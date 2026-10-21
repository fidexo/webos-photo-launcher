const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const A = 'assets/wallpapers/a.jpg';
const B = 'assets/wallpapers/b.webp';
const C = 'assets/wallpapers/c.png';
const plain = (value) => JSON.parse(JSON.stringify(value));
const pixels = (...rgba) => new Uint8ClampedArray(rgba.flat());
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); }

function load(env = {}) {
  const window = Object.assign({}, env);
  const file = path.join(__dirname, '../ambient-wallpaper.js');
  vm.runInNewContext(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '', { window, Promise, Error });
  assert.ok(window.LauncherAmbient, 'the wallpaper-only ambient module must be exported');
  return window.LauncherAmbient;
}

test('dominant color comes from useful pixels, never a fabricated fallback', () => {
  const ambient = load();
  assert.equal(ambient.colorFromPixels(pixels([0, 0, 0, 255], [255, 0, 0, 0])), null);
  assert.equal(ambient.colorFromPixels(new Uint8ClampedArray()), null);
  assert.equal(ambient.colorFromPixels(null), null);
  assert.equal(ambient.colorFromPixels(new Uint8ClampedArray([12, 20, 30])), null);
  const image = pixels(...Array(20).fill([255, 255, 255, 255]), [180, 40, 20, 255], [188, 44, 24, 255], [20, 30, 200, 255]);
  assert.deepEqual(plain(ambient.colorFromPixels(image)), [184, 42, 22]);
  assert.deepEqual(plain(ambient.colorFromPixels(pixels([250, 252, 254, 255]))), [250, 252, 254]);
  assert.deepEqual(plain(ambient.colorFromPixels(pixels([0, 0, 255, 0], [80, 90, 100, 255]))), [80, 90, 100]);
});

function harness(options = {}) {
  const s = { url: A, hidden: false, now: 0, timers: [], loads: [], writes: [], errors: [], ...options };
  const ambient = load().create({
    source: () => s.url,
    isHidden: () => s.hidden,
    setTimer(fn, ms) { const timer = { fn, at: s.now + ms }; s.timers.push(timer); return timer; },
    clearTimer(timer) { s.timers = s.timers.filter((item) => item !== timer); },
    loadColor(url) {
      const task = deferred(); s.loads.push({ url, task });
      return s.deferLoads ? task.promise : Promise.resolve(s.color === undefined ? [180, 40, 20] : s.color);
    },
    send(rgb, ids) {
      const task = deferred(); s.writes.push({ rgb: plain(rgb), ids: ids && plain(ids), task });
      return s.deferWrites ? task.promise : Promise.resolve();
    },
    onError(error, url) { s.errors.push({ error, url }); if (s.onError) s.onError(error, url); }
  });
  async function advance(ms = 200) {
    const until = s.now + ms;
    for (;;) {
      s.timers.sort((a, b) => a.at - b.at);
      if (!s.timers.length || s.timers[0].at > until) break;
      const timer = s.timers.shift(); s.now = timer.at; timer.fn();
    }
    s.now = until; await flush();
  }
  return { ambient, s, advance };
}

test('mount, refresh, visibility and invalid selections have no effects before explicit start', async () => {
  const { ambient, s, advance } = harness();
  ambient.refresh(); ambient.visibilityChanged();
  await advance(100000);
  assert.equal(s.loads.length + s.writes.length + s.timers.length, 0);
  for (const ids of [[], [''], [null], 'lamp']) { ambient.start(ids); await advance(); }
  assert.equal(s.loads.length + s.writes.length, 0);
  ambient.start(); await advance();
  assert.equal(s.writes.length, 1, 'ids are optional when the sender owns its selection');
});

