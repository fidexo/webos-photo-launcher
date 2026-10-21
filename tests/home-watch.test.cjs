const {test} = require('node:test');
const assert = require('node:assert/strict');
const file = '../services/com.frxn.mipantalla.lights/home-watch';
const PID = '/tmp/mipantalla-home.pid';
function load() { return require(file); }
function event(code = 773) {
  const b = Buffer.alloc(16); b.writeUInt16LE(1, 8); b.writeUInt16LE(code, 10); b.writeInt32LE(1, 12); return b;
}
function harness(args, initial = {}) {
  let time = 0, wall = 100000, next = 0, fd = 10;
  const timers = new Map(), files = new Map(Object.entries(initial)), devices = new Map();
  const names = [], queues = new Map(), calls = [], logs = [], closed = [], flags = [];
  let powerReady = false, powerWake, powerStarts = 0, powerStops = 0;
  function timer(fn, delay, interval) { const id = ++next; timers.set(id, {fn, due:time + delay, interval}); return id; }
  const fs = {
    constants:{O_RDONLY:0, O_NONBLOCK:2048},
    writeFileSync(path, text, opts) {
      if (opts && opts.flag === 'wx' && files.has(path)) throw Object.assign(Error('exists'), {code:'EEXIST'});
      files.set(path, String(text));
    },
    readFileSync(path) { if (!files.has(path)) throw Error('missing'); return files.get(path); },
    unlinkSync(path) { files.delete(path); },
    readdirSync() { return names.slice(); },
    openSync(path, mode) { flags.push(mode); devices.set(++fd, path.split('/').pop()); return fd; },
    readSync(handle, buffer) {
      const q = queues.get(devices.get(handle)) || [];
      const value = q.shift();
      if (!value) throw Object.assign(Error('idle'), {code:'EAGAIN'});
      if (value instanceof Error) throw value;
      value.copy(buffer); return value.length;
    },
    closeSync(handle) { closed.push(handle); devices.delete(handle); }
  };
  const deps = {fs, pid:1234, now:() => wall + time, log:line => logs.push(line),
    watchPower:onWake => { powerStarts++; powerWake=onWake; return {ready:()=>powerReady,stop:()=>powerStops++}; },
    setTimeout:(fn, ms) => timer(fn, ms, 0), clearTimeout:id => timers.delete(id),
    setInterval:(fn, ms) => timer(fn, ms, ms), clearInterval:id => timers.delete(id),
    execFile:(command, argv, options, callback) => {
      const child = {killed:false, kill() { this.killed = true; }};
      calls.push({command, argv, options, callback, child}); return child;
    }};
  function advance(ms) {
    const end = time + ms;
    for (;;) {
      const pending = [...timers.entries()].filter(([, t]) => t.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!pending) break;
      const [id, t] = pending; time = t.due;
      if (t.interval) t.due += t.interval; else timers.delete(id);
      t.fn();
    }
    time = end;
  }
  return {names, queues, calls, logs, closed, flags, timers, files, advance, deps,
    power:{get starts(){return powerStarts;},get stops(){return powerStops;},
      ready:value=>{powerReady=value;},wake:()=>powerWake()},
    jump:ms => { wall += ms; }, start:() => load().createDaemon(load().parseArgs(args), deps),
    reply:(index, value, error = null) => calls[index].callback(error, value)};
}

test('CLI validates modes and unsigned 16-bit HOME codes', () => {
  const parse = load().parseArgs;
  assert.deepEqual(parse(['--boot','--watch','--dry-run','--home-code=102']),
    {boot:true, watch:true, nativeHome:false, dryRun:true, homeCode:102, pollMs:100, help:false});
  assert.equal(parse(['--help']).help, true);
  assert.equal(parse(['--watch']).homeCode, 773);
  for (const args of [[], ['--dry-run'], ['--oops'], ['--watch','--home-code=-1'],
    ['--watch','--home-code=65536'], ['--watch','--home-code=1.5'], ['--watch','--home-code=1;id']]) {
    assert.throws(() => parse(args));
  }
});

test('native Home is opt-in, requires watch, and supports boot plus watch', () => {
  const parse=load().parseArgs; let config;
  assert.equal(parse(['--watch']).nativeHome,false);
  assert.doesNotThrow(()=>{config=parse(['--watch','--native-home']);});
  assert.equal(config.nativeHome,true);
  assert.doesNotThrow(()=>{config=parse(['--boot','--watch','--native-home']);});
  assert.equal(config.boot,true); assert.equal(config.watch,true); assert.equal(config.nativeHome,true);
  for (const args of [['--native-home'],['--boot','--native-home']]) assert.throws(()=>parse(args), /requires --watch/);
});

