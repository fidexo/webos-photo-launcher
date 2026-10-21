const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../services/com.frxn.mipantalla.lights/hyperhdr-rpc.js');
const token = 'private-test-token-DO-NOT-RETURN';
function load() { assert.ok(fs.existsSync(file), 'HyperHDR RPC module must exist'); return require(file); }
function send(socket, reply) { socket.emit('data', Buffer.from(JSON.stringify(reply) + '\n')); }
function response(packet, info) {
  return {success:true, command:packet.command + (packet.subcommand ? '-' + packet.subcommand : ''), tan:packet.tan, info};
}
function harness(onPacket, extra = {}) {
  const sockets = [], packets = [], wires = [], endpoints = [];
  const factory = load()({token, timeoutMs:40, ...extra, socketFactory(endpoint) {
    endpoints.push(endpoint);
    const socket = new EventEmitter();
    socket.destroyCount = 0;
    socket.destroy = () => { socket.destroyCount++; socket.emit('close'); };
    socket.write = (wire, encoding, callback) => {
      wires.push(wire); const packet = JSON.parse(wire); packets.push(packet);
      if (onPacket && onPacket(socket, packet) === false) return;
      send(socket, response(packet, packet.command === 'instance' ? {instance:0} : {}));
      if (callback) callback();
    };
    sockets.push(socket); setImmediate(() => socket.emit('connect')); return socket;
  }});
  return {factory, sockets, packets, wires, endpoints};
}
function fixedError(code) {
  return error => {
    assert.equal(error.code, code);
    assert.ok(!String(error.stack).includes(token));
    assert.ok(!JSON.stringify(error).includes(token));
    assert.ok(!error.message.includes('RAW-SECRET'));
    return true;
  };
}
const turn = () => new Promise(resolve => setImmediate(resolve));

test('factory stays disconnected; explicit connect logs in then fixes instance zero', async () => {
  const h = harness();
  await turn(); assert.equal(h.sockets.length, 0);
  assert.ok(!JSON.stringify(h.factory).includes(token));
  const session = await h.factory.connect();
  assert.deepEqual(h.endpoints, [{host:'127.0.0.1', port:19444}]);
  assert.deepEqual(h.packets, [
    {command:'authorize', subcommand:'login', token, tan:1},
    {command:'instance', subcommand:'switchTo', instance:0, tan:2}
  ]);
  assert.ok(h.wires.every(wire => wire.endsWith('\n') && wire.indexOf('\n') === wire.length - 1));
  assert.ok(!JSON.stringify(session).includes(token));
  session.close(); session.close(); assert.equal(h.sockets[0].destroyCount, 1);
});

test('constructor rejects invalid token and endpoint/instance overrides without opening sockets', () => {
  const create = load(); let opened = 0;
  for (const value of [undefined, '', '  ', '\r\n', 'a\nb', 'a\rb', 'x'.repeat(2049), 42]) {
    assert.throws(() => create({token:value, socketFactory:() => opened++}), fixedError('HYPERHDR_INVALID_OPTIONS'));
  }
  for (const extra of [{host:'example.test'}, {port:123}, {instance:1}, {timeoutMs:0}, {timeoutMs:Infinity}, {socketFactory:42}]) {
    assert.throws(() => create({token, ...extra}), fixedError('HYPERHDR_INVALID_OPTIONS'));
  }
  assert.equal(opened, 0);
});

test('only the six bounded public request shapes are sent, with increasing transaction ids', async () => {
  const h = harness(); const session = await h.factory.connect();
  const requests = [
    {command:'serverinfo'}, {command:'config',subcommand:'getconfig'},
    {command:'authorize',subcommand:'adminRequired'},
    {command:'componentstate',componentstate:{component:'LEDDEVICE',state:false}},
    {command:'componentstate',componentstate:{component:'LEDDEVICE',state:true}},
    {command:'sourceselect',priority:150}, {command:'sourceselect',auto:true}
  ];
  for (const request of requests) assert.equal((await session.request(request)).success, true);
  assert.deepEqual(h.packets.slice(2).map(({tan, ...packet}) => packet), requests);
  assert.deepEqual(h.packets.map(packet => packet.tan), [1,2,3,4,5,6,7,8,9]);
  session.close();
});

