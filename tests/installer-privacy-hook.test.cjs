'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const modulePath = path.join(__dirname,'../installer/privacy-hook.cjs');
const api = fs.existsSync(modulePath) ? require(modulePath) : {};
const ID='d'.repeat(32), BASE='/var/lib/mipantalla-maintenance', ROOT=BASE+'/privacy-rdxd';
const SCRIPT=ROOT+'/privacy-log-settings.js', BACKUP=ROOT+'/settings-before.json';
const HOOK='/var/lib/webosbrew/init.d/61-mipantalla-privacy-rdxd';
const previous={analyticsLog:true,crashLog:false};
const baseline=JSON.stringify({version:1,analyticsLog:true,crashLog:false})+'\n';
const hook='#!/bin/sh\numask 077\n/usr/bin/node '+SCRIPT+' --apply > '+ROOT+'/last-apply.log 2>&1\n';
function fixture(fault) {
  const entries={},events=[];let ino=1;
  const missing=()=>Object.assign(Error('private'),{code:'ENOENT'});
  function cut(p,when){if(fault&&fault.path===p&&fault.when===when&&!fault.hit){fault.hit=true;throw Error('simulated power cut');}}
  const put=(p,body='',mode=384,dir=false)=>{entries[p]={body,mode,dir,uid:0,nlink:1,ino:ino++};};
  const stat=e=>({uid:e.uid,mode:e.mode,nlink:e.nlink,size:Buffer.byteLength(e.body),ino:e.ino,dev:1,
    isFile:()=>!e.dir&&!e.link,isDirectory:()=>e.dir&&!e.link,isSymbolicLink:()=>!!e.link});
  for(const p of [BASE,'/var/lib/webosbrew','/var/lib/webosbrew/init.d'])put(p,'',493,true);
  const f={constants:{O_RDONLY:0,O_WRONLY:1,O_CREAT:64,O_EXCL:128,O_NOFOLLOW:131072},
    mkdirSync(p,mode){if(entries[p])throw Object.assign(Error('exists'),{code:'EEXIST'});put(p,'',mode,true);},
    lstatSync(p){if(!entries[p])throw missing();return stat(entries[p]);},
    openSync(p,flags,mode){assert.ok(flags&131072);if(flags&128){if(entries[p])throw Object.assign(Error('exists'),{code:'EEXIST'});cut(p,'before');put(p,'',mode);events.push('create:'+p);}if(!entries[p])throw missing();if(entries[p].link)throw Error('link');return p;},
    fstatSync(p){return stat(entries[p]);},closeSync(p){if(events.includes('write:'+p))cut(p,'after');},fsyncSync(){},
    fchmodSync(p,mode){entries[p].mode=mode;},ftruncateSync(p){entries[p].body='';},
    readSync(p,b,o,n){return Buffer.from(entries[p].body).copy(b,o,0,n);},
    writeFileSync(p,body){entries[p].body=String(body);events.push('write:'+p);},
    renameSync(from,to){cut(to,'before');if(!entries[to])events.push('create:'+to);entries[to]=entries[from];delete entries[from];events.push('write:'+to);cut(to,'after');},
    linkSync(from,to){cut(to,'before');if(entries[to])throw Object.assign(Error('exists'),{code:'EEXIST'});entries[to]=entries[from];entries[to].nlink++;events.push('create:'+to,'write:'+to);cut(to,'after');},
    unlinkSync(p){if(entries[p]&&entries[p].nlink>1)entries[p].nlink--;delete entries[p];events.push('remove:'+p);}
  };
  const transport={async runRemote(script){
    const source=script.split("MP_PRIVACY_HOOK_NODE'\n")[1].split('\nMP_PRIVACY_HOOK_NODE')[0];let stdout='';
    vm.runInNewContext(source,{require(name){if(name==='fs')return f;if(name==='crypto')return crypto;throw Error('No process execution allowed');},Buffer,process:{getuid:()=>0,stdout:{write(s){stdout+=s;}}}});
    return{stdout};
  }};
  return{entries,events,put,transport};
}
test('creates protected helper, original baseline and exact startup hook without executing them',async()=>{
  assert.equal(typeof api.ensurePrivacyHook,'function');const f=fixture();
  const result=await api.ensurePrivacyHook(f.transport,{backupId:ID,previous});
  assert.equal(result.status,'complete');assert.equal(result.physicalProofPending,true);
  assert.equal(f.entries[ROOT].mode,448);assert.equal(f.entries[BACKUP].body,baseline);assert.equal(f.entries[BACKUP].mode,384);
  assert.equal(f.entries[SCRIPT].body,fs.readFileSync(path.join(__dirname,'../scripts/tv/privacy-log-settings.js'),'utf8'));
  assert.equal(f.entries[HOOK].body,hook);assert.equal(f.entries[HOOK].mode,448);
  const receiptWrite=f.events.indexOf('write:'+BASE+'/setup/'+ID+'/privacy-hook-receipt.json');
  assert.ok(receiptWrite<f.events.indexOf('create:'+BACKUP));
});
test('adopts identical pre-existing files and never overwrites an earlier valid baseline',async()=>{
  const f=fixture();await api.ensurePrivacyHook(f.transport,{backupId:ID,previous});
  const second='e'.repeat(32);const r=await api.ensurePrivacyHook(f.transport,{backupId:second,previous:{analyticsLog:false,crashLog:false}});
  assert.equal(r.status,'skipped');assert.equal(f.entries[BACKUP].body,baseline);
  await api.restorePrivacyHook(f.transport,{backupId:second,receipt:r.receipt});assert.ok(f.entries[HOOK]);
});
test('corrupt, falsy, permissive, symlink and oversized backups cannot enable a hook',async()=>{
  for(const value of ['null','false','{}','{',' '.repeat(8193),JSON.stringify({version:1,...previous,extra:true})]){
    const f=fixture();f.put(ROOT,'',448,true);f.put(BACKUP,value);
    await assert.rejects(api.ensurePrivacyHook(f.transport,{backupId:ID,previous}));assert.equal(f.entries[HOOK],undefined);
  }
  for(const patch of [{mode:420},{uid:1000},{link:true},{nlink:2}]){
    const f=fixture();f.put(ROOT,'',448,true);f.put(BACKUP,baseline);Object.assign(f.entries[BACKUP],patch);
    await assert.rejects(api.ensurePrivacyHook(f.transport,{backupId:ID,previous}));assert.equal(f.entries[HOOK],undefined);
  }
});
test('foreign helper/hook and unsafe directories fail before creating the baseline',async()=>{
  for(const kind of ['helper','hook','directory','log']){
    const f=fixture();f.put(ROOT,'',448,true);
    if(kind==='helper')f.put(SCRIPT,'foreign');if(kind==='hook')f.put(HOOK,'foreign',448);
    if(kind==='directory')f.entries[ROOT].mode=511;
    if(kind==='log'){f.put(ROOT+'/last-apply.log','');f.entries[ROOT+'/last-apply.log'].link=true;}
    await assert.rejects(api.ensurePrivacyHook(f.transport,{backupId:ID,previous}));assert.equal(f.entries[BACKUP],undefined);
  }
});
test('restore removes only this plan hook after hash verification and keeps recovery material',async()=>{
  const f=fixture(),r=await api.ensurePrivacyHook(f.transport,{backupId:ID,previous});
  f.entries[HOOK].body+='foreign';await assert.rejects(api.restorePrivacyHook(f.transport,{backupId:ID,receipt:r.receipt}));assert.ok(f.entries[HOOK]);
  f.entries[HOOK].body=hook;await api.restorePrivacyHook(f.transport,{backupId:ID,receipt:r.receipt});
  assert.equal(f.entries[HOOK],undefined);assert.ok(f.entries[SCRIPT]);assert.ok(f.entries[BACKUP]);
});
test('invalid arguments and malformed receipts do not confirm persistent privacy',async()=>{
  let calls=0;const transport={async runRemote(){calls++;return{stdout:'{"ok":true,"result":{"status":"complete"}}'};}};
  for(const options of [{backupId:'bad',previous},{backupId:ID,previous:{analyticsLog:'off',crashLog:false}}])await assert.rejects(api.ensurePrivacyHook(transport,options));
  assert.equal(calls,0);await assert.rejects(api.ensurePrivacyHook(transport,{backupId:ID,previous}));
  const f=fixture();await api.ensurePrivacyHook(f.transport,{backupId:ID,previous});
  const receipt=BASE+'/setup/'+ID+'/privacy-hook-receipt.json';f.entries[receipt].body=JSON.stringify({version:1,backupId:ID,created:[{key:'foreign',hash:'a'.repeat(64)}]});
  await assert.rejects(api.restorePrivacyHook(f.transport,{backupId:ID}));assert.ok(f.entries[HOOK]);
});

test('write-ahead intent survives a cut before or after the global startup hook is created',async()=>{
  for(const when of ['before','after']){
    const fault={path:HOOK,when};const f=fixture(fault);
    await assert.rejects(api.ensurePrivacyHook(f.transport,{backupId:ID,previous}));assert.equal(fault.hit,true);
    const receipt=JSON.parse(f.entries[BASE+'/setup/'+ID+'/privacy-hook-receipt.json'].body);
    assert.ok(receipt.created.some(entry=>entry.key==='hook'),'intent is durable before startup persistence exists');
    await api.restorePrivacyHook(f.transport,{backupId:ID});assert.equal(f.entries[HOOK],undefined);
    assert.ok(f.entries[SCRIPT]);assert.ok(f.entries[BACKUP]);
  }
});