test('explicit start sends the photo once and snapshots selected ids', async () => {
  const { ambient, s, advance } = harness();
  const ids = ['living-a', 'living-a', 'living-b'];
  ambient.start(ids); ids[0] = 'elsewhere'; await advance();
  assert.deepEqual(s.writes.map((w) => w.ids), [['living-a', 'living-b']]);
  assert.deepEqual(s.writes[0].rgb, [180, 40, 20]);
  for (let i = 0; i < 10; i++) { ambient.refresh(); ambient.visibilityChanged(); ambient.start(['living-a', 'living-b']); }
  await advance(100000);
  assert.equal(s.loads.length, 1); assert.equal(s.writes.length, 1);
});

test('rapid photo changes coalesce to the last URL before sampling', async () => {
  const { ambient, s, advance } = harness();
  ambient.start(); s.url = B; ambient.refresh(); s.url = C; ambient.refresh();
  await advance();
  assert.deepEqual(s.loads.map((l) => l.url), [C]); assert.equal(s.writes.length, 1);
});

test('old A callbacks cannot win after A to B to A', async () => {
  const { ambient, s, advance } = harness({ deferLoads: true });
  ambient.start(); await advance();
  s.url = B; ambient.refresh(); await advance();
  s.url = A; ambient.refresh(); await advance();
  s.loads[0].task.resolve([0, 0, 200]); s.loads[1].task.reject(Error('old B'));
  await flush(); assert.equal(s.writes.length + s.errors.length, 0);
  s.loads[2].task.resolve([180, 40, 20]); await flush();
  assert.deepEqual(s.writes.map((w) => w.rgb), [[180, 40, 20]]);
});

test('a changed source is checked again even when onShow refresh arrives late', async () => {
  const { ambient, s, advance } = harness({ deferLoads: true });
  ambient.start(); await advance(); s.url = B;
  s.loads[0].task.resolve([200, 0, 0]); await flush();
  assert.equal(s.writes.length, 0); await advance();
  assert.equal(s.loads[1].url, B);
});

test('one pending write coalesces later photos and ignores its obsolete failure', async () => {
  const { ambient, s, advance } = harness({ deferWrites: true });
  ambient.start(['living-a']); await advance();
  s.url = B; ambient.refresh(); await advance(); s.url = C; ambient.refresh(); await advance();
  assert.equal(s.writes.length, 1);
  s.writes[0].task.reject(Error('old write')); await flush();
  assert.equal(s.writes.length, 2); assert.equal(s.errors.length, 0);
  s.writes[1].task.resolve(); await flush(); await advance(100000);
  assert.equal(s.writes.length, 2);
});

test('stop then restart never overlaps a pending write or reuses old recipients', async () => {
  const { ambient, s, advance } = harness({ deferWrites: true });
  ambient.start(['living-a']); await advance(); ambient.stop();
  ambient.start(['living-b']); await advance(); assert.equal(s.writes.length, 1);
  s.writes[0].task.resolve(); await flush();
  assert.deepEqual(s.writes.map((w) => w.ids), [['living-a'], ['living-b']]);
  s.writes[1].task.resolve(); await flush();
  ambient.start(['living-c']); await advance();
  assert.deepEqual(s.writes[2].ids, ['living-c']);
});

test('stop invalidates delayed loads, timers, retry callbacks and visibility resumes', async () => {
  const { ambient, s, advance } = harness({ deferLoads: true });
  ambient.start(); const oldTimer = s.timers[0]; ambient.stop(); oldTimer.fn(); await advance();
  assert.equal(s.loads.length, 0);
  ambient.start(); await advance(); ambient.stop();
  s.loads[0].task.reject(Error('after stop')); await flush();
  ambient.visibilityChanged(); ambient.refresh(); await advance(100000);
  assert.equal(s.writes.length + s.errors.length + s.timers.length, 0);
});

