'use strict';
var PARENT = '/var/lib/mipantalla-maintenance';
var ROOT = PARENT + '/privacy-rdxd';
var BACKUP = ROOT + '/settings-before.json';
var MAX = 8192;
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function flags(value) {
  return object(value) && typeof value.analyticsLog === 'boolean' && typeof value.crashLog === 'boolean';
}
function same(a, b) { return a.analyticsLog === b.analyticsLog && a.crashLog === b.crashLog; }
function run(deps, mode, callback) {
  var fs = deps.fs;
  var finished = false;
  function finish(status, error, value) {
    if (finished) return;
    finished = true;
    var result = {status: status};
    if (flags(value)) { result.analyticsLog = value.analyticsLog; result.crashLog = value.crashLog; }
    callback(error ? Error(status) : null, result);
  }
  function rpc(method, payload, next) {
    var answered = false;
    function reply(error, stdout) {
      if (answered || finished) return;
      answered = true;
      var value = null;
      if (!error && typeof stdout === 'string' && Buffer.byteLength(stdout) <= MAX) {
        try { value = JSON.parse(stdout); } catch (ignored) {}
      }
      next(object(value) && value.returnValue === true ? value : null);
    }
    try {
      deps.execFile('/usr/bin/luna-send', ['-n', '1', '-f', 'luna://com.webos.rdxd/' + method,
        JSON.stringify(payload)], {timeout: 2500, killSignal: 'SIGKILL', maxBuffer: MAX, encoding: 'utf8'}, reply);
    } catch (ignored) { reply(Error('rpc-failed')); }
  }
  function directory(path, strict) {
    var stat;
    try { fs.mkdirSync(path, 448); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    stat = fs.lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== 0 ||
        (stat.mode & 18) !== 0 || strict && (stat.mode & 511) !== 448) throw Error('unsafe-directory');
  }
  function safeFile(stat) {
    return stat.isFile() && !stat.isSymbolicLink() && stat.uid === 0 &&
      (stat.mode & 511) === 384 && stat.nlink === 1 && stat.size <= MAX;
  }
  function readBackup() {
    var stat = fs.lstatSync(BACKUP);
    if (!safeFile(stat) || !fs.constants || typeof fs.constants.O_NOFOLLOW !== 'number') throw Error('backup-invalid');
    var fd = fs.openSync(BACKUP, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      stat = fs.fstatSync(fd);
      if (!safeFile(stat)) throw Error('backup-invalid');
      var bytes = Buffer.alloc(stat.size + 1);
      var count = fs.readSync(fd, bytes, 0, bytes.length, 0);
      if (count !== stat.size) throw Error('backup-invalid');
      var value = JSON.parse(bytes.slice(0, count).toString('utf8'));
      if (!flags(value) || value.version !== 1 || Object.keys(value).sort().join(',') !== 'analyticsLog,crashLog,version') throw Error('backup-invalid');
      return {analyticsLog: value.analyticsLog, crashLog: value.crashLog};
    } finally { fs.closeSync(fd); }
  }
  function backup(current) {
    try { fs.lstatSync(BACKUP); return readBackup(); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!fs.constants || typeof fs.constants.O_NOFOLLOW !== 'number') throw Error('backup-invalid');
    var fd = fs.openSync(BACKUP, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 384);
    try {
      if (!safeFile(fs.fstatSync(fd))) throw Error('backup-invalid');
      fs.writeFileSync(fd, JSON.stringify({version: 1, analyticsLog: current.analyticsLog, crashLog: current.crashLog}) + '\n', {encoding: 'utf8'});
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    return readBackup();
  }
  function change(current, wanted, success) {
    if (same(current, wanted)) return finish('already-' + success, false, current);
    rpc('setLogSettings', wanted, function (ack) {
      if (!ack) return finish('set-failed', true);
      rpc('getLogSettings', {}, function (readback) {
        if (!flags(readback) || !same(readback, wanted)) return finish('readback-failed', true);
        finish(success, false, readback);
      });
    });
  }
  if (mode !== '--status' && mode !== '--apply' && mode !== '--restore') return finish('usage-invalid', true);
  var previous;
  if (mode !== '--status') {
    try {
      if (!deps.getuid || deps.getuid() !== 0) throw Error('root-required');
      directory(PARENT, false);
      directory(ROOT, true);
      if (mode === '--restore') previous = readBackup();
    } catch (ignored) { return finish('backup-unsafe', true); }
  }
  rpc('getLogSettings', {}, function (current) {
    if (!flags(current)) return finish('read-failed', true);
    if (mode === '--status') return finish('status', false, current);
    if (mode === '--restore') return change(current, previous, 'restored');
    try { backup(current); }
    catch (ignored) { return finish('backup-unsafe', true); }
    change(current, {analyticsLog: false, crashLog: false}, 'applied');
  });
}
module.exports = {run: run};
if (require.main === module) {
  if (process.argv.length !== 3) {
    process.stdout.write('{"status":"usage-invalid"}\n');
    process.exitCode = 1;
  } else {
    run({fs: require('fs'), execFile: require('child_process').execFile,
      getuid: typeof process.getuid === 'function' ? process.getuid.bind(process) : null}, process.argv[2], function (error, result) {
      process.stdout.write(JSON.stringify(result) + '\n');
      if (error) process.exitCode = 1;
    });
  }
}
