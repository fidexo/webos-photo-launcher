const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const file=path.join(__dirname,'../scripts/tv/native-home-guard.js');
const APP='com.frxn.mipantalla';
const MANIFEST='/media/developer/apps/usr/palm/applications/'+APP+'/appinfo.json';
const ROOT='/var/lib/mipantalla-maintenance/native-home/';
const old='com.webos.app.fullhome';
const original={home:APP,browser:'com.webos.app.browser',other:{enabled:true}};
function fixture(options={}) {
  const files={};const calls=[],unlinks=[],reads=[];
  const backup={category:'general',settings:{defaultApps:{home:old}}};
  files[ROOT+'settings-before.json']={data:JSON.stringify(backup)};
  if(options.present)files[MANIFEST]={data:JSON.stringify({id:APP})};
  Object.assign(files,options.files);
  const missing=()=>Object.assign(Error('private-detail'),{code:'ENOENT'});
  const stat=(entry)=>({size:Buffer.byteLength(entry.data||''),isFile:()=>!entry.symlink,isSymbolicLink:()=>!!entry.symlink});
  const fakeFs={constants:{O_RDONLY:0,O_NOFOLLOW:131072},
    lstatSync(p){if(!files[p])throw missing();if(files[p].error)throw Error('private-detail');return stat(files[p]);},
    openSync(p,flags){assert.ok(flags&131072,'O_NOFOLLOW is required');if(!files[p])throw missing();assert.ok(!files[p].symlink);return p;},
    fstatSync(fd){return stat(files[fd]);},readFileSync(fd){reads.push(fd);return files[fd].data;},closeSync(){},
    readSync(fd,buffer,offset,length){reads.push(fd);return Buffer.from(files[fd].data).copy(buffer,offset,0,length);},
    unlinkSync(p){unlinks.push(p);if(options.unlinkError)throw Error('private-detail');}};
  const replies=options.replies||[{returnValue:true,settings:{defaultApps:original}},
    {returnValue:true},{returnValue:true,settings:{defaultApps:{other:{enabled:true},browser:original.browser,home:old}}}];
  function execFile(command,args,settings,callback){
    calls.push({command,args,settings,payload:JSON.parse(args[args.length-1])});
    const reply=replies[calls.length-1];
    if(reply instanceof Error)callback(reply);else callback(null,typeof reply==='string'?reply:JSON.stringify(reply));
  }
  function run(){assert.ok(fs.existsSync(file),'guard implementation must exist');return new Promise(resolve=>{
    require(file).run({fs:fakeFs,execFile},(error,status)=>resolve({error,status}));});}
  return {run,files,calls,unlinks,reads,fakeFs,execFile};
}
test('legitimate installed app makes no Luna calls and never reads the backup',async()=>{
  const t=fixture({present:true});assert.equal((await t.run()).status,'app-present');
  assert.deepEqual(t.calls,[]);assert.deepEqual(t.unlinks,[]);assert.deepEqual(t.reads,[MANIFEST]);
});
test('an existing malformed, wrong-id or symlink manifest fails closed',async()=>{
  for(const entry of [{data:'{'},{data:'{"id":"other.app"}'},{symlink:true,data:'{}'},{error:true}]){
    const t=fixture({files:{[MANIFEST]:entry}});const result=await t.run();
    assert.equal(result.status,'app-uncertain');assert.ok(result.error);assert.deepEqual(t.calls,[]);
  }
});
test('missing, corrupt or symlink backup never triggers Luna',async()=>{
  for(const entry of [undefined,{data:'{'},{symlink:true,data:'{}'}]){
    const t=fixture();if(entry)t.files[ROOT+'settings-before.json']=entry;else delete t.files[ROOT+'settings-before.json'];
    assert.equal((await t.run()).status,'backup-invalid');assert.deepEqual(t.calls,[]);assert.deepEqual(t.unlinks,[]);
  }
});
test('backup requires general category and a safe previous home distinct from ours',async()=>{
  for(const category of ['option','general'])for(const home of [APP,'unsafe app;command',null]){
    const t=fixture({files:{[ROOT+'settings-before.json']:{data:JSON.stringify({category,settings:{defaultApps:{home}}})}}});
    assert.equal((await t.run()).status,'backup-invalid');assert.deepEqual(t.calls,[]);
  }
});
test('rejected, malformed and timed out reads stop without writes',async()=>{
  for(const reply of [{returnValue:false},'{',Error('private-token'),{returnValue:true,settings:{}}]){
    const t=fixture({replies:[reply]});const result=await t.run();assert.equal(result.status,'read-failed');
    assert.ok(result.error);assert.equal(t.calls.length,1);assert.deepEqual(t.unlinks,[]);
  }
});
test('a home no longer owned by Mi pantalla is neither overwritten nor unlinked',async()=>{
  const t=fixture({replies:[{returnValue:true,settings:{defaultApps:{home:'another.app'}}}]});
  assert.equal((await t.run()).status,'home-not-owned');assert.equal(t.calls.length,1);assert.deepEqual(t.unlinks,[]);
});
test('rejected or timed out set never removes the enabled flag or retries',async()=>{
  for(const reply of [{returnValue:false},Error('private-token')]){
    const t=fixture({replies:[{returnValue:true,settings:{defaultApps:original}},reply]});
    assert.equal((await t.run()).status,'set-failed');assert.equal(t.calls.length,2);assert.deepEqual(t.unlinks,[]);
  }
});
test('readback rejection or mismatch keeps fallback enabled',async()=>{
  for(const reply of [{returnValue:false},{returnValue:true,settings:{defaultApps:original}},Error('private-token')]){
    const t=fixture({replies:[{returnValue:true,settings:{defaultApps:original}},{returnValue:true},reply]});
    assert.equal((await t.run()).status,'readback-failed');assert.equal(t.calls.length,3);assert.deepEqual(t.unlinks,[]);
  }
});
test('successful recovery preserves every other current default and only then unlinks enabled',async()=>{
  const t=fixture();const result=await t.run();assert.equal(result.error,null);assert.equal(result.status,'restored');
  assert.deepEqual(t.calls[1].payload,{category:'general',settings:{defaultApps:{...original,home:old}}});
  assert.deepEqual(t.unlinks,[ROOT+'enabled']);
  for(const call of t.calls){assert.equal(call.command,'/usr/bin/luna-send');assert.equal(call.settings.timeout,2500);assert.ok(call.settings.maxBuffer<=65536);assert.equal(call.settings.shell,undefined);}
  assert.ok(t.calls[0].args.includes('luna://com.webos.settingsservice/getSystemSettings'));
});
test('unlink failure reports only a fixed status after confirmed restoration',async()=>{
  const t=fixture({unlinkError:true});const result=await t.run();assert.equal(result.status,'flag-remove-failed');
  assert.equal(result.error.message,'flag-remove-failed');assert.equal(t.calls.length,3);
});
test('malformed deeply nested defaults report a fixed failure without writes',()=>{
  const nested='['.repeat(8000)+'true'+']'.repeat(8000);
  const raw='{"returnValue":true,"settings":{"defaultApps":{"home":"'+APP+'","other":'+nested+'}}}';
  assert.ok(Buffer.byteLength(raw)<32768);const t=fixture({replies:[raw]});let status;
  require(file).run({fs:t.fakeFs,execFile:t.execFile},(error,value)=>{assert.ok(error);status=value;});
  assert.equal(status,'read-failed');assert.equal(t.calls.length,1);assert.deepEqual(t.unlinks,[]);
});
test('standalone guard prints a fixed status and exits nonzero on failure',()=>{
  assert.ok(fs.existsSync(file));const source=fs.readFileSync(file,'utf8');const t=fixture();delete t.files[ROOT+'settings-before.json'];
  const module={exports:{}};let output='';const process={stdout:{write(s){output+=s;}},exitCode:0};
  const fakeRequire=(name)=>name==='fs'?t.fakeFs:name==='child_process'?{execFile:t.execFile}:require(name);fakeRequire.main=module;
  vm.runInNewContext(source,{require:fakeRequire,module,process,Buffer});
  assert.equal(output,'backup-invalid\n');assert.equal(process.exitCode,1);assert.deepEqual(t.calls,[]);
  assert.doesNotMatch(source,/\bconst\b|\blet\b|=>|\basync\b|\bawait\b|\?\.|\?\?/);
});
