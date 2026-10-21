'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const helper = require('../scripts/tv/privacy-log-settings.js');
const ROOT = '/var/lib/mipantalla-maintenance/privacy-rdxd';
const FILE = ROOT + '/settings-before.json';
function fixture(opts = {}) {
  const files = {}, calls = [], opened = [];
  const missing = () => Object.assign(Error('private detail'), {code: 'ENOENT'});
  let state = {analyticsLog: true, crashLog: true}, writes = 0;
  Object.assign(state, opts.state);
  const constants = {O_RDONLY: 0, O_WRONLY: 1, O_CREAT: 64, O_EXCL: 128, O_NOFOLLOW: 131072};
  const stat = entry => ({uid: entry.uid === undefined ? 0 : entry.uid, mode: entry.mode || (entry.dir ? 448 : 384),
    size: Buffer.byteLength(entry.data || ''), nlink: 1, isFile: () => !entry.dir && !entry.link,
    isDirectory: () => !!entry.dir && !entry.link, isSymbolicLink: () => !!entry.link});
  files['/var/lib/mipantalla-maintenance'] = {dir: true, mode: 493};
  files[ROOT] = {dir: true};
  if (opts.backup !== undefined) files[FILE] = {data: opts.backup, ...opts.file};
  if (opts.directory) files[ROOT] = opts.directory;
  const fs = {constants,
    mkdirSync(path, mode) { if (files[path]) throw Object.assign(Error('exists'), {code: 'EEXIST'}); files[path] = {dir: true, mode}; },
    lstatSync(path) { if (!files[path]) throw missing(); return stat(files[path]); },
    openSync(path, flags, mode) {
      opened.push({path, flags, mode}); assert.ok(flags & constants.O_NOFOLLOW);
      if (flags & constants.O_EXCL) { if (files[path]) throw Object.assign(Error('exists'), {code: 'EEXIST'}); files[path] = {data: '', mode}; }
      if (!files[path]) throw missing(); if (files[path].link) throw Error('private symlink'); return path;
    },
    fstatSync(fd) { return stat(files[fd]); }, closeSync() {}, fsyncSync() {},
    readSync(fd, buffer, offset, length) { return Buffer.from(files[fd].data).copy(buffer, offset, 0, length); },
    writeFileSync(fd, text) { writes++; if (opts.writeError) throw Error('private key'); files[fd].data = text; }
  };
  function execFile(command, args, settings, callback) {
    calls.push({command, args, settings});
    let response;
    if (opts.replies) response = opts.replies[calls.length - 1];
    else if (args[3].endsWith('/setLogSettings')) { state = JSON.parse(args[4]); response = {returnValue: true}; }
    else response = {returnValue: true, ...state};
    if (response instanceof Error) callback(response);
    else callback(null, typeof response === 'string' ? response : JSON.stringify(response));
  }
  const run = mode => new Promise(resolve => helper.run({fs, execFile, getuid: () => opts.uid || 0}, mode, (error, result) => resolve({error, result})));
  return {files, calls, opened, run, writes: () => writes};
}
const baseline = JSON.stringify({version: 1, analyticsLog: true, crashLog: true});
test('status reads only and does not touch a backup', async () => {
  const t = fixture({backup: '{'}); const r = await t.run('--status');
  assert.equal(r.error, null); assert.equal(r.result.analyticsLog, true);
  assert.equal(t.calls.length, 1); assert.equal(t.writes(), 0); assert.deepEqual(t.opened, []);
});
test('apply saves an exclusive protected baseline, sets only two flags and verifies', async () => {
  const t = fixture(); const r = await t.run('--apply'); assert.equal(r.error, null);
  assert.deepEqual(JSON.parse(t.files[FILE].data), JSON.parse(baseline));
  assert.equal(t.calls.length, 3); assert.equal(t.opened[0].mode, 384); assert.ok(t.opened[0].flags & 128);
  assert.deepEqual(JSON.parse(t.calls[1].args[4]), {analyticsLog: false, crashLog: false});
  for (const call of t.calls) { assert.equal(call.command, '/usr/bin/luna-send'); assert.equal(call.settings.timeout, 2500); assert.equal(call.settings.maxBuffer, 8192); assert.equal(call.settings.shell, undefined); }
});
test('apply is idempotent and never overwrites the original baseline', async () => {
  const t = fixture({backup: baseline, state: {analyticsLog: false, crashLog: false}});
  const r = await t.run('--apply'); assert.equal(r.error, null); assert.equal(t.calls.length, 1); assert.equal(t.writes(), 0);
  assert.equal(t.files[FILE].data, baseline);
});
test('restore uses exactly the saved booleans and verifies', async () => {
  const t = fixture({backup: JSON.stringify({version: 1, analyticsLog: true, crashLog: false}), state: {analyticsLog: false, crashLog: false}});
  const r = await t.run('--restore'); assert.equal(r.error, null);
  const write = t.calls.find(call => call.args[3].endsWith('/setLogSettings'));
  assert.deepEqual(JSON.parse(write.args[4]), {analyticsLog: true, crashLog: false}); assert.equal(t.writes(), 0);
});
test('corrupt, foreign, permissive or symlink backups fail without a set', async () => {
  for (const opts of [{backup: '{'}, {backup: '{"version":2,"analyticsLog":true,"crashLog":true}'},
    {backup: baseline, file: {uid: 1000}}, {backup: baseline, file: {mode: 420}}, {backup: baseline, file: {link: true}}]) {
    const t = fixture(opts); const r = await t.run('--restore'); assert.ok(r.error);
    assert.equal(t.calls.length, 0); assert.equal(t.writes(), 0); assert.ok(!r.error.message.includes('private'));
  }
});
test('unsafe backup directories or non-root callers never set', async () => {
  for (const opts of [{directory: {dir: true, mode: 511}}, {directory: {dir: true, link: true}}, {uid: 1000}]) {
    const t = fixture(opts); const r = await t.run('--apply'); assert.ok(r.error);
    assert.ok(!t.calls.some(call => call.args[3].endsWith('/setLogSettings')));
  }
});
test('failed or malformed reads never save or set', async () => {
  for (const reply of [{returnValue: false}, {returnValue: true, analyticsLog: 'on', crashLog: true}, '{', Error('secret')]) {
    const t = fixture({replies: [reply]}); const r = await t.run('--apply'); assert.ok(r.error);
    assert.equal(t.calls.length, 1); assert.equal(t.writes(), 0);
  }
});
test('write failure prevents changing the settings', async () => {
  const t = fixture({writeError: true}); const r = await t.run('--apply'); assert.ok(r.error); assert.equal(t.calls.length, 1);
});
test('set failure or mismatching readback never reports success', async () => {
  const current = {returnValue: true, analyticsLog: true, crashLog: true};
  for (const replies of [[current, {returnValue: false}], [current, Error('secret')], [current, {returnValue: true}, current]]) {
    const t = fixture({replies}); const r = await t.run('--apply'); assert.ok(r.error); assert.equal(t.files[FILE].data.trim(), baseline);
  }
});
test('unknown mode cannot call Luna or create files', async () => {
  const t = fixture(); const r = await t.run('--other'); assert.ok(r.error); assert.equal(t.calls.length, 0); assert.equal(t.writes(), 0);
});

