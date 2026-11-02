const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function worker() {
  const handlers = {};
  const removed = [];
  let activated = 0;
  let claimed = 0;
  const scope = 'https://ficx.situacion.es/';
  const current = `ficx64:${scope}:__BUILD_VERSION__`;
  const caches = {
    open: async () => ({ addAll: async () => {} }),
    keys: async () => ['another-app-v1', 'ficx64-v3', `ficx64:${scope}:old`, current],
    delete: async (key) => { removed.push(key); },
  };
  const self = { registration: { scope }, location: scope + 'sw.js',
    addEventListener: (name, handler) => { handlers[name] = handler; },
    skipWaiting: async () => { activated++; },
    clients: { claim: async () => { claimed++; } },
  };
  vm.runInNewContext(fs.readFileSync('src/sw.js', 'utf8'), {
    self, caches, URL, Request: class { constructor(url, options) { this.url = url; this.options = options; } },
  });
  async function dispatch(type, data) {
    const work = [];
    handlers[type]({data, waitUntil: (promise) => work.push(promise)});
    await Promise.all(work);
  }
  return { dispatch, removed, activated: () => activated, claimed: () => claimed };
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
