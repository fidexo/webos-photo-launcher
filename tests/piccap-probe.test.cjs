const {test}=require('node:test');
const assert=require('node:assert/strict');
const create=require('../services/com.frxn.mipantalla.lights/piccap-probe');
function status(overrides={}) {
  return {payload:Object.assign({returnValue:true,isRunning:true,connected:true,uiRunning:true,
    videoRunning:false,framerate:29.9},overrides)};
}
function probe(responses) {
  let at=0;
  const calls=[];
  return {calls,read:create({call:async(uri,args)=>{calls.push([uri,args]);return responses[Math.min(at++,responses.length-1)];},
    wait:async()=>{}}).read};
}
test('fresh frames need two consecutive running samples connected to HyperHDR',async()=>{
  const t=probe([status(),status({framerate:30})]);
  assert.deepEqual(await t.read(),{framesVerified:true,sourceFreshness:'fresh'});
  assert.equal(t.calls.length,2);
  assert.ok(t.calls.every(([uri,args])=>uri==='luna://org.webosbrew.piccap.service/status'&&Object.keys(args).length===0));
});
test('stale, stopped, disconnected or zero-rate capture is not frame proof',async()=>{
  for (const responses of [
    [status({framerate:0}),status()],
    [status(),status({isRunning:false})],
    [status(),status({connected:false})],
    [status(),status({uiRunning:false,videoRunning:false})],
    [status(),status({framerate:0})]
  ]) {
    const t=probe(responses);
    assert.deepEqual(await t.read(),{framesVerified:false,sourceFreshness:'unknown'});
  }
});
test('probe errors never leak payloads and fail closed',async()=>{
  const read=create({call:async()=>{throw Error('secret-token at 192.168.1.40');},wait:async()=>{}}).read;
  assert.deepEqual(await read(),{framesVerified:false,sourceFreshness:'unknown'});
  const malformed=create({call:async()=>({payload:null}),wait:async()=>{}}).read;
  assert.deepEqual(await malformed(),{framesVerified:false,sourceFreshness:'unknown'});
});
