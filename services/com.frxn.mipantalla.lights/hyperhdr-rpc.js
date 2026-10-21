'use strict';
var net = require('net');
var MAX_BUFFER = 256 * 1024;
var MESSAGES = {
  HYPERHDR_INVALID_OPTIONS:'Opciones de HyperHDR invalidas.',
  HYPERHDR_INVALID_REQUEST:'Solicitud de HyperHDR no permitida.',
  HYPERHDR_AUTH_REQUIRED:'HyperHDR requiere autorizacion valida.',
  HYPERHDR_INSTANCE_UNAVAILABLE:'HyperHDR no confirmo la instancia cero.',
  HYPERHDR_BUSY:'HyperHDR ya tiene una solicitud pendiente.',
  HYPERHDR_COMMAND_REJECTED:'HyperHDR rechazo la solicitud.',
  HYPERHDR_TIMEOUT:'HyperHDR no confirmo la respuesta a tiempo.',
  HYPERHDR_PROTOCOL:'Respuesta de HyperHDR invalida.',
  HYPERHDR_CONNECTION:'No se pudo completar la conexion con HyperHDR.',
  HYPERHDR_CLOSED:'La sesion de HyperHDR esta cerrada.'
};
function failure(code) {
  var error = new Error(MESSAGES[code]);
  error.code = code;
  return error;
}
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keys(value, allowed) {
  return object(value) && Object.keys(value).length === allowed.length && allowed.every(function (key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  });
}
function allowedRequest(value) {
  if (!object(value)) return null;
  if (value.command === 'serverinfo' && keys(value,['command'])) return {command:'serverinfo'};
  if (value.command === 'config' && value.subcommand === 'getconfig' && keys(value,['command','subcommand'])) {
    return {command:'config',subcommand:'getconfig'};
  }
  if (value.command === 'authorize' && value.subcommand === 'adminRequired' && keys(value,['command','subcommand'])) {
    return {command:'authorize',subcommand:'adminRequired'};
  }
  if (value.command === 'componentstate' && keys(value,['command','componentstate'])) {
    var component = value.componentstate;
    if (!keys(component,['component','state'])) return null;
    var state = component.state;
    if (component.component === 'LEDDEVICE' && typeof state === 'boolean') {
      return {command:'componentstate',componentstate:{component:'LEDDEVICE',state:state}};
    }
  }
  if (value.command === 'sourceselect') {
    if (keys(value,['command','priority']) && value.priority === 150) return {command:'sourceselect',priority:150};
    if (keys(value,['command','auto']) && value.auto === true) return {command:'sourceselect',auto:true};
  }
  return null;
}

