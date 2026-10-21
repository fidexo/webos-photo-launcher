const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const file=path.join(__dirname,'../services/com.frxn.mipantalla.lights/api.js');
function setup(){
  assert.ok(fs.existsSync(file),'WiZ Luna adapter must exist');
  const handlers={};const calls=[];
  const controller={capabilities:()=>({available:true,screenSync:false})};
  for(const method of ['discover','getState','setState','setMode'])controller[method]=async payload=>{calls.push(method);return {devices:[],mode:payload.mode};};
  require(file)({register(name,fn){handlers[name]=fn;}},controller);
  return {calls,handlers,controller,call(method,sender,payload={}){return new Promise(resolve=>handlers[method]({sender,payload,respond:resolve}));}};
}
test('WiZ network methods reject other apps and unidentified bus clients before effects',async()=>{
  const t=setup();
  for(const sender of [undefined,':1.42','another.app','com.frxn.mipantalla.evil']){
    const response=await t.call('setState',sender,{ids:['wiz-aabbcc001122'],on:false});
    assert.equal(response.returnValue,false);
  }
  assert.equal((await t.call('setState',':1.42',{sender:'com.frxn.mipantalla',on:false})).returnValue,false);
  assert.equal(t.calls.length,0);
});
test('WiZ exact launcher caller can request fixed methods and exceptions are reported once',async()=>{
  const t=setup();
  assert.equal((await t.call('discover','com.frxn.mipantalla')).returnValue,true);
  assert.deepEqual(t.calls,['discover']);
  const payload={ids:['wiz-aabbcc001122'],on:false};
  const result=await t.call('setState','com.frxn.mipantalla',payload);
  assert.equal(result.returnValue,true);
  assert.equal(t.handlers.exec,undefined);
  assert.equal(t.handlers.request,undefined);
  t.controller.getState=()=>{throw Error('UDP offline');};
  const failure=await t.call('getState','com.frxn.mipantalla');
  assert.equal(failure.returnValue,false);
  assert.match(failure.errorText,/UDP offline/);
});