test('request cannot inject commands, subscription, token, priority, component, or instance', async () => {
  const h = harness(); const session = await h.factory.connect();
  for (const request of [null, [], {}, {command:'color'}, {command:'serverinfo',subscribe:['all']},
    {command:'config',subcommand:'setconfig'}, {command:'authorize',subcommand:'login',token},
    {command:'authorize',subcommand:'createToken'}, {command:'instance',subcommand:'switchTo',instance:0},
    {command:'sourceselect',priority:149}, {command:'sourceselect',auto:false},
    {command:'sourceselect',auto:true,priority:150}, {command:'serverinfo',tan:1},
    {command:'componentstate',componentstate:{component:'ALL',state:false}},
    {command:'componentstate',componentstate:{component:'LEDDEVICE',state:1}},
    {command:'componentstate',componentstate:{component:'LEDDEVICE',state:false,extra:true}}]) {
    await assert.rejects(session.request(request), fixedError('HYPERHDR_INVALID_REQUEST'));
  }
  assert.equal(h.packets.length, 2); session.close();
});

test('login failure with mismatched command still rejects and never switches instance', async () => {
  const h = harness((socket, packet) => {
    send(socket, {success:false,command:'authorize',tan:packet.tan,error:token + ' RAW-SECRET'}); return false;
  });
  await assert.rejects(h.factory.connect(), fixedError('HYPERHDR_AUTH_REQUIRED'));
  assert.equal(h.packets.length, 1); assert.equal(h.sockets[0].destroyCount, 1);
});

test('login requires true success and exact authorize-login correlation', async () => {
  for (const reply of [{success:true,command:'authorize',tan:1}, {success:true,command:'authorize-login',tan:'1'}]) {
    const h = harness(socket => { send(socket, reply); return false; }, {timeoutMs:10});
    await assert.rejects(h.factory.connect(), fixedError('HYPERHDR_TIMEOUT'));
    assert.equal(h.packets.length, 1); assert.equal(h.sockets[0].destroyCount, 1);
  }
  const h = harness(socket => { send(socket, {success:1,command:'authorize-login',tan:1}); return false; });
  await assert.rejects(h.factory.connect(), fixedError('HYPERHDR_PROTOCOL'));
});

test('instance switch must explicitly confirm numeric instance zero', async () => {
  for (const info of [undefined, {}, {instance:1}, {instance:'0'}]) {
    const h = harness((socket, packet) => {
      if (packet.command !== 'instance') return;
      send(socket, response(packet, info)); return false;
    });
    await assert.rejects(h.factory.connect(), fixedError('HYPERHDR_INSTANCE_UNAVAILABLE'));
    assert.equal(h.packets.length, 2); assert.equal(h.sockets[0].destroyCount, 1);
  }
});

test('fragmented UTF-8 replies and coalesced callbacks preserve exact response correlation', async () => {
  const h = harness((socket, packet) => {
    if (packet.command !== 'serverinfo') return;
    const wire = Buffer.from(JSON.stringify({command:'priorities-update',data:[]}) + '\n' +
      JSON.stringify({...response(packet, {name:'pantalla ámbar'}), extra:true}) + '\n');
    const split = wire.indexOf(Buffer.from('á')) + 1;
    socket.emit('data', wire.subarray(0, split)); socket.emit('data', wire.subarray(split)); return false;
  });
  const session = await h.factory.connect();
  assert.equal((await session.request({command:'serverinfo'})).info.name, 'pantalla ámbar'); session.close();
});

test('wrong tan, string tan, wrong subcommand and callbacks cannot settle a pending request', async () => {
  let packet;
  const h = harness((socket, p) => { if (p.command === 'config') { packet = p; return false; } });
  const session = await h.factory.connect(); let settled = false;
  const pending = session.request({command:'config',subcommand:'getconfig'}).then(reply => { settled=true; return reply; });
  const socket = h.sockets[0];
  socket.emit('data', Buffer.from([
    {...response(packet),tan:999}, {...response(packet),tan:String(packet.tan)},
    {...response(packet),command:'config-getschema'}, {success:false,command:'config-getconfig'}
  ].map(x => JSON.stringify(x)).join('\n') + '\n'));
  await turn(); assert.equal(settled, false);
  send(socket, response(packet, {value:1})); assert.equal((await pending).info.value, 1); session.close();
});

test('only one request can be pending; busy leaves the original request intact', async () => {
  let packet;
  const h = harness((socket, p) => { if (p.command === 'serverinfo') { packet=p; return false; } });
  const session = await h.factory.connect(); const first = session.request({command:'serverinfo'});
  await assert.rejects(session.request({command:'serverinfo'}), fixedError('HYPERHDR_BUSY'));
  assert.equal(h.packets.length, 3); send(h.sockets[0], response(packet)); await first; session.close();
});

