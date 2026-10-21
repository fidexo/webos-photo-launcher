const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load() {
  const context = { window: {}, Math, JSON, Date, isFinite, encodeURIComponent, String };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'weather.js'), 'utf8'), context);
  return context.window.LauncherWeather;
}
const W = load();
// Coordenadas de prueba ficticias: no representan la ubicación configurada por el proyecto.
const CONFIG = { name: 'Prueba', region: 'Test', latitude: -10.5, longitude: 20.25, timezone: 'UTC' };
const NOW = Date.UTC(2026, 9, 20, 21, 0);
const body = (current) => ({ utc_offset_seconds: -10800, current_units: { temperature_2m: '°C' }, current: Object.assign({ time: '2026-10-20T18:00', temperature_2m: 18.4, apparent_temperature: 17.6, weather_code: 2, is_day: 1 }, current) });

function memoryStorage(initial) {
  const data = Object.assign({}, initial);
  return { getItem: (key) => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); }, data };
}
function harness(options = {}) {
  const state = { now: options.now || NOW, hidden: false, requests: [], views: [], timers: [] };
  const weather = W.createWeather({
    config: 'config' in options ? options.config : CONFIG,
    storage: options.storage || memoryStorage(),
    now: () => state.now,
    isHidden: () => state.hidden,
    render: (view) => state.views.push(view),
    request: (url, timeout, done) => state.requests.push({ url, timeout, done }),
    setTimer: (fn, ms) => { const timer = { fn, ms, at: state.now + ms }; state.timers.push(timer); return timer; },
    clearTimer: (timer) => { state.timers = state.timers.filter((candidate) => candidate !== timer); }
  });
  state.last = () => state.views[state.views.length - 1];
  state.fire = () => { const timer = state.timers.shift(); state.now = Math.max(state.now, timer.at); timer.fn(); };
  return { weather, state };
}

test('no configuration means no request and an explicit unavailable state', () => {
  for (const config of [undefined, null, {}, { name: 'X', latitude: '1', longitude: 2, timezone: 'UTC' }, { name: 'X', latitude: 91, longitude: 0, timezone: 'UTC' }, { name: 'X', latitude: NaN, longitude: 0, timezone: 'UTC' }]) {
    const { weather, state } = harness({ config });
    weather.start();
    weather.visibilityChanged();
    assert.equal(state.requests.length, 0);
    assert.equal(state.timers.length, 0);
    assert.equal(state.last().state, 'unconfigured');
  }
});

test('requests the official endpoint with the documented current fields', () => {
  const { weather, state } = harness();
  weather.start();
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].url, 'https://api.open-meteo.com/v1/forecast?latitude=-10.5&longitude=20.25&current=temperature_2m,apparent_temperature,weather_code,is_day&timezone=auto');
  assert.ok(state.requests[0].timeout > 0 && state.requests[0].timeout <= 10000);
  assert.equal(state.last().state, 'loading');
});

test('0 °C is a valid reading; unknown values are never turned into 0', () => {
  const zero = W.parseForecast(body({ temperature_2m: 0, apparent_temperature: -0.4 }));
  assert.equal(zero.temperature, 0);
  assert.equal(W.degrees(zero.temperature), '0°');
  assert.equal(W.degrees(zero.apparent), '0°', 'no "-0°"');
  for (const bad of [null, undefined, '18', NaN, Infinity, 99]) assert.equal(W.parseForecast(body({ temperature_2m: bad })), null, String(bad));
  assert.equal(W.parseForecast(body({ apparent_temperature: null })).apparent, null);
  assert.equal(W.parseForecast(body({ weather_code: 4 })), null, 'unknown WMO code');
  assert.equal(W.parseForecast(body({ weather_code: 2.5 })), null);
  assert.equal(W.parseForecast(body({ is_day: true })), null);
  assert.equal(W.parseForecast({ ...body({}), current_units: { temperature_2m: '°F' } }), null);
  assert.equal(W.parseForecast({ error: true, reason: 'x' }), null);
  assert.equal(W.parseForecast('nope'), null);
});

