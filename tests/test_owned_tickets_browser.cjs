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
    const screening = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/screenings.json'), 'utf8')).screenings.find(item => item.filmIds?.length);
    assert.ok(screening, 'fixture must include a film screening');
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('ficx64-planned-screenings-v1', ${JSON.stringify(JSON.stringify(Object.fromEntries(screening.filmIds.map(id => [id, screening.candidateId]))))})` });
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: pathToFileURL(path.join(__dirname, '../dist/index.html')).href });
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!!document.querySelector('#film-list .film-title-line')`)) break;
      await pause(50);
    }
    assert.ok(await evaluate(`!!document.querySelector('#film-list .film-title-line')`), 'app should open');
    assert.equal(await evaluate(`document.querySelector('#ticket-intro').open`), true, 'first visit should show the feature intro');
    assert.match(await evaluate(`document.querySelector('#ticket-intro').innerText`), /recordatorio personal/i);
    const introSize = await evaluate(`(() => { const r = document.querySelector('#ticket-intro').getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:r.height,viewport:innerHeight}; })()`);
    assert.ok(introSize.top >= 0 && introSize.bottom <= introSize.viewport && introSize.height > 0, `intro should fit the mobile viewport: ${JSON.stringify(introSize)}`);
    await evaluate(`document.querySelector('#ticket-intro-program').click()`);
    assert.equal(await evaluate(`document.querySelector('#ticket-intro').open`), false, 'primary action should close the intro');
    assert.equal(await evaluate(`document.querySelector('#screen-program').hidden`), false, 'primary action should open Mi programa');
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!!document.querySelector('#program-agenda .program-ticket-toggle')`)) break;
      await pause(50);
    }
    const selector = `#program-agenda [data-program-action="toggle-owned-ticket"][data-candidate-id="${screening.candidateId}"]`;
    assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`), 1);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-pressed')`), 'false');
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-pressed')`), 'true');
    assert.match(await evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`), /Tengo entrada/);
    assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('ficx64-owned-tickets-v1'))`), [screening.candidateId]);
    await send('Page.reload');
    await pause(300);
    assert.equal(await evaluate(`document.querySelector('#ticket-intro').open`), false, 'intro should stay dismissed on later visits');
    await evaluate(`document.querySelector('#go-program').click()`);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-pressed')`), 'true', 'mark persists after reload');
    const targetSize = await evaluate(`({height:document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().height,width:innerWidth,media:matchMedia('(max-width: 650px)').matches})`);
    assert.ok(targetSize.media && targetSize.height >= 44, `mobile touch target must be at least 44px: ${JSON.stringify(targetSize)}`);
  } finally {
    clearTimeout(timeout);
    if (ws) ws.close();
    browser.kill();
    if (browser.exitCode === null && browser.signalCode === null) await new Promise(resolve => browser.once('exit', resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
