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
  let closeBrowser;
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
    closeBrowser = () => send("Browser.close").catch(() => {});
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
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('ficx64-hide-past-v1','false');localStorage.setItem('ficx64-planned-screenings-v1', ${JSON.stringify(JSON.stringify(planned))})`});
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

    const specialId=screenings[0].candidateId;
    const selector=`#program-agenda [data-temporal-candidate="${specialId}"] .program-access-help`;
    for(const [width,theme] of [[390,'light'],[390,'dark'],[1280,'light'],[1280,'dark']]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
      await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
      await evaluate(`document.querySelector(${JSON.stringify(selector+' > summary')}).click()`);
      await pause(150);
      const instructions=await evaluate(`document.querySelector(${JSON.stringify(selector+' .access-instructions')}).textContent`);
      await evaluate(`document.querySelector(${JSON.stringify(selector+' .access-ticket-toggle')}).scrollIntoView({block:'nearest',behavior:'instant'});document.querySelector(${JSON.stringify(selector+' .access-ticket-toggle')}).click()`);
      assert.match(await evaluate(`document.querySelector(${JSON.stringify(selector+' > summary')}).textContent`),/Con entrada/);
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).open`),true,'mark keeps instructions open');
      assert.match(await evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`),/Has marcado que tienes entrada/);
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector+' .access-instructions')}).textContent`),instructions);
      assert.ok(JSON.parse(await evaluate(`localStorage.getItem('ficx64-owned-tickets-v1')`)).includes(specialId));
      assert.equal(await evaluate(`document.activeElement.matches('.access-ticket-toggle')`),true,'focus follows replacement action');
      await pause(150);
      const bounds=await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector+' .access-ticket-toggle')}).getBoundingClientRect();return {left:b.left,right:b.right,height:b.height,width:innerWidth}})()`);
      assert.ok(bounds.left>=0&&bounds.right<=bounds.width&&bounds.height>=44,JSON.stringify(bounds));
      const capture=await send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(`/tmp/ficx-special-ticket-${width}-${theme}.png`,Buffer.from(capture.data,'base64'));
      await evaluate(`document.querySelector(${JSON.stringify(selector+' .access-ticket-toggle')}).scrollIntoView({block:'nearest',behavior:'instant'});document.querySelector(${JSON.stringify(selector+' .access-ticket-toggle')}).click()`);
      assert.match(await evaluate(`document.querySelector(${JSON.stringify(selector+' > summary')}).textContent`),/Entradas/);
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).open`),true);
      assert.ok(!JSON.parse(await evaluate(`localStorage.getItem('ficx64-owned-tickets-v1')`)).includes(specialId));
      await evaluate(`document.querySelector(${JSON.stringify(selector+' > summary')}).click()`);
    }
    // Persist a mark and verify the summary and instructions after reloading.
    await evaluate(`document.querySelector(${JSON.stringify(selector+' > summary')}).click();document.querySelector(${JSON.stringify(selector+' .access-ticket-toggle')}).click()`);
    await send('Page.reload');
    for(let i=0;i<100;i++){if(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`))break;await pause(50);}
    assert.match(await evaluate(`document.querySelector(${JSON.stringify(selector+' > summary')}).textContent`),/Con entrada/);
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.querySelector('#go-program').click();document.querySelector(${JSON.stringify(selector+' > summary')}).click()`);
    assert.match(await evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`),/Quitar marca/);
    console.log('Special ticket: exclusive/outside-close disclosure, mark/unmark, retained instructions/focus, reload, mobile/desktop and light/dark passed');

  } finally {
    clearTimeout(timeout);
    if (closeBrowser) await closeBrowser();
    if (ws) ws.close();
    if (browser.exitCode === null && browser.signalCode === null) {
      await Promise.race([new Promise(resolve => browser.once('exit', resolve)),pause(3000)]);
      if (browser.exitCode === null && browser.signalCode === null) browser.kill();
    }
    fs.rmSync(profile, { recursive: true, force: true, maxRetries:10, retryDelay:100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
