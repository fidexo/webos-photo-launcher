const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const path = require('node:path');
const fs = require('node:fs');
const file = path.join(__dirname, '../services/com.frxn.mipantalla.lights/transport.js');
const ip = [192,168,50,20].join('.');
const own = [192,168,50,10].join('.');
const interfaces = () => ({eth:[{family:'IPv4',internal:false,address:own,netmask:'255.255.255.0'}]});
function load() { assert.ok(fs.existsSync(file),'WiZ transport must exist'); return require(file); }
function socketFactory(onSend, sockets) {
  return () => {
    const socket = new EventEmitter();
    socket.bind = (port, ready) => setImmediate(ready);
    socket.setBroadcast = () => {};
    socket.close = () => {socket.closed=true;};
    socket.send = (buffer,port,address,callback) => {
      onSend(socket,JSON.parse(buffer.toString()),{address,port});
      if(callback) callback(null);
    };
    sockets.push(socket);
    return socket;
  };
}
function reply(socket, method, result, address=ip, port=38899) {
  socket.emit('message',Buffer.from(JSON.stringify({method,result})),{address,port});
}

test('WiZ discovery is read-only, bounded, deduplicated and accepts only local source packets', async () => {
  const create = load(); const sockets=[]; const sent=[];
  const transport=create({interfaces, discoveryMs:15, timeoutMs:15, socketFactory:socketFactory((s,p,target)=>{
    sent.push(p);
    if(p.method==='getPilot') {
      reply(s,'getPilot',{mac:'aabbcc001122',state:true});
      reply(s,'getPilot',{mac:'aabbcc001122',state:true});
      reply(s,'getPilot',{mac:'aabbcc334455'},'8.8.8.8');
      reply(s,'getPilot',{mac:'aabbcc445566'},ip,1234);
    } else reply(s,'getSystemConfig',{mac:'aabbcc001122',roomId:123,moduleName:'ESP01_SHRGB1C_31'});
  },sockets)});
  const devices=await transport.discover();
  assert.equal(devices.length,1);
  assert.equal(devices[0].system.roomId,123);
  assert.deepEqual(sent.map(p=>p.method),['getPilot','getSystemConfig']);
  assert.ok(sockets.every(s=>s.closed));
});

test('WiZ unicast ignores replies from another device or method, and never retries a write', async () => {
  const create = load();const sockets=[];let sends=0;
  const transport=create({interfaces,timeoutMs:12,socketFactory:socketFactory((s,p)=>{
    sends++;
    reply(s,'getPilot',{state:true},[192,168,50,21].join('.'));
    reply(s,'getSystemConfig',{mac:'aabbcc001122'});
  },sockets)});
  await assert.rejects(transport.query(ip,'setPilot',{state:false}),/confirm|tiempo/i);
  assert.equal(sends,1);
  assert.ok(sockets.every(s=>s.closed));
  await assert.rejects(transport.query('8.8.8.8','getPilot',{}),/local|inválid/i);
  await assert.rejects(transport.query(ip,'reboot',{}),/inválid/i);
  assert.equal(sends,1);
});

test('WiZ UDP errors settle once and close sockets', async () => {
  const create=load();const sockets=[];
  const transport=create({interfaces,timeoutMs:12,socketFactory:socketFactory(s=>{
    s.emit('error',Error('UDP denied'));
  },sockets)});
  await assert.rejects(transport.query(ip,'getPilot',{}),/UDP denied/);
  assert.equal(sockets[0].closed,true);
});

test('WiZ send failures after bind reject safely instead of escaping the request', async () => {
  const create=load(); const sockets=[];
  const transport=create({interfaces,timeoutMs:15,socketFactory:socketFactory(()=>{
    throw Error('send failed');
  },sockets)});
  await assert.rejects(transport.query(ip,'getPilot',{}),/send failed/);
  assert.equal(sockets[0].closed,true);
});
