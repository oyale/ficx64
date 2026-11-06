const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/app.js', 'utf8');
function extract(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}

function context(saved = null) {
  const values = new Map(saved === null ? [] : [['tickets', saved]]);
  const screenings = [{ candidateId: 'pass-a' }, { candidateId: 'pass-b' }];
  const sandbox = vm.createContext({
    ownedTicketsStorageKey: 'tickets', screeningRecords: screenings,
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    saveLocalValue(key, value) { values.set(key, value); return true; },
  });
  vm.runInContext(`${extract('readOwnedTickets')}\n${extract('persistOwnedTickets')}\n${extract('toggleOwnedTicket')}\n${extract('importProgram')}`, sandbox);
  return { sandbox, values };
}

test('ticket marks load only valid screening identifiers and ignore malformed storage', () => {
  const valid = context('["pass-a","stale",3]');
  assert.deepEqual(Array.from(vm.runInContext('[...readOwnedTickets()]', valid.sandbox)), ['pass-a']);
  const malformed = context('{broken');
  assert.deepEqual(Array.from(vm.runInContext('[...readOwnedTickets()]', malformed.sandbox)), []);
});

test('ticket marks toggle by screening, persist, and reject unknown passes', () => {
  const { sandbox, values } = context('[]');
  vm.runInContext('ownedTickets = readOwnedTickets()', sandbox);
  assert.equal(vm.runInContext("toggleOwnedTicket('pass-b')", sandbox), true);
  assert.deepEqual(JSON.parse(values.get('tickets')), ['pass-b']);
  assert.equal(vm.runInContext("toggleOwnedTicket('unknown')", sandbox), false);
  assert.equal(vm.runInContext("toggleOwnedTicket('pass-b')", sandbox), true);
  assert.deepEqual(JSON.parse(values.get('tickets')), []);
});

test('personal import merges valid ticket marks without propagating them as share state', () => {
  const { sandbox } = context('[]');
  Object.assign(sandbox, {
    userAlias: '', intentions: new Map(), plannedScreenings: new Map(), discarded: new Set(),
    prioritized: new Set(), pinnedSections: [], maxPinnedSections: 8, films: [{ id: 'film-a' }],
    availableSections: () => [], persistAlias() {}, persist() {}, persistPlannedScreenings() {},
    persistDiscarded() {}, persistPrioritized() {}, persistPinnedSections() {}, renderSaved() {},
  });
  vm.runInContext('ownedTickets = readOwnedTickets()', sandbox);
  const imported = vm.runInContext(`importProgram({ ownedTickets: ['pass-a', 'pass-a', 'stale'] })`, sandbox);
  assert.equal(imported.addedOwnedTickets, 1);
  assert.deepEqual(Array.from(vm.runInContext('[...ownedTickets]', sandbox)), ['pass-a']);
  assert.match(source, /ownedTickets: \[\.\.\.ownedTickets\]/);
  const sharedLink = source.slice(source.indexOf('async function sharePassLink'), source.indexOf('window.sharePassLink'));
  assert.doesNotMatch(sharedLink, /ownedTickets/);
});

test('only the itinerary PDF snapshot receives the private ticket state', () => {
  assert.match(source, /ownedTickets\.has\(screening\.candidateId\) \? "Tengo entrada"/);
  const sharedLink = source.slice(source.indexOf('async function sharePassLink'), source.indexOf('window.sharePassLink'));
  assert.doesNotMatch(sharedLink, /ownedTickets/);
});
