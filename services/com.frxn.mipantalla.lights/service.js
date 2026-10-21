'use strict';
var Service = require('webos-service');
var controller = require('./controller')(require('./transport')(),{screenFactory:require('./screen-control')});
require('./api')(new Service('com.frxn.mipantalla.lights',null,{noBuiltinMethods:true}),controller);
