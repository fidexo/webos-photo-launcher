'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const file = path.join(__dirname, '../installer/home-hooks.cjs');
const api = fs.existsSync(file) ? require(file) : {};
const ID = 'b'.repeat(32), BASE = '/var/lib/mipantalla-maintenance';
const NATIVE = BASE + '/native-home', HBC = '/var/lib/webosbrew/init.d';
const TARGET = '/media/developer/apps/usr/palm/services/com.frxn.mipantalla.lights/home-autostart.sh';
const GUARD = NATIVE + '/native-home-guard.js';
const HOOK59 = HBC + '/59-mipantalla-home-guard', HOOK60 = HBC + '/60-mipantalla-home';
const original = {category:'general',settings:{defaultApps:{home:'com.webos.app.fullhome',browser:'PRESERVE'}}};
function fixture(fault) {
  const entries = {}, events = []; let ino = 1;
  const missing = () => Object.assign(Error('private detail'), {code:'ENOENT'});
  function cut(p,when) { if(fault&&fault.path===p&&fault.when===when&&!fault.hit){fault.hit=true;throw Error('simulated power cut');} }
  function put(p, body = '', mode = 384, dir = false) { entries[p] = {body,mode,dir,uid:0,ino:ino++}; }
  function stat(e) { return {mode:e.mode,uid:e.uid,nlink:e.nlink || 1,size:Buffer.byteLength(e.body),ino:e.ino,dev:1,isFile:()=>!e.dir&&!e.target,isDirectory:()=>e.dir&&!e.target,isSymbolicLink:()=>!!e.target}; }
  for (const p of [BASE, '/var/lib/webosbrew', HBC]) put(p, '', 493, true);
  put(path.posix.dirname(TARGET),'',493,true);
  put(TARGET, fs.readFileSync(path.join(__dirname, '../services/com.frxn.mipantalla.lights/home-autostart.sh'), 'utf8'), 420);
  for (const name of ['home-watch.js','home-input.js','home-power.js']) put(path.posix.dirname(TARGET)+'/'+name, 'source', 420);
  const constants = {O_RDONLY:0,O_WRONLY:1,O_CREAT:64,O_EXCL:128,O_NOFOLLOW:131072};
  const f = {constants,lstatSync(p) { if (!entries[p]) throw missing(); return stat(entries[p]); },
    mkdirSync(p,mode) { if (entries[p]) throw Object.assign(Error('exists'),{code:'EEXIST'}); put(p,'',mode,true); },
    openSync(p,flags,mode) { assert.ok(flags&constants.O_NOFOLLOW); if (flags&constants.O_EXCL) { if (entries[p]) throw Object.assign(Error('exists'),{code:'EEXIST'}); cut(p,'before'); put(p,'',mode); events.push('create:'+p); } if (!entries[p]) throw missing(); if (entries[p].target) throw Error('link'); return p; },
    fstatSync(p) { return stat(entries[p]); }, readSync(p,b,o,n) { return Buffer.from(entries[p].body).copy(b,o,0,n); },
    closeSync(p) { if(events.includes('write:'+p))cut(p,'after'); }, fsyncSync() {}, ftruncateSync(p) { entries[p].body=''; },
    fchmodSync(p,mode) { entries[p].mode=mode; events.push('chmod:'+p); },
    writeFileSync(p,body) { entries[p].body=String(body); events.push('write:'+p); },
    symlinkSync(target,p) { if (entries[p]) throw Error('exists'); cut(p,'before');put(p); entries[p].target=target; events.push('create:'+p);cut(p,'after'); },
    readlinkSync(p) { if (!entries[p] || !entries[p].target) throw Error('not link'); return entries[p].target; },
    renameSync(from,to) { cut(to,'before');if(!entries[to])events.push('create:'+to);entries[to]=entries[from];delete entries[from];events.push('write:'+to);cut(to,'after'); },
    linkSync(from,to) { cut(to,'before');if(entries[to])throw Object.assign(Error('exists'),{code:'EEXIST'});entries[to]=entries[from];entries[to].nlink=(entries[to].nlink||1)+1;events.push('create:'+to,'write:'+to);cut(to,'after'); },
    unlinkSync(p) { if (!entries[p]) throw missing(); if(entries[p].nlink>1)entries[p].nlink--;delete entries[p]; events.push('remove:'+p); }
  };
  const transport = {async runRemote(script) {
    assert.ok(!script.includes('kill ') && !script.includes('execFile'), 'hook setup never starts or kills a watcher');
    const source = script.split("MP_HOME_HOOKS_NODE'\n")[1].split('\nMP_HOME_HOOKS_NODE')[0]; let stdout = '';
    vm.runInNewContext(source, {require(name) { if (name==='fs') return f; if(name==='crypto')return crypto; throw Error('unexpected module'); },Buffer,process:{getuid:()=>0,stdout:{write(s){stdout+=s;}}}});
    return {stdout};
  }};
  return {entries,events,put,transport};
}

