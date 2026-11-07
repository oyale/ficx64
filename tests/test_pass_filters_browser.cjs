// Real Chromium regression for the ticket-owned toggle in the personal itinerary.
// Run python3 build.py first. Requires Node 22+ and chromium (or CHROMIUM_BIN).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ficx-owned-ticket-'));
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
    const screenings = JSON.parse(fs.readFileSync('data/screenings.json', 'utf8')).screenings;
    const chosen = screenings.find(s => s.accessType === 'public' && s.filmIds?.length && screenings.some(other => other.candidateId !== s.candidateId && other.accessType === 'public' && other.date === s.date && other.time === s.time));
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', {source: `localStorage.setItem('ficx64-planned-screenings-v1', ${JSON.stringify(JSON.stringify(Object.fromEntries(chosen.filmIds.map(id => [id, chosen.candidateId]))))}); localStorage.setItem('ficx64-discarded-v1', ${JSON.stringify(JSON.stringify(chosen.filmIds))});`});
    await send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
    await send('Page.navigate', {url:pathToFileURL(path.resolve('dist/index.html')).href});
    for (let i=0;i<100;i++) {
      if (await evaluate(`!!document.querySelector('#session-results-list li')`)) break;
      await pause(50);
    }
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelector('#next-to-sessions').click()`);
    const count = () => evaluate(`document.querySelectorAll('#session-results-list > li.finder-screening').length`);
    const input = async (id,value) => evaluate(`(() => { const el = document.getElementById(${JSON.stringify(id)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    const toggle = async id => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
    const initial = await count(); assert.ok(initial > 0);
    assert.equal(await evaluate(`document.querySelector('#session-filter-fold').open`),false);
    await evaluate(`document.querySelector('#session-filter-fold > summary').click()`);

    await input('session-search','zzzz-nonexistent-film');
    assert.match(await evaluate(`document.querySelector('#session-results-list').textContent`), /No/);
    await evaluate(`document.querySelector('#reset-session-filters').click()`);
    assert.equal(await count(), initial);
    const title = chosen.films[0].title;
    await input('session-search',title);
    assert.ok(await count() > 0, 'known title is searchable');
    await toggle('hide-session-discarded');
    const discardedHidden = await evaluate(`document.querySelector('#session-results-list').innerHTML`);
    assert.ok(!discardedHidden.includes('data-candidate-id="' + chosen.candidateId + '"'), 'discarded titles are excluded');
    await toggle('hide-session-discarded');
    await toggle('hide-session-planned-films');
    assert.equal(await count(),0,'every pass of this planned film is excluded');
    assert.match(await evaluate(`document.querySelector('#session-filter-count').textContent`),/1 activo/);
    await evaluate(`document.querySelector('#session-filter-fold > summary').click()`);
    assert.equal(await count(),0,'closing filters keeps their effect');
    await evaluate(`document.querySelector('#session-filter-fold > summary').click()`);
    await toggle('hide-session-planned-films');
    await toggle('hide-session-planned');
    const remaining = await evaluate(`document.querySelector('#session-results-list').innerHTML`);
    assert.ok(!remaining.includes('data-candidate-id="' + chosen.candidateId + '"'), 'planned pass is excluded');
    await evaluate(`document.querySelector('#reset-session-filters').click()`);
    await toggle('hide-session-conflicts');
    assert.ok(await count() < initial, 'same-time and overlapping passes are excluded');
    await toggle('hide-session-planned');
    const combined = await count();
    assert.ok(combined < initial);
    await toggle('hide-session-discarded');
    await toggle('only-saved');
    await evaluate(`document.querySelector('#reset-session-filters').click()`);
    assert.equal(await count(),initial,'reset clears all combined filters');
    for (const width of [320,390,768,1280]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:true});
      await evaluate(`document.querySelector('.session-results').scrollIntoView({block:'start'})`);
      await pause(100);
      const size = await evaluate(`(() => {const r=document.querySelector('#session-search').getBoundingClientRect(); return {left:r.left,right:r.right,height:r.height,viewport:innerWidth};})()`);
      assert.ok(size.height>=44 && size.left>=0 && size.right<=size.viewport, JSON.stringify(size));
      const shot = await send('Page.captureScreenshot', {format:'png'});
      fs.writeFileSync(`/tmp/ficx-passes-${width}.png`,Buffer.from(shot.data,'base64'));
    }
    console.log('Pases: search, planned/conflict exclusions, combined reset and responsive controls passed');
  } finally {
    clearTimeout(timeout);
    if (ws) ws.close();
    browser.kill();
    if (browser.exitCode === null && browser.signalCode === null) await new Promise(resolve => browser.once('exit', resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
