'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const file = path.join(__dirname, '../installer/server.cjs');
const api = fs.existsSync(file) ? require(file) : {};

async function setup(t, engine, options = {}) {
  assert.equal(typeof api.startServer, 'function');
  const uiDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mi-pantalla-setup-test-'));
  fs.writeFileSync(path.join(uiDir, 'index.html'), '<!doctype html><html><head></head><body>Own setup</body></html>');
  fs.writeFileSync(path.join(uiDir, 'app.js'), '/* own UI */'); fs.writeFileSync(path.join(uiDir, 'styles.css'), 'body{}');
  fs.writeFileSync(path.join(uiDir, 'secret.txt'), 'PRIVATE');
  const app = await api.startServer({engine, uiDir, ...options});
  t.after(async () => { await app.close(); fs.rmSync(uiDir, {recursive: true, force: true}); });
  return app;
}
function request(app, target = '/', options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(app.url + target, {method: options.method || 'GET', headers: options.headers || {}}, res => {
      let body = ''; res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body}));
    }); req.on('error', reject); if (options.body) req.write(options.body); req.end();
  });
}
async function session(app) {
  const page = await request(app);
  const match = page.body.match(/<meta name="setup-token" content="([a-f0-9]{32})">/);
  assert.ok(match, 'root HTML contains a 128-bit session token'); return match[1];
}
const headers = (app, token) => ({Origin: app.url, 'X-Setup-Token': token, 'Content-Type': 'application/json'});
const post = (app, token, action = 'status', payload = {}) => request(app, '/api', {method: 'POST', headers: headers(app, token), body: JSON.stringify({action, payload})});

test('serves only its own UI, injects token on root and binds loopback dynamically', async t => {
  const app = await setup(t, {runAction() { assert.fail('GET cannot call engine'); }});
  assert.equal(app.server.address().address, '127.0.0.1'); assert.ok(app.server.address().port > 0);
  const token = await session(app); const css = await request(app, '/styles.css');
  assert.equal(css.status, 200); assert.equal(css.headers['access-control-allow-origin'], undefined);
  assert.ok(!css.body.includes(token)); assert.equal(css.headers['cache-control'], 'no-store');
  assert.match(css.headers['content-security-policy'], /frame-ancestors 'none'/);
  for (const target of ['/secret.txt', '/server.cjs', '/../package.json', '/%2e%2e/package.json', '/?token=bad', '/app.js?x=1']) {
    assert.ok((await request(app, target)).status >= 400, target);
  }
});

test('all API actions require exact Origin, Host and constant session token', async t => {
  const calls = []; const app = await setup(t, {runAction(...args) { calls.push(args); return {state: 'ok'}; }});
  const token = await session(app);
  const valid = headers(app, token);
  for (const invalid of [{...valid, Origin: 'https://untrusted.test'}, {...valid, Origin: ''}, {...valid, Host: 'localhost:' + app.server.address().port}, {...valid, 'X-Setup-Token': '0'.repeat(32)}, {...valid, 'X-Setup-Token': ''}]) {
    assert.equal((await request(app, '/api', {method: 'POST', headers: invalid, body: '{"action":"status","payload":{}}'})).status, 403);
  }
  assert.equal(calls.length, 0);
  const result = await post(app, token, 'status', {refresh: true});
  assert.deepEqual(JSON.parse(result.body), {ok: true, result: {state: 'ok'}});
  assert.deepEqual(calls, [['status', {refresh: true}]]);
});

test('rejects malformed JSON, oversized bodies, methods and unknown action fields', async t => {
  let calls = 0; const app = await setup(t, {runAction() { calls++; }}); const token = await session(app);
  for (const body of ['{', 'null', '[]', '{"action":"shell","payload":{}}', '{"action":"status","payload":[],"script":"id"}', '{"action":"status","payload":{},"path":"secret"}']) {
    assert.equal((await request(app, '/api', {method: 'POST', headers: headers(app, token), body})).status, 400);
  }
  assert.equal((await request(app, '/api', {method: 'POST', headers: headers(app, token), body: ' '.repeat(16385)})).status, 413);
  assert.equal((await request(app, '/api')).status, 405);
  assert.equal((await request(app, '/api', {method: 'OPTIONS'})).status, 405);
  assert.equal(calls, 0);
});

test('serializes mutations while status remains available and releases lock on failure', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const app = await setup(t, {async runAction(action) { if (action === 'apply') { await gate; throw Error('PRIVATE detail'); } return action; }});
  const token = await session(app); const pending = post(app, token, 'apply');
  await new Promise(resolve => setImmediate(resolve));
  const status = await post(app, token, 'status'); assert.equal(status.status, 200);
  assert.equal((await post(app, token, 'restore')).status, 409);
  release(); const failed = await pending; assert.equal(failed.status, 500); assert.ok(!failed.body.includes('PRIVATE'));
  assert.equal((await post(app, token, 'restore')).status, 200);
});

test('engine deadline keeps mutation locked until the actual operation settles', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const app = await setup(t, {runAction() { return gate; }}, {actionTimeoutMs: 30}); const token = await session(app);
  assert.equal((await post(app, token, 'apply')).status, 504);
  assert.equal((await post(app, token, 'restore')).status, 409);
  release('done'); await new Promise(resolve => setImmediate(resolve));
  assert.equal((await post(app, token, 'restore')).status, 200);
});

test('slow request body expires before engine execution', async t => {
  let calls = 0; const app = await setup(t, {runAction() { calls++; }}, {bodyTimeoutMs: 30}); const token = await session(app);
  const result = await new Promise((resolve, reject) => {
    const req = http.request(app.url + '/api', {method: 'POST', headers: {...headers(app, token), 'Content-Length': 100}}, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.write('{');
  });
  assert.equal(result, 408); assert.equal(calls, 0);
});

test('each session has a new token and accepts no cross-session or form submissions', async t => {
  let calls = 0; const engine = {runAction() { calls++; return {}; }};
  const first = await setup(t, engine); const second = await setup(t, engine);
  const firstToken = await session(first), secondToken = await session(second);
  assert.notEqual(firstToken, secondToken);
  assert.equal((await post(first, secondToken)).status, 403);
  for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
    const result = await request(first, '/api', {method: 'POST', headers: {...headers(first, firstToken), 'Content-Type': contentType}, body: '{"action":"apply","payload":{}}'});
    assert.equal(result.status, 415);
  }
  assert.equal(calls, 0);
});

test('chunked bodies are limited by actual bytes rather than trusting Content-Length', async t => {
  let calls = 0; const app = await setup(t, {runAction() { calls++; }}); const token = await session(app);
  const result = await request(app, '/api', {method: 'POST', headers: {...headers(app, token), 'Transfer-Encoding': 'chunked'}, body: ' '.repeat(16385)});
  assert.equal(result.status, 413); assert.equal(calls, 0);
});

test('disconnecting the client does not unlock a mutation that is still running', async t => {
  let release, began;
  const started = new Promise(resolve => { began = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const app = await setup(t, {runAction() { began(); return gate; }}); const token = await session(app);
  const req = http.request(app.url + '/api', {method: 'POST', headers: headers(app, token)});
  req.on('error', () => {}); req.end('{"action":"apply","payload":{}}');
  await started; req.destroy();
  assert.equal((await post(app, token, 'restore')).status, 409);
  release({}); await new Promise(resolve => setImmediate(resolve));
});
