// Real Chromium regression for isolated wizard demo conflicts.
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
    const planned = Object.fromEntries(screenings.flatMap(s => (s.filmIds || []).map(id => [id, s.candidateId])));
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', {source: `localStorage.setItem('ficx64-planned-screenings-v1', ${JSON.stringify(JSON.stringify(planned))})`});
    await send('Page.navigate', {url: pathToFileURL(path.resolve('dist/index.html')).href});
    for (let i=0;i<100;i++) { if (await evaluate(`!!document.querySelector('#film-list .film-title-line')`)) break; await pause(50); }
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close()); document.querySelector('#replay-wizard').click(); for(let i=0;i<3;i++) document.querySelector('#wizard-next').dispatchEvent(new Event('click'))`);
    const count = () => evaluate(`document.querySelectorAll('#wizard-demo-pass .program-event').length`);
    const conflicts = () => evaluate(`document.querySelectorAll('#wizard-demo-pass .has-conflict').length`);
    assert.equal(await count(), 1);
    assert.equal(await conflicts(), 0, 'A alone must ignore the saved itinerary');
    await evaluate(`document.querySelector('[data-wizard-layer="add-b"]').click()`);
    assert.equal(await count(), 2);
    assert.equal(await conflicts(), 0, 'A and B fit independently of the saved itinerary');
    await evaluate(`document.querySelector('[data-wizard-layer="add-c"]').click()`);
    assert.equal(await count(), 3);
    assert.ok(await conflicts() >= 2, 'C still conflicts with the visible demo passes');
    await evaluate(`document.querySelector('[data-wizard-layer="reset"]').click()`);
    assert.equal(await count(), 1);
    assert.equal(await conflicts(), 0);
    console.log('Wizard conflicts stay isolated from saved passes; C still shows its overlap.');
  } finally {
    clearTimeout(timeout);
    if (ws) ws.close();
    browser.kill();
    if (browser.exitCode === null && browser.signalCode === null) await new Promise(resolve => browser.once('exit', resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
