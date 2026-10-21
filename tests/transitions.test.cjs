const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const context = { window: {}, Math, JSON };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'transitions.js'), 'utf8'), context);
const T = context.window.LauncherTransitions;
const episode = (id, extra) => Object.assign({ videoId: id, title: 'Transitions ' + id, url: 'https://www.youtube.com/watch?v=' + id, source: 'John Digweed', duration: '1:00:00' }, extra);
const LIST = ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC', 'DDDDDDDDDDD'].map((id) => episode(id));

function memory(initial) {
  const data = Object.assign({}, initial);
  return { getItem: (key) => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); }, data };
}
// Secuencia determinista de "aleatorios".
const sequence = (values) => { let at = 0; return () => values[at++ % values.length]; };

test('only well-formed episodes survive: 11-char ID, title and matching watch URL', () => {
  const clean = T.cleanList([
    episode('2TcoICioKpM'),
    episode('2TcoICioKpM', { title: 'duplicate' }),
    episode('short'),
    episode('2TcoICioKp!'),
    episode('Po7Pus771UA', { url: 'https://evil.example/watch?v=Po7Pus771UA' }),
    episode('EgDFWu6b2Aw', { url: 'https://www.youtube.com/watch?v=OG4vgR4moew' }),
    episode('OG4vgR4moew', { title: '   ' }),
    episode('CFy5Ustk0Dw', { duration: '<b>1h</b>', title: 'Transitions\n1123' }),
    null, 7, 'x'
  ]);
  assert.deepEqual(Array.from(clean, (entry) => entry.videoId), ['2TcoICioKpM', 'CFy5Ustk0Dw']);
  assert.equal(clean[1].title, 'Transitions 1123');
  assert.equal(clean[1].duration, '', 'unexpected duration text is dropped, not shown');
  for (const value of [undefined, null, {}, 'list']) assert.deepEqual(Array.from(T.cleanList(value)), []);
});

test('missing or empty configuration picks nothing instead of inventing an episode', () => {
  for (const list of [undefined, null, [], [{ videoId: 'nope' }]]) {
    const storage = memory();
    const picker = T.createPicker({ list, storage, random: () => 0.5 });
    assert.equal(picker.count(), 0);
    assert.equal(picker.next(), null);
    assert.deepEqual(storage.data, {}, 'nothing persisted');
  }
});

test('never repeats the previous episode when there is more than one', () => {
  const storage = memory();
  const picker = T.createPicker({ list: LIST, storage, random: Math.random });
  let last = null;
  for (let i = 0; i < 400; i += 1) {
    const chosen = picker.next();
    assert.notEqual(chosen.videoId, last);
    assert.equal(storage.data[T.STORAGE_KEY], chosen.videoId);
    last = chosen.videoId;
  }
  // También entre sesiones: el último guardado se excluye en la primera elección.
  const restored = T.createPicker({ list: LIST, storage: memory({ [T.STORAGE_KEY]: 'AAAAAAAAAAA' }), random: () => 0 });
  assert.equal(restored.next().videoId, 'BBBBBBBBBBB');
});

test('the choice is uniform over the remaining episodes', () => {
  const counts = {};
  for (let i = 0; i < 3; i += 1) {
    const value = (i + 0.5) / 3;
    const chosen = T.pick(LIST, 'BBBBBBBBBBB', () => value);
    counts[chosen.videoId] = (counts[chosen.videoId] || 0) + 1;
  }
  assert.deepEqual(counts, { AAAAAAAAAAA: 1, CCCCCCCCCCC: 1, DDDDDDDDDDD: 1 });
  assert.equal(T.pick(LIST, null, () => 0.9999).videoId, 'DDDDDDDDDDD');
  assert.equal(T.pick(LIST, null, () => 1).videoId, 'AAAAAAAAAAA', 'out-of-range random is clamped');
  assert.equal(T.pick(LIST, null, () => NaN).videoId, 'AAAAAAAAAAA');
});

test('a single episode can repeat; it is the only one available', () => {
  const picker = T.createPicker({ list: [LIST[0]], storage: memory({ [T.STORAGE_KEY]: 'AAAAAAAAAAA' }), random: () => 0.7 });
  assert.equal(picker.next().videoId, 'AAAAAAAAAAA');
  assert.equal(picker.next().videoId, 'AAAAAAAAAAA');
});

test('corrupt, foreign or unavailable storage still works and avoids repeats in memory', () => {
  for (const stored of ['', 'not-an-id', '{"x":1}', 'ZZZZZZZZZZZ']) {
    const picker = T.createPicker({ list: LIST, storage: memory({ [T.STORAGE_KEY]: stored }), random: () => 0 });
    assert.equal(picker.next().videoId, 'AAAAAAAAAAA', 'unknown stored values do not exclude anything');
  }
  const throwing = { getItem() { throw Error('denied'); }, setItem() { throw Error('full'); } };
  const picker = T.createPicker({ list: LIST, storage: throwing, random: sequence([0, 0, 0]) });
  const first = picker.next();
  const second = picker.next();
  assert.equal(first.videoId, 'AAAAAAAAAAA');
  assert.notEqual(second.videoId, first.videoId, 'falls back to memory when storage throws');
  const none = T.createPicker({ list: LIST, storage: null, random: () => 0 });
  assert.ok(none.next());
});

test('creating the picker has no side effects: no random draw, no storage write', () => {
  let draws = 0;
  const storage = memory();
  T.createPicker({ list: LIST, storage, random: () => { draws += 1; return 0; } });
  assert.equal(draws, 0);
  assert.deepEqual(storage.data, {});
});

test('a stale readable value cannot override the last choice when storage writes fail', () => {
  const storage = { getItem() { return 'AAAAAAAAAAA'; }, setItem() { throw Error('quota'); } };
  const picker = T.createPicker({ list: LIST.slice(0, 2), storage, random: () => 0 });
  assert.equal(picker.next().videoId, 'BBBBBBBBBBB');
  assert.equal(picker.next().videoId, 'AAAAAAAAAAA');
  assert.equal(picker.next().videoId, 'BBBBBBBBBBB');
});

const parentConfig = path.join(__dirname, '..', 'transitions-config.js');
test('every episode in the parent configuration passes validation', { skip: !fs.existsSync(parentConfig) && 'sin transitions-config.js' }, () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(parentConfig, 'utf8'), sandbox);
  const clean = T.cleanList(sandbox.window.LAUNCHER_TRANSITIONS);
  assert.ok(clean.length > 1);
  assert.equal(clean.length, sandbox.window.LAUNCHER_TRANSITIONS.length, 'no configured episode is silently dropped');
  for (const entry of clean) assert.match(entry.title, /^Transitions \d+/);
});
