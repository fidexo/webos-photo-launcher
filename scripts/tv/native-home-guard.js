'use strict';
var APP = 'com.frxn.mipantalla';
var MANIFEST = '/media/developer/apps/usr/palm/applications/' + APP + '/appinfo.json';
var ROOT = '/var/lib/mipantalla-maintenance/native-home/';
var MAX_BYTES = 32768;
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function same(a, b) {
  if (a === b) return true;
  if (!object(a) && !Array.isArray(a)) return false;
  if (!b || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  var keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(function (key) {
    return Object.prototype.hasOwnProperty.call(b, key) && same(a[key], b[key]);
  });
}
function run(deps, callback) {
  var fs = deps.fs;
  var finished = false;
  function finish(status, failed) {
    if (finished) return;
    finished = true;
    callback(failed ? Error(status) : null, status);
  }
  function readJson(file, known) {
    var stat = known || fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES ||
        !fs.constants || typeof fs.constants.O_NOFOLLOW !== 'number') throw Error('unsafe-file');
    var fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.size > MAX_BYTES) throw Error('unsafe-file');
      var bytes = Buffer.alloc(stat.size + 1);
      var count = fs.readSync(fd, bytes, 0, bytes.length, 0);
      if (count > stat.size) throw Error('changed-file');
      return JSON.parse(bytes.slice(0, count).toString('utf8'));
    } finally { fs.closeSync(fd); }
  }
  function rpc(method, payload, next) {
    var answered = false;
    function reply(error, stdout) {
      if (answered) return;
      answered = true;
      var result = null;
      if (!error && typeof stdout === 'string') {
        try { result = JSON.parse(stdout); } catch (ignored) {}
      }
      next(object(result) && result.returnValue === true ? result : null);
    }
    try {
      deps.execFile('/usr/bin/luna-send', ['-n', '1', '-f', 'luna://com.webos.settingsservice/' + method,
        JSON.stringify(payload)], {timeout:2500, maxBuffer:MAX_BYTES, encoding:'utf8'}, reply);
    } catch (ignored) { reply(Error('request-failed')); }
  }
  function defaults(result) {
    return result && object(result.settings) && object(result.settings.defaultApps) &&
      typeof result.settings.defaultApps.home === 'string' ? result.settings.defaultApps : null;
  }
  var manifestStat;
  try {
    manifestStat = fs.lstatSync(MANIFEST);
    var manifest = readJson(MANIFEST, manifestStat);
    return finish(object(manifest) && manifest.id === APP ? 'app-present' : 'app-uncertain', !object(manifest) || manifest.id !== APP);
  } catch (error) {
    if (manifestStat || error.code !== 'ENOENT') return finish('app-uncertain', true);
  }
  var previous;
  try {
    var saved = readJson(ROOT + 'settings-before.json');
    previous = saved && saved.category === 'general' && object(saved.settings) &&
      object(saved.settings.defaultApps) && saved.settings.defaultApps.home;
    if (typeof previous !== 'string' || previous === APP || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(previous)) throw Error('invalid-backup');
  } catch (ignored) { return finish('backup-invalid', true); }
  var query = {category:'general', keys:['defaultApps']};
  rpc('getSystemSettings', query, function (result) {
    var current = defaults(result);
    if (!current) return finish('read-failed', true);
    if (current.home !== APP) return finish('home-not-owned', false);
    var wanted;
    try { wanted = JSON.parse(JSON.stringify(current)); }
    catch (ignored) { return finish('read-failed', true); }
    wanted.home = previous;
    rpc('setSystemSettings', {category:'general', settings:{defaultApps:wanted}}, function (ack) {
      if (!ack) return finish('set-failed', true);
      rpc('getSystemSettings', query, function (readback) {
        var matches = false;
        try { matches = same(defaults(readback), wanted); } catch (ignored) {}
        if (!matches) return finish('readback-failed', true);
        try { fs.unlinkSync(ROOT + 'enabled'); }
        catch (error) { if (error.code !== 'ENOENT') return finish('flag-remove-failed', true); }
        finish('restored', false);
      });
    });
  });
}
module.exports = {run:run};
if (require.main === module) {
  run({fs:require('fs'), execFile:require('child_process').execFile}, function (error, status) {
    process.stdout.write(status + '\n');
    if (error) process.exitCode = 1;
  });
}
