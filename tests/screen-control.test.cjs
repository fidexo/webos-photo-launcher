const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
test('screen wiring adapts selected id arrays to the existing lamp API payload for probe and baseline',async()=>{
  const ids=['wiz-aabbcc001122'];let backendRead,sessionRead,backendProbe;
  const mod={exports:{}};
  const fakes={
    path,
    './screen-settings':()=>({enabled:false}),
    './hyperhdr-rpc':()=>({}),
    './screen-backend':options=>{backendRead=options.read;backendProbe=options.probe;return {inspect:async()=>({ready:false})};},
    './screen-session':{create:options=>{sessionRead=options.read;return {pending:()=>null};}},
    './screen-store':()=>({})
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../services/com.frxn.mipantalla.lights/screen-control.js'),'utf8'),
    {module:mod,__dirname:'/synthetic-app',require:name=>{assert.ok(name in fakes,name);return fakes[name];}});
  let reads=0;
  const probe=async()=>({framesVerified:true});
  mod.exports({read:async payload=>{assert.deepEqual(JSON.parse(JSON.stringify(payload)),{ids});reads++;return {devices:[]};},
    write:()=>{throw Error('unexpected write');}},{probe});
  await backendRead(ids);await sessionRead(ids);
  assert.equal(reads,2);assert.equal(backendProbe,probe);
});
