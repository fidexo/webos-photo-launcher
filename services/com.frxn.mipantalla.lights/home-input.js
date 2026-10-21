'use strict';

var EVENT_BYTES = 16;
var DEFAULT_HOME_CODE = 773;

function parseEvents(buffer, previous) {
  if (!Buffer.isBuffer(buffer) || (previous !== undefined && !Buffer.isBuffer(previous))) {
    throw new TypeError('Input events must be Buffers.');
  }
  if (previous && previous.length >= EVENT_BYTES) throw new RangeError('Incomplete event must contain fewer than 16 bytes.');
  var bytes = previous && previous.length ? Buffer.concat([previous, buffer]) : buffer;
  var complete = bytes.length - bytes.length % EVENT_BYTES;
  var events = [];
  for (var offset = 0; offset < complete; offset += EVENT_BYTES) {
    events.push({type: bytes.readUInt16LE(offset + 8), code: bytes.readUInt16LE(offset + 10), value: bytes.readInt32LE(offset + 12)});
  }
  var remainder = Buffer.alloc(bytes.length - complete);
  bytes.copy(remainder, 0, complete);
  return {events: events, remainder: remainder};
}

function isHomeEvent(event, homeCode) {
  if (homeCode === undefined) homeCode = DEFAULT_HOME_CODE;
  if (typeof homeCode !== 'number' || !isFinite(homeCode) || Math.floor(homeCode) !== homeCode || homeCode < 0 || homeCode > 65535) {
    throw new RangeError('HOME code must be an integer from 0 to 65535.');
  }
  return !!event && event.type === 1 && event.code === homeCode && event.value === 1;
}

module.exports = {parseEvents: parseEvents, isHomeEvent: isHomeEvent};
