'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeFiles}=require('../installer/steps-files.cjs');
const BASE='/var/lib/mipantalla-maintenance',ID='e'.repeat(32),FILE=BASE+'/setup/'+ID+'/receipt.json';
function fixture(failAt){
  const entries={},handles={},events=[];let ino=1,nextFd=1;
  function missing(){return Object.assign(Error('missing'),{code:'ENOENT'});}
  function put(p,body,mode=384,dir=false){entries[p]={body,mode,dir,uid:0,ino:ino++};}
  function stat(e){return {uid:e.uid,mode:e.mode,nlink:1,size:Buffer.byteLength(e.body),ino:e.ino,dev:1,
    isFile:()=>!e.dir&&!e.link,isDirectory:()=>e.dir,isSymbolicLink:()=>!!e.link};}
  for(const p of [BASE,BASE+'/setup',BASE+'/setup/'+ID])put(p,'',448,true);
  put(FILE,'{"phase":"prepared"}');
  const f={constants:{O_RDONLY:0,O_WRONLY:1,O_CREAT:64,O_EXCL:128,O_NOFOLLOW:131072},
    lstatSync(p){if(!entries[p])throw missing();return stat(entries[p]);},
    openSync(p,flags,mode){assert.ok(flags&131072);if(flags&128){if(failAt==='collision'){put(p,'foreign');throw Object.assign(Error('exists'),{code:'EEXIST'});}assert.equal(entries[p],undefined);put(p,'',mode);events.push('create:'+p);}if(!entries[p])throw missing();if(entries[p].link)throw Error('link');const fd=nextFd++;handles[fd]=entries[p];return fd;},
    fstatSync(fd){return stat(handles[fd]);},closeSync(fd){delete handles[fd];},
    fchmodSync(fd,mode){handles[fd].mode=mode;},ftruncateSync(fd){handles[fd].body='';},
    readSync(fd,b,o,n){return Buffer.from(handles[fd].body).copy(b,o,0,n);},
    writeFileSync(fd,body){handles[fd].body=String(body);if(failAt==='write'){handles[fd].body=String(body).slice(0,5);throw Error('interrupted write');}},
    fsyncSync(){events.push('fsync');if(failAt==='fsync')throw Error('interrupted sync');if(failAt==='swap')put(FILE,'foreign');},
    renameSync(from,to){events.push('rename');if(failAt==='rename')throw Error('interrupted rename');entries[to]=entries[from];delete entries[from];},
    unlinkSync(p){delete entries[p];events.push('cleanup:'+p);}
  };
  return {files:makeFiles(f,ID),entries,events};
}
test('interrupted TV receipt replacement never truncates the previous JSON or leaves a transaction file',()=>{
  for(const failure of ['write','fsync','rename']){
    const f=fixture(failure);assert.throws(()=>f.files.write(FILE,'{"phase":"applied"}',384,false));
    assert.equal(f.entries[FILE].body,'{"phase":"prepared"}');
    assert.deepEqual(Object.keys(f.entries).filter(p=>p.startsWith(FILE+'.')),[]);
  }
});
test('TV receipt replacement fsyncs before publishing, keeps private mode and rejects a changed destination',()=>{
  const f=fixture();f.files.write(FILE,'{"phase":"applied"}',384,false);
  assert.equal(f.entries[FILE].body,'{"phase":"applied"}');assert.equal(f.entries[FILE].mode,384);
  assert.ok(f.events.indexOf('fsync')<f.events.indexOf('rename'));assert.ok(f.events.includes('rename'));
  const changed=fixture('swap');assert.throws(()=>changed.files.write(FILE,'new',384,false));
  assert.equal(changed.entries[FILE].body,'foreign');assert.ok(!changed.events.includes('rename'));
});
test('a rejected exclusive transaction open never deletes a file it did not create',()=>{
  const f=fixture('collision');assert.throws(()=>f.files.write(FILE,'new',384,false));
  assert.equal(f.entries[FILE].body,'{"phase":"prepared"}');
  const leftovers=Object.keys(f.entries).filter(p=>p.startsWith(FILE+'.tmp-'));
  assert.equal(leftovers.length,1);assert.equal(f.entries[leftovers[0]].body,'foreign');
});
