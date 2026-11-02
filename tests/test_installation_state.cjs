const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('src/index.html', 'utf8');
const start = html.indexOf('    // Un único estado de instalación');
const code = html.slice(start, html.indexOf('</script>', start));
function page(store = new Map(), {standalone = false, apps = [], storageBlocked = false} = {}) {
  const elements = new Map(), events = new Map();
  const document = {querySelector(id) {
    if (!elements.has(id)) elements.set(id, { hidden: true, disabled: false, textContent: '',
      href: 'https://ficx.situacion.es/manifest.webmanifest',
      handlers: {}, addEventListener(name, fn) {this.handlers[name] = fn;} });
    return elements.get(id);
  }};
  const context = {document, usingLocalFile: false, URL,
    location: {protocol: 'https:'},
    localStorage: {
      getItem(key) {if (storageBlocked) throw Error('blocked'); return store.get(key);},
      setItem(key, value) {if (storageBlocked) throw Error('blocked'); store.set(key, value);},
    },
    navigator: {userAgent: 'Chrome Mobile', getInstalledRelatedApps: async () => apps},
    window: {matchMedia: query => ({matches: standalone && query.includes('standalone'), addEventListener(){}}),
      addEventListener: (name, fn) => events.set(name, fn)},
  };
  vm.runInNewContext(code, context);
  return {elements, events, store, async offer(outcome = 'accepted') {
    events.get('beforeinstallprompt')({preventDefault(){}, prompt: async()=>{}, userChoice: Promise.resolve({outcome})});
  }, get: id => elements.get(id)};
}

test('acceptance survives reload even when the API is empty and another prompt arrives', async () => {
  const original = page();
  await original.offer();
  assert.equal(original.get('#wizard-install').hidden, false);
  await original.get('#wizard-install-button').handlers.click();
  assert.equal(original.get('#help-install-remembered').hidden, false);
  const reloaded = page(original.store);
  await reloaded.offer();
  assert.equal(reloaded.get('#wizard-install').hidden, true);
  assert.equal(reloaded.get('#help-installed').hidden, true);
  assert.equal(reloaded.get('#help-install-remembered').hidden, false);
  assert.equal(reloaded.get('#help-install-state').hidden, true);
  assert.equal(reloaded.get('#help-install-button').textContent, 'Volver a instalar');
  assert.equal(reloaded.get('#help-install-button').hidden, false);
});

test('dismissal never records installation', async () => {
  const original = page();
  await original.offer('dismissed');
  await original.get('#wizard-install-button').handlers.click();
  const reloaded = page(original.store);
  await reloaded.offer();
  assert.equal(reloaded.get('#wizard-install').hidden, false);
  assert.equal(reloaded.get('#help-install-remembered').hidden, true);
});

test('opening an existing standalone app records it for later browser visits', async () => {
  const installed = page(new Map(), {standalone:true});
  assert.equal(installed.get('#help-installed').hidden, false);
  const browser = page(installed.store);
  await browser.offer();
  assert.equal(browser.get('#wizard-install').hidden, true);
  assert.equal(browser.get('#help-install-remembered').hidden, false);
});

test('storage denial keeps the current session working', async () => {
  const original = page(new Map(), {storageBlocked:true});
  await original.offer();
  await original.get('#wizard-install-button').handlers.click();
  assert.equal(original.get('#wizard-install').hidden, true);
  assert.equal(original.get('#help-install-remembered').hidden, false);
});

test('appinstalled records acceptance without claiming verified installation', async () => {
  const original = page();
  original.events.get('appinstalled')();
  assert.equal(original.get('#help-installed').hidden, true);
  assert.equal(original.get('#help-install-remembered').hidden, false);
});
