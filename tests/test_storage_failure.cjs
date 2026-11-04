const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('src/app.js', 'utf8');
function extract(name) {
  const start = source.indexOf('  function ' + name + '(');
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}
test('failed writes warn, allow export, and only recover when every failed key is saved', () => {
  let blocked = true;
  let warning;
  let exported = 0;
  const element = () => ({ hidden: false, children: [], setAttribute() {},
    append(...children) { this.children.push(...children); },
    addEventListener(type, handler) { this.click = handler; } });
  const context = vm.createContext({
    failedStorageKeys: new Set(), storageWarning: null, queueMicrotask: () => {},
    localStorage: { setItem() { if (blocked) throw new Error('quota exceeded'); } },
    document: {
      querySelector: selector => selector === '#storage-warning' ? warning : selector === '#settings-download' ? { click: () => exported++ } : null,
      createElement: element,
      body: { prepend: node => { warning = node; } },
    },
  });
  vm.runInContext(extract('saveLocalValue') + extract('updateStorageWarning'), context);
  const save = key => vm.runInContext(`saveLocalValue('${key}', 'value')`, context);
  assert.equal(save('lists'), false);
  assert.equal(warning.hidden, false);
  assert.match(warning.children[0].textContent, /antes de cerrar/);
  save('plan');
  warning.children[1].click();
  assert.equal(exported, 1);
  assert.equal(warning.hidden, false, 'export does not repair persistence');
  blocked = false;
  assert.equal(save('theme'), true);
  assert.equal(warning.hidden, false, 'an unrelated success must not hide lost writes');
  save('lists');
  assert.equal(warning.hidden, false);
  save('plan');
  assert.equal(warning.hidden, true);
});
