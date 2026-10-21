'use strict';
var fs = require('fs');
function disabled(invalid) { return {enabled:false,invalid:!!invalid,token:'',profile:'Mi pantalla WiZ Living'}; }
module.exports = function loadSettings(file) {
  try {
    var stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 8192) return disabled(true);
    var config = JSON.parse(fs.readFileSync(file,'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).some(function (key) {
      return ['enabled','token','profile'].indexOf(key) === -1;
    }) || typeof config.enabled !== 'boolean' || typeof config.token !== 'string' || config.token.length > 2048 ||
        /[\x00-\x1f]/.test(config.token) || (config.enabled && !config.token.trim()) ||
        typeof config.profile !== 'string' || !config.profile || config.profile.length > 80 || /[\x00-\x1f]/.test(config.profile)) return disabled(true);
    return {enabled:config.enabled,token:config.token,profile:config.profile};
  } catch (error) { return disabled(error.code !== 'ENOENT'); }
};
