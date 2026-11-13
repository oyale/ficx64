// Real Chromium regression for temporal display with a controlled clock.
// Run python3 build.py first. Requires Node 22+ and chromium (or CHROMIUM_BIN).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ficx-temporal-'));
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

    const errors=[];
    await send('Runtime.enable');
    const originalOnMessage=ws.onmessage;
    ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+JSON.stringify(m.params.exceptionDetails.exception));originalOnMessage(event);};
    const fixtureFilms=['alpha','beta','gamma'].map(id=>({id,title:id,sections:['Esbilla'],directors:['Director'],durationMinutes:60,synopsis:'Una película de prueba.',countries:['España']}));
    const fixturePasses=[
      {candidateId:'a',date:'2026-11-13',time:'10:00',durationMinutes:30,filmIds:['alpha']},
      {candidateId:'b',date:'2026-11-13',time:'11:00',durationMinutes:120,filmIds:['beta']},
      {candidateId:'c',date:'2026-11-14',time:'10:00',durationMinutes:60,filmIds:['gamma']},
    ].map(s=>({...s,accessType:'public',venue:'Teatro',venueGroup:'teatro-jovellanos',films:s.filmIds.map(id=>({id,title:id}))}));
    if(process.env.FICX_TEMPORAL_INVALID){
      [null,'not-a-date','2026-02-30'].forEach((date,i)=>{
        const id='unknown'+i;
        fixtureFilms.push({id,title:id,sections:['Esbilla'],durationMinutes:60,synopsis:'Sin fecha.'});
        fixturePasses.push({candidateId:id,date,time:'10:00',durationMinutes:60,filmIds:[id],films:[{id,title:id}],accessType:'public',venue:'Teatro',venueGroup:'teatro-jovellanos'});
      });
    }
    fixtureFilms.forEach(f=>f.screenings=fixturePasses.filter(s=>s.filmIds.includes(f.id)));
    await send('Page.enable');
    await send('Emulation.setTimezoneOverride',{timezoneId:'America/New_York'});
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`
      window.__now=Date.parse('2026-11-13T08:59:59.999Z');
      const NativeDate=Date;
      window.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[window.__now]));}static now(){return window.__now;}};
      const nativeSetTimeout=setTimeout,nativeClearTimeout=clearTimeout;
      let seq=1000000;const timers=new Map();
      window.setTimeout=(fn,delay,...args)=>{if(delay>0&&delay<=30000){const id=++seq;timers.set(id,{fn:()=>fn(...args),at:window.__now+delay});return id;}return nativeSetTimeout(fn,delay,...args);};
      window.clearTimeout=id=>{timers.delete(id);nativeClearTimeout(id);};
      window.__advance=ms=>{window.__now=ms;const due=[...timers].filter(([,t])=>t.at<=ms);for(const [id,t]of due){timers.delete(id);t.fn();}};
      Object.defineProperty(window,'FICX_FILMS',{configurable:true,get:()=>${JSON.stringify(fixtureFilms)},set:()=>{}});
      Object.defineProperty(window,'FICX_SCREENINGS',{configurable:true,get:()=>${JSON.stringify(fixturePasses)},set:()=>{}});
      localStorage.clear();
      localStorage.setItem('ficx64-film-intentions-v2',JSON.stringify({alpha:'want',beta:'want',unknown0:'want',unknown1:'want',unknown2:'want'}));
      localStorage.setItem('ficx64-planned-screenings-v1',${JSON.stringify(JSON.stringify({alpha:'a',...(process.env.FICX_TEMPORAL_INVALID?{unknown0:'unknown0',unknown1:'unknown1',unknown2:'unknown2'}:{})}))});
      localStorage.setItem('ficx64-owned-tickets-v1',JSON.stringify(['a']));
    `});
    const url=process.env.FICX_TEMPORAL_URL||pathToFileURL(path.resolve('dist/ficx64-portable.html')).href;
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await send('Page.navigate',{url});
    for(let i=0;i<100;i++){if(await evaluate(`!!document.querySelector('#session-results-list li')`))break;await pause(50);}
    assert.deepEqual(errors,[],'app boot');
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close())`);
    assert.equal(await evaluate(`document.querySelector('#hide-past').checked`),true);
    const count=()=>evaluate(`document.querySelectorAll('#session-results-list .finder-screening').length`);

    if(process.env.FICX_TEMPORAL_INVALID){
      assert.equal(await count(),6);
      assert.match(await evaluate(`document.querySelector('#program-agenda').textContent`),/Fecha sin confirmar/);
      await evaluate(`document.querySelector('#film-list [data-film-id="unknown0"]').click()`);
      assert.match(await evaluate(`document.querySelector('#film-dialog-host').textContent`),/FECHA SIN CONFIRMAR/);
      assert.equal(await evaluate(`document.querySelector('#film-dialog-host time[datetime*="null"]')`),null);
      await evaluate(`document.querySelector('#film-dialog-host [data-action="expand"]').click();location.hash='pases=v1.'+btoa(JSON.stringify({v:1,p:['unknown0','unknown1','unknown2']})).replace(/=+$/,'')`);
      for(let i=0;i<100;i++){if(await evaluate(`!document.querySelector('#screen-shared').hidden`))break;await pause(20);}
      assert.match(await evaluate(`document.querySelector('#shared-list').textContent`),/Fecha sin confirmar/);
      assert.deepEqual(errors,[],'invalid-date views do not throw');
      console.log('Temporal invalid-date fixtures: passes, detail, itinerary and shared render without exceptions');
      return;
    }
    assert.equal(await count(),3);
    const original=await evaluate(`localStorage.getItem('ficx64-planned-screenings-v1')`);
    await evaluate(`window.__nativeCreateURL=URL.createObjectURL;URL.createObjectURL=blob=>{window.__exportBlob=blob;return window.__nativeCreateURL(blob)};document.querySelector('#settings-download').click()`);
    const exportedBefore=await evaluate(`window.__exportBlob.text()`);
    const countsBefore=await evaluate(`['program-conflict-count','program-unplanned-count','program-pass-count'].map(id=>document.getElementById(id).textContent)`);
    await evaluate(`document.querySelector('[data-temporal-film="alpha"]').open=true;document.querySelector('[data-temporal-film="beta"]').open=false;`);

    await evaluate(`window.__node=document.querySelector('#film-list .film-row');window.__advance(Date.parse('2026-11-13T08:59:59.999Z'));`);
    assert.equal(await evaluate(`window.__node===document.querySelector('#film-list .film-row')`),true,'no paint without state change');
    // Open alpha before its last start, then cross the exact start boundary.
    await evaluate(`document.querySelector('#film-list [data-film-id="alpha"]').click();window.__dialog=document.querySelector('#film-dialog-host dialog')`);
    assert.equal(await evaluate(`window.__dialog.open`),true);
    const statusBefore=await evaluate(`document.querySelector('#temporal-status').textContent`);
    await evaluate(`window.__advance(Date.parse('2026-11-13T09:00:00Z'))`);
    assert.equal(await evaluate(`document.querySelector('#temporal-status').textContent`),statusBefore,'no announcement from hidden Pases while reading dialog');
    assert.equal(await evaluate(`document.querySelectorAll('#film-list-progress[aria-live],#film-list-progress[role],#session-results-list[aria-live],#shared-list[aria-live],#shared-pass-filter-summary[role],.pass-conflict-popover[role]').length`),0,'single result announcement channel');
    assert.equal(await count(),3,'ongoing screening remains visible');
    assert.equal(await evaluate(`document.querySelector('[data-temporal-film="alpha"]').open`),true,'alpha disclosure remains open');
    assert.equal(await evaluate(`document.querySelector('[data-temporal-film="beta"]').open`),false,'beta disclosure remains closed');
    assert.deepEqual(await evaluate(`['program-conflict-count','program-unplanned-count','program-pass-count'].map(id=>document.getElementById(id).textContent)`),countsBefore,'fitting/conflict counts unchanged');
    await evaluate(`document.querySelector('#settings-download').click()`);
    const exportedAfter=JSON.parse(await evaluate(`window.__exportBlob.text()`)),beforePayload=JSON.parse(exportedBefore);
    delete exportedAfter.exportedAt;delete beforePayload.exportedAt;
    assert.deepEqual(exportedAfter,beforePayload,'complete exported choices unchanged (export timestamp excluded)');

    assert.equal(await evaluate(`window.__dialog===document.querySelector('#film-dialog-host dialog')&&window.__dialog.open`),true,'open dialog identity');
    assert.equal(await evaluate(`document.querySelectorAll('#film-dialog-host .film-detail-nav:disabled').length`),1);
    assert.match(await evaluate(`document.querySelector('#film-dialog-host .film-expanded-screenings').textContent`),/En curso · hasta las 10:30/);
    assert.match(await evaluate(`document.querySelector('#program-agenda').textContent`),/En curso/);
    assert.equal(await evaluate(`localStorage.getItem('ficx64-planned-screenings-v1')`),original);
    assert.equal(await evaluate(`localStorage.getItem('ficx64-owned-tickets-v1')`),'["a"]');
    assert.match(await evaluate(`document.querySelector('#session-results-list [data-temporal-candidate="a"]').textContent`),/En curso · hasta las 10:30/);
    assert.match(await evaluate(`document.querySelector('#program-agenda').textContent`),/En curso · hasta las 10:30/);
    await evaluate(`window.__advance(Date.parse('2026-11-13T09:29:59.999Z'))`);
    assert.equal(await count(),3,'visible until one millisecond before end');
    await evaluate(`window.__advance(Date.parse('2026-11-13T09:30:00Z'))`);
    assert.equal(await count(),2,'hidden at exact end');
    assert.equal(await evaluate(`document.querySelector('#film-list [data-film-id="alpha"]')`),null,'film leaves catalogue only after last end');
    assert.match(await evaluate(`document.querySelector('#film-dialog-host .film-expanded-screenings').textContent`),/No quedan pases/);
    assert.equal(await evaluate(`document.querySelectorAll('#film-dialog-host .film-detail-nav:disabled').length`),2);
    await evaluate(`document.querySelector('#film-dialog-host [data-action="expand"]').click()`);
    assert.equal(await evaluate(`document.querySelector('#film-dialog-host dialog')===null`),true);
    await evaluate(`document.querySelector('#only-my-lists').click()`);
    assert.ok(await evaluate(`!!document.querySelector('#film-list [data-film-id="alpha"]')`),'list exempt');
    await evaluate(`document.querySelector('#film-list [data-film-id="alpha"]').click()`);
    assert.ok(await evaluate(`document.querySelectorAll('#film-dialog-host .screening-list li').length`)>0,'list detail exempt');
    await evaluate(`document.querySelector('#film-dialog-host .film-star-button').click()`);
    assert.equal(await evaluate(`document.querySelector('#film-dialog-host .film-star-button').getAttribute('aria-pressed')`),'true','priority updates stable dialog');
    await evaluate(`document.querySelector('#film-dialog-host .film-star-button').click()`);
    assert.equal(await evaluate(`document.querySelector('#film-dialog-host .film-star-button').getAttribute('aria-pressed')`),'false');

    await evaluate(`document.querySelector('#film-dialog-host [data-action="expand"]').click();document.querySelector('#only-my-lists').click();window.__advance(Date.parse('2026-11-13T10:00:00Z'))`);
    assert.match(await evaluate(`document.querySelector('#program-agenda').textContent`),/siguen guardados/);
    assert.equal(await evaluate(`document.querySelector('[data-date="2026-11-13"]').disabled`),false,'day waits for last end');
    await evaluate(`window.__advance(Date.parse('2026-11-13T12:00:00Z'))`);
    assert.equal(await evaluate(`document.querySelector('[data-date="2026-11-13"]').disabled`),true,'day closes at last end');
    await evaluate(`document.querySelector('#hide-past').click()`);
    assert.equal(await count(),3);
    assert.equal(await evaluate(`localStorage.getItem('ficx64-hide-past-v1')`),'false');
    await evaluate(`window.dispatchEvent(new StorageEvent('storage',{key:null,newValue:null}))`);
    assert.equal(await evaluate(`document.querySelector('#hide-past').checked`),true);

    // Shared proposals keep historical events folded without default selection.
    await evaluate(`window.__advance(Date.parse('2026-11-13T09:30:00Z'));document.querySelector('#hide-past').click();location.hash='pases=v1.'+btoa(JSON.stringify({v:1,p:['a','b','c']})).replace(/=+$/,'')`);
    for(let i=0;i<100;i++){if(await evaluate(`!document.querySelector('#screen-shared').hidden`))break;await pause(20);}
    assert.equal(await evaluate(`document.querySelector('.shared-past details').open`),false);
    assert.equal(await evaluate(`document.querySelector('[data-shared-pass="a"]').checked`),false);
    // An explicit uncheck survives the reclassification, even if state.listed is true.
    await evaluate(`var input=document.querySelector('[data-shared-pass="b"]');input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}));window.__advance(Date.parse('2026-11-13T10:00:00Z'))`);
    assert.equal(await evaluate(`document.querySelector('[data-shared-pass="b"]').checked`),false);
    assert.ok(await evaluate(`document.querySelector('.shared-past [data-shared-pass="b"]')!==null`),'moves to past even when global filter off');
    await evaluate(`document.querySelector('#shared-mark-fitting').click()`);
    assert.equal(await evaluate(`document.querySelector('[data-shared-pass="b"]').checked`),false,'bulk excludes past');
    await evaluate(`var input=document.querySelector('[data-shared-pass="b"]');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));window.__advance(Date.parse('2026-11-13T12:00:00Z'))`);
    assert.equal(await evaluate(`document.querySelector('[data-shared-pass="b"]').checked`),true,'explicit historical choice survives');
    await evaluate(`document.querySelector('#hide-past').click()`);
    await evaluate(`window.__advance(Date.parse('2026-11-15T12:00:00Z'))`);
    assert.match(await evaluate(`document.querySelector('#session-results-list').textContent`),/festival ha terminado/);
    for(const width of [390,1280]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
      await evaluate(`document.querySelector('#next-to-sessions').click();document.querySelector('#session-results-list').scrollIntoView({block:'end',behavior:'instant'})`);
      await pause(100);
      const shot=await send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(`/tmp/ficx-temporal-${width}.png`,Buffer.from(shot.data,'base64'));
      assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),'no horizontal overflow');
    }
    assert.deepEqual(errors,[],'no browser exceptions');
    console.log('Temporal: exact transitions, day end, lists/detail exemption, dialog identity, ticket/selection invariance, settings/storage and mobile/desktop passed: '+url);
  } finally {
    clearTimeout(timeout);
    if (ws) ws.close();
    browser.kill();
    if (browser.exitCode === null && browser.signalCode === null) await new Promise(resolve => browser.once('exit', resolve));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
