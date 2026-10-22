const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r/g, '');
const restore = app.slice(app.indexOf('  try {\n    var stored ='), app.indexOf('  function element('));

function upgrade(saved) {
  const config = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'config.js'), 'utf8'), config);
  const context = {items: config.window.LAUNCHER_CONFIG.map(item => Object.assign({}, item, {visible: true})),
    storageKey: 'fixture', localStorage: {getItem() { return JSON.stringify(saved); }},
    say(message) { assert.fail(message); }};
  vm.runInNewContext(restore, context);
  return Array.from(context.items, item => ({key: item.key, visible: item.visible}));
}

test('upgrading a saved layout keeps order and hidden choices and appends new shortcuts visible', () => {
  const keys = ['youtube', 'spotify', 'netflix', 'disney'];
  const saved = keys.map(key => ({key, visible: key !== 'netflix'}));
  const updated = upgrade(saved);
  assert.deepEqual(updated.slice(0, keys.length), saved);
  const added = updated.slice(keys.length);
  assert.ok(added.length > 0 && added.every(item => item.visible && !keys.includes(item.key)));
  assert.deepEqual(upgrade(updated), updated, 'reopening is stable');
});