test('creates verified hooks, preserves an original baseline and records only owned files', async () => {
  assert.equal(typeof api.ensureHomeHooks,'function');
  const f = fixture(); const result = await api.ensureHomeHooks(f.transport,{backupId:ID,previousHome:original.settings.defaultApps.home});
  assert.equal(result.status,'complete'); assert.equal(result.physicalProofPending,true);
  assert.equal(f.entries[HOOK60].target,TARGET); assert.equal(f.entries[HOOK59].mode,448);
  assert.equal(f.entries[GUARD].body,fs.readFileSync(path.join(__dirname,'../scripts/tv/native-home-guard.js'),'utf8'));
  assert.equal(f.entries[TARGET].mode,448);
  assert.equal(JSON.parse(f.entries[NATIVE+'/settings-before.json'].body).settings.defaultApps.home,'com.webos.app.fullhome');
  assert.ok(result.receipt); const again = await api.ensureHomeHooks(f.transport,{backupId:ID});
  assert.equal(again.status,'skipped'); assert.deepEqual(again.receipt,result.receipt);
});

test('does not infer the old Home, overwrite a baseline, or accept an unsafe original', async () => {
  const fresh = fixture(); await assert.rejects(api.ensureHomeHooks(fresh.transport,{backupId:ID}));
  assert.equal(fresh.entries[HOOK59],undefined);
  const f = fixture(); f.put(NATIVE,'',448,true); f.put(NATIVE+'/settings-before.json',JSON.stringify(original));
  await api.ensureHomeHooks(f.transport,{backupId:ID,previousHome:'com.frxn.mipantalla'});
  assert.equal(f.entries[NATIVE+'/settings-before.json'].body,JSON.stringify(original));
  const bad = fixture(); bad.put(NATIVE,'',448,true); bad.put(NATIVE+'/settings-before.json','{}');
  await assert.rejects(api.ensureHomeHooks(bad.transport,{backupId:ID,previousHome:'com.webos.app.fullhome'}));
  assert.equal(bad.entries[HOOK59],undefined);
});

test('foreign hooks, unsafe directories and changed autostart source fail before hook creation', async () => {
  for (const conflict of ['hook','directory','source']) {
    const f = fixture();
    if (conflict==='hook') f.put(HOOK59,'#!/bin/sh\necho foreign\n',448);
    if (conflict==='directory') f.entries[HBC].mode=511;
    if (conflict==='source') f.entries[TARGET].body+='\necho foreign\n';
    await assert.rejects(api.ensureHomeHooks(f.transport,{backupId:ID,previousHome:'com.webos.app.fullhome'}));
    assert.equal(f.entries[HOOK60],undefined); assert.ok(!f.events.includes('chmod:'+TARGET));
  }
});

test('restore removes only files created by this plan and preserves baselines and pre-existing hooks', async () => {
  const f = fixture(); const result = await api.ensureHomeHooks(f.transport,{backupId:ID,previousHome:'com.webos.app.fullhome'});
  await api.restoreHomeHooks(f.transport,{backupId:ID,receipt:result.receipt});
  for (const name of [HOOK59,HOOK60,GUARD,NATIVE+'/enabled']) assert.equal(f.entries[name],undefined);
  assert.ok(f.entries[NATIVE+'/settings-before.json']); assert.ok(f.entries[TARGET]);
  const other = fixture(); const first = await api.ensureHomeHooks(other.transport,{backupId:ID,previousHome:'com.webos.app.fullhome'});
  const secondId = 'c'.repeat(32); await api.ensureHomeHooks(other.transport,{backupId:secondId});
  await api.restoreHomeHooks(other.transport,{backupId:secondId});
  assert.ok(other.entries[HOOK59]); assert.ok(other.entries[HOOK60]);
  await api.restoreHomeHooks(other.transport,{backupId:ID,receipt:first.receipt});
});

