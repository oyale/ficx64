// Real Chromium regression for cumulative film section filters.
// Run python3 build.py first. Requires Node 22+ and chromium (or CHROMIUM_BIN).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ficx-swipe-'));
  const browser = spawn(process.env.CHROMIUM_BIN || 'chromium', [
    '--headless', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let ws;
  const timeout = setTimeout(() => { browser.kill(); process.exitCode = 1; }, 60000);
  try {
    const address = await new Promise((resolve, reject) => {
      let stderr = '';
      browser.on('error', reject);
      browser.on('exit', code => reject(new Error(`Chromium exited (${code}): ${stderr}`)));
      browser.stderr.on('data', chunk => {
        stderr += chunk;
        const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
    });
    const tabs = await (await fetch(`${address}/json`)).json();
    ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let sequence = 0;
    const pending = new Map();
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      message.error ? request.reject(message.error) : request.resolve(message.result);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await send('Page.navigate', { url: pathToFileURL(path.join(__dirname, '../dist/index.html')).href });
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!!document.querySelector('#film-list .film-title-line')`)) break;
      await pause(50);
    }
    assert.ok(await evaluate(`!!document.querySelector('#film-list .film-title-line')`), await evaluate(`JSON.stringify({url:location.href,title:document.title,body:document.body?.innerText.slice(0,700)})`));
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d => d.close())`);
    const choose = name => evaluate(`document.querySelector('#featured-sections button[data-section="${name}"]').click()`);
    const check = async names => {
      const actual = await evaluate(`Array.from(document.querySelectorAll('#film-list > li'), row => row.dataset.filmId).sort()`);
      const expected = await evaluate(`window.FICX_FILMS.filter(f => ${JSON.stringify(names)}.length === 0 || f.sections.some(s => ${JSON.stringify(names)}.includes(s))).map(f=>f.id).sort()`);
      assert.deepEqual(actual, expected);
      assert.equal(new Set(actual).size, actual.length, 'a film in several sections appears once');
      const selected = await evaluate(`Array.from(document.querySelectorAll('#featured-sections [aria-pressed="true"]'), b=>b.dataset.section).sort()`);
      assert.deepEqual(selected, [...names].sort());
    };
    const refineAll = async () => {
      assert.equal(await evaluate(`document.querySelector('#section-subfilters').hidden`), false);
      const name = await evaluate(`(() => {
        const input = document.querySelector('#section-subfilters input[data-filter-section=""]');
        if(!input) throw new Error('Missing all-films refinements');
        const name=input.dataset.subfilter; input.checked=false;
        input.dispatchEvent(new Event('change',{bubbles:true})); return name;
      })()`);
      const actual = await evaluate(`Array.from(document.querySelectorAll('#film-list > li'),row=>row.dataset.filmId).sort()`);
      const expected = await evaluate(`window.FICX_FILMS.filter(f=>!f.sections.includes(${JSON.stringify(name)})).map(f=>f.id).sort()`);
      assert.deepEqual(actual,expected);
      assert.equal(await evaluate(`document.querySelector('#section-subfilters input[data-subfilter="${name}"]').checked`),false);
      await evaluate(`document.querySelector('#section-subfilters input[data-subfilter="${name}"]').click()`);
      await check([]);
      // With no search matches there is nothing to refine; clearing search restores it.
      await evaluate(`document.querySelector('#search-input').value='zzzz-no-film'; document.querySelector('#search-input').dispatchEvent(new Event('input'));`);
      assert.equal(await evaluate(`document.querySelector('#section-subfilters').hidden`),true);
      await evaluate(`document.querySelector('#clear-filters').click()`);
      assert.equal(await evaluate(`document.querySelector('#section-subfilters').hidden`),false);
    };
    for (const [width,height] of [[390,844],[844,390],[1280,800]]) {
      await send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<900});
      await evaluate(`document.querySelector('#clear-filters').click()`);
      await check([]);
      await refineAll();
      await choose('Albar');
      await check(['Albar']);
      assert.equal(await evaluate(`document.querySelector('#section-subfilters').hidden`), false);
      await choose('Retueyos');
      await check(['Albar','Retueyos']);
      assert.ok(await evaluate(`document.querySelectorAll('#section-subfilters .section-subfilter-group').length`) >= 1);
      await choose('Sección Oficial');
      await check(['Albar','Retueyos','Sección Oficial']);
      await choose('Retueyos');
      await check(['Albar','Sección Oficial']);
      const extra = await evaluate(`document.querySelector('#more-sections option[value]:not([value=""])').value`);
      await evaluate(`var select = document.querySelector('#more-sections'); select.value=${JSON.stringify(extra)}; select.dispatchEvent(new Event('change'));`);
      await check(['Albar','Sección Oficial',extra]);
      await choose(extra);
      await check(['Albar','Sección Oficial']);
      // Exclusions belong to one selected section; another selected section can still include a film.
      const subfilter = await evaluate(`(() => {
        const input = document.querySelector('#section-subfilters input');
        if(!input) return null;
        const details={section:input.dataset.filterSection, excluded:input.dataset.subfilter};
        input.checked=false; input.dispatchEvent(new Event('change',{bubbles:true})); return details;
      })()`);
      if (subfilter) {
        const actual = await evaluate(`Array.from(document.querySelectorAll('#film-list > li'), row => row.dataset.filmId).sort()`);
        const expected = await evaluate(`window.FICX_FILMS.filter(f=> ['Albar','Sección Oficial'].some(s=>f.sections.includes(s) && (s!==${JSON.stringify(subfilter.section)} || !f.sections.includes(${JSON.stringify(subfilter.excluded)})))).map(f=>f.id).sort()`);
        assert.deepEqual(actual,expected);
      }
      await evaluate(`document.querySelector('#search-input').value='zzzz-no-film'; document.querySelector('#search-input').dispatchEvent(new Event('input'));`);
      assert.equal(await evaluate(`document.querySelectorAll('#film-list > li').length`),0);
      await evaluate(`document.querySelector('#clear-filters').click()`);
      await check([]);
      await choose('Albar'); await choose('Retueyos');
      await evaluate(`document.querySelector('#show-all-sections').click()`);
      await check([]);
    }
    console.log('Chromium: cumulative sections, no duplicates, independent exclusions, additional sections, deselection and resets passed at 3 viewport sizes');
  } finally {
    clearTimeout(timeout);
    ws?.close();
    if (browser.exitCode === null && browser.signalCode === null) {
      const exited = new Promise(resolve => browser.once('exit', resolve));
      browser.kill();
      await exited;
    }
    await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
