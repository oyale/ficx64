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
    const screenings=JSON.parse(fs.readFileSync('data/screenings.json','utf8')).screenings.filter(s=>s.accessType==='restricted' && s.filmIds?.length).slice(0,2);
    const free = JSON.parse(fs.readFileSync('data/screenings.json','utf8')).screenings.find(s=>s.filmIds?.length && (s.eventLabels || []).some(l=>['ENTRADA LIBRE','ACCESO LIBRE'].includes(l)));
    assert.ok(free);
    screenings.push(free);
    await send('Page.enable');
    const planned = Object.fromEntries(screenings.flatMap(s => s.filmIds.map(id => [id,s.candidateId])));
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('ficx64-planned-screenings-v1', ${JSON.stringify(JSON.stringify(planned))})`});
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await send('Page.navigate',{url:pathToFileURL(path.resolve('dist/index.html')).href});
    for(let i=0;i<100;i++){if(await evaluate(`!!document.querySelector('#film-list .film-title-line')`))break;await pause(50);}
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.querySelector('#go-program').click()`);
    assert.ok(await evaluate(`document.querySelectorAll('#program-agenda .program-access-help').length>=2`));
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('#program-agenda .program-access-tag')).some(t=>t.textContent==='Entrada libre')`));
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('.access-instructions-title')).every(t=>t.textContent!=='Prensa y acreditados')`));
    await evaluate(`document.querySelectorAll('#program-agenda .program-access-help > summary')[0].click()`);
    assert.equal(await evaluate(`document.querySelectorAll('.program-access-help[open]').length`),1);
    await evaluate(`(() => {const b=document.querySelectorAll('#program-agenda .program-access-help > summary')[1]; window.scrollBy(0,b.getBoundingClientRect().top-innerHeight+150);b.click();})()`);
    await pause(150);
    const visiblePanel=await evaluate(`(() => {const p=document.querySelector('.program-access-help[open] > div').getBoundingClientRect();return {top:p.top,bottom:p.bottom,bar:document.querySelector('.mobile-tabbar').getBoundingClientRect().top,header:document.querySelector('.masthead').getBoundingClientRect().bottom};})()`);
    assert.ok(visiblePanel.bottom<=visiblePanel.bar && visiblePanel.top>=visiblePanel.header,JSON.stringify(visiblePanel));
    const shot=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync('/tmp/ficx-access-visible.png',Buffer.from(shot.data,'base64'));

    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('#program-agenda .program-access-help'),d=>d.open).slice(0,2)`),[false,true]);
    await evaluate(`document.querySelector('#program-title').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('.program-access-help[open]').length`),0);
    console.log('Only one access instructions popup opens; clicking outside closes it');
  } finally {
    clearTimeout(timeout);
    if (ws) ws.close();
    browser.kill();
    if (browser.exitCode === null && browser.signalCode === null) await new Promise(resolve => browser.once('exit', resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
