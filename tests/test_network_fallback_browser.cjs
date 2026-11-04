// Real Chromium regression for offline resilience and storage failures.
// Run python3 build.py first. Requires Node 22+ and chromium (or CHROMIUM_BIN).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  let delayed = false;
  const root = path.join(__dirname, '../dist');
  const server = require('node:http').createServer((req,res) => {
    const url = new URL(req.url, 'http://localhost');
    const filename = url.pathname === '/' ? '/index.html' : url.pathname;
    const content = fs.readFileSync(root + filename);
    res.setHeader('Content-Type', filename.endsWith('.js') ? 'application/javascript' : filename.endsWith('.html') ? 'text/html' : filename.endsWith('.webmanifest') ? 'application/manifest+json' : 'image/png');
    if (delayed && filename === '/index.html') setTimeout(() => res.end(Buffer.concat([content,Buffer.from('<!-- late-network-success -->')])), 5000);
    else res.end(content);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const appURL = 'http://127.0.0.1:' + server.address().port + '/';
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
    await send('Page.navigate', { url: appURL });
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!!document.querySelector('#film-list .film-title-line')`)) break;
      await pause(50);
    }
    assert.ok(await evaluate(`!!document.querySelector('#film-list .film-title-line')`), await evaluate(`JSON.stringify({url:location.href,title:document.title,body:document.body?.innerText.slice(0,700)})`));
    await evaluate(`navigator.serviceWorker.ready.then(() => true)`);
    for(let i=0;i<100 && !await evaluate('!!navigator.serviceWorker.controller');i++) await pause(50);
    assert.equal(await evaluate('!!navigator.serviceWorker.controller'),true);
    delayed = true;
    const started = Date.now();
    await send('Page.navigate', {url: appURL + '?slow=1'});
    for(let i=0;i<100 && !await evaluate(`!!document.querySelector('#film-list .film-title-line')`);i++) await pause(50);
    const elapsed = Date.now()-started;
    assert.ok(elapsed >= 2800 && elapsed < 4800, 'offline fallback after 3 seconds: '+elapsed);
    await pause(2500);
    assert.equal(await evaluate(`caches.keys().then(async keys => {
      const key = keys.find(key=>key.startsWith('ficx64:'));
      const response = await (await caches.open(key)).match(location.origin+'/');
      return (await response.text()).includes('late-network-success');
    })`),true);
    console.log('Chromium HTTP: offline response after '+elapsed+' ms; late network success persisted in cache');
  } finally {
    server.closeAllConnections();
    server.close();
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
