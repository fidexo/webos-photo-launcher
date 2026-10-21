'use strict';

var URI = 'luna://com.webos.service.tvpower/power/getPowerState';
var MAX_BUFFER = 4096;
var RECONNECT_MS = 5000;

module.exports = function watchPower(onWake, rawDeps) {
  var deps = rawDeps || {};
  var spawn = deps.spawn || require('child_process').spawn;
  var setTimeoutFn = deps.setTimeout || setTimeout;
  var clearTimeoutFn = deps.clearTimeout || clearTimeout;
  var stopped = false;
  var available = false;
  var active = null;
  var reconnect = null;
  var lastState = null;

  function kill(connection) {
    if (!connection || connection.killed) return;
    connection.killed = true;
    if (connection.child) { try { connection.child.kill(); } catch (ignored) {} }
  }
  function failed(connection) {
    if (stopped || active !== connection) return;
    active = null;
    available = false;
    kill(connection);
    if (reconnect === null) reconnect = setTimeoutFn(function () {
      reconnect = null;
      start();
    }, RECONNECT_MS);
  }
  function receive(connection, chunk) {
    if (stopped || active !== connection) return;
    var bytes = typeof chunk === 'string' ? Buffer.from(chunk,'utf8') : chunk;
    if (!Buffer.isBuffer(bytes) || bytes.length + connection.buffer.length > MAX_BUFFER) {
      failed(connection); return;
    }
    connection.buffer = Buffer.concat([connection.buffer,bytes]);
    var index;
    while (!stopped && active === connection && (index = connection.buffer.indexOf(10)) !== -1) {
      var line = connection.buffer.slice(0,index).toString('utf8').trim();
      connection.buffer = connection.buffer.slice(index + 1);
      if (!line) continue;
      var message;
      try { message = JSON.parse(line); } catch (ignored) { failed(connection); return; }
      if (!message || typeof message !== 'object' || Array.isArray(message) || message.returnValue !== true ||
          (message.subscribed !== undefined && message.subscribed !== true) || typeof message.state !== 'string' ||
          !message.state.trim() || message.state.length > 128 || /[\x00-\x1f]/.test(message.state)) {
        failed(connection); return;
      }
      var previous = lastState;
      lastState = message.state;
      available = true;
      if (previous !== null && previous !== 'Active' && lastState === 'Active') {
        try { onWake(); } catch (ignored) { /* Observation must not terminate the daemon. */ }
      }
    }
  }
  function start() {
    if (stopped || active) return;
    var connection = {child:null,buffer:Buffer.alloc(0),killed:false};
    active = connection;
    try {
      connection.child = spawn('luna-send',['-i',URI,'{"subscribe":true}'],{stdio:['ignore','pipe','ignore']});
      connection.child.on('error',function () { failed(connection); });
      connection.child.on('close',function () { failed(connection); });
      connection.child.stdout.on('error',function () { failed(connection); });
      connection.child.stdout.on('end',function () { failed(connection); });
      connection.child.stdout.on('data',function (chunk) { receive(connection,chunk); });
    } catch (ignored) { failed(connection); }
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    available = false;
    if (reconnect !== null) { clearTimeoutFn(reconnect); reconnect = null; }
    var connection = active;
    active = null;
    kill(connection);
  }
  start();
  return {ready:function () { return !stopped && available; },stop:stop};
};