test('describes WMO codes in Spanish with day and night icons', () => {
  assert.deepEqual({ ...W.describe({ code: 0, isDay: true }) }, { label: 'Despejado', icon: 'clear-day' });
  assert.deepEqual({ ...W.describe({ code: 2, isDay: false }) }, { label: 'Parcialmente nublado', icon: 'partly-night' });
  assert.equal(W.describe({ code: 63, isDay: true }).label, 'Lluvia');
  assert.equal(W.describe({ code: 95, isDay: true }).icon, 'storm');
  assert.equal(W.describe({ code: 77, isDay: true }).label, 'Nieve granulada');
  assert.equal(W.parseForecast(body({ weather_code: 97 })).code, 97);
});

test('source time and UTC offset are required and invalid dates are rejected', () => {
  assert.equal(W.parseForecast(body({})).validAt, NOW);
  for (const time of [undefined, '', '2026-02-30T18:00', '2026-10-20T25:00', 'not a date']) {
    assert.equal(W.parseForecast(body({ time })), null, String(time));
  }
  for (const offset of [undefined, null, '0', 999999, NaN]) {
    assert.equal(W.parseForecast({ ...body({}), utc_offset_seconds: offset }), null);
  }
});

test('a newly fetched old reading stays stale and repeated responses do not renew it', () => {
  const { weather, state } = harness();
  weather.start();
  state.requests[0].done(null, body({ time: '2026-10-20T17:15' }));
  assert.equal(state.last().state, 'stale');
  assert.equal(state.last().validAt, NOW - 45 * 60000);
  state.fire();
  state.requests[1].done(null, body({ time: '2026-10-20T17:15' }));
  assert.equal(state.last().state, 'stale', 'retrieval time must not replace the source time');
  for (const time of ['2026-10-19T18:00', '2026-10-21T18:00']) {
    const next = harness();
    next.weather.start();
    next.state.requests[0].done(null, body({ time }));
    assert.equal(next.state.last().state, 'error', time);
    assert.equal(next.state.last().reading, undefined);
  }
});

test('a good response renders, caches and schedules the next refresh in 15 minutes', () => {
  const storage = memoryStorage();
  const { weather, state } = harness({ storage });
  weather.start();
  state.requests[0].done(null, body({ temperature_2m: 0 }));
  const view = state.last();
  assert.equal(view.state, 'ok');
  assert.equal(view.reading.temperature, 0);
  assert.equal(view.place, 'Prueba');
  assert.equal(state.timers.length, 1);
  assert.equal(state.timers[0].ms, W.REFRESH_MS);
  assert.match(storage.data['mi-pantalla-weather-v1'], /"temperature_2m":0/);
});

test('failures show unavailable, back off and never invent a reading', () => {
  const { weather, state } = harness();
  weather.start();
  state.requests[0].done({ kind: 'timeout' });
  assert.equal(state.last().state, 'error');
  assert.equal(state.last().reading, undefined);
  assert.equal(state.timers[0].ms, 60000);
  state.fire();
  state.requests[1].done({ kind: 'network' });
  assert.equal(state.timers[0].ms, 120000);
  state.fire();
  state.requests[2].done(null, body({ temperature_2m: null }));
  assert.equal(state.last().state, 'error');
  assert.equal(state.last().reason, 'Respuesta no válida');
  assert.equal(W.retryDelay({ kind: 'http', status: 400 }, 1), W.REFRESH_MS, 'no fast retry on 4xx');
  assert.equal(W.retryDelay({ kind: 'http', status: 503 }, 1), 60000);
  assert.equal(W.retryDelay({ kind: 'network' }, 9), W.REFRESH_MS, 'capped at the normal cadence');
});

