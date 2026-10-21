'use strict';
var Service = require('webos-service');
var controller = require('./controller')(require('./transport')());
require('./api')(new Service('com.frxn.mipantalla.lights',null,{noBuiltinMethods:true}),controller);
