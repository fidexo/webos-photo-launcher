const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const context = { window: {}, Math, JSON, Date, isFinite, isNaN, encodeURIComponent, String, Number, parseInt };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'daily-photos.js'), 'utf8'), context);
const D = context.window.LauncherDailyPhotos;
const plain = (value) => JSON.parse(JSON.stringify(value)); // objetos del contexto vm → objetos locales

const ENDPOINT = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&generator=categorymembers&gcmtitle=Category%3AFeatured_pictures_of_landscapes';
const CONFIG = { endpoint: ENDPOINT, count: 6 };
const NOON = new Date(2026, 9, 20, 12, 0).getTime(); // hora local de la máquina, como en la TV
const DAY = 24 * 60 * 60 * 1000;

function page(id, info, meta, extra) {
  return Object.assign({
    pageid: id,
    title: 'File:Lake ' + id + '.jpg',
    imageinfo: [Object.assign({
      mime: 'image/jpeg', width: 6000, height: 4000, thumbwidth: 1920, thumbheight: 1280,
      thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Lake_' + id + '.jpg/1920px-Lake_' + id + '.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Lake_' + id + '.jpg',
      extmetadata: Object.assign({
        Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Ana" title="User:Ana">Ana &amp; Bo</a>' },
        LicenseShortName: { value: 'CC BY-SA 4.0' },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
        AttributionRequired: { value: 'true' },
        ImageDescription: { value: 'A calm <b>lake</b> at dawn' }
      }, meta)
    }, info)]
  }, extra);
}
const pages = (from, count) => Array.from({ length: count }, (_, i) => page(from + i));
const reply = (list, next) => ({ batchcomplete: true, continue: next, query: { pages: list } });
const TOKEN_A = { gcmcontinue: '20250620005131|139570600', continue: 'gcmcontinue||' };
const TOKEN_B = { gcmcontinue: '20250619063536|97468430', continue: 'gcmcontinue||' };