test('hidden pauses sampling and sends only the current photo once on return', async () => {
  const { ambient, s, advance } = harness({ deferLoads: true });
  ambient.start(); await advance(); s.hidden = true; ambient.visibilityChanged();
  s.loads[0].task.resolve([1, 2, 200]); await flush();
  assert.equal(s.writes.length + s.timers.length, 0);
  s.url = B; ambient.refresh(); await advance(100000); assert.equal(s.loads.length, 1);
  s.hidden = false; ambient.visibilityChanged(); await advance();
  assert.equal(s.loads[1].url, B); s.loads[1].task.resolve([120, 100, 20]); await flush();
  ambient.visibilityChanged(); ambient.refresh(); await advance(); assert.equal(s.writes.length, 1);
});

test('a missing photo never produces a color and a returning same URL is applied anew', async () => {
  const { ambient, s, advance } = harness();
  ambient.start(); await advance(); s.url = null; ambient.refresh(); await advance();
  assert.equal(s.writes.length, 1); s.url = A; ambient.refresh(); await advance();
  assert.equal(s.writes.length, 2);
});

test('load failures notify once per URL, retry finitely, and never send invented colors', async () => {
  const { ambient, s, advance } = harness({ deferLoads: true });
  ambient.start(); await advance(); s.loads[0].task.reject(Error('CORS')); await flush();
  assert.equal(s.errors.length, 1); await advance(100000);
  assert.equal(s.loads.length, 2); s.loads[1].task.resolve(null); await flush();
  for (let i = 0; i < 10; i++) { ambient.refresh(); await advance(100000); }
  assert.equal(s.loads.length, 2); assert.equal(s.errors.length, 1); assert.equal(s.writes.length, 0);
});

test('a failed send retries only the actual sampled color, with no brightness or off fallback', async () => {
  const { ambient, s, advance } = harness({ deferWrites: true });
  ambient.start(); await advance(); s.writes[0].task.reject(Error('uncertain')); await flush();
  await advance(100000); assert.equal(s.writes.length, 2);
  assert.deepEqual(s.writes[1].rgb, s.writes[0].rgb);
  s.writes[1].task.reject(Error('still uncertain')); await flush(); await advance(100000);
  assert.equal(s.writes.length, 2); assert.equal(s.errors.length, 1); assert.equal(s.loads.length, 1);
});

test('an error handler can stop the mode without a retry being scheduled afterward', async () => {
  const h = harness({ color: null }); h.s.onError = () => h.ambient.stop();
  h.ambient.start(); await h.advance();
  assert.equal(h.s.errors.length, 1); assert.equal(h.s.timers.length, 0);
  await h.advance(100000); assert.equal(h.s.loads.length, 1); assert.equal(h.s.writes.length, 0);
});

test('a rejected write without an Error is still a failure', async () => {
  const { ambient, s, advance } = harness({ deferWrites: true });
  ambient.start(); await advance(); s.writes[0].task.reject(); await flush();
  assert.equal(s.errors.length, 1); await advance(100000); assert.equal(s.writes.length, 2);
  s.writes[1].task.resolve(); await flush();
});

test('start while hidden waits for visibility, and hidden writes never overlap resumed writes', async () => {
  const { ambient, s, advance } = harness({ hidden: true, deferWrites: true });
  ambient.start(); await advance(100000); assert.equal(s.loads.length + s.timers.length, 0);
  s.hidden = false; ambient.visibilityChanged(); await advance(); assert.equal(s.writes.length, 1);
  s.hidden = true; ambient.visibilityChanged(); s.url = B;
  s.hidden = false; ambient.visibilityChanged(); await advance(); assert.equal(s.writes.length, 1);
  s.writes[0].task.reject(Error('obsolete')); await flush(); assert.equal(s.writes.length, 2);
  assert.equal(s.errors.length, 0); s.writes[1].task.resolve(); await flush();
});