test('restore checks every receipt target and hash before deleting anything', async () => {
  const f = fixture(); const result = await api.ensureHomeHooks(f.transport,{backupId:ID,previousHome:'com.webos.app.fullhome'});
  f.entries[HOOK60].target='/foreign.sh';
  await assert.rejects(api.restoreHomeHooks(f.transport,{backupId:ID,receipt:result.receipt}));
  assert.ok(f.entries[HOOK59]); assert.ok(f.entries[GUARD]); assert.ok(f.entries[NATIVE+'/enabled']);
});

test('rejects unsafe IDs before contacting the transport', async () => {
  let calls=0; const transport={runRemote(){calls++;throw Error('unexpected');}};
  for (const backupId of ['../../other','x'.repeat(32),'']) await assert.rejects(api.ensureHomeHooks(transport,{backupId,previousHome:'com.webos.app.fullhome'}));
  assert.equal(calls,0);
});

test('a present falsy JSON baseline cannot be mistaken for an absent baseline', async () => {
  for (const value of ['null','false','0','""']) {
    const f=fixture(); f.put(NATIVE,'',448,true); f.put(NATIVE+'/settings-before.json',value);
    await assert.rejects(api.ensureHomeHooks(f.transport,{backupId:ID,previousHome:'com.webos.app.fullhome'}));
    assert.equal(f.entries[HOOK59],undefined); assert.equal(f.entries[NATIVE+'/settings-before.json'].body,value);
  }
});

test('the service directory must be real, root-owned and not writable by other users', async () => {
  for (const kind of ['link','writable','foreign']) {
    const f=fixture(), dir=f.entries[path.posix.dirname(TARGET)];
    if(kind==='link')dir.target='/foreign'; if(kind==='writable')dir.mode=511; if(kind==='foreign')dir.uid=1000;
    await assert.rejects(api.ensureHomeHooks(f.transport,{backupId:ID,previousHome:'com.webos.app.fullhome'}));
    assert.equal(f.entries[HOOK60],undefined); assert.ok(!f.events.includes('chmod:'+TARGET));
  }
});

test('malformed remote success cannot confirm configured hooks', async () => {
  for (const result of [{status:'complete'},{status:'complete',code:'OTHER',physicalProofPending:true},
    {status:'complete',code:'HOME_HOOKS_CONFIGURED',physicalProofPending:true,receipt:{version:1,backupId:ID,created:[{key:'foreign'}]}}]) {
    const transport={async runRemote(){return{stdout:JSON.stringify({ok:true,result})};}};
    await assert.rejects(api.ensureHomeHooks(transport,{backupId:ID,previousHome:'com.webos.app.fullhome'}));
  }
});

test('write-ahead intent survives cuts immediately before and after Home hook creation', async () => {
  for(const target of [HOOK59,HOOK60])for(const when of ['before','after']){
    const fault={path:target,when};const f=fixture(fault);
    await assert.rejects(api.ensureHomeHooks(f.transport,{backupId:ID,previousHome:'com.webos.app.fullhome'}));
    assert.equal(fault.hit,true);
    const receipt=JSON.parse(f.entries[BASE+'/setup/'+ID+'/home-hooks-receipt.json'].body);
    assert.ok(receipt.created.some(entry=>entry.key===(target===HOOK59?'hook59':'hook60')),'durable intent precedes creating the global hook');
    await api.restoreHomeHooks(f.transport,{backupId:ID});
    assert.equal(f.entries[target],undefined,'restore removes a matching committed hook or skips an absent one');
    assert.ok(f.entries[NATIVE+'/settings-before.json']);
  }
});
