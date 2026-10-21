const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file=path.join(__dirname,'../services/com.frxn.mipantalla.lights/controller.js');
const id='wiz-aabbcc001122';
const ip=[192,168,50,20].join('.');
function setup(query) {
  assert.ok(fs.existsSync(file),'WiZ controller must exist');
  let discoveryCount=0;
  const calls=[];
  const transport={discover:async()=>{
    discoveryCount++;
    return [{ip,pilot:{mac:id.slice(4),state:true,dimming:40},system:{mac:id.slice(4),roomId:123,moduleName:'ESP01_SHRGB1C_31'}}];
  },query:async(address,method,params)=>{
    calls.push({address,method,params});
    return query?query(address,method,params,calls):{mac:id.slice(4),state:true,dimming:40};
  }};
  return {controller:require(file)(transport,{settle:()=>Promise.resolve()}),calls,discoveryCount:()=>discoveryCount};
}

test('WiZ controller discovers actual devices without selecting or changing any lights',async()=>{
  const {controller,calls}=setup();
  const result=await controller.discover();
  assert.equal(result.devices[0].id,id);
  assert.equal(result.devices[0].room,'123');
  assert.deepEqual(calls,[]);
  assert.equal(controller.capabilities().screenSync,false);
});

test('WiZ controller rejects empty selection and invalid writes before network effects',async()=>{
  const t=setup();
  for(const p of [{ids:[],on:true},{ids:[id],rgb:[0,2,999]},{ids:[id],method:'reboot'},{ids:[id],on:'yes'}]) {
    await assert.rejects(t.controller.setState(p),/selección|inválid/i);
  }
  assert.equal(t.discoveryCount(),0);
  assert.equal(t.calls.length,0);
});

test('WiZ writes revalidate identity before setPilot and report a fresh readback',async()=>{
  let on=true;
  const t=setup((address,method,params)=>{
    if(method==='setPilot'){on=params.state;return {success:true};}
    return {mac:id.slice(4),state:on,dimming:40};
  });
  const result=await t.controller.setState({ids:[id],on:false});
  assert.deepEqual(t.calls.map(c=>c.method),['getPilot','setPilot','getPilot']);
  assert.equal(result.devices[0].state.on,false);
  assert.equal(result.devices[0].confirmed,true);
});

test('WiZ identity mismatch and undiscovered IDs cannot send writes',async()=>{
  const t=setup(()=>({mac:'aabbcc445566',state:true}));
  const result=await t.controller.setState({ids:[id,'wiz-aabbcc778899'],on:false});
  assert.equal(t.calls.some(c=>c.method==='setPilot'),false);
  assert.ok(result.devices.every(d=>d.error));
});

test('WiZ uncertain writes return unknown state, with no automatic retry',async()=>{
  const t=setup((address,method)=>{
    if(method==='setPilot')throw Error('No confirmation');
    return {mac:id.slice(4),state:true};
  });
  const result=await t.controller.setState({ids:[id],on:false});
  assert.equal(t.calls.filter(c=>c.method==='setPilot').length,1);
  assert.equal(result.devices[0].state,null);
  assert.equal(result.devices[0].confirmed,false);
  assert.equal(result.devices[0].reachable,false);
});

test('WiZ ACK without matching readback is not a confirmed change',async()=>{
  const t=setup((address,method)=>method==='setPilot'?{success:true}:{mac:id.slice(4),state:true,dimming:40});
  const result=await t.controller.setState({ids:[id],on:false});
  assert.equal(result.devices[0].confirmed,false);
  assert.equal(result.devices[0].reachable,true);
  assert.equal(result.devices[0].state.on,true,'the actual readable state must be preserved');
  assert.match(result.devices[0].error,/coincide|confirm/i);
});

test('WiZ getState rediscovers selected IDs after service restart and keeps failures unknown',async()=>{
  const t=setup(()=>{throw Error('offline');});
  const result=await t.controller.getState({ids:[id]});
  assert.equal(t.discoveryCount(),1);
  assert.equal(result.devices[0].state,null);
  assert.equal(result.devices[0].reachable,false);
});

test('WiZ does not advertise screen synchronization before capture has been verified',async()=>{
  const {controller}=setup();
  await assert.rejects(controller.setMode({mode:'ambient',source:'screen',ids:[id]}),/captura|disponible/i);
  assert.equal((await controller.setMode({mode:'manual',ids:[id]})).mode,'manual');
});
