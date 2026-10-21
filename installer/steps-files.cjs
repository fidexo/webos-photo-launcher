'use strict';
// Serialized into the TV helper: ES5 and built-ins only.
function makeFiles(fs, id) {
  var parent = '/var/lib/mipantalla-maintenance';
  var root = parent + '/setup';
  var plan = root + '/' + id;
  var nofollow = fs.constants && fs.constants.O_NOFOLLOW;
  function directory(file, strict) {
    try { fs.mkdirSync(file, 448); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    var s = fs.lstatSync(file);
    if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== 0 || (s.mode & 18) || strict && (s.mode & 511) !== 448) throw Error('unsafe');
  }
  function regular(s, max, privateFile) {
    return s.isFile() && !s.isSymbolicLink() && s.uid === 0 && s.nlink === 1 && s.size <= max &&
      (!privateFile || (s.mode & 511) === 384);
  }
  function read(file, max, privateFile) {
    var before = fs.lstatSync(file);
    if (typeof nofollow !== 'number' || !regular(before, max, privateFile)) throw Error('unsafe');
    var fd = fs.openSync(file, fs.constants.O_RDONLY | nofollow);
    try {
      var s = fs.fstatSync(fd);
      if (!regular(s, max, privateFile) || s.ino !== before.ino || s.dev !== before.dev) throw Error('unsafe');
      var buffer = Buffer.alloc(s.size + 1);
      var count = fs.readSync(fd, buffer, 0, buffer.length, 0);
      if (count !== s.size) throw Error('changed');
      return buffer.slice(0, count).toString('utf8');
    } finally { fs.closeSync(fd); }
  }
  function maybe(file, max) {
    try { return read(file, max, false); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  function write(file, body, mode, exclusive) {
    if (typeof nofollow !== 'number') throw Error('unsafe');
    var old = maybe(file, 262144);
    if (exclusive && old !== null) throw Error('exists');
    var before = old === null ? null : fs.lstatSync(file);
    var temporary = before ? file + '.tmp-' + require('crypto').randomBytes(12).toString('hex') : null;
    var fd, created = false;
    try {
      fd = fs.openSync(temporary || file, fs.constants.O_WRONLY | nofollow | fs.constants.O_CREAT | fs.constants.O_EXCL, temporary ? 384 : mode);
      created = true;
      if (!regular(fs.fstatSync(fd), 262144, false)) throw Error('unsafe');
      fs.fchmodSync(fd, mode);
      fs.writeFileSync(fd, body, {encoding:'utf8'});
      fs.fsyncSync(fd);
      fs.closeSync(fd); fd = undefined;
      if (temporary) {
        var current = fs.lstatSync(file);
        if (!regular(current, 262144, false) || current.ino !== before.ino || current.dev !== before.dev || read(file,262144,false) !== old) throw Error('changed');
        fs.renameSync(temporary,file); temporary = null;
      }
      if (read(file, 262144, mode === 384) !== body) throw Error('readback');
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (temporary && created) try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  function prepare() {
    if (!/^[a-f0-9]{32}$/.test(id)) throw Error('id');
    directory(parent, false); directory(root, true); directory(plan, true);
  }
  function privacyFs() {
    var adapter = {};
    Object.keys(fs).forEach(function (key) { adapter[key] = fs[key]; });
    function mapped(file) { return file.replace(parent + '/privacy-rdxd', plan + '/privacy-rdxd'); }
    ['mkdirSync','lstatSync','openSync'].forEach(function (key) {
      adapter[key] = function () { var args = Array.prototype.slice.call(arguments); args[0] = mapped(args[0]); return fs[key].apply(fs, args); };
    });
    return adapter;
  }
  return {parent:parent,plan:plan,read:read,maybe:maybe,write:write,directory:directory,prepare:prepare,privacyFs:privacyFs};
}
module.exports = {makeFiles:makeFiles};
