'use strict';

var DEFAULT_HOME_CODE = 773;
var PID_FILE = '/tmp/mipantalla-home.pid';
var LOG_FILE = '/tmp/mipantalla-home.log';
var LOG_LIMIT = 65536;
var LAUNCH_URI = 'luna://com.webos.applicationManager/launch';
var LAUNCH_PAYLOAD = '{"id":"com.frxn.mipantalla"}';
var LAUNCH_ARGS = ['-n', '1', '-f', LAUNCH_URI, LAUNCH_PAYLOAD];
var LAUNCH_OPTIONS = {timeout: 2500, maxBuffer: 8192, encoding: 'utf8'};
var EVENT_BYTES = 16;
var READ_BYTES = 128;
var POLL_MS = 100;
var DISCOVER_MS = 1000;
var HEARTBEAT_MS = 1000;
var WAKE_GAP_MS = 10000;
var DEBOUNCE_MS = 800;
var BOOT_RETRY_MS = 2000;
var BOOT_MAX = 30;
var WAKE_RETRY_MS = 1500;
var WAKE_MAX = 4;
var HELP = [
  'Usage: node home-watch.js --boot --watch [--dry-run] [--home-code=773] [--poll-ms=100]',
  '',
  '  --boot             launch Mi pantalla while the app manager starts',
  '  --watch            reopen Mi pantalla when Home is pressed',
  '  --dry-run          log actions without running luna-send',
  '  --home-code=N      Linux input code for Home (default 773)',
  '  --poll-ms=N        input polling interval in milliseconds (default 100)',
  '  --help             show this help'
].join('\n') + '\n';

function parseArgs(argv) {
  if (!Array.isArray(argv)) argv = [];
  if (argv.indexOf('--help') !== -1 || argv.indexOf('-h') !== -1) {
    return {boot: false, watch: false, dryRun: false, homeCode: DEFAULT_HOME_CODE, pollMs: POLL_MS, help: true};
  }
  var config = {boot: false, watch: false, dryRun: false, homeCode: DEFAULT_HOME_CODE, pollMs: POLL_MS, help: false};
  for (var i = 0; i < argv.length; i += 1) {
    var arg = argv[i];
    if (arg === '--boot') {
      config.boot = true;
    } else if (arg === '--watch') {
      config.watch = true;
    } else if (arg === '--dry-run') {
      config.dryRun = true;
    } else if (arg.indexOf('--home-code=') === 0) {
      var raw = arg.slice('--home-code='.length);
      if (!/^[0-9]+$/.test(raw)) throw new Error('Invalid HOME code: ' + raw);
      var code = parseInt(raw, 10);
      if (code > 65535) throw new Error('HOME code out of range: ' + raw);
      config.homeCode = code;
    } else if (arg.indexOf('--poll-ms=') === 0) {
      var rawPoll = arg.slice('--poll-ms='.length);
      if (!/^[0-9]+$/.test(rawPoll)) throw new Error('Invalid poll interval: ' + rawPoll);
      var pollMs = parseInt(rawPoll, 10);
      if (pollMs < 16 || pollMs > 1000) throw new Error('Poll interval out of range: ' + rawPoll);
      config.pollMs = pollMs;
    } else {
      throw new Error('Unknown argument: ' + arg);
    }
  }
  if (!config.boot && !config.watch) throw new Error('Use --boot and/or --watch.');
  return config;
}

function createLogger(fs, now) {
  return function log(line) {
    var fd;
    try {
      var constants = fs.constants || {};
      var flags = (constants.O_WRONLY || 1) | (constants.O_CREAT || 64) |
        (constants.O_APPEND || 1024) | (constants.O_NOFOLLOW || 0);
      var text = String(line);
      if (text.length > LOG_LIMIT - 1) text = text.slice(0, LOG_LIMIT - 1);
      var payload = '[' + now() + '] ' + text + '\n';
      fd = fs.openSync(LOG_FILE, flags, 384);
      var stat = fs.fstatSync(fd);
      var size = stat && typeof stat.size === 'number' ? stat.size : 0;
      if (size + Buffer.byteLength(payload) > LOG_LIMIT) fs.ftruncateSync(fd, 0);
      fs.appendFileSync(fd, payload);
    } catch (error) {
      return;
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch (error) { /* ignore */ }
      }
    }
  };
}

