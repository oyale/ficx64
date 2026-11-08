// Chromium regression for manifest shortcut destinations.
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
    const manifest=JSON.parse(fs.readFileSync('dist/manifest.webmanifest','utf8'));
    assert.deepEqual(manifest.shortcuts.map(s=>s.name),['Películas','Mis listas','Pases','Mi parrilla']);
    for(const shortcut of manifest.shortcuts){
      const icon=shortcut.icons[0].src.split('?')[0];
      assert.ok(fs.existsSync(path.join('dist',icon)));
    }
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('ficx64-onboarding-done-v1','true');localStorage.setItem('ficx64-ticket-intro-v1','true')`});
    const baseUrl=pathToFileURL(path.resolve('dist/index.html')).href;
    const expected={'peliculas':'explore','mis-listas':'explore','pases':'sessions','mi-parrilla':'program'};
    for(const width of [390,1440]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
      for(const shortcut of manifest.shortcuts){
        const hash=new URL(shortcut.url,'https://example.test/').hash;
        await send('Page.navigate',{url:baseUrl+hash});
        for(let i=0;i<100;i++){if(await evaluate(`!!document.querySelector('#film-list .film-title-line')`))break;await pause(50);}
        await pause(100);
        const section=hash.split('=')[1];
        assert.equal(await evaluate(`document.querySelector('.app-screen:not([hidden])').id`),'screen-'+expected[section],`${width}: cold ${section}`);
        assert.equal(await evaluate(`document.querySelector('#mi-programa-sheet').hidden`),section!=='mis-listas');
      }
      for(const section of ['mis-listas','pases','mi-parrilla','peliculas']){
        await evaluate(`location.hash='seccion=${section}'`);
        await pause(100);
        assert.equal(await evaluate(`document.querySelector('.app-screen:not([hidden])').id`),'screen-'+expected[section],`${width}: hash ${section}`);
        assert.equal(await evaluate(`document.querySelector('#mi-programa-sheet').hidden`),section!=='mis-listas');
      }
      await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.querySelector('#film-list .film-title-line').click();location.hash='seccion=pases'`);
      await pause(100);
      assert.equal(await evaluate(`document.querySelectorAll('dialog.film-expanded[open]').length`),0);
      assert.equal(await evaluate(`document.querySelector('.app-screen:not([hidden])').id`),'screen-sessions');
    }
    console.log('Four shortcut destinations verified on cold launch and hash navigation, mobile and desktop; icons exist; open film closes.');
  } finally {
    clearTimeout(timeout);
    if (ws) ws.close();
    browser.kill();
    if (browser.exitCode === null && browser.signalCode === null) await new Promise(resolve => browser.once('exit', resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