test('same-tan error rejects despite mismatched command and never leaks server text', async () => {
  const h = harness((socket, packet) => {
    if (packet.command !== 'serverinfo') return;
    send(socket, {success:false,command:'unrelated',tan:packet.tan,error:token + ' RAW-SECRET'}); return false;
  });
  const session = await h.factory.connect();
  await assert.rejects(session.request({command:'serverinfo'}), fixedError('HYPERHDR_COMMAND_REJECTED'));
  assert.equal(h.sockets[0].destroyCount, 1);
  await assert.rejects(session.request({command:'serverinfo'}), fixedError('HYPERHDR_CLOSED'));
});

test('invalid JSON, non-object JSON and oversized buffered input close pending requests once', async () => {
  for (const chunks of [[Buffer.from('{bad json}\n')], [Buffer.from('null\n')],
    [Buffer.alloc(131072, 120),Buffer.alloc(131073, 120)], [Buffer.alloc(262145, 120)]]) {
    const h = harness((socket, packet) => {
      if (packet.command !== 'serverinfo') return;
      for (const chunk of chunks) socket.emit('data', chunk); return false;
    });
    const session = await h.factory.connect();
    await assert.rejects(session.request({command:'serverinfo'}), fixedError('HYPERHDR_PROTOCOL'));
    assert.equal(h.sockets[0].destroyCount, 1);
  }
});

test('socket close, end, error and explicit close reject pending work without raw errors', async () => {
  for (const event of ['close','end','error','explicit']) {
    const h = harness((socket, packet) => packet.command === 'serverinfo' ? false : undefined);
    const session = await h.factory.connect(); const pending = session.request({command:'serverinfo'});
    if (event === 'explicit') session.close(); else h.sockets[0].emit(event, Error(token + ' RAW-SECRET'));
    await assert.rejects(pending, fixedError(event === 'error' ? 'HYPERHDR_CONNECTION' : 'HYPERHDR_CLOSED'));
    h.sockets[0].emit('error', Error(token)); session.close(); assert.equal(h.sockets[0].destroyCount, 1);
  }
});

test('mutation timeout closes exactly once, rejects further work and never retries', async () => {
  const h = harness((socket, packet) => packet.command === 'componentstate' ? false : undefined, {timeoutMs:10});
  const session = await h.factory.connect();
  await assert.rejects(session.request({command:'componentstate',componentstate:{component:'LEDDEVICE',state:false}}), fixedError('HYPERHDR_TIMEOUT'));
  await assert.rejects(session.request({command:'serverinfo'}), fixedError('HYPERHDR_CLOSED'));
  assert.equal(h.packets.filter(p => p.command === 'componentstate').length, 1);
  assert.equal(h.sockets.length, 1); assert.equal(h.sockets[0].destroyCount, 1);
});

test('connection establishment timeout, factory exceptions and write failures use fixed safe errors', async () => {
  const create = load(); const socket = new EventEmitter(); let destroyed = 0;
  socket.destroy = () => destroyed++;
  await assert.rejects(create({token,timeoutMs:10,socketFactory:() => socket}).connect(), fixedError('HYPERHDR_TIMEOUT'));
  assert.equal(destroyed, 1);
  await assert.rejects(create({token,socketFactory:() => { throw Error(token); }}).connect(), fixedError('HYPERHDR_CONNECTION'));
  for (const callbackFailure of [false,true]) {
    const h = harness((s, packet) => {
      if (packet.command !== 'serverinfo') return;
      if (!callbackFailure) throw Error(token);
      return false;
    });
    const session = await h.factory.connect();
    if (callbackFailure) h.sockets[0].write = (wire, encoding, callback) => callback(Error(token));
    await assert.rejects(session.request({command:'serverinfo'}), fixedError('HYPERHDR_CONNECTION'));
    assert.equal(h.sockets[0].destroyCount, 1);
  }
});

test('successful replies cannot reflect the private token into a returned result', async () => {
  const h = harness((socket, packet) => {
    if (packet.command !== 'serverinfo') return;
    send(socket, response(packet, {nested:[{name:token}]})); return false;
  });
  const session = await h.factory.connect();
  await assert.rejects(session.request({command:'serverinfo'}), fixedError('HYPERHDR_PROTOCOL'));
  assert.equal(h.sockets[0].destroyCount, 1);
});

test('option getters fail with safe errors', () => {
  const create = load();
  assert.throws(() => create({get token() { throw Error(token); }}), fixedError('HYPERHDR_INVALID_OPTIONS'));
});

test('mutable request getters cannot bypass boolean validation', async () => {
  const h = harness(); const session = await h.factory.connect(); let reads = 0;
  const reply = await session.request({command:'componentstate',componentstate:{component:'LEDDEVICE',
    get state() { return ++reads === 1 ? false : {RAW:'RAW-SECRET'}; }
  }});
  assert.equal(reply.success, true);
  assert.equal(h.packets[2].componentstate.state, false);
  session.close();
});