test('CLI help documents native Home and exits before starting a daemon', () => {
  const {spawnSync}=require('node:child_process');
  const result=spawnSync(process.execPath,[require.resolve(file),'--native-home','--help'],{encoding:'utf8'});
  assert.equal(result.status,0); assert.match(result.stdout,/--native-home/);
  assert.match(result.stdout,/requires --watch/); assert.equal(result.stderr,'');
  assert.equal(load().parseArgs(['--native-home','--help']).nativeHome,false);
});

test('native Home skips all input opens and polling while preserving power wake and heartbeat fallback', () => {
  const h=harness(['--watch']); h.names.push('event0','event1');
  const daemon=load().createDaemon(Object.assign(load().parseArgs(['--watch']),{nativeHome:true}),h.deps);
  assert.equal(h.flags.length,0); assert.equal(h.power.starts,1);
  assert.deepEqual([...h.timers.values()].map(t=>t.interval),[1000]);
  h.power.ready(true); h.queues.set('event0',[event()]); h.advance(5000);
  assert.equal(h.flags.length,0); assert.equal(h.calls.length,0);
  h.power.wake(); assert.equal(h.calls.length,1); h.reply(0,'{"returnValue":true}');
  h.power.ready(false); h.jump(15000); h.advance(1000); assert.equal(h.calls.length,2);
  daemon.stop(); assert.equal(h.power.stops,1); assert.equal(h.closed.length,0); assert.equal(h.timers.size,0);
});

test('CLI and autostart both default to 100ms input polling without an override', () => {
  const fs = require('node:fs');
  assert.equal(load().parseArgs(['--watch']).pollMs, 100);
  assert.match(fs.readFileSync(require('node:path').join(__dirname,
    '../services/com.frxn.mipantalla.lights/home-autostart.sh'), 'utf8'), /POLL_MS=\$\{MIPANTALLA_HOME_POLL_MS:-100\}/);
  const h = harness(['--watch']); h.names.push('event0'); const daemon = h.start();
  h.queues.set('event0', [event()]); h.advance(99); assert.equal(h.calls.length, 0);
  h.advance(1); assert.equal(h.calls.length, 1); daemon.stop();
});

test('boot passes literal Luna argv and stops only on explicit acceptance', () => {
  const h = harness(['--boot']); const daemon = h.start();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].command, 'luna-send');
  assert.deepEqual(h.calls[0].argv, ['-n','1','-f','luna://com.webos.applicationManager/launch','{"id":"com.frxn.mipantalla"}']);
  assert.equal(h.calls[0].options.timeout, 2500);
  assert.equal(h.calls[0].options.maxBuffer, 8192);
  h.reply(0, '{"returnValue":false}'); h.advance(1999); assert.equal(h.calls.length, 1);
  h.advance(1); h.reply(1, 'not json'); h.advance(2000);
  h.reply(2, '{\n "returnValue": true\n}'); h.advance(10000);
  assert.equal(h.calls.length, 3); daemon.stop();
});

test('boot failure is bounded to 30 attempts including subprocess errors', () => {
  const h = harness(['--boot']); const daemon = h.start();
  for (let i = 0; i < 30; i++) {
    h.reply(i, '', Object.assign(Error('failed'), {code:'ETIMEDOUT'})); h.advance(2000);
  }
  assert.equal(h.calls.length, 30); daemon.stop();
});

test('nonblocking inputs retain separate partial buffers and debounce HOME for 800ms', () => {
  const h = harness(['--watch','--poll-ms=16']); h.names.push('event0','event1','mouse0'); const daemon = h.start();
  assert.deepEqual(h.flags, [2048,2048]);
  h.queues.set('event0', [event().subarray(0, 11)]);
  h.queues.set('event1', [event(100)]); h.advance(16);
  assert.equal(h.calls.length, 0);
  h.queues.set('event0', [event().subarray(11)]); h.advance(16); assert.equal(h.calls.length, 1);
  h.reply(0, '{"returnValue":true}');
  h.queues.set('event1', [Buffer.concat([event(),event()])]); h.advance(16); assert.equal(h.calls.length, 1);
  h.advance(784); h.queues.set('event1', [event()]); h.advance(16); assert.equal(h.calls.length, 2);
  daemon.stop(); assert.equal(h.closed.length, 2);
});

