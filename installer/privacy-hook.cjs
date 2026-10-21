'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {makeFiles} = require('./steps-files.cjs');
const ROOT = '/var/lib/mipantalla-maintenance/privacy-rdxd';
const HOOK = '#!/bin/sh\numask 077\n/usr/bin/node '+ROOT+'/privacy-log-settings.js --apply > '+ROOT+'/last-apply.log 2>&1\n';
const hash = body => crypto.createHash('sha256').update(body).digest('hex');
function flags(value) { return value && typeof value.analyticsLog === 'boolean' && typeof value.crashLog === 'boolean'; }

// Node 8 code serialized into a fixed SSH script. Installs files only, never runs the helper.
function remote(input, files) {
  var fs=require('fs'),crypto=require('crypto');
  var root='/var/lib/mipantalla-maintenance/privacy-rdxd';
  var hbc='/var/lib/webosbrew/init.d';
  var script=root+'/privacy-log-settings.js',backup=root+'/settings-before.json',hook=hbc+'/61-mipantalla-privacy-rdxd';
  var record=files.plan+'/privacy-hook-receipt.json';
  function fail(){throw Error('PRIVACY_HOOK_REJECTED');}
  function object(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
  function digest(body){return crypto.createHash('sha256').update(body).digest('hex');}
  function stat(p){try{return fs.lstatSync(p);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  function directory(p,strict){var s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&18)||strict&&(s.mode&511)!==448)fail();}
  function text(p,max,mode){var s=fs.lstatSync(p);if((s.mode&511)!==mode)fail();return files.read(p,max,mode===384);}
  function baseline(){
    var saved=JSON.parse(text(backup,8192,384));
    if(!object(saved)||saved.version!==1||typeof saved.analyticsLog!=='boolean'||typeof saved.crashLog!=='boolean'||
      Object.keys(saved).sort().join(',')!=='analyticsLog,crashLog,version')fail();
    return saved;
  }
  function receipt(){
    var saved=JSON.parse(text(record,32768,384));
    if(!object(saved)||saved.version!==1||saved.backupId!==input.backupId||!Array.isArray(saved.created)||
      Object.keys(saved).sort().join(',')!=='backupId,created,version')fail();
    var seen={};
    saved.created.forEach(function(entry){
      if(!object(entry)||['script','baseline','hook'].indexOf(entry.key)===-1||seen[entry.key]||
        Object.keys(entry).sort().join(',')!=='hash,key'||!/^[a-f0-9]{64}$/.test(entry.hash)||
        entry.key==='hook'&&entry.hash!==input.hookHash)fail();
      seen[entry.key]=true;
    });return saved;
  }
  function output(value){process.stdout.write(JSON.stringify({ok:true,result:value})+'\n');}
  try{
    if(process.getuid()!==0||!/^[a-f0-9]{32}$/.test(input.backupId))fail();
    if(input.action==='restore'){
      if(!stat(files.parent)||!stat(files.parent+'/setup')||!stat(files.plan))return output({status:'skipped',code:'PRIVACY_HOOK_NOT_OWNED',physicalProofPending:true});
      directory(files.parent,false);directory(files.parent+'/setup',true);directory(files.plan,true);
      if(!stat(record))return output({status:'skipped',code:'PRIVACY_HOOK_NOT_OWNED',physicalProofPending:true});
      var old=receipt();if(input.receipt&&JSON.stringify(input.receipt)!==JSON.stringify(old))fail();
      var owned=old.created.some(function(entry){return entry.key==='hook';});
      if(owned&&stat(hook)){
        directory('/var/lib/webosbrew',false);directory(hbc,false);
        if(digest(text(hook,8192,448))!==input.hookHash)fail();
        fs.unlinkSync(hook);
      }
      return output({status:owned?'complete':'skipped',code:'PRIVACY_HOOK_RESTORED',physicalProofPending:true});
    }
    files.prepare();files.directory(root,true);files.directory('/var/lib/webosbrew',false);files.directory(hbc,false);
    var body=Buffer.from(input.script,'base64').toString('utf8');
    if(digest(body)!==input.scriptHash||digest(input.hook)!==input.hookHash)fail();
    var savedBaseline=stat(backup)?baseline():{version:1,analyticsLog:input.previous.analyticsLog,crashLog:input.previous.crashLog};
    if(typeof savedBaseline.analyticsLog!=='boolean'||typeof savedBaseline.crashLog!=='boolean')fail();
    var specs=[{key:'baseline',path:backup,body:JSON.stringify(savedBaseline)+'\n',mode:384},
      {key:'script',path:script,body:body,mode:384},{key:'hook',path:hook,body:input.hook,mode:448}];
    var present=specs.map(function(spec){
      if(!stat(spec.path))return false;
      if(spec.key!=='baseline'&&text(spec.path,32768,spec.mode)!==spec.body)fail();
      return true;
    });
    var log=stat(root+'/last-apply.log');
    if(log&&(!log.isFile()||log.isSymbolicLink()||log.uid!==0||log.nlink!==1||(log.mode&511)!==384))fail();
    var saved=stat(record)?receipt():{version:1,backupId:input.backupId,created:[]};
    // Persist this plan's receipt before creating any global file or boot hook.
    files.write(record,JSON.stringify(saved)+'\n',384,!stat(record));
    var created=0;
    specs.forEach(function(spec,index){
      if(present[index])return;
      // Persist ownership intent before startup persistence can exist.
      if(!saved.created.some(function(entry){return entry.key===spec.key;}))saved.created.push({key:spec.key,hash:digest(spec.body)});
      files.write(record,JSON.stringify(saved)+'\n',384,false);
      files.write(spec.path,spec.body,spec.mode,true);
      if(text(spec.path,32768,spec.mode)!==spec.body)fail();
      created++;
    });
    output({status:created?'complete':'skipped',code:'PRIVACY_HOOK_CONFIGURED',physicalProofPending:true,receipt:saved});
  }catch(ignored){process.stdout.write('{"ok":false,"code":"PRIVACY_HOOK_REJECTED"}\n');}
}

async function action(transport,options,mode){
  if(!options||!/^[a-f0-9]{32}$/.test(options.backupId||'')||mode==='apply'&&!flags(options.previous))throw Error('PRIVACY_HOOK_ARGUMENTS');
  const source=fs.readFileSync(path.join(__dirname,'../scripts/tv/privacy-log-settings.js'),'utf8').replace(/\r\n/g,'\n');
  const input={action:mode,backupId:options.backupId,receipt:options.receipt,
    previous:options.previous&&{analyticsLog:options.previous.analyticsLog,crashLog:options.previous.crashLog},
    script:Buffer.from(source).toString('base64'),scriptHash:hash(source),hook:HOOK,hookHash:hash(HOOK)};
  const encoded=Buffer.from(JSON.stringify(input)).toString('base64');
  const script="set -eu\n/usr/bin/node - <<'MP_PRIVACY_HOOK_NODE'\n'use strict';\n"+
    'var fs=require("fs"),input=JSON.parse(Buffer.from("'+encoded+'","base64").toString("utf8"));\n'+
    'var files=('+makeFiles.toString()+')(fs,input.backupId);\n('+remote.toString()+')(input,files);\nMP_PRIVACY_HOOK_NODE\n';
  const response=await transport.runRemote(script,{timeoutMs:20000});let reply;
  try{if(typeof response.stdout!=='string'||Buffer.byteLength(response.stdout)>32768)throw Error();reply=JSON.parse(response.stdout);}catch{throw Error('PRIVACY_HOOK_UNCONFIRMED');}
  const result=reply&&reply.ok===true&&reply.result;
  if(!result||!['complete','skipped'].includes(result.status)||result.physicalProofPending!==true)throw Error('PRIVACY_HOOK_REJECTED');
  if(mode==='restore'){
    if(result.code!=='PRIVACY_HOOK_RESTORED'&&!(result.status==='skipped'&&result.code==='PRIVACY_HOOK_NOT_OWNED'))throw Error('PRIVACY_HOOK_UNCONFIRMED');
  }else{
    const saved=result.receipt,seen=new Set();
    if(result.code!=='PRIVACY_HOOK_CONFIGURED'||!saved||saved.version!==1||saved.backupId!==options.backupId||!Array.isArray(saved.created)||
      Object.keys(saved).sort().join(',')!=='backupId,created,version')throw Error('PRIVACY_HOOK_UNCONFIRMED');
    for(const entry of saved.created){
      if(!entry||!['script','baseline','hook'].includes(entry.key)||seen.has(entry.key)||Object.keys(entry).sort().join(',')!=='hash,key'||
        !/^[a-f0-9]{64}$/.test(entry.hash)||entry.key==='hook'&&entry.hash!==hash(HOOK)||entry.key==='script'&&entry.hash!==hash(source))throw Error('PRIVACY_HOOK_UNCONFIRMED');
      seen.add(entry.key);
    }
  }return result;
}
const ensurePrivacyHook=(transport,options)=>action(transport,options,'apply');
const restorePrivacyHook=(transport,options)=>action(transport,options,'restore');
module.exports={ensurePrivacyHook,restorePrivacyHook};