test('cache is shown with its time, labelled when old, and dropped when too old', () => {
  const fetchedAt = NOW;
  const entry = JSON.stringify({ latitude: CONFIG.latitude, longitude: CONFIG.longitude, fetchedAt, ...body({}) });
  const fresh = harness({ now: fetchedAt + 5 * 60000, storage: memoryStorage({ 'mi-pantalla-weather-v1': entry }) });
  fresh.weather.start();
  assert.equal(fresh.state.views[0].state, 'ok');
  assert.equal(fresh.state.requests.length, 0, 'fresh cache does not refetch');
  assert.equal(fresh.state.timers[0].ms, 10 * 60000);

  const old = harness({ now: fetchedAt + 45 * 60000, storage: memoryStorage({ 'mi-pantalla-weather-v1': entry }) });
  old.weather.start();
  assert.equal(old.state.views[0].state, 'stale');
  assert.equal(old.state.requests.length, 1, 'expired cache refetches');
  old.state.requests[0].done({ kind: 'offline' });
  assert.equal(old.state.last().state, 'stale', 'keeps the labelled previous reading while offline');

  const ancient = harness({ now: fetchedAt + W.MAX_AGE_MS + 1, storage: memoryStorage({ 'mi-pantalla-weather-v1': entry }) });
  ancient.weather.start();
  assert.equal(ancient.state.views[0].state, 'loading');
  ancient.state.requests[0].done({ kind: 'network' });
  assert.equal(ancient.state.last().state, 'error');

  const moved = harness({ now: fetchedAt + 60000, config: Object.assign({}, CONFIG, { latitude: 1 }), storage: memoryStorage({ 'mi-pantalla-weather-v1': entry }) });
  moved.weather.start();
  assert.equal(moved.state.views[0].state, 'loading', 'cache from other coordinates is ignored');
});

test('pauses while hidden and refreshes on return only when expired', () => {
  const { weather, state } = harness();
  weather.start();
  state.requests[0].done(null, body({}));
  state.hidden = true;
  weather.visibilityChanged();
  assert.equal(state.timers.length, 0, 'no timers while hidden');
  state.hidden = false;
  state.now += 5 * 60000;
  weather.visibilityChanged();
  assert.equal(state.requests.length, 1, 'still fresh');
  assert.equal(state.timers.length, 1);
  state.hidden = true;
  weather.visibilityChanged();
  state.now += 20 * 60000;
  state.hidden = false;
  weather.visibilityChanged();
  assert.equal(state.requests.length, 2, 'expired on return');
});

test('a future cache timestamp cannot prevent recovery with current weather', () => {
  for (const entry of [
    { latitude: CONFIG.latitude, longitude: CONFIG.longitude, fetchedAt: NOW, ...body({ time: '2030-10-20T18:00' }) },
    { latitude: CONFIG.latitude, longitude: CONFIG.longitude, fetchedAt: NOW + 60000, ...body({}) }
  ]) {
    const { weather, state } = harness({ storage: memoryStorage({ 'mi-pantalla-weather-v1': JSON.stringify(entry) }) });
    weather.start();
    assert.equal(state.last().state, 'loading');
    state.requests[0].done(null, body({}));
    assert.equal(state.last().state, 'ok');
    assert.equal(state.last().validAt, NOW);
  }
});

test('XHR transport classifies timeouts, HTTP errors and bad JSON', () => {
  const outcomes = [];
  function FakeXHR() { FakeXHR.last = this; }
  FakeXHR.prototype.open = function (method, url, async) { this.method = method; this.url = url; this.async = async; };
  FakeXHR.prototype.send = function () {};
  const context = { window: {}, navigator: { onLine: true }, XMLHttpRequest: FakeXHR, Math, JSON, Date, isFinite, encodeURIComponent, String };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'weather.js'), 'utf8'), context);
  const request = context.window.LauncherWeather.requestJSON;
  const done = (error, data) => outcomes.push(error ? error.kind + (error.status ? ':' + error.status : '') : data.ok);
  request('https://x', 8000, done); assert.equal(FakeXHR.last.timeout, 8000); assert.equal(FakeXHR.last.method, 'GET'); FakeXHR.last.ontimeout();
  request('https://x', 8000, done); FakeXHR.last.status = 500; FakeXHR.last.onload();
  request('https://x', 8000, done); FakeXHR.last.status = 200; FakeXHR.last.responseText = '{oops'; FakeXHR.last.onload();
  request('https://x', 8000, done); FakeXHR.last.status = 200; FakeXHR.last.responseText = '{"ok":"yes"}'; FakeXHR.last.onload(); FakeXHR.last.onerror();
  context.navigator.onLine = false;
  request('https://x', 8000, done);
  assert.deepEqual(outcomes, ['timeout', 'http:500', 'invalid', 'yes', 'offline']);
});
