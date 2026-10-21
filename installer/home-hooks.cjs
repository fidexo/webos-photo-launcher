'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {makeFiles} = require('./steps-files.cjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

// Serialized into Node 8 on the TV; never launches the watcher or calls Luna.
function remote(input, files) {
  var fs = require('fs'), crypto = require('crypto');
  var native = '/var/lib/mipantalla-maintenance/native-home';
  var hbc = '/var/lib/webosbrew/init.d';
  var service = '/media/developer/apps/usr/palm/services/com.frxn.mipantalla.lights';
  var guard = native + '/native-home-guard.js';
  var source = service + '/home-autostart.sh';
  var baseline = native + '/settings-before.json';
  var record = files.plan + '/home-hooks-receipt.json';
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
  function home(value) { return typeof value === 'string' && value !== 'com.frxn.mipantalla' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value); }
  function fail() { throw Error('HOME_HOOKS_REJECTED'); }
  function stat(file) { try { return fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
  function directory(file, strict) {
    var s = fs.lstatSync(file);
    if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== 0 || (s.mode & 18) || strict && (s.mode & 511) !== 448) fail();
  }
  function text(file, max, mode) {
    var s = fs.lstatSync(file);
    if ((s.mode & 18) || mode && (s.mode & 511) !== mode) fail();
    return files.read(file, max, mode === 384);
  }
  var hook59 = '#!/bin/sh\n/usr/bin/node ' + guard + '\nexit 0\n';
  var specs = [
    {key:'guard',path:guard,body:Buffer.from(input.guard,'base64').toString('utf8'),mode:384},
    {key:'hook59',path:hbc+'/59-mipantalla-home-guard',body:hook59,mode:448},
    {key:'hook60',path:hbc+'/60-mipantalla-home',target:source},
    {key:'enabled',path:native+'/enabled',body:'',mode:384}
  ];
  function expected(spec) { return spec.target ? {key:spec.key,target:spec.target} : {key:spec.key,hash:digest(spec.body)}; }
  function inspect(spec) {
    var s = stat(spec.path);
    if (!s) return false;
    if (spec.target) {
      if (!s.isSymbolicLink() || s.uid !== 0 || s.nlink !== 1 || fs.readlinkSync(spec.path) !== spec.target) fail();
    } else if (text(spec.path, 32768, spec.mode) !== spec.body) fail();
    return true;
  }
  function receipt() {
    var saved = JSON.parse(text(record,32768,384));
    if (!object(saved) || saved.version !== 1 || saved.backupId !== input.backupId || !Array.isArray(saved.created) ||
        Object.keys(saved).sort().join(',') !== 'backupId,created,version') fail();
    var seen = {};
    saved.created.forEach(function(entry) {
      var spec = specs.filter(function(value) { return value.key === entry.key; })[0];
      if (!spec || seen[entry.key] || JSON.stringify(entry) !== JSON.stringify(expected(spec))) fail();
      seen[entry.key] = true;
    });
    return saved;
  }
  function output(result) { process.stdout.write(JSON.stringify({ok:true,result:result})+'\n'); }
  try {
    if (process.getuid() !== 0 || !/^[a-f0-9]{32}$/.test(input.backupId) || digest(specs[0].body) !== input.guardHash) fail();
    if (input.action === 'restore') {
      if (!stat(files.parent) || !stat(files.parent+'/setup') || !stat(files.plan)) return output({status:'skipped',code:'HOME_HOOKS_NOT_OWNED'});
      directory(files.parent,false); directory(files.parent+'/setup',true); directory(files.plan,true);
      if (!stat(record)) return output({status:'skipped',code:'HOME_HOOKS_NOT_OWNED'});
      var old = receipt();
      if (input.receipt && JSON.stringify(input.receipt) !== JSON.stringify(old)) fail();
      if (stat(native)) directory(native,true);
      if (stat('/var/lib/webosbrew')) directory('/var/lib/webosbrew',false);
      if (stat(hbc)) directory(hbc,false);
      var owned = old.created.map(function(entry) { return specs.filter(function(spec) { return spec.key === entry.key; })[0]; });
      owned.forEach(inspect);
      owned.sort(function(a,b) { return a.key === 'guard' ? 1 : b.key === 'guard' ? -1 : 0; });
      owned.forEach(function(spec) { if (inspect(spec)) fs.unlinkSync(spec.path); });
      return output({status:'complete',code:'HOME_HOOKS_RESTORED',physicalProofPending:true});
    }
    files.prepare();
    files.directory(native,true); files.directory('/var/lib/webosbrew',false); files.directory(hbc,false);
    var baselinePresent = !!stat(baseline);
    var original = baselinePresent ? JSON.parse(text(baseline,32768,384)) : null;
    if (baselinePresent) {
      if (!object(original) || original.category !== 'general' || !object(original.settings) || !object(original.settings.defaultApps) || !home(original.settings.defaultApps.home)) fail();
    } else {
      if (!home(input.previousHome)) fail();
      original = {category:'general',settings:{defaultApps:{home:input.previousHome}}};
    }
    var present = specs.map(inspect);
    directory(service,false);
    if (digest(text(source,8192)) !== input.autostartHash) fail();
    ['home-watch.js','home-input.js','home-power.js'].forEach(function(name) { text(service+'/'+name,131072); });
    var saved = stat(record) ? receipt() : {version:1,backupId:input.backupId,created:[]};
    if (!stat(baseline)) files.write(baseline,JSON.stringify(original)+'\n',384,true);
    // Recheck the exact opened source before changing its permissions.
    var fd = fs.openSync(source,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try {
      var s = fs.fstatSync(fd);
      if (!s.isFile() || s.uid !== 0 || s.nlink !== 1 || s.size > 8192 || (s.mode & 18)) fail();
      var bytes = Buffer.alloc(s.size+1), count = fs.readSync(fd,bytes,0,bytes.length,0);
      if (count !== s.size || digest(bytes.slice(0,count)) !== input.autostartHash) fail();
      fs.fchmodSync(fd,448);
    } finally { fs.closeSync(fd); }
    files.write(record,JSON.stringify(saved)+'\n',384,!stat(record));
    var created = 0;
    specs.forEach(function(spec,index) {
      if (present[index]) return;
      // Write-ahead intent survives a cut between creating the hook and its ACK.
      if (!saved.created.some(function(entry) { return entry.key === spec.key; })) saved.created.push(expected(spec));
      files.write(record,JSON.stringify(saved)+'\n',384,false);
      if (spec.target) fs.symlinkSync(spec.target,spec.path); else files.write(spec.path,spec.body,spec.mode,true);
      inspect(spec); created++;
    });
    output({status:created?'complete':'skipped',code:'HOME_HOOKS_CONFIGURED',physicalProofPending:true,receipt:saved});
  } catch (ignored) { process.stdout.write('{"ok":false,"code":"HOME_HOOKS_REJECTED"}\n'); }
}

async function action(transport, options, mode) {
  if (!options || !/^[a-f0-9]{32}$/.test(options.backupId || '') ||
      options.previousHome !== undefined && (typeof options.previousHome !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(options.previousHome))) throw Error('HOME_HOOKS_ARGUMENTS');
  const guard = fs.readFileSync(path.join(__dirname,'../scripts/tv/native-home-guard.js'),'utf8').replace(/\r\n/g,'\n');
  const autostart = fs.readFileSync(path.join(__dirname,'../services/com.frxn.mipantalla.lights/home-autostart.sh'));
  const input = {action:mode,backupId:options.backupId,previousHome:options.previousHome,receipt:options.receipt,
    guard:Buffer.from(guard).toString('base64'),guardHash:hash(guard),autostartHash:hash(autostart)};
  const encoded = Buffer.from(JSON.stringify(input)).toString('base64');
  const script = "set -eu\n/usr/bin/node - <<'MP_HOME_HOOKS_NODE'\n'use strict';\n"+
    'var fs=require("fs"), input=JSON.parse(Buffer.from("'+encoded+'","base64").toString("utf8"));\n'+
    'var files=('+makeFiles.toString()+')(fs,input.backupId);\n('+remote.toString()+')(input,files);\nMP_HOME_HOOKS_NODE\n';
  const result = await transport.runRemote(script,{timeoutMs:20000});
  let reply;
  try { if (typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout)>32768) throw Error(); reply=JSON.parse(result.stdout); } catch { throw Error('HOME_HOOKS_UNCONFIRMED'); }
  if (!reply || reply.ok !== true || !reply.result || !['complete','skipped'].includes(reply.result.status)) throw Error('HOME_HOOKS_REJECTED');
  const value = reply.result;
  if (mode === 'restore') {
    if (value.status === 'skipped' && value.code === 'HOME_HOOKS_NOT_OWNED') return value;
    if (value.code !== 'HOME_HOOKS_RESTORED' || value.physicalProofPending !== true) throw Error('HOME_HOOKS_UNCONFIRMED');
  } else {
    const saved = value.receipt, target='/media/developer/apps/usr/palm/services/com.frxn.mipantalla.lights/home-autostart.sh';
    const expected = {guard:hash(guard),hook59:hash('#!/bin/sh\n/usr/bin/node /var/lib/mipantalla-maintenance/native-home/native-home-guard.js\nexit 0\n'),enabled:hash('')};
    const seen = new Set();
    if (value.code !== 'HOME_HOOKS_CONFIGURED' || value.physicalProofPending !== true || !saved ||
        saved.version !== 1 || saved.backupId !== options.backupId || !Array.isArray(saved.created) ||
        Object.keys(saved).sort().join(',') !== 'backupId,created,version') throw Error('HOME_HOOKS_UNCONFIRMED');
    for (const entry of saved.created) {
      if (!entry || seen.has(entry.key)) throw Error('HOME_HOOKS_UNCONFIRMED');
      const valid = entry.key === 'hook60' ? entry.target === target && Object.keys(entry).sort().join(',') === 'key,target' :
        Object.hasOwn(expected,entry.key) && entry.hash === expected[entry.key] && Object.keys(entry).sort().join(',') === 'hash,key';
      if (!valid) throw Error('HOME_HOOKS_UNCONFIRMED');
      seen.add(entry.key);
    }
  }
  return value;
}
const ensureHomeHooks = (transport,options) => action(transport,options,'apply');
const restoreHomeHooks = (transport,options) => action(transport,options,'restore');
module.exports = {ensureHomeHooks,restoreHomeHooks};