function browserHarness(readError) {
  const s = { images: [], events: [], timers: [], canvases: [], reads: 0 };
  function Image() { s.images.push(this); this.naturalWidth = 1920; this.naturalHeight = 1080; }
  Object.defineProperty(Image.prototype, 'crossOrigin', { set(v) { s.events.push(['cors', v]); } });
  Object.defineProperty(Image.prototype, 'src', { set(v) { s.events.push(['src', v]); } });
  const ambient = load({ Image, document: { createElement(tag) {
    assert.equal(tag, 'canvas'); const canvas = { getContext(type) {
      assert.equal(type, '2d'); return {
        drawImage() { s.events.push(['draw']); },
        getImageData(x, y, w, h) { s.reads++; assert.deepEqual([x, y, w, h], [0, 0, 32, 18]); if (readError) throw readError; return { data: pixels([120, 60, 30, 255]) }; }
      };
    } }; s.canvases.push(canvas); return canvas;
  } }, setTimeout(fn, ms) { const timer = { fn, ms }; s.timers.push(timer); return timer; },
  clearTimeout(timer) { s.timers = s.timers.filter((item) => item !== timer); } });
  return { ambient, s };
}

test('browser sampling uses CORS before src, a tiny canvas and no export or persisted frame', async () => {
  const { ambient, s } = browserHarness();
  const src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Photo.jpg/1920px-Photo.jpg';
  const result = ambient.loadColor(src);
  assert.deepEqual(s.events.slice(0, 2), [['cors', 'anonymous'], ['src', src]]);
  assert.ok(s.timers[0].ms > 0 && s.timers[0].ms <= 15000);
  s.images[0].onload(); assert.deepEqual(plain(await result), [120, 60, 30]);
  assert.deepEqual([s.canvases[0].width, s.canvases[0].height], [32, 18]);
  assert.equal(s.timers.length, 0); assert.equal(s.images[0].onload, null);
});

test('browser loader rejects unsafe sources before creating an image', async () => {
  const { ambient, s } = browserHarness();
  for (const url of ['https://example.org/a.jpg', '//upload.wikimedia.org/a.jpg', 'http://upload.wikimedia.org/wikipedia/commons/a.jpg',
    'https://upload.wikimedia.org.evil.test/wikipedia/commons/a.jpg', 'assets/wallpapers/../secret.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/%2e%2e/a.jpg', 'data:image/svg+xml,<svg/>', 'assets/wallpapers/a.jpg?x=1']) {
    await assert.rejects(ambient.loadColor(url), /fuente|source/i);
  }
  assert.equal(s.images.length + s.timers.length, 0);
});

test('local photos and inline raster previews can be sampled', async () => {
  const { ambient, s } = browserHarness();
  for (const src of [A, 'data:image/jpeg;base64,AAAA', 'https://thumb.wikimedia.org/wikipedia/commons/a/a1/a.webp']) {
    const result = ambient.loadColor(src); s.images.at(-1).onload(); await result;
  }
  assert.equal(s.reads, 3); assert.equal(s.timers.length, 0);
});

test('tainted canvas and timed out images reject safely and discard late callbacks', async () => {
  const taint = browserHarness(Object.assign(Error('tainted canvas'), { name: 'SecurityError' }));
  const rejected = taint.ambient.loadColor(A); taint.s.images[0].onload();
  await assert.rejects(rejected, /tainted/); assert.equal(taint.s.timers.length, 0);
  const { ambient, s } = browserHarness();
  const timeout = ambient.loadColor(A); const late = s.images[0].onload; s.timers[0].fn();
  await assert.rejects(timeout, /tiempo|timeout/i); late();
  assert.equal(s.reads, 0); assert.equal(s.timers.length, 0);
});

test('stop cooperatively cancels the browser loader timer and pending image callback', async () => {
  const { ambient, s } = browserHarness(); let writes = 0;
  const mode = ambient.create({ source: () => A, send: () => { writes++; return Promise.resolve(); } });
  mode.start(); s.timers.shift().fn(); assert.equal(s.images.length, 1);
  const late = s.images[0].onload; mode.stop(); late(); await flush();
  assert.equal(s.timers.length + s.reads + writes, 0); assert.equal(s.images[0].onload, null);
});