test('backup schema rejects extra fields and oversized data before a restore', async () => {
  for (const data of [JSON.stringify({version: 1, analyticsLog: true, crashLog: true, arbitrary: 'secret'}), ' '.repeat(8193)]) {
    const t = fixture({backup: data}); const r = await t.run('--restore');
    assert.ok(r.error); assert.equal(t.calls.length, 0);
  }
});

test('standalone status uses ES5 syntax and prints only the validated flags', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require.resolve('../scripts/tv/privacy-log-settings.js'), 'utf8');
  assert.doesNotMatch(source, /\bconst\b|\blet\b|=>|\basync\b|\bawait\b|\?\.|\?\?/);
  const module = {exports: {}}; let text = '';
  const process = {argv: ['node', 'script', '--status'], getuid: () => 0, stdout: {write(value) { text += value; }}, exitCode: 0};
  const fakeRequire = name => name === 'fs' ? {} : {execFile(command, args, options, cb) {
    cb(null, JSON.stringify({returnValue: true, analyticsLog: false, crashLog: false, private: 'secret'}));
  }};
  fakeRequire.main = module;
  vm.runInNewContext(source, {require: fakeRequire, module, process, Buffer});
  assert.equal(text, '{"status":"status","analyticsLog":false,"crashLog":false}\n');
  assert.equal(process.exitCode, 0);
});
