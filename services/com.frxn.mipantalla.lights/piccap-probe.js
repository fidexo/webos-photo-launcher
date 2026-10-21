'use strict';

var URI = 'luna://org.webosbrew.piccap.service/status';

function number(value) {
  return typeof value === 'number' && isFinite(value) && value >= 0 ? value : 0;
}
function normalize(payload) {
  var status = payload && typeof payload === 'object' ? payload : {};
  return {
    running: status.isRunning === true,
    connected: status.connected === true,
    ui: status.uiRunning === true,
    video: status.videoRunning === true,
    framerate: number(status.framerate)
  };
}
function fresh(status) {
  return status.running && status.connected && (status.ui || status.video) && status.framerate > 0;
}
module.exports = function createProbe(options) {
  options = options || {};
  var call = options.call;
  var wait = options.wait || function (ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  };
  function once() {
    return Promise.resolve().then(function () {
      return call(URI, {});
    }).then(function (message) {
      return normalize(message && message.payload);
    });
  }
  function read() {
    return once().then(function (first) {
      if (!fresh(first)) return {framesVerified:false,sourceFreshness:'unknown'};
      return wait(250).then(once).then(function (second) {
        if (!fresh(second)) return {framesVerified:false,sourceFreshness:'unknown'};
        return {framesVerified:true,sourceFreshness:'fresh'};
      });
    }).catch(function () {
      return {framesVerified:false,sourceFreshness:'unknown'};
    });
  }
  return {read:read};
};
