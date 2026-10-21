'use strict';
var protocol = require('./protocol');
function failure(reason) { var error = Error('No se pudo confirmar la captura.'); error.reason = reason; return error; }
function base(config) {
  return {configured:config.enabled === true,available:false,ready:false,active:false,
    configVerified:false,hardwareVerified:false,framesVerified:false,sourceFreshness:'unknown',
    outputEnabled:false,lampCount:0,reason:'setup-pending'};
}
function reasonFor(error) {
  if (error && error.reason) return error.reason;
  var codes = {HYPERHDR_AUTH_REQUIRED:'auth-required',HYPERHDR_INSTANCE_UNAVAILABLE:'instance-mismatch',
    HYPERHDR_TIMEOUT:'timeout',HYPERHDR_PROTOCOL:'protocol-error',HYPERHDR_COMMAND_REJECTED:'protocol-error'};
  return codes[error && error.code] || 'offline';
}
function validIds(ids) {
  return Array.isArray(ids) && ids.length <= 32 && ids.every(function (id,i) {
    return typeof id === 'string' && /^wiz-[a-f0-9]{12}$/.test(id) && ids.indexOf(id) === i;
  });
}
function layoutMatches(leds, count) {
  return Array.isArray(leds) && leds.length === count && leds.every(function (led) {
    return led && led.disabled !== true && ['hmin','hmax','vmin','vmax'].every(function (key) {
      return typeof led[key] === 'number' && isFinite(led[key]) && led[key] >= 0 && led[key] <= 1;
    }) && led.hmin < led.hmax && led.vmin < led.vmax;
  });
}
function matches(device, leds, ids, current) {
  if (!device || device.type !== 'wiz' || (device.port !== undefined && device.port !== 38899) ||
      !Array.isArray(device.lamps) || device.lamps.length !== ids.length || !layoutMatches(leds,ids.length)) return false;
  var seen = {};
  return device.lamps.every(function (lamp) {
    var mac = lamp && protocol.mac(lamp.macAddress);
    var id = 'wiz-' + mac;
    var actual = current.filter(function (d) { return d.id === id; })[0];
    if (!mac || seen[id] || ids.indexOf(id) === -1 || !actual || actual.reachable !== true ||
        !protocol.privateIPv4(lamp.ipAddress) || actual.ip !== lamp.ipAddress) return false;
    seen[id] = true; return true;
  });
}
module.exports = function createBackend(options) {
  var config = options.config || {};
  function configured() {
    if (config.invalid) throw failure('config-invalid');
    if (config.enabled !== true) throw failure('setup-pending');
    if (typeof config.token !== 'string' || !config.token || config.token.length > 2048 || /[\x00-\x1f]/.test(config.token) ||
        typeof config.profile !== 'string' || !config.profile || config.profile.length > 80) throw failure('config-invalid');
  }
  function use(action) {
    var session;
    return Promise.resolve().then(function () { configured(); return options.rpc.connect(); }).then(function (connection) {
      session = connection; return action(session);
    }).then(function (result) { if (session) session.close(); return result; },function (error) {
      if (session) session.close(); throw error;
    });
  }
  function check(session, ids) {
    if (!validIds(ids)) return Promise.reject(failure('selection-mismatch'));
    var info, output;
    return session.request({command:'authorize',subcommand:'adminRequired'}).then(function (result) {
      if (!result.info || result.info.adminRequired !== false) throw failure('admin-required');
      return session.request({command:'serverinfo'});
    }).then(function (result) {
      info = result.info;
      var instance = info && Array.isArray(info.instance) && info.instance.filter(function (i) { return i.instance === 0 && i.running === true; })[0];
      if (!info || info.currentInstance !== 0 || !instance) throw failure('instance-mismatch');
      if (instance.friendly_name !== config.profile) throw failure('profile-mismatch');
      output = Array.isArray(info.components) && info.components.filter(function (c) { return c.name === 'LEDDEVICE'; })[0];
      if (!output || typeof output.enabled !== 'boolean') throw failure('protocol-error');
      return session.request({command:'config',subcommand:'getconfig'});
    }).then(function (result) {
      if (!ids.length) throw failure('selection-required');
      return options.read(ids).then(function (current) {
        if (!current || !Array.isArray(current.devices) || !matches(result.info && result.info.device,
            result.info && result.info.leds,ids,current.devices)) throw failure('selection-mismatch');
        return {outputEnabled:output.enabled};
      });
    });
  }
  return {
    inspect:function (ids) {
      var status = base(config);
      return use(function (session) { return check(session,ids); }).then(function (checked) {
        status.available = true; status.configVerified = true; status.outputEnabled = checked.outputEnabled;
        status.lampCount = ids.length;
        status.reason = checked.outputEnabled ? 'output-in-use' : 'frames-unverified';
        return status;
      },function (error) { status.reason = reasonFor(error); return status; });
    },
    start:function () {
      // TCP serverinfo cannot prove fresh frames. No configuration flag bypasses this gate.
      var error = Error('La captura de video todavía no está verificada.');
      error.code = 'SCREEN_FRAMES_UNVERIFIED'; return Promise.reject(error);
    },
    stop:function (ids) {
      // Called only by the session owner with its persisted original selection.
      return use(function (session) {
        return check(session,ids).then(function () {
          return session.request({command:'componentstate',componentstate:{component:'LEDDEVICE',state:false}});
        }).then(function () { return session.request({command:'serverinfo'}); }).then(function (result) {
          var info = result.info;
          var output = info && Array.isArray(info.components) && info.components.filter(function (c) { return c.name === 'LEDDEVICE'; })[0];
          if (!info || info.currentInstance !== 0 || !output || output.enabled !== false) throw failure('protocol-error');
          return {active:false};
        });
      }).catch(function () { var error = Error('No se confirmó la parada de la salida de video.'); error.code = 'SCREEN_STOP_UNCONFIRMED'; throw error; });
    }
  };
};