test('a valid page becomes plain, bounded photo metadata with a clean thumbnail URL', () => {
  const photo = plain(D.parsePage(page(7)));
  assert.deepEqual(photo, {
    id: 7,
    src: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Lake_7.jpg/1920px-Lake_7.jpg',
    width: 1920, height: 1280, title: 'Lake 7', author: 'Ana & Bo',
    license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Lake_7.jpg', description: 'A calm lake at dawn'
  });
  assert.ok(D.parsePage(page(8, { thumburl: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Lake_8.jpg' })));
});

test('malformed responses fail; an empty category is a valid empty answer', () => {
  for (const body of [null, undefined, 'x', 7, [], { error: { code: 'maxlag', info: 'Waiting for a database server' } }, { query: null }, { query: {} }, { query: { pages: {} } }]) {
    assert.equal(D.parseResponse(body), null, JSON.stringify(body));
  }
  assert.equal(D.parseResponse({ batchcomplete: true }).photos.length, 0);
  const mixed = D.parseResponse(reply([null, 7, 'x', {}, { pageid: 1 }, { pageid: 2, title: 'File:x.jpg' }, { pageid: 3, title: 'File:y.jpg', imageinfo: [null] }, page(4), page(4)]));
  assert.deepEqual(Array.from(mixed.photos, (photo) => photo.id), [4], 'junk skipped, duplicates removed');
});

test('only JPEG landscapes of 1.3–2.4 ratio, ≤ 1920 px thumbnails and Wikimedia hosts are kept', () => {
  const rejected = [
    page(1, { mime: 'image/png' }),
    page(2, { thumbheight: 2880 }), // vertical
    page(3, { thumbheight: 386 }), // panorámica extrema
    page(4, { thumbheight: 1483 }), // 1.29
    page(5, { thumbwidth: 2560, thumbheight: 1440 }),
    page(6, { thumbwidth: 800, thumbheight: 500 }),
    page(7, { thumbwidth: '1920' }),
    page(8, { thumburl: 'https://upload.wikimedia.org.evil.com/wikipedia/commons/a/ab/x.jpg' }),
    page(9, { thumburl: 'http://upload.wikimedia.org/wikipedia/commons/a/ab/x.jpg' }),
    page(10, { thumburl: 'https://user@thumb.wikimedia.org/wikipedia/commons/a/ab/x.jpg' }),
    page(11, { thumburl: 'https://evil.example/wikipedia/commons/a/ab/x.jpg' }),
    page(12, { thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/a/ab/x.jpg"onerror="x' }),
    page(13, { thumburl: 'javascript:alert(1)//x.jpg' }),
    page(14, { descriptionurl: 'https://evil.example/wiki/File:x.jpg' }),
    page(15, {}, {}, { pageid: '15' }),
    page(16, {}, {}, { title: 'File:Train crossing the valley.jpg' }),
    page(17, {}, { ImageDescription: { value: 'Rowers training on a lake' } }),
    page(18, {}, {}, { title: 'File:Reformierte Kirche Scuol.jpg' })
  ];
  for (const candidate of rejected) assert.equal(D.parsePage(candidate), null, 'page ' + candidate.pageid);
  assert.ok(D.parsePage(page(19, { thumbheight: 960 })), '2:1 panorama is fine');
  assert.ok(D.parsePage(page(20, { thumbwidth: 1280, thumbheight: 800 })));
});

test('licences: CC0, public domain, CC BY and CC BY-SA with a coherent creativecommons.org URL only', () => {
  const cases = [
    ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0', 'CC BY-SA 4.0'],
    ['CC BY 2.0', 'https://creativecommons.org/licenses/by/2.0/', 'CC BY 2.0'],
    ['CC BY-SA 3.0 de', 'https://creativecommons.org/licenses/by-sa/3.0/de/deed.en', 'CC BY-SA 3.0 de'],
    ['CC BY 4.0', 'http://creativecommons.org/licenses/by/4.0', 'CC BY 4.0'],
    ['CC0', 'http://creativecommons.org/publicdomain/zero/1.0/deed.en', 'CC0'],
    ['Public domain', '', 'Dominio público'],
    ['CC BY-NC 4.0', 'https://creativecommons.org/licenses/by-nc/4.0', null],
    ['CC BY-NC-SA 4.0', 'https://creativecommons.org/licenses/by-nc-sa/4.0', null],
    ['CC BY-ND 4.0', 'https://creativecommons.org/licenses/by-nd/4.0', null],
    ['GFDL', 'https://www.gnu.org/licenses/fdl.html', null],
    ['FAL', 'http://artlibre.org/licence/lal/en', null],
    ['CC BY 4.0', '', null],
    ['CC BY 4.0', 'https://creativecommons.org/licenses/by-sa/4.0', null],
    ['CC BY 4.0', 'https://creativecommons.org/licenses/by/3.0', null],
    ['CC BY 4.0', 'https://creativecommons.org.evil.com/licenses/by/4.0', null],
    ['CC BY 4.0', 'javascript:alert(1)', null],
    ['CC0', '', null],
    ['Attribution', 'https://creativecommons.org/licenses/by/4.0', null],
    ['', '', null]
  ];
  for (const [name, url, expected] of cases) {
    const result = D.checkLicense(name, url);
    assert.equal(result ? result.license : null, expected, name + ' ' + url);
  }
  assert.equal(D.checkLicense('CC BY 4.0', 'http://creativecommons.org/licenses/by/4.0').licenseUrl, 'https://creativecommons.org/licenses/by/4.0');
  assert.equal(D.checkLicense('Public domain', 'https://en.wikipedia.org/wiki/Public_domain').licenseUrl, '', 'unvetted links are not kept');
  const missing = page(1, {}, { LicenseShortName: undefined, LicenseUrl: undefined });
  assert.equal(D.parsePage(missing), null);
});

test('third-party HTML is reduced to bounded plain text; markup never survives', () => {
  assert.equal(D.htmlToText('<script>alert(1)</script><b>Ana</b> <img src=x onerror=alert(1)>', 80), 'Ana');
  assert.equal(D.htmlToText('<style>a{}</style>Bo &lt;3 &#x41;&#66; &quot;C&quot; &nbsp;D&bogus;', 80), 'Bo <3 AB "C" D');
  assert.equal(D.htmlToText('<!-- hidden -->Visible <a href="x', 80), 'Visible');
  assert.equal(D.htmlToText('<ul><li><b>Original: </b>Ana</li><li><b>Derivative work: </b>Bo</li></ul>', 80), 'Original: Ana; Derivative work: Bo');
  assert.equal(D.htmlToText('A\u0000B‮C\n\tD', 80), 'A B C D');
  assert.equal(D.htmlToText('x'.repeat(200), 50).length, 50);
  assert.ok(D.htmlToText('x'.repeat(200), 50).endsWith('…'));
  for (const value of [null, undefined, 7, {}]) assert.equal(D.htmlToText(value, 10), '');
  const long = '<table><tr><td><a href="https://upload.wikimedia.org/x.jpg">This Photo</a> was taken by <a href="//commons.wikimedia.org/wiki/User:Tagooty" title="User:Tagooty">Timothy A. Gonsalves</a>. Feel free to use my photos, but please mention me as the author and send me an email.</td></tr></table>';
  assert.equal(D.parsePage(page(1, {}, { Artist: { value: long } })).author, 'Timothy A. Gonsalves');
  assert.equal(D.parsePage(page(2, {}, { Artist: { value: '' }, Credit: { value: '<span>Studio Uno</span>' } })).author, 'Studio Uno');
  assert.equal(D.parsePage(page(3, {}, { Artist: { value: '' }, Credit: { value: 'Own work' } })), null, 'no author, no photo');
  assert.equal(D.parsePage(page(4, {}, { Artist: undefined })), null);
});

test('the request URL only carries the continuation the API returned', () => {
  assert.equal(D.buildUrl(ENDPOINT, null), ENDPOINT);
  assert.equal(D.buildUrl(ENDPOINT, TOKEN_A), ENDPOINT + '&continue=gcmcontinue%7C%7C&gcmcontinue=20250620005131%7C139570600');
  for (const bad of [{ gcmcontinue: 'a&action=edit', continue: 'gcmcontinue||' }, { gcmcontinue: 'x y', continue: 'c' }, { gcmcontinue: 'x' }, 'token', 7]) {
    assert.equal(D.buildUrl(ENDPOINT, bad), ENDPOINT);
  }
  for (const config of [null, {}, { endpoint: 'https://evil.example/w/api.php?x=1' }, { endpoint: 'http://commons.wikimedia.org/w/api.php?x=1' },
    { endpoint: ENDPOINT + '&gcmcontinue=1' }, { endpoint: ENDPOINT + '"><script>' }, { endpoint: 7 }]) {
    assert.equal(D.validConfig(config), null, JSON.stringify(config));
  }
  assert.equal(D.validConfig({ endpoint: ENDPOINT, count: 10 }).count, 6);
  assert.equal(D.validConfig({ endpoint: ENDPOINT, count: 3 }).count, 3);
  assert.equal(D.validConfig({ endpoint: ENDPOINT }).count, 6);
});

test('the day is the TV local date and midnight is computed locally', () => {
  const late = new Date(2026, 9, 20, 23, 59, 30).getTime();
  assert.equal(D.localDay(late), '2026-10-20');
  assert.equal(D.localDay(late + 31000), '2026-10-21');
  assert.equal(D.msUntilNextDay(late), 30000);
  assert.equal(D.localDay(NaN), '');
});

test('selection prefers new photos (not shown the previous day) and spreads across the batch', () => {
  const photos = Array.from(D.parseResponse(reply(pages(1, 12))).photos);
  const first = Array.from(D.choose(photos, 6, []), (photo) => photo.id);
  assert.deepEqual(first, [1, 3, 5, 7, 9, 11]);
  const next = Array.from(D.choose(photos, 6, first), (photo) => photo.id);
  assert.equal(next.filter((id) => first.indexOf(id) !== -1).length, 0, 'no repeats when the pool allows');
  const small = Array.from(D.choose(photos.slice(0, 7), 6, [1, 2, 3]), (photo) => photo.id);
  assert.deepEqual(small, [4, 5, 6, 7, 1, 2], 'fills with older ones only when needed');
  const narrow = Array.from(D.parseResponse(reply([page(30, { thumbwidth: 1000, thumbheight: 600 })].concat(pages(31, 6)))).photos);
  assert.equal(Array.from(D.choose(narrow, 6, [])).some((photo) => photo.id === 30), false, '≥ 1280 px preferred');
});

// ---------- Controlador ----------
function memory(initial) {
  const data = Object.assign({}, initial);
  return { getItem: (key) => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); }, data };
}
function harness(options = {}) {
  const state = { now: options.now || NOON, hidden: !!options.hidden, requests: [], shown: [], timers: [] };
  const daily = D.createDailyPhotos({
    config: 'config' in options ? options.config : CONFIG,
    storage: 'storage' in options ? options.storage : memory(),
    now: () => state.now,
    isHidden: () => state.hidden,
    onPhotos: (list) => state.shown.push(list),
    request: (url, timeout, done) => state.requests.push({ url, timeout, done }),
    setTimer: (fn, ms) => { const timer = { fn, ms, at: state.now + ms }; state.timers.push(timer); return timer; },
    clearTimer: (timer) => { state.timers = state.timers.filter((candidate) => candidate !== timer); }
  });
  state.answer = (error, body) => state.requests[state.requests.length - 1].done(error, body);
  state.fire = () => { const timer = state.timers.shift(); state.now = Math.max(state.now, timer.at); timer.fn(); };
  state.ids = (index) => Array.from(state.shown[index === undefined ? state.shown.length - 1 : index], (photo) => photo.id);
  return { daily, state };
}

test('without configuration nothing is requested and cached photos are not used', () => {
  const storage = memory({ [D.STORAGE_KEY]: JSON.stringify({ v: 1, day: '2026-10-20', photos: [plain(D.parsePage(page(1)))] }) });
  for (const config of [undefined, null, {}, { endpoint: 'https://evil.example/w/api.php?x' }]) {
    const { daily, state } = harness({ config, storage });
    daily.start();
    daily.visibilityChanged();
    assert.equal(state.requests.length, 0);
    assert.equal(state.timers.length, 0);
    assert.equal(state.shown.length, 0);
  }
});

test('first day: one request, six photos, metadata and continuation cached, next check after midnight', () => {
  const storage = memory();
  const { daily, state } = harness({ storage });
  daily.start();
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].url, ENDPOINT);
  assert.ok(state.requests[0].timeout > 0 && state.requests[0].timeout <= 15000);
  assert.equal(state.shown.length, 0, 'the local gallery stays until there is valid metadata');
  state.answer(null, reply(pages(1, 12), TOKEN_A));
  assert.equal(state.shown.length, 1);
  assert.equal(state.ids().length, 6);
  const cached = JSON.parse(storage.data[D.STORAGE_KEY]);
  assert.equal(cached.day, '2026-10-20');
  assert.deepEqual(cached.next, TOKEN_A);
  assert.equal(cached.photos.length, 6);
  assert.doesNotMatch(storage.data[D.STORAGE_KEY], /base64|data:image/, 'no image bytes in storage');
  assert.equal(state.timers.length, 1);
  assert.equal(state.timers[0].at, new Date(2026, 9, 21).getTime() + 60000);
  daily.visibilityChanged();
  assert.equal(state.requests.length, 1, 'same day: no second request');
});

test('same day reopen uses the cache without requesting; next day walks to the next page, then back to the start', () => {
  const storage = memory();
  const day1 = harness({ storage });
  day1.daily.start();
  day1.state.answer(null, reply(pages(1, 12), TOKEN_A));
  const firstIds = day1.state.ids();

  const reopen = harness({ storage, now: NOON + 3 * 60 * 60 * 1000 });
  reopen.daily.start();
  assert.equal(reopen.state.requests.length, 0);
  assert.deepEqual(reopen.state.ids(0), firstIds, 'cached selection shown right away');

  const day2 = harness({ storage, now: NOON + DAY });
  day2.daily.start();
  assert.deepEqual(day2.state.ids(0), firstIds, 'yesterday stays until the new answer');
  assert.equal(day2.state.requests.length, 1);
  assert.equal(day2.state.requests[0].url, D.buildUrl(ENDPOINT, TOKEN_A));
  day2.state.answer(null, reply(pages(1, 3).concat(pages(100, 12))));
  const secondIds = day2.state.ids();
  assert.equal(secondIds.filter((id) => firstIds.indexOf(id) !== -1).length, 0, 'no photo from the previous day');
  assert.equal(JSON.parse(storage.data[D.STORAGE_KEY]).next, null);

  const day3 = harness({ storage, now: NOON + 2 * DAY });
  day3.daily.start();
  assert.equal(day3.state.requests[0].url, ENDPOINT, 'without continuation the walk restarts at the first page');
});

test('an empty filtered batch allows exactly one more, using the returned continuation', () => {
  const storage = memory();
  const seed = harness({ storage });
  seed.daily.start();
  seed.state.answer(null, reply(pages(1, 6)));
  const before = seed.state.ids();

  const { daily, state } = harness({ storage, now: NOON + DAY });
  daily.start();
  state.answer(null, reply([page(50, { mime: 'image/png' })], TOKEN_A));
  assert.equal(state.requests.length, 2);
  assert.equal(state.requests[1].url, D.buildUrl(ENDPOINT, TOKEN_A));
  state.answer(null, reply([page(51, { thumbheight: 3000 })], TOKEN_B));
  assert.equal(state.requests.length, 2, 'never a third request');
  assert.equal(state.shown.length, 1, 'previous selection kept, no empty gallery');
  assert.deepEqual(state.ids(0), before);
  const cached = JSON.parse(storage.data[D.STORAGE_KEY]);
  assert.equal(cached.day, '2026-10-21', 'the day is done; no retries today');
  assert.deepEqual(cached.next, TOKEN_B);
  daily.visibilityChanged();
  assert.equal(state.requests.length, 2);
});

test('network, API and maxlag failures keep the selection and retry at most once an hour', () => {
  for (const failure of [[{ kind: 'network' }], [{ kind: 'http', status: 503 }], [null, { error: { code: 'maxlag' } }], [null, { query: { pages: 'x' } }]]) {
    const storage = memory();
    const seed = harness({ storage });
    seed.daily.start();
    seed.state.answer(null, reply(pages(1, 6), TOKEN_A));
    const { daily, state } = harness({ storage, now: NOON + DAY });
    daily.start();
    state.answer(failure[0], failure[1]);
    assert.equal(state.shown.length, 1, 'only the cached selection');
    assert.equal(state.requests.length, 1);
    daily.visibilityChanged();
    state.now += 10 * 60000;
    daily.visibilityChanged();
    assert.equal(state.requests.length, 1, 'returning to the screen does not hammer the API');
    assert.equal(state.timers.length, 1);
    assert.ok(state.timers[0].at - (NOON + DAY) >= D.RETRY_MS - 1000);
    const reopened = harness({ storage, now: NOON + DAY + 5 * 60000 });
    reopened.daily.start();
    assert.equal(reopened.state.requests.length, 0, 'a relaunch also respects the wait');
    state.fire();
    assert.equal(state.requests.length, 2);
    assert.equal(state.requests[1].url, D.buildUrl(ENDPOINT, TOKEN_A), 'the same page is retried, no token invented');
  }
});

test('nothing runs while hidden; returning after midnight refreshes once', () => {
  const storage = memory();
  const { daily, state } = harness({ storage, hidden: true });
  daily.start();
  assert.equal(state.requests.length, 0);
  assert.equal(state.timers.length, 0);
  state.hidden = false;
  daily.visibilityChanged();
  assert.equal(state.requests.length, 1);
  state.answer(null, reply(pages(1, 8)));
  assert.equal(state.timers.length, 1, 'midnight timer');
  state.hidden = true;
  daily.visibilityChanged();
  assert.equal(state.timers.length, 0, 'timer paused while hidden');
  state.now += DAY;
  state.hidden = false;
  daily.visibilityChanged();
  daily.visibilityChanged();
  assert.equal(state.requests.length, 2, 'one refresh on return, not one per event');
});

test('an empty response received while hidden defers its continuation until visible', () => {
  const { daily, state } = harness();
  daily.start();
  state.hidden = true;
  daily.visibilityChanged();
  state.answer(null, reply([], TOKEN_A));
  assert.equal(state.requests.length, 1, 'no second request in the background');
  assert.equal(state.timers.length, 0);
  state.hidden = false;
  daily.visibilityChanged();
  daily.visibilityChanged();
  assert.equal(state.requests.length, 2, 'continuation resumes once');
  assert.equal(state.requests[1].url, D.buildUrl(ENDPOINT, TOKEN_A));
  state.answer(null, reply(pages(100, 6), TOKEN_B));
  assert.deepEqual(state.ids(), [100, 101, 102, 103, 104, 105]);
});

test('the midnight timer refreshes the gallery while the screen stays on', () => {
  const late = new Date(2026, 9, 20, 23, 50).getTime();
  const { daily, state } = harness({ now: late });
  daily.start();
  state.answer(null, reply(pages(1, 8), TOKEN_A));
  assert.equal(state.timers[0].ms, 10 * 60000 + 60000);
  state.fire();
  assert.equal(state.requests.length, 2);
  assert.equal(state.requests[1].url, D.buildUrl(ENDPOINT, TOKEN_A));
  state.answer(null, reply(pages(20, 8)));
  assert.equal(state.shown.length, 2);
  assert.equal(daily.day(), '2026-10-21');
});

test('corrupt or tampered storage is ignored and unavailable storage still works', () => {
  const tampered = [
    'not json', '[]', JSON.stringify({ v: 2, day: '2026-10-20', photos: [] }),
    JSON.stringify({ v: 1, day: '2026-10-20', photos: [Object.assign(plain(D.parsePage(page(1))), { src: 'https://evil.example/x.jpg' })] }),
    JSON.stringify({ v: 1, day: '2026-10-20', photos: [Object.assign(plain(D.parsePage(page(1))), { license: 'CC BY-NC 4.0' })] }),
    JSON.stringify({ v: 1, day: 'yesterday', photos: 'x', next: { gcmcontinue: 'a&b=c', continue: 'x' }, failedAt: 'soon' })
  ];
  for (const value of tampered) {
    const { daily, state } = harness({ storage: memory({ [D.STORAGE_KEY]: value }) });
    daily.start();
    assert.equal(state.shown.length, 0, value);
    assert.equal(state.requests.length, 1, value);
    assert.equal(state.requests[0].url, ENDPOINT, 'a tampered token is never sent');
  }
  const throwing = { getItem() { throw Error('denied'); }, setItem() { throw Error('full'); } };
  for (const storage of [throwing, null]) {
    const { daily, state } = harness({ storage });
    daily.start();
    state.answer(null, reply(pages(1, 8)));
    assert.equal(state.shown.length, 1);
  }
  const future = harness({ storage: memory({ [D.STORAGE_KEY]: JSON.stringify({ v: 1, day: '2026-10-20', photos: [], failedAt: NOON + DAY }) }), now: NOON + 2 * DAY });
  future.daily.start();
  assert.equal(future.state.requests.length, 1, 'a failure stamped in the future does not block');
});

test('late duplicate callbacks are ignored and callers get copies, never live state', () => {
  const storage = memory();
  const { daily, state } = harness({ storage });
  daily.start();
  const first = state.requests[0];
  first.done(null, reply(pages(1, 8)));
  first.done(null, reply(pages(50, 8)));
  first.done({ kind: 'network' });
  assert.equal(state.shown.length, 1);
  assert.equal(JSON.parse(storage.data[D.STORAGE_KEY]).failedAt, 0);
  state.shown[0][0].src = 'https://evil.example/x.jpg';
  state.shown[0].length = 0;
  assert.equal(daily.selection().length, 6);
  assert.match(daily.selection()[0].src, /^https:\/\/thumb\.wikimedia\.org\//);
  const other = harness({ storage: memory() });
  other.daily.start();
  assert.equal(other.state.requests.length, 1, 'separate instances do not share state');
  assert.equal(other.daily.selection().length, 0);
});

test('the parent endpoint is accepted as configured', { skip: !fs.existsSync(path.join(__dirname, '..', 'daily-photos-config.js')) && 'sin config' }, () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'daily-photos-config.js'), 'utf8'), sandbox);
  const config = D.validConfig(sandbox.window.LAUNCHER_DAILY_PHOTOS);
  assert.ok(config, 'validConfig accepts the parent endpoint');
  assert.ok(config.count >= 1 && config.count <= 6);
});

test('authors lose a trailing period but keep initials', () => {
  const author = (value) => D.parsePage(page(1, {}, { Artist: { value } })).author;
  assert.equal(author('Dominicus Johannes Bergsma.'), 'Dominicus Johannes Bergsma');
  assert.equal(author('A.Savin'), 'A.Savin');
  assert.equal(author('John Q.'), 'John Q.');
});
