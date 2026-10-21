const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../services/com.frxn.mipantalla.lights/home-input.js');
const load = () => { assert.ok(fs.existsSync(file), 'Home input module must exist'); return require(file); };

function inputEvent(type, code, value) {
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32LE(1730000000, 0);
  bytes.writeUInt32LE(500000, 4);
  bytes.writeUInt16LE(type, 8);
  bytes.writeUInt16LE(code, 10);
  bytes.writeInt32LE(value, 12);
  return bytes;
}

test('Home input parses a 32-bit little-endian HOME press', () => {
  const home = load();
  const parsed = home.parseEvents(inputEvent(1, 773, 1));
  assert.deepEqual(parsed.events, [{type: 1, code: 773, value: 1}]);
  assert.equal(parsed.remainder.length, 0);
  assert.equal(home.isHomeEvent(parsed.events[0]), true);
});

test('Home input accepts a configured HOME code including unsigned 16-bit boundaries', () => {
  const home = load();
  for (const code of [0, 102, 65535]) {
    const event = home.parseEvents(inputEvent(1, code, 1)).events[0];
    assert.equal(home.isHomeEvent(event, code), true);
    assert.equal(home.isHomeEvent(event), false);
  }
  assert.equal(home.isHomeEvent({type: 1, code: 773, value: 1}, 102), false);
});

test('Home input ignores other keys, event types, release and repeat values', () => {
  const home = load();
  for (const event of [{type: 1, code: 102, value: 1}, {type: 0, code: 773, value: 1},
    {type: 2, code: 773, value: 1}, {type: 1, code: 773, value: 0},
    {type: 1, code: 773, value: 2}, {type: 1, code: 773, value: -1}, null]) {
    assert.equal(home.isHomeEvent(event), false);
  }
});

test('Home input parses multiple events in order and preserves signed values', () => {
  const home = load();
  const parsed = home.parseEvents(Buffer.concat([
    inputEvent(1, 773, 1), inputEvent(1, 773, 0), inputEvent(2, 0, -32768)
  ]));
  assert.deepEqual(parsed.events, [
    {type: 1, code: 773, value: 1}, {type: 1, code: 773, value: 0}, {type: 2, code: 0, value: -32768}
  ]);
  assert.equal(parsed.remainder.length, 0);
});

test('Home input handles empty reads with or without a partial event', () => {
  const home = load();
  const empty = home.parseEvents(Buffer.alloc(0));
  assert.deepEqual(empty.events, []);
  assert.equal(empty.remainder.length, 0);
  const partial = inputEvent(1, 773, 1).subarray(0, 7);
  const parsed = home.parseEvents(Buffer.alloc(0), partial);
  assert.deepEqual(parsed.events, []);
  assert.deepEqual(parsed.remainder, partial);
  assert.notEqual(parsed.remainder, partial);
});

test('Home input reassembles an event across every possible partial read', () => {
  const home = load();
  const bytes = inputEvent(1, 773, 1);
  for (let split = 1; split < bytes.length; split += 1) {
    const first = home.parseEvents(bytes.subarray(0, split));
    assert.deepEqual(first.events, []);
    assert.deepEqual(first.remainder, bytes.subarray(0, split));
    const second = home.parseEvents(bytes.subarray(split), first.remainder);
    assert.deepEqual(second.events, [{type: 1, code: 773, value: 1}]);
    assert.equal(second.remainder.length, 0);
  }
});

test('Home input keeps each device stream independent across multiple chunks', () => {
  const home = load();
  const firstBytes = Buffer.concat([inputEvent(1, 773, 1), inputEvent(1, 773, 0)]);
  const secondBytes = inputEvent(1, 102, 1);
  const first = home.parseEvents(firstBytes.subarray(0, 20));
  const second = home.parseEvents(secondBytes.subarray(0, 3));
  const continued = home.parseEvents(firstBytes.subarray(20), first.remainder);
  const other = home.parseEvents(secondBytes.subarray(3), second.remainder);
  assert.deepEqual(first.events, [{type: 1, code: 773, value: 1}]);
  assert.deepEqual(continued.events, [{type: 1, code: 773, value: 0}]);
  assert.deepEqual(other.events, [{type: 1, code: 102, value: 1}]);
  assert.equal(continued.remainder.length, 0);
  assert.equal(other.remainder.length, 0);
});

test('Home input never changes caller buffers and copies a trailing partial event', () => {
  const home = load();
  const bytes = Buffer.concat([inputEvent(1, 773, 1), inputEvent(1, 773, 0).subarray(0, 6)]);
  const previous = bytes.subarray(0, 5);
  const read = bytes.subarray(5);
  const original = Buffer.from(bytes);
  const parsed = home.parseEvents(read, previous);
  assert.deepEqual(bytes, original);
  assert.deepEqual(parsed.remainder, original.subarray(16));
  bytes.fill(0);
  assert.deepEqual(parsed.remainder, original.subarray(16));
  const reused = inputEvent(1, 773, 1).subarray(0, 8);
  const copied = home.parseEvents(reused).remainder;
  const expected = Buffer.from(reused);
  reused.fill(0);
  assert.deepEqual(copied, expected);
});

test('Home input validates buffer arguments and rejects an already complete remainder', () => {
  const home = load();
  for (const value of [null, '', [], new Uint8Array(16)]) {
    assert.throws(() => home.parseEvents(value), TypeError);
    assert.throws(() => home.parseEvents(Buffer.alloc(0), value), TypeError);
  }
  assert.throws(() => home.parseEvents(Buffer.alloc(0), Buffer.alloc(16)), RangeError);
});

test('Home input rejects invalid configured HOME codes', () => {
  const home = load();
  for (const value of [-1, 65536, 773.5, NaN, Infinity, '773', null]) {
    assert.throws(() => home.isHomeEvent({type: 1, code: 773, value: 1}, value), RangeError);
  }
});
