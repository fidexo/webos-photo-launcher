'use strict';
var Service = require('webos-service');
var service = new Service('com.frxn.mipantalla.lights',null,{noBuiltinMethods:true});
function call(uri,args) {
  return new Promise(function (resolve,reject) {
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true; reject(Error('La captura no respondió a tiempo.'));
    },1500);
    function finish(error,message) {
      if (done) return;
      done = true; clearTimeout(timer);
      if (error) reject(error); else resolve(message);
    }
    try {
      service.call(uri,args,function (message) { finish(null,message); });
    } catch (error) { finish(error); }
  });
}
var controller = require('./controller')(require('./transport')(),{
  screenFactory:require('./screen-control'),
  screenProbe:require('./piccap-probe')({call:call}).read
});
require('./api')(service,controller);
