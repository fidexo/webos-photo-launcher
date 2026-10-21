'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var MAX_BYTES = 32768;
function failure() { return Error('SCREEN_STORE_UNAVAILABLE'); }
module.exports = function createStore(directory) {
  directory = directory || '/media/internal/mi-pantalla-lights';
  var file = path.join(directory,'screen-session.json');
  function stat(name) { try { return fs.lstatSync(name); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
  function checkDirectory(create) {
    var info = stat(directory);
    if (!info && create) { fs.mkdirSync(directory,448); info = stat(directory); }
    if (!info) return false;
    if (!info.isDirectory() || info.isSymbolicLink()) throw failure();
    if (typeof process.getuid === 'function' && (info.uid !== process.getuid() || (info.mode & 511) !== 448)) throw failure();
    return true;
  }
  function checkFile() {
    var info = stat(file);
    if (!info) return false;
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > MAX_BYTES) throw failure();
    if (typeof process.getuid === 'function' && (info.uid !== process.getuid() || (info.mode & 511) !== 384)) throw failure();
    return true;
  }
  return {
    load:function () {
      try { if (!checkDirectory(false) || !checkFile()) return null; return JSON.parse(fs.readFileSync(file,'utf8')); }
      catch (error) { throw failure(); }
    },
    save:function (record) {
      var temporary;
      try {
        var content = JSON.stringify(record);
        if (typeof content !== 'string' || Buffer.byteLength(content,'utf8') > MAX_BYTES) throw failure();
        checkDirectory(true); checkFile();
        temporary = path.join(directory,'screen-session.' + crypto.randomBytes(12).toString('hex') + '.tmp');
        var fd = fs.openSync(temporary,'wx',384);
        try { fs.writeFileSync(fd,content,'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        checkFile(); fs.renameSync(temporary,file); temporary = null;
      } catch (error) { throw failure(); }
      finally { if (temporary) { try { fs.unlinkSync(temporary); } catch (ignored) {} } }
    },
    clear:function () {
      try { if (checkDirectory(false) && checkFile()) fs.unlinkSync(file); }
      catch (error) { throw failure(); }
    }
  };
};
