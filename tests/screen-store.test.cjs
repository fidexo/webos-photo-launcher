const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const storeFile=path.join(__dirname,'../services/com.frxn.mipantalla.lights/screen-store.js');
const settingsFile=path.join(__dirname,'../services/com.frxn.mipantalla.lights/screen-settings.js');
function fixture(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mi-pantalla-screen-'));
  try{return run(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('screen recovery store performs no writes until a baseline is explicitly saved',()=>fixture(dir=>{
  assert.ok(fs.existsSync(storeFile),'persistent screen store must exist');
  const store=require(storeFile)(path.join(dir,'private'));
  assert.equal(store.load(),null);assert.equal(fs.existsSync(path.join(dir,'private')),false);
  const saved={phase:'prepared',ids:['wiz-aabbcc001122'],devices:[{id:'wiz-aabbcc001122',state:{on:true,brightness:50,rgb:[10,20,30]}}]};
  store.save(saved);assert.deepEqual(store.load(),saved);
  store.save(Object.assign({},saved,{phase:'restoring'}));
  assert.equal(store.load().phase,'restoring');assert.deepEqual(fs.readdirSync(path.join(dir,'private')),['screen-session.json']);
  store.clear();assert.equal(store.load(),null);
}));
test('malformed or oversized recovery cannot be mistaken for an empty session',()=>fixture(dir=>{
  assert.ok(fs.existsSync(storeFile),'persistent screen store must exist');
  const store=require(storeFile)(dir);const file=path.join(dir,'screen-session.json');
  fs.writeFileSync(file,'{broken');assert.throws(()=>store.load(),/SCREEN_STORE/);
  fs.writeFileSync(file,' '.repeat(33000));assert.throws(()=>store.load(),/SCREEN_STORE/);
}));
test('screen settings are disabled by default and reject arbitrary endpoints or malformed secrets',()=>fixture(dir=>{
  assert.ok(fs.existsSync(settingsFile),'screen settings loader must exist');
  const load=require(settingsFile);const file=path.join(dir,'screen-config.json');
  assert.equal(load(file).enabled,false);
    const valid={enabled:true,profile:'Mi pantalla WiZ Living',token:'synthetic-private-token',hardwareVerified:true};
    fs.writeFileSync(file,JSON.stringify(valid));assert.deepEqual(load(file),valid);
    fs.writeFileSync(file,JSON.stringify({...valid,hardwareVerified:false}));
    assert.equal(load(file).hardwareVerified,false);
    for(const invalid of [{...valid,host:'example.org'},{...valid,token:'bad\nkey'},{...valid,hardwareVerified:'yes'},
      {enabled:'true'},null]){
    fs.writeFileSync(file,JSON.stringify(invalid));const result=load(file);
    assert.equal(result.enabled,false);assert.equal(result.invalid,true);
    assert.doesNotMatch(JSON.stringify(result),/synthetic|example\.org|bad/);
  }
}));