module.exports = function createHyperhdrRpc(options) {
  var token, timeout, socketFactory;
  try {
    if (!object(options) || Object.keys(options).some(function (key) {
      return ['token','socketFactory','timeoutMs'].indexOf(key) === -1;
    })) throw failure('HYPERHDR_INVALID_OPTIONS');
    token = options.token; timeout = options.timeoutMs; socketFactory = options.socketFactory;
    if (typeof token !== 'string' || !token.trim() || token.length > 2048 || /[\r\n]/.test(token) ||
        (socketFactory !== undefined && typeof socketFactory !== 'function') ||
        (timeout !== undefined && (typeof timeout !== 'number' || !isFinite(timeout) || timeout <= 0 ||
        timeout > 2147483647))) throw failure('HYPERHDR_INVALID_OPTIONS');
  } catch (ignored) { throw failure('HYPERHDR_INVALID_OPTIONS'); }
  if (timeout === undefined) timeout = 2000;
  if (!socketFactory) socketFactory = function (endpoint) { return net.createConnection(endpoint); };

  function connect() {
    return new Promise(function (resolveConnect,rejectConnect) {
      var socket;
      var closed = false;
      var connected = false;
      var settled = false;
      var pending = null;
      var nextTan = 0;
      var buffer = Buffer.alloc(0);
      var connectTimer = setTimeout(function () { stop('HYPERHDR_TIMEOUT'); },timeout);
      function stop(code) {
        if (closed) return;
        closed = true;
        clearTimeout(connectTimer);
        buffer = Buffer.alloc(0);
        var current = pending;
        pending = null;
        if (current) { clearTimeout(current.timer); current.reject(failure(code)); }
        if (!settled) { settled = true; rejectConnect(failure(code)); }
        if (socket) { try { socket.destroy(); } catch (ignored) {} }
      }
      function send(command, rejectionCode) {
        return new Promise(function (resolve,reject) {
          if (closed) { reject(failure('HYPERHDR_CLOSED')); return; }
          if (pending) { reject(failure('HYPERHDR_BUSY')); return; }
          nextTan++;
          command.tan = nextTan;
          pending = {tan:nextTan,command:command.command + (command.subcommand ? '-' + command.subcommand : ''),
            rejectionCode:rejectionCode || 'HYPERHDR_COMMAND_REJECTED',resolve:resolve,reject:reject,
            timer:setTimeout(function () { stop('HYPERHDR_TIMEOUT'); },timeout)};
          try {
            socket.write(JSON.stringify(command) + '\n','utf8',function (error) {
              if (error) stop('HYPERHDR_CONNECTION');
            });
          } catch (ignored) { stop('HYPERHDR_CONNECTION'); }
        });
      }
      function request(value) {
        if (closed) return Promise.reject(failure('HYPERHDR_CLOSED'));
        var command;
        try { command = allowedRequest(value); } catch (ignored) {}
        if (!command) return Promise.reject(failure('HYPERHDR_INVALID_REQUEST'));
        return send(command);
      }
      function receive(bytes) {
        if (closed) return;
        if (!Buffer.isBuffer(bytes) || bytes.length + buffer.length > MAX_BUFFER) {
          stop('HYPERHDR_PROTOCOL'); return;
        }
        buffer = Buffer.concat([buffer,bytes]);
        var index;
        while (!closed && (index = buffer.indexOf(10)) !== -1) {
          var line = buffer.slice(0,index);
          buffer = buffer.slice(index + 1);
          var reply;
          var containsSecret = false;
          try { reply = JSON.parse(line.toString('utf8'),function (key,value) {
            if (key.indexOf(token) !== -1 || (typeof value === 'string' && value.indexOf(token) !== -1)) containsSecret = true;
            return value;
          }); }
          catch (ignored) { stop('HYPERHDR_PROTOCOL'); return; }
          if (!object(reply)) { stop('HYPERHDR_PROTOCOL'); return; }
          if (!pending || reply.tan !== pending.tan) continue;
          if (reply.success === false) { stop(pending.rejectionCode); return; }
          if (reply.command !== pending.command) continue;
          if (reply.success !== true || containsSecret) { stop('HYPERHDR_PROTOCOL'); return; }
          var current = pending;
          pending = null;
          clearTimeout(current.timer);
          current.resolve(reply);
        }
      }
      try {
        socket = socketFactory({host:'127.0.0.1',port:19444});
        socket.on('error',function () { stop('HYPERHDR_CONNECTION'); });
        socket.on('close',function () { stop('HYPERHDR_CLOSED'); });
        socket.on('end',function () { stop('HYPERHDR_CLOSED'); });
        socket.on('data',receive);
        socket.on('connect',function () {
          if (closed || connected) return;
          connected = true;
          clearTimeout(connectTimer);
          send({command:'authorize',subcommand:'login',token:token},'HYPERHDR_AUTH_REQUIRED').then(function () {
            return send({command:'instance',subcommand:'switchTo',instance:0},'HYPERHDR_INSTANCE_UNAVAILABLE');
          }).then(function (reply) {
            if (!reply.info || reply.info.instance !== 0) { stop('HYPERHDR_INSTANCE_UNAVAILABLE'); return; }
            if (closed) return;
            settled = true;
            resolveConnect({request:request,close:function () { stop('HYPERHDR_CLOSED'); }});
          },function () { /* stop() already rejects the connection and destroys its socket. */ });
        });
      } catch (ignored) { stop('HYPERHDR_CONNECTION'); }
    });
  }
  return {connect:connect};
};
