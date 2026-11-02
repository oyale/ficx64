const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('src/app.js', 'utf8');
function extract(name) {
  const a = source.indexOf('  function ' + name + '(');
  return source.slice(a, source.indexOf('\n  }', a) + 4);
}
test('clearing both lists needs confirmation; timeout cancels it', () => {
  const classes = new Set();
  let timeout;
  let saves = 0;
  const intentions = new Map([['film', 'maybe']]);
  const prioritized = new Set(['film']);
  const clearSaved = { classList: {contains: x => classes.has(x), add: x => classes.add(x), remove: x => classes.delete(x)}, setAttribute(){}, removeAttribute(){} };
  const context = vm.createContext({clearSaved, intentions, prioritized,
    setTimeout: fn => {timeout = fn; return 1;}, clearTimeout(){},
    persist: () => saves++, persistPrioritized(){}, renderSaved(){} });
  vm.runInContext(extract('resetClearSavedConfirmation') + extract('clearSavedLists'), context);
  const click = () => vm.runInContext('clearSavedLists()', context);
  click(); assert.equal(intentions.size, 1); assert.equal(saves, 0);
  timeout(); click(); assert.equal(intentions.size, 1); assert.equal(saves, 0);
  click(); assert.equal(intentions.size, 0); assert.equal(prioritized.size, 0); assert.equal(saves, 1);
});
