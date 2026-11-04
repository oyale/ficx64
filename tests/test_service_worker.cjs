const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function worker({ fetchImpl, cached, timers = { setTimeout, clearTimeout } } = {}) {
  const handlers = {};
  const removed = [];
  const writes = [];
  let activated = 0;
  let claimed = 0;
  const scope = 'https://ficx.situacion.es/';
  const current = `ficx64:${scope}:__BUILD_VERSION__`;
  const caches = {
    open: async () => ({ addAll: async () => {}, match: async () => cached,
      put: async (url, response) => { writes.push({ url, response }); } }),
    keys: async () => ['another-app-v1', 'ficx64-v3', `ficx64:${scope}:old`, current],
    delete: async (key) => { removed.push(key); },
  };
  const self = { registration: { scope }, location: new URL('sw.js', scope),
    addEventListener: (name, handler) => { handlers[name] = handler; },
    skipWaiting: async () => { activated++; },
    clients: { claim: async () => { claimed++; } },
  };
  vm.runInNewContext(fs.readFileSync('src/sw.js', 'utf8'), {
    self, caches, URL, ...timers, fetch: fetchImpl, Request: class { constructor(url, options) { this.url = url; this.options = options; } },
  });
  async function dispatch(type, data) {
    const work = [];
    handlers[type]({data, waitUntil: (promise) => work.push(promise)});
    await Promise.all(work);
  }
  async function request(path = '/', settleBackground = true) {
    const work = [];
    let response;
    handlers.fetch({ request: { method: 'GET', url: new URL(path, scope).href, mode: 'navigate' },
      waitUntil: (promise) => work.push(promise), respondWith: (promise) => { response = promise; } });
    const result = await response;
    if (settleBackground) await Promise.all(work);
    return result;
  }
  return { request, writes, dispatch, removed, activated: () => activated, claimed: () => claimed };
}

test('an installed update waits for explicit approval before activation', async () => {
  const sw = worker();
  await sw.dispatch('install');
  assert.equal(sw.activated(), 0);
  await sw.dispatch('message', {type: 'UNRELATED'});
  assert.equal(sw.activated(), 0);
  await sw.dispatch('message', {type: 'SKIP_WAITING'});
  assert.equal(sw.activated(), 1);
});

test('activation retires old FICX caches and preserves other apps', async () => {
  const sw = worker();
  await sw.dispatch('activate');
  assert.deepEqual(sw.removed, ['ficx64-v3', 'ficx64:https://ficx.situacion.es/:old']);
  assert.equal(sw.claimed(), 1);
});

for (const status of [404, 500, 502, 503, 504]) {
  for (const path of ['/', '/index.html', '/?pases=123']) {
    test(`${status} on ${path} uses the offline app without overwriting it`, async () => {
      const cached = { body: 'offline app' };
      const sw = worker({ cached, fetchImpl: async () => ({ status, ok: false }) });
      assert.equal(await sw.request(path), cached);
      assert.equal(sw.writes.length, 0);
    });
  }
  test(`${status} is preserved when no offline app exists`, async () => {
    const response = { status, ok: false };
    const sw = worker({ fetchImpl: async () => response });
    assert.equal(await sw.request(), response);
  });
}
for (const [path, status] of [['/missing', 404], ['/other', 500], ['/', 403]]) {
  test(`${status} on ${path} remains visible`, async () => {
    const response = { status, ok: false };
    const sw = worker({ cached: {}, fetchImpl: async () => response });
    assert.equal(await sw.request(path), response);
    assert.equal(sw.writes.length, 0);
  });
}
test('network failure still serves the offline app', async () => {
  const cached = {};
  const sw = worker({ cached, fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(await sw.request(), cached);
});
test('successful app response refreshes the canonical offline copy', async () => {
  const copy = {};
  const response = { status: 200, ok: true, clone: () => copy };
  const sw = worker({ cached: {}, fetchImpl: async () => response });
  assert.equal(await sw.request('/index.html'), response);
  assert.deepEqual(sw.writes, [{ url: 'https://ficx.situacion.es/', response: copy }]);
});

function fakeTimers() {
  let fire;
  let cleared = false;
  return {
    timers: { setTimeout: (fn, ms) => { assert.equal(ms, 3000); fire = fn; return 1; },
      clearTimeout: () => { cleared = true; } },
    expire: async () => { while (!fire) await Promise.resolve(); fire(); },
    cleared: () => cleared,
  };
}
test('slow network serves offline app after deadline and caches a late success', async () => {
  const clock = fakeTimers();
  const cached = {};
  const copy = {};
  const response = { status: 200, ok: true, clone: () => copy };
  let finish;
  const sw = worker({ cached, timers: clock.timers, fetchImpl: () => new Promise(resolve => { finish = resolve; }) });
  const result = sw.request('/', false);
  await clock.expire();
  assert.equal(await result, cached);
  assert.equal(clock.cleared(), true);
  finish(response);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sw.writes, [{ url: 'https://ficx.situacion.es/', response: copy }]);
});
test('without an offline copy a slow network is allowed to finish', async () => {
  const response = { status: 200, ok: true, clone: () => ({}) };
  const sw = worker({ timers: { setTimeout: () => assert.fail('must not time out without a copy'), clearTimeout() {} },
    fetchImpl: () => new Promise(resolve => setImmediate(() => resolve(response))) });
  assert.equal(await sw.request(), response);
});