function createDaemon(rawConfig, rawDeps) {
  var config = rawConfig || {};
  var deps = rawDeps || {};
  var fs = deps.fs || require('fs');
  var now = deps.now || Date.now;
  var pid = deps.pid || process.pid;
  var log = deps.log || createLogger(fs, now);
  var setTimeoutFn = deps.setTimeout || setTimeout;
  var clearTimeoutFn = deps.clearTimeout || clearTimeout;
  var setIntervalFn = deps.setInterval || setInterval;
  var clearIntervalFn = deps.clearInterval || clearInterval;
  var execFile = deps.execFile || require('child_process').execFile;
  var watchPower = deps.watchPower || require('./home-power');
  var powerMonitor = null;
  var homeInput = require('./home-input');
  var parseEvents = homeInput.parseEvents;
  var isHomeEvent = homeInput.isHomeEvent;
  var homeCode = config.homeCode === undefined ? DEFAULT_HOME_CODE : config.homeCode;
  var pollMs = config.pollMs === undefined ? POLL_MS : config.pollMs;
  var devices = [];
  var failedDevices = {};
  var timeouts = [];
  var intervals = [];
  var children = [];
  var stopped = false;
  var bootAttempts = 0;
  var bootDone = false;
  var bootTimer = null;
  var wakeTimer = null;
  var wakeActive = false;
  var wakeAttempts = 0;
  var launchInFlight = null;
  var lastHeartbeat = now();
  var lastHome = -Infinity;
  var readBuffer = Buffer.alloc(READ_BYTES);

  function schedule(fn, delay) {
    var id = setTimeoutFn(function () {
      var index = timeouts.indexOf(id);
      if (index !== -1) timeouts.splice(index, 1);
      if (!stopped) fn();
    }, delay);
    timeouts.push(id);
    return id;
  }

  function every(fn, delay) {
    var id = setIntervalFn(function () {
      if (!stopped) fn();
    }, delay);
    intervals.push(id);
    return id;
  }

  function cancel(id) {
    if (id === null) return;
    clearTimeoutFn(id);
    var index = timeouts.indexOf(id);
    if (index !== -1) timeouts.splice(index, 1);
  }

  function removeChild(child) {
    var index = children.indexOf(child);
    if (index !== -1) children.splice(index, 1);
  }

  function accepted(stdout) {
    try {
      var message = JSON.parse(String(stdout));
      return !!message && message.returnValue === true;
    } catch (error) {
      return false;
    }
  }

  function runLaunch(reason, callback) {
    if (stopped) return null;
    if (config.dryRun) {
      log('dry-run: ' + reason);
      if (callback) callback(null, '{"returnValue":true}');
      return null;
    }
    if (launchInFlight) {
      if (callback) launchInFlight.callbacks.push(callback);
      return launchInFlight.child;
    }
    var settled = false;
    var operation = {child:null, callbacks:callback ? [callback] : []};
    launchInFlight = operation;
    function finish(error, stdout) {
      if (settled) return;
      settled = true;
      launchInFlight = null;
      removeChild(operation.child);
      if (stopped) return;
      if (!error && accepted(stdout)) {
        // Acceptance cancels automatic retries; it does not prove foreground visibility.
        bootDone = true;
        wakeActive = false;
        cancel(bootTimer); bootTimer = null;
        cancel(wakeTimer); wakeTimer = null;
      }
      operation.callbacks.forEach(function (done) { done(error, stdout); });
    }
    try { operation.child = execFile('luna-send', LAUNCH_ARGS, LAUNCH_OPTIONS, finish); }
    catch (error) { finish(error, ''); }
    if (!settled) children.push(operation.child);
    return operation.child;
  }

  function boot() {
    bootTimer = null;
    if (stopped || !config.boot || bootDone) return;
    if (config.dryRun) {
      log('dry-run: boot');
      bootDone = true;
      return;
    }
    if (bootAttempts >= BOOT_MAX) {
      bootDone = true;
      log('boot: giving up after ' + BOOT_MAX + ' attempts');
      return;
    }
    bootAttempts += 1;
    runLaunch('boot', function (error, stdout) {
      if (stopped) return;
      if (!error && accepted(stdout)) {
        bootDone = true;
        log('boot: accepted');
        return;
      }
      if (bootDone) return;
      if (bootAttempts >= BOOT_MAX) {
        bootDone = true;
        log('boot: giving up after ' + BOOT_MAX + ' attempts');
        return;
      }
      bootTimer = schedule(boot, BOOT_RETRY_MS);
    });
  }

  function homeDetected() {
    if (stopped) return;
    var current = now();
    if (current >= lastHome && current - lastHome < DEBOUNCE_MS) return;
    lastHome = current;
    log('home: detected');
    runLaunch('home', function (error, stdout) {
      log(!error && accepted(stdout) ? 'home: accepted' : 'home: rejected');
    });
  }

  function closeDevice(index) {
    var device = devices[index];
    devices.splice(index, 1);
    try { fs.closeSync(device.fd); } catch (error) { /* ignore */ }
  }

  function listDeviceNames() {
    var names = [];
    try {
      var text = String(fs.readFileSync('/proc/bus/input/devices', 'utf8'));
      var lines = text.split('\n');
      for (var i = 0; i < lines.length; i += 1) {
        var match = /(?:^|\s)(event[0-9]+)(?:\s|$)/.exec(lines[i]);
        if (match && names.indexOf(match[1]) === -1) names.push(match[1]);
      }
    } catch (error) {
      names = [];
    }
    if (names.length) return names;
    try {
      names = fs.readdirSync('/dev/input');
    } catch (error) {
      return [];
    }
    var filtered = [];
    for (var j = 0; j < names.length; j += 1) {
      if (/^event[0-9]+$/.test(names[j])) filtered.push(names[j]);
    }
    return filtered;
  }

  function openDevice(name) {
    if (stopped) return;
    for (var i = 0; i < devices.length; i += 1) {
      if (devices[i].name === name) return;
    }
    if (failedDevices[name] && failedDevices[name] > now()) return;
    var constants = fs.constants || {};
    var fd;
    try {
      fd = fs.openSync('/dev/input/' + name, (constants.O_RDONLY || 0) | (constants.O_NONBLOCK || 2048));
    } catch (error) {
      failedDevices[name] = now() + 30000;
      log('input: cannot open ' + name + ': ' + error.message);
      return;
    }
    delete failedDevices[name];
    devices.push({name: name, fd: fd, remainder: Buffer.alloc(0)});
  }

  function discover() {
    if (stopped) return;
    var names = listDeviceNames();
    for (var i = 0; i < names.length; i += 1) openDevice(names[i]);
  }

  function poll() {
    if (stopped) return;
    for (var i = 0; i < devices.length; i += 1) {
      var device = devices[i];
      var bytes;
      try {
        bytes = fs.readSync(device.fd, readBuffer, 0, readBuffer.length, null);
      } catch (error) {
        if (error && (error.code === 'EAGAIN' || error.code === 'EWOULDBLOCK')) continue;
        closeDevice(i);
        i -= 1;
        continue;
      }
      if (!bytes) continue;
      var parsed;
      try {
        parsed = parseEvents(readBuffer.slice(0, bytes), device.remainder);
      } catch (error) {
        device.remainder = Buffer.alloc(0);
        continue;
      }
      device.remainder = parsed.remainder;
      for (var j = 0; j < parsed.events.length; j += 1) {
        if (isHomeEvent(parsed.events[j], homeCode)) homeDetected();
      }
    }
  }

  function attemptWake() {
    wakeTimer = null;
    if (stopped || !wakeActive) return;
    wakeAttempts += 1;
    runLaunch('wake', function (error, stdout) {
      if (stopped) return;
      if (!error && accepted(stdout)) {
        wakeActive = false;
        log('wake: accepted');
        return;
      }
      if (!wakeActive) return;
      if (wakeAttempts >= WAKE_MAX) {
        wakeActive = false;
        log('wake: giving up after ' + WAKE_MAX + ' attempts');
        return;
      }
      wakeTimer = schedule(attemptWake, WAKE_RETRY_MS);
    });
  }

  function wake() {
    if (stopped || wakeActive) return;
    if (config.dryRun) {
      log('dry-run: wake');
      return;
    }
    log('wake: detected');
    wakeActive = true;
    wakeAttempts = 0;
    attemptWake();
  }

  function heartbeat() {
    if (stopped) return;
    var current = now();
    var gap = current - lastHeartbeat;
    lastHeartbeat = current;
    if (gap > WAKE_GAP_MS && (!powerMonitor || !powerMonitor.ready())) wake();
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (powerMonitor) { try { powerMonitor.stop(); } catch (ignored) {} }
    var id;
    for (var t = 0; t < timeouts.length; t += 1) {
      id = timeouts[t];
      clearTimeoutFn(id);
    }
    for (var i = 0; i < intervals.length; i += 1) {
      id = intervals[i];
      clearIntervalFn(id);
    }
    timeouts = [];
    intervals = [];
    while (devices.length) closeDevice(devices.length - 1);
    while (children.length) {
      var child = children.pop();
      try { child.kill(); } catch (error) { /* ignore */ }
    }
    try {
      var stored = String(fs.readFileSync(PID_FILE)).trim();
      if (stored === String(pid)) fs.unlinkSync(PID_FILE);
    } catch (error) { /* ignore */ }
  }

  if (config.help) {
    log(HELP.trim());
    return {stop: stop};
  }

  try {
    fs.writeFileSync(PID_FILE, String(pid), {flag: 'wx', mode: 384});
  } catch (error) {
    throw error;
  }

  log('start: boot=' + (config.boot ? '1' : '0') + ' watch=' + (config.watch ? '1' : '0') +
    ' poll=' + pollMs + ' home=' + homeCode);

  if (config.boot) boot();
  if (config.watch) {
    if (!config.dryRun) powerMonitor = watchPower(wake);
    discover();
    log('watch: opened ' + devices.length + ' input devices');
    every(poll, pollMs);
    every(discover, DISCOVER_MS);
    every(heartbeat, HEARTBEAT_MS);
  }

  return {stop: stop};
}

if (require.main === module) {
  var config;
  try {
    config = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exit(2);
  }
  if (config.help) {
    process.stdout.write(HELP);
  } else {
    var daemon;
    try {
      daemon = createDaemon(config);
    } catch (error) {
      process.stderr.write('home-watch: ' + error.message + '\n');
      process.exit(1);
    }
    var shutdown = function () {
      daemon.stop();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}

module.exports = {
  parseArgs: parseArgs,
  createDaemon: createDaemon,
  createLogger: createLogger
};
