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
  const snapshot = source.slice(source.indexOf('function buildItineraryDocument'), source.indexOf('function buildCalendar'));
  assert.match(snapshot, /ticketOwned: ownedTickets\.has\(screening\.candidateId\)/);
  assert.match(fs.readFileSync('src/pdf-itinerary.js', 'utf8'), /event\.ticketDisplay === "owned" && event\.ticketOwned/);
  const sharedLink = source.slice(source.indexOf('async function sharePassLink'), source.indexOf('window.sharePassLink'));
  assert.doesNotMatch(sharedLink, /ownedTickets/);
});


test('plan buttons distinguish planned passes with and without an owned ticket', () => {
  const sandbox = vm.createContext({
    plannedScreenings: new Map(), plannedStandalone: new Set(), ownedTickets: new Set(),
    discarded: new Set(), escapeHtml: String, passConflictWarning: () => '',
  });
  vm.runInContext(extract('screeningIsPlanned') + '\n' + extract('renderPassQuickActions'), sandbox);
  const render = () => vm.runInContext("renderPassQuickActions({candidateId:'pass-a',filmIds:['film-a']},{planOnly:true})",sandbox);
  assert.match(render(), /＋ A la parrilla/);
  sandbox.ownedTickets.add('pass-a');
  assert.match(render(), /＋ A la parrilla/, 'Owning a ticket does not silently add a pass');
  sandbox.plannedScreenings.set('film-a','pass-a');
  assert.match(render(), /✓ Con entrada/);
  assert.match(render(), /disabled aria-label="Con entrada; quita este pase desde Mi parrilla"/);
  sandbox.ownedTickets.delete('pass-a');
  assert.match(render(), /✓ En la parrilla/);
  sandbox.plannedStandalone.add('talk');
  sandbox.ownedTickets.add('talk');
  const standalone = vm.runInContext("renderPassQuickActions({candidateId:'talk',filmIds:[]})",sandbox);
  assert.match(standalone, /✓ Con entrada/);
  assert.match(standalone, /disabled/);
});
