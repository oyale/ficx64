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
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d => d.close());
      window.originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function() { throw new DOMException('Full', 'QuotaExceededError'); };
      document.querySelector('#film-list .film-title-line').click();
      document.querySelector('dialog[open] .intent-want').click();`);
    assert.equal(await evaluate(`document.querySelector('#storage-warning').matches(':popover-open')`), true);
    assert.equal(await evaluate(`document.querySelector('#storage-warning').getAttribute('role')`), 'alert');
    for (const [width, height] of [[390,844],[844,390],[1280,800]]) {
      await send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<900});
      await pause(100); // Let Chromium finish the modal/popover reflow at the new viewport.
      const layout = await evaluate(`(() => { const w=document.querySelector('#storage-warning'); const b=w.querySelector('button');
        const r=b.getBoundingClientRect();return {width:w.getBoundingClientRect().width, height:r.height, visible:w.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}; })()`);
      assert.ok(layout.width <= width && layout.height >= 44 && layout.visible, JSON.stringify(layout));
    }
    await evaluate(`window.exportedJSON=null; URL.createObjectURL = blob => { blob.text().then(text=>window.exportedJSON=JSON.parse(text)); return 'blob:test'; };
      HTMLAnchorElement.prototype.click=function(){};
      document.querySelector('#storage-warning button').click();`);
    for(let i=0;i<20 && !await evaluate('window.exportedJSON');i++) await pause(25);
    assert.ok(await evaluate(`Object.keys(window.exportedJSON.filmIntentions).length > 0`));
    assert.equal(await evaluate(`document.querySelector('#storage-warning').hidden`), false);
    await evaluate(`Storage.prototype.setItem=window.originalSetItem;
      document.querySelector('dialog[open] .intent-want').click();`);
    assert.equal(await evaluate(`document.querySelector('#storage-warning').hidden`), true);
    console.log('Chromium: storage warning visible above dialog at 390x844, 844x390, 1280x800; export contains unsaved lists; recovery hides warning');
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
