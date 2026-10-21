const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../services/com.frxn.mipantalla.lights/home-power.js');
const packet = state => JSON.stringify({subscribed:true,returnValue:true,state}) + '\n';
function harness(spawnFailure = false) {
  const children = [], calls = [], timers = new Map(); let wakes = 0, next = 0, time = 0;
  assert.ok(fs.existsSync(file), 'home power observer must exist');
  const monitor = require(file)(() => wakes++, {
    spawn(command, args, options) {
      calls.push({command,args,options});
      if (spawnFailure) throw Error('synthetic spawn failure');
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.kills = 0;
      child.kill = () => { child.kills++; child.emit('close'); }; children.push(child); return child;
    },
    setTimeout(fn, ms) { const id = ++next; timers.set(id, {fn,due:time + ms}); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  function advance(ms) {
    time += ms;
    for (const [id,timer] of [...timers]) if (timer.due <= time) { timers.delete(id); timer.fn(); }
  }
  return {monitor,children,calls,timers,advance,get wakes(){return wakes;},
    emit(text, index = children.length - 1) { children[index].stdout.emit('data', Buffer.from(text)); }};
}

test('power observer subscribes to the fixed read-only URI and first Active is baseline only', () => {
  const h = harness(); assert.equal(h.monitor.ready(), false);
  assert.deepEqual(h.calls, [{command:'luna-send',args:['-i',
    'luna://com.webos.service.tvpower/power/getPowerState','{"subscribe":true}'],
    options:{stdio:['ignore','pipe','ignore']}}]);
  h.emit(packet('Active')); assert.equal(h.monitor.ready(), true); assert.equal(h.wakes, 0);
  h.emit(packet('Active')); assert.equal(h.wakes, 0); h.monitor.stop();
});

test('fragmented and coalesced states fire once per nonActive to Active transition', () => {
  const h = harness(); const first = Buffer.from(packet('Active'));
  h.children[0].stdout.emit('data', first.subarray(0, 13)); assert.equal(h.monitor.ready(), false);
  h.children[0].stdout.emit('data', first.subarray(13)); assert.equal(h.monitor.ready(), true);
  h.emit('\n' + packet('Suspend') + packet('Suspend') + packet('Active') + packet('Active'));
  assert.equal(h.wakes, 1);
  h.emit(packet('Off') + packet('Active')); assert.equal(h.wakes, 2); h.monitor.stop();
});

test('first nonActive state followed by Active is an observed transition', () => {
  const h = harness(); h.emit(packet('Suspend')); assert.equal(h.wakes, 0);
  h.emit(packet('Active')); assert.equal(h.wakes, 1); h.monitor.stop();
});

test('invalid, rejected and oversized input resets readiness and schedules one reconnect in 5s', () => {
  for (const chunks of [['{broken}\n'], ['null\n'], ['{"returnValue":false,"state":"Active"}\n'],
    ['{"returnValue":true,"subscribed":false,"state":"Active"}\n'],
    ['{"returnValue":true,"subscribed":true}\n'], ['x'.repeat(2048),'x'.repeat(2049)]]) {
    const h = harness(); h.emit(packet('Active')); assert.equal(h.monitor.ready(), true);
    for (const chunk of chunks) h.emit(chunk);
    assert.equal(h.monitor.ready(), false); assert.equal(h.children[0].kills, 1); assert.equal(h.timers.size, 1);
    h.children[0].emit('error', Error('late')); h.children[0].stdout.emit('end');
    assert.equal(h.timers.size, 1); h.advance(4999); assert.equal(h.calls.length, 1);
    h.advance(1); assert.equal(h.calls.length, 2); assert.equal(h.wakes, 0); h.monitor.stop();
  }
});

test('process and stdout failures reconnect without parallel subscriptions', () => {
  for (const [surface,event] of [['child','error'],['child','close'],['stdout','error'],['stdout','end']]) {
    const h = harness(); h.emit(packet('Active'));
    (surface === 'child' ? h.children[0] : h.children[0].stdout).emit(event, Error('failed'));
    assert.equal(h.monitor.ready(), false); assert.equal(h.children[0].kills, 1);
    h.advance(5000); assert.equal(h.calls.length, 2);
    h.emit(packet('Active')); assert.equal(h.monitor.ready(), true); assert.equal(h.wakes, 0); h.monitor.stop();
  }
});

test('a known nonActive baseline survives reconnect and old stream events are ignored', () => {
  const h = harness(); h.emit(packet('Suspend')); h.children[0].emit('close'); h.advance(5000);
  h.emit(packet('Active'), 0); assert.equal(h.wakes, 0); assert.equal(h.monitor.ready(), false);
  h.emit(packet('Active'), 1); assert.equal(h.wakes, 1);
  h.children[0].emit('close'); assert.equal(h.timers.size, 0);
  h.emit(packet('Active')); assert.equal(h.wakes, 1); h.monitor.stop();
});

test('stop kills once, cancels reconnection and ignores late callbacks', () => {
  for (const disconnected of [false,true]) {
    const h = harness(); h.emit(packet('Suspend'));
    if (disconnected) h.children[0].emit('close');
    h.monitor.stop(); h.monitor.stop();
    assert.equal(h.monitor.ready(), false); assert.equal(h.children[0].kills, 1); assert.equal(h.timers.size, 0);
    h.emit(packet('Active')); h.children[0].emit('error', Error('late')); h.advance(20000);
    assert.equal(h.wakes, 0); assert.equal(h.calls.length, 1);
  }
});

test('spawn exceptions reconnect on the same controlled timer and stop cancels it', () => {
  const h = harness(true); assert.equal(h.monitor.ready(), false); assert.equal(h.timers.size, 1);
  h.advance(5000); assert.equal(h.calls.length, 2); assert.equal(h.timers.size, 1);
  h.monitor.stop(); h.advance(20000); assert.equal(h.calls.length, 2);
});
