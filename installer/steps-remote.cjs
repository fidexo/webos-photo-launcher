'use strict';
// Serialized verbatim for Node 8: async subprocesses avoid its libuv sync-child crash.
async function remoteMain(request, deps, profile) {
  var files = deps.files;
  var GENERAL = ['defaultApps','homePromotion','screenSaverAd','adCookie','customizedAd'];
  var OPTION = ['livePlus','livePromotion','webOSPromotionVideo'];
  var finished = false;
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function emit(ok, status, extra) {
    if (finished) return;
    finished = true;
    var value = {ok:ok,status:status};
    if (!ok) value.code = 'REMOTE_STEP_FAILED';
    Object.keys(extra || {}).forEach(function (key) { value[key] = extra[key]; });
    deps.output(value);
  }
  function rpc(service, method, payload) {
    return new Promise(function (resolve, reject) {
      var answered = false;
      function finish(error, raw) {
        if (answered) return;
        answered = true;
        try {
          if (error) throw error;
          var value = JSON.parse(String(raw));
          if (!object(value) || value.returnValue !== true) throw Error('rpc');
          resolve(value);
        } catch (ignored) { reject(Error('rpc')); }
      }
      try { deps.cp.execFile('/usr/bin/luna-send', ['-n','1','-f','luna://' + service + '/' + method,JSON.stringify(payload)],
        {encoding:'utf8',timeout:2500,maxBuffer:2097152,killSignal:'SIGKILL'},finish); }
      catch (ignored) { finish(Error('rpc')); }
    });
  }
  async function settings(category, keys) {
    var value = await rpc('com.webos.settingsservice','getSystemSettings',{category:category,keys:keys});
    if (!object(value.settings)) throw Error('settings');
    return value.settings;
  }
  async function inventory() {
    var raw = (await rpc('com.webos.applicationManager','listApps',{})).apps;
    if (!Array.isArray(raw) || raw.length > 1000) throw Error('inventory');
    var seen = {};
    raw.forEach(function (app) {
      if (!object(app) || typeof app.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(app.id) || seen[app.id]) throw Error('inventory');
      seen[app.id] = true;
    });
    return raw;
  }
  function release() {
    var text = files.read('/etc/starfish-release',4096,false);
    var match = /^Rockhopper release (\d+\.\d+\.\d+-\d+) \(([a-z0-9-]+)\)\r?\n?$/.exec(text);
    if (!match) throw Error('release');
    return {version:match[1],build:match[2]};
  }
  async function inspect() {
    var snapshot;
    try {
      var body = files.maybe('/media/developer/apps/usr/palm/applications/' + profile.app.id + '/appinfo.json',65536);
      var app = body === null ? null : JSON.parse(body);
      if (app !== null && (!object(app) || app.id !== profile.app.id || typeof app.version !== 'string')) throw Error('manifest');
      var sys = await rpc('com.webos.service.tv.systemproperty','getSystemInfo',{keys:['modelName','firmwareVersion','sdkVersion','boardType']});
      var system = {};
      ['modelName','firmwareVersion','sdkVersion','boardType'].forEach(function (key) {
        if (typeof sys[key] !== 'string' || sys[key].length > 128) throw Error('identity');
        system[key] = sys[key];
      });
      snapshot = {uid:deps.getuid(),release:release(),system:system,general:await settings('general',GENERAL),option:await settings('option',OPTION),
        app:app && {id:app.id,version:app.version},apps:(await inventory()).filter(function (item) { return profile.removeAllowlist.indexOf(item.id) !== -1; }).map(function (item) {
          return {id:item.id,version:typeof item.version === 'string' ? item.version : '',systemApp:typeof item.systemApp === 'boolean' ? item.systemApp : null,removable:typeof item.removable === 'boolean' ? item.removable : null};
        })};
    } catch (ignored) { return null; }
    return new Promise(function (resolve) {
      deps.privacy.run({fs:deps.fs,execFile:deps.cp.execFile,getuid:deps.getuid},'--status',function (error, result) {
        if (error) { resolve(null); return; }
        snapshot.rdxd = {analyticsLog:result.analyticsLog,crashLog:result.crashLog};
        resolve(snapshot);
      });
    });
  }
  function known(snapshot) {
    var s = snapshot.system, r = snapshot.release;
    return snapshot.uid === 0 && s.modelName === profile.model && s.firmwareVersion === profile.firmware &&
      s.sdkVersion === profile.sdk && s.boardType === profile.board && r.version === profile.release && r.build === profile.releaseBuild;
  }
  function validate(options, snapshot, preparing) {
    if (!object(options) || !Array.isArray(options.removeApps || [])) throw Error('options');
    ['general','option'].forEach(function (category) {
      var keys = category === 'general' ? GENERAL.slice(1) : OPTION;
      keys.forEach(function (key) { if (snapshot[category][key] !== 'on' && snapshot[category][key] !== 'off') throw Error('unknown-pref'); });
    });
    if (options.home && (!preparing && (!snapshot.app || snapshot.app.version !== profile.app.version) || !object(snapshot.general.defaultApps) ||
        typeof snapshot.general.defaultApps.home !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(snapshot.general.defaultApps.home))) throw Error('home');
    (options.removeApps || []).forEach(function (id) {
      if (profile.removeAllowlist.indexOf(id) === -1 || profile.protectedApps.indexOf(id) !== -1) throw Error('remove');
      var app = snapshot.apps.filter(function (item) { return item.id === id; })[0];
      if (app && (app.removable !== true || app.systemApp !== false)) throw Error('remove');
    });
  }
  function backup(snapshot, options) {
    files.prepare();
    var file = files.plan + '/before.json';
    var existing = files.maybe(file,262144);
    if (existing !== null) return readBackup();
    var value = {version:1,id:request.backupId,snapshot:snapshot,options:options};
    files.write(file,JSON.stringify(value),384,true);
    return readBackup();
  }
  function readBackup() {
    var value = JSON.parse(files.read(files.plan + '/before.json',262144,true));
    if (!object(value) || value.version !== 1 || value.id !== request.backupId || !object(value.snapshot) || !known(value.snapshot)) throw Error('backup');
    validate(value.options,value.snapshot,true);
    return value;
  }
  async function setPrefs(category, wanted) {
    if (!Object.keys(wanted).length) return;
    await rpc('com.webos.settingsservice','setSystemSettings',{category:category,settings:wanted});
    var after = await settings(category,Object.keys(wanted));
    Object.keys(wanted).forEach(function (key) { if (deps.fingerprint(after[key]) !== deps.fingerprint(wanted[key])) throw Error('readback'); });
  }
  async function changePrefs(snapshot, options, restore, current) {
    var general = {}, option = {};
    if (options.privacy) {
      GENERAL.slice(1).forEach(function (key) { general[key] = restore ? snapshot.general[key] : 'off'; });
      OPTION.forEach(function (key) { option[key] = restore ? snapshot.option[key] : 'off'; });
    }
    if (options.home) {
      var map = clone(current.general.defaultApps);
      if (!object(map) || typeof map.home !== 'string') throw Error('home');
      if (restore && map.home !== profile.app.id && map.home !== snapshot.general.defaultApps.home) throw Error('home-conflict');
      map.home = restore ? snapshot.general.defaultApps.home : profile.app.id;
      general.defaultApps = map;
    }
    await setPrefs('general',general); await setPrefs('option',option);
  }
  function privacy(mode) {
    return new Promise(function (resolve) {
      deps.privacy.run({fs:files.privacyFs(),execFile:deps.cp.execFile,getuid:deps.getuid},mode,function (error) { resolve(!error); });
    });
  }
  async function remove(options) {
    var removed = [];
    var ids = options.removeApps || [];
    for (var at = 0; at < ids.length; at += 1) {
      var id = ids[at];
      var current = (await inventory()).filter(function (item) { return item.id === id; })[0];
      if (!current) continue;
      if (profile.removeAllowlist.indexOf(id) === -1 || profile.protectedApps.indexOf(id) !== -1 || current.systemApp !== false || current.removable !== true) throw Error('remove');
      await rpc('com.webos.appInstallService','remove',{id:id,subscribe:true});
      var absent = false;
      for (var check = 0; check < 8; check += 1) {
        if (!(await inventory()).some(function (item) { return item.id === id; })) { absent = true; break; }
        if (check < 7) await new Promise(function (resolve) { (deps.setTimer || setTimeout)(resolve,500); });
      }
      if (!absent) throw Error('remove-unconfirmed');
      removed.push(id);
    }
    return removed;
  }
  if (['inspect','prepare','apply','restore'].indexOf(request.action) === -1) { emit(false,'failed'); return; }
  try {
    var current = await inspect();
    if (!current) { emit(false,'failed'); return; }
    if (request.action === 'inspect') { emit(true,'status',{snapshot:current}); return; }
    try {
      if (!known(current) || !/^[a-f0-9]{32}$/.test(request.backupId)) throw Error('identity');
      if (request.action !== 'restore' && deps.fingerprint(current) !== request.expected) throw Error('drift');
      if (request.action === 'restore') {
        var saved = readBackup();
        await changePrefs(saved.snapshot,saved.options,true,current);
        if (!saved.options.privacy) { emit(true,'restored'); return; }
        var restored = await privacy('--restore');
        emit(restored,restored ? 'restored' : 'failed');
        return;
      }
      validate(request.options,current,request.action === 'prepare');
      backup(current,request.options);
      if (request.action === 'prepare') { emit(true,'prepared'); return; }
      await changePrefs(current,request.options,false,current);
      if (request.options.privacy && !(await privacy('--apply'))) { emit(false,'failed'); return; }
      emit(true,'applied',{removed:await remove(request.options),homeProof:request.options.home ? 'pending' : undefined});
    } catch (ignored) { emit(false,'failed'); }
  } catch (ignored) { emit(false,'failed'); }
}
module.exports = {remoteMain:remoteMain};