test('watch discovers late devices and reopens disconnected inputs', () => {
  const h = harness(['--watch','--poll-ms=16']); const daemon = h.start();
  h.names.push('event9'); h.advance(1000); assert.equal(h.flags.length, 1);
  h.queues.set('event9', [Object.assign(Error('gone'), {code:'ENODEV'})]); h.advance(16);
  assert.equal(h.closed.length, 1); h.advance(1000); assert.equal(h.flags.length, 2); daemon.stop();
});

test('an isolated short heartbeat delay does not accumulate into a false wake', () => {
  const h = harness(['--watch']); const daemon = h.start();
  h.jump(2000); h.advance(1000); assert.equal(h.calls.length, 0);
  h.advance(15000); assert.equal(h.calls.length, 0); daemon.stop();
});

test('wake gap must exceed 10s and stops after explicit acceptance', () => {
  const h = harness(['--watch']); const daemon = h.start();
  h.jump(9000); h.advance(1000); assert.equal(h.calls.length, 0);
  h.jump(10000); h.advance(1000); assert.equal(h.calls.length, 1);
  h.reply(0, '{"returnValue":true}'); h.advance(10000);
  assert.equal(h.calls.length, 1);
  assert.ok(h.logs.includes('wake: accepted'));
  assert.ok(!h.logs.some(line => /visible|on.?screen/i.test(line)));
  h.jump(15000); h.advance(1000); assert.equal(h.calls.length, 2); daemon.stop();
});

test('wake retries only after a failure, never during a pending launch, and stops at four attempts', () => {
  const h = harness(['--watch']); const daemon = h.start();
  h.jump(15000); h.advance(1000); h.advance(6000); assert.equal(h.calls.length, 1);
  const failures = ['not json', '{"returnValue":false}', ''];
  for (let i = 0; i < 3; i++) {
    h.reply(i, failures[i], i === 2 ? Error('timeout') : null);
    h.advance(1499); assert.equal(h.calls.length, i + 1);
    h.advance(1); assert.equal(h.calls.length, i + 2);
  }
  h.reply(3, '{"returnValue":false}'); h.advance(20000);
  assert.equal(h.calls.length, 4); daemon.stop();
});

test('boot, HOME and wake share an in-flight launch and HOME remains usable afterwards', () => {
  const h = harness(['--boot','--watch']); h.names.push('event0'); const daemon = h.start();
  h.queues.set('event0', [event()]); h.advance(100); assert.equal(h.calls.length, 1);
  h.jump(15000); h.advance(6000); assert.equal(h.calls.length, 1);
  h.reply(0, '{"returnValue":true}'); h.advance(10000); assert.equal(h.calls.length, 1);
  h.queues.set('event0', [event()]); h.advance(100); assert.equal(h.calls.length, 2);
  h.reply(1, '{"returnValue":true}'); h.advance(10000); assert.equal(h.calls.length, 2); daemon.stop();
});

test('HOME acceptance cancels earlier failed boot and wake retry campaigns', () => {
  for (const boot of [true, false]) {
    const h = harness(boot ? ['--boot','--watch'] : ['--watch']);
    h.names.push('event0'); const daemon = h.start();
    if (!boot) { h.jump(15000); h.advance(1000); }
    h.reply(0, '{"returnValue":false}');
    h.queues.set('event0', [event()]); h.advance(100); assert.equal(h.calls.length, 2);
    h.reply(1, '{"returnValue":true}'); h.advance(10000);
    assert.equal(h.calls.length, 2, boot ? 'boot retry cancelled' : 'wake retry cancelled'); daemon.stop();
  }
});

test('Home diagnostics log fixed acceptance and rejection without raw subprocess text', () => {
  const h = harness(['--watch']); h.names.push('event0'); const daemon = h.start();
  h.queues.set('event0', [event()]); h.advance(100);
  h.reply(0, '{"returnValue":true}'); assert.ok(h.logs.includes('home: accepted'));
  h.advance(800); h.queues.set('event0', [event()]); h.advance(100);
  h.reply(1, 'RAW-PRIVATE-STDOUT', Error('RAW-PRIVATE-ERROR'));
  assert.ok(h.logs.includes('home: rejected')); assert.ok(!h.logs.join('\n').includes('RAW-PRIVATE')); daemon.stop();
});

