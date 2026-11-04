const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('src/app.js', 'utf8');
const start = source.indexOf('  function matchingFilms(');
const matching = source.slice(start, source.indexOf('\n  }', start) + 4);
for (const [mode, expected] of [
  ['duration-asc', ['A short', 'Z short', 'Long', 'Missing', 'Zero']],
  ['duration-desc', ['Long', 'A short', 'Z short', 'Missing', 'Zero']],
  ['title', ['A short', 'Long', 'Missing', 'Z short', 'Zero']],
  ['title-desc', ['Zero', 'Z short', 'Missing', 'Long', 'A short']],
]) {
  test(`${mode}: stable title ties and unknown durations last`, () => {
    const films = [['Z short',5],['Missing',null],['Zero',0],['A short',5],['Long',100]]
      .map(([title,durationMinutes])=>({id:title,title,durationMinutes}));
    const context=vm.createContext({films, search:{value:''}, sort:{value:mode},
      activeSections:new Set(), excludedSubfilters:new Set(), discarded:new Set(),
      showDiscarded:false, discardAck:null, intentions:new Map(), onlyMyLists:false,
      directorText:()=>''});
    vm.runInContext(matching,context);
    assert.deepEqual(Array.from(vm.runInContext('matchingFilms()',context),film=>film.title), expected);
  });
}
