'use strict';
var path = require('path');
var loadSettings = require('./screen-settings');
var createRpc = require('./hyperhdr-rpc');
var createBackend = require('./screen-backend');
var createSession = require('./screen-session').create;
var createStore = require('./screen-store');
module.exports = function createScreenControl(lamps, options) {
  options = options || {};
  var config = loadSettings(path.join(__dirname,'screen-config.json'));
  function read(ids) { return lamps.read({ids:ids}); }
  var backend = createBackend({config:config,read:read,probe:options.probe,rpc:{
    connect:function () { return createRpc({token:config.token}).connect(); }
  }});
  var session = createSession({backend:backend,read:read,write:lamps.write,store:createStore()});
  return {
    pending:session.pending,start:session.start,stop:session.stop,
    status:function (ids) {
      return backend.inspect(ids).then(function (status) {
        var pending = session.pending();
        status.pending = !!pending;
        status.phase = pending ? pending.phase : null;
        if (pending) { status.ready = false; status.reason = 'restore-pending'; }
        return status;
      });
    }
  };
};