test('Quick Start power events reopen after standby without a heartbeat gap', () => {
  const {EventEmitter} = require('node:events'); const h = harness(['--watch']); let child;
  assert.ok(require('node:fs').existsSync(require('node:path').join(__dirname,
    '../services/com.frxn.mipantalla.lights/home-power.js')), 'power observer must exist for Quick Start');
  const createPower = require('../services/com.frxn.mipantalla.lights/home-power');
  h.deps.watchPower = onWake => createPower(onWake,{setTimeout:h.deps.setTimeout,clearTimeout:h.deps.clearTimeout,
    spawn(){ child=new EventEmitter(); child.stdout=new EventEmitter(); child.killed=false;
      child.kill=()=>{child.killed=true;}; return child; }});
  const daemon=h.start(); const state=value=>child.stdout.emit('data',Buffer.from(JSON.stringify(
    {subscribed:true,returnValue:true,state:value})+'\n'));
  state('Active'); h.advance(20000); assert.equal(h.calls.length,0);
  state('Suspend'); h.advance(20000); assert.equal(h.calls.length,0);
  state('Active'); assert.equal(h.calls.length,1); h.reply(0,'{"returnValue":true}');
  state('Active'); h.advance(10000); assert.equal(h.calls.length,1);
  daemon.stop(); assert.equal(child.killed,true);
});

test('heartbeat fallback only acts while the power observer is unavailable', () => {
  const h=harness(['--watch']); const daemon=h.start(); assert.equal(h.power.starts,1);
  h.power.ready(true); h.jump(15000); h.advance(1000); assert.equal(h.calls.length,0);
  h.power.ready(false); h.jump(15000); h.advance(1000); assert.equal(h.calls.length,1);
  daemon.stop(); assert.equal(h.power.stops,1); h.power.wake(); assert.equal(h.calls.length,1);
  const boot=harness(['--boot']); const once=boot.start(); assert.equal(boot.power.starts,0); once.stop();
});

test('dry-run never spawns even for boot, HOME and standby wake', () => {
  const h = harness(['--boot','--watch','--dry-run']); h.names.push('event0'); const daemon = h.start();
  h.queues.set('event0', [event()]); h.advance(100); h.jump(15000); h.advance(8000);
  assert.equal(h.calls.length, 0); assert.equal(h.power.starts,0);
  assert.ok(h.logs.some(line => /dry-run/.test(line))); daemon.stop();
});

test('stop cancels timers, closes inputs, kills children and removes only own PID', () => {
  const h = harness(['--boot','--watch']); h.names.push('event0'); const daemon = h.start();
  h.jump(15000); h.advance(1000); daemon.stop(); daemon.stop();
  assert.equal(h.timers.size, 0); assert.equal(h.closed.length, 1);
  assert.ok(h.calls.every(call => call.child.killed)); assert.equal(h.files.has(PID), false);
  h.reply(0, '{"returnValue":false}'); h.advance(10000); assert.equal(h.timers.size, 0);
  const other = harness(['--watch']); const running = other.start(); other.files.set(PID, '9999'); running.stop();
  assert.equal(other.files.get(PID), '9999');
});

test('an existing PID file prevents a duplicate before any launch or device open', () => {
  const h = harness(['--boot','--watch'], {[PID]:'9999'});
  assert.throws(() => h.start(), /exists/); assert.equal(h.calls.length, 0); assert.equal(h.flags.length, 0);
});

test('log stays within 64KiB and opens without following symlinks', () => {
  let content = '', closes = 0, opened;
  const fs = {constants:{O_WRONLY:1,O_CREAT:64,O_APPEND:1024,O_NOFOLLOW:131072},
    openSync:(path, flags, mode) => { opened = {path,flags,mode}; return 7; },
    fstatSync:() => ({size:Buffer.byteLength(content), isFile:() => true}),
    ftruncateSync:() => { content = ''; }, appendFileSync:(fd, line) => { content += line; },
    closeSync:() => { closes++; }};
  const log = load().createLogger(fs, () => 123);
  for (let i = 0; i < 300; i++) { log('x'.repeat(2000)); assert.ok(Buffer.byteLength(content) <= 65536); }
  assert.equal(closes, 300); assert.equal(opened.path, '/tmp/mipantalla-home.log');
  assert.equal(opened.flags & fs.constants.O_NOFOLLOW, fs.constants.O_NOFOLLOW); assert.equal(opened.mode, 0o600);
});
