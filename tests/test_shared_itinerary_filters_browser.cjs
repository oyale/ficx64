// Chromium regression for personal filters on received itineraries.
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
    const records=JSON.parse(fs.readFileSync('data/screenings.json','utf8')).screenings;
    const singles=records.filter(s=>s.accessType==='public'&&s.filmIds?.length===1);
    const other=singles.find(s=>singles.some(t=>t.candidateId!==s.candidateId&&t.filmIds[0]===s.filmIds[0]&&t.date!==s.date));
    const otherOwn=singles.find(t=>t.candidateId!==other.candidateId&&t.filmIds[0]===other.filmIds[0]&&t.date!==other.date);
    const chosen=[other];
    for(const s of singles){if(chosen.length===5)break;if(chosen.every(t=>t.filmIds[0]!==s.filmIds[0]))chosen.push(s);}
    assert.equal(chosen.length,5);
    const [otherPass,coincide,want,maybe,fresh]=chosen;
    const planned={[other.filmIds[0]]:otherOwn.candidateId,[coincide.filmIds[0]]:coincide.candidateId};
    const intentions={[other.filmIds[0]]:'want',[coincide.filmIds[0]]:'want',[want.filmIds[0]]:'want',[maybe.filmIds[0]]:'maybe'};
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('ficx64-onboarding-done-v1','true');localStorage.setItem('ficx64-film-intentions-v2',${JSON.stringify(JSON.stringify(intentions))});localStorage.setItem('ficx64-planned-screenings-v1',${JSON.stringify(JSON.stringify(planned))})`});
    await send('Page.navigate',{url:pathToFileURL(path.resolve('dist/index.html')).href});
    for(let i=0;i<100;i++){if(await evaluate(`!!document.querySelector('#film-list .film-title-line')`))break;await pause(50);}
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close())`);
    const ids=chosen.map(s=>s.candidateId);
    const visible=()=>evaluate(`Array.from(document.querySelectorAll('#shared-list [data-shared-candidate]:not([hidden])'),r=>r.dataset.sharedCandidate)`);
    const selected=()=>evaluate(`Array.from(document.querySelectorAll('#shared-list input[data-shared-pass]:checked'),i=>i.dataset.sharedPass)`);
    const clickFilter=key=>evaluate(`document.querySelector('[data-shared-pass-filter="${key}"]').click()`);
    for(const width of [390,1440]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
      for(const theme of ['light','dark']){
        await evaluate(`document.documentElement.dataset.theme='${theme}';window.renderSharedScreen(${JSON.stringify(ids)},'Alex')`);
        assert.deepEqual(await visible(),ids,'Original itinerary order and all passes on entry');
        const initialSelected=await selected();
        const beforeStorage=await evaluate(`JSON.stringify({...localStorage})`);
        const expected={coincide:[coincide.candidateId],want:chosen.filter(s=>intentions[s.filmIds[0]]==='want').map(s=>s.candidateId),maybe:[maybe.candidateId],other:[otherPass.candidateId]};
        for(const [key,values] of Object.entries(expected)){
          await clickFilter(key);
          assert.deepEqual(await visible(),values,`${width} ${theme}: ${key}`);
          assert.deepEqual(await selected(),initialSelected,'Filtering preserves selected passes');
        }
        await clickFilter('fitting');
        const enabled=await evaluate(`Array.from(document.querySelectorAll('#shared-list input[data-shared-pass]:not(:disabled)'),i=>i.dataset.sharedPass)`);
        assert.deepEqual(await visible(),enabled,'Fitting means eligible to select');
        assert.ok(enabled.includes(maybe.candidateId),'Fixture includes an eligible maybe pass');
        assert.equal(await evaluate(`JSON.stringify({...localStorage})`),beforeStorage,'Filtering never persists personal data');
        await evaluate(`document.querySelector('#shared-clear').click()`);
        await clickFilter('maybe');
        await evaluate(`document.querySelector('#shared-mark-fitting').click()`);
        assert.deepEqual(await selected(),enabled.includes(maybe.candidateId)?[maybe.candidateId]:[],'Bulk mark only visible fitting rows');
        await clickFilter('coincide');
        if(enabled.includes(maybe.candidateId))assert.match(await evaluate(`document.querySelector('#shared-pass-filter-summary').textContent`),/seleccionado fuera del filtro/);
        await clickFilter('want');
        const navIds=await evaluate(`Array.from(new Set(Array.from(document.querySelectorAll('#shared-list .shared-pass:not([hidden]) [data-open-film]'),b=>b.dataset.openFilm)))`);
        await evaluate(`document.querySelector('#shared-list .shared-pass:not([hidden]) [data-open-film]').click()`);
        for(let i=0;i<navIds.length;i++){
          assert.equal(await evaluate(`document.querySelector('dialog[open] .intent-want').dataset.id`),navIds[i]);
          if(i<navIds.length-1)await evaluate(`document.querySelector('dialog[open] [data-action="film-next"]').click()`);
        }
        await evaluate(`document.querySelector('dialog[open] .film-detail-close').click()`);
        assert.equal(await evaluate(`document.querySelector('[data-shared-pass-filter="want"]').getAttribute('aria-pressed')`),'true','Return preserves filter');
        await clickFilter('all');
        const shot=await send('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(`/tmp/ficx-shared-filters-${width}-${theme}.png`,Buffer.from(shot.data,'base64'));
        assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false,'No horizontal page overflow');
        await evaluate(`window.renderSharedScreen(${JSON.stringify(ids)},'New')`);
        assert.equal(await evaluate(`document.querySelector('[data-shared-pass-filter="all"]').getAttribute('aria-pressed')`),'true','New itinerary resets filter');
      }
    }
    // A local change from the detail must update the active filter on return.
    await clickFilter('maybe');
    await evaluate(`document.querySelector('#shared-list .shared-pass:not([hidden]) [data-open-film]').click()`);
    await evaluate(`document.querySelector('dialog[open] .intent-want').click();document.querySelector('dialog[open] .film-detail-close').click()`);
    assert.deepEqual(await visible(),[]);
    assert.equal(await evaluate(`document.querySelector('#shared-filter-empty').hidden`),false);
    assert.equal(await evaluate(`document.querySelector('[data-shared-pass-filter="maybe"]').getAttribute('aria-pressed')`),'true');
    // Follow a real encoded link, which must reset the view to the full itinerary.
    const encoded=await evaluate(`window.encodePassLink(${JSON.stringify(ids)},'Real link')`);
    await evaluate(`location.hash='pases='+${JSON.stringify(encoded)}`);
    await pause(150);
    assert.deepEqual(await visible(),ids);
    assert.equal(await evaluate(`document.querySelector('[data-shared-pass-filter="all"]').getAttribute('aria-pressed')`),'true');
    // Shared film lists keep their separate filters and staged choices.
    const listPayload='v1.'+Buffer.from(JSON.stringify({v:1,l:[[fresh.filmIds[0],'want',0],[want.filmIds[0],'want',0]]})).toString('base64url');
    await evaluate(`location.hash='listas='+${JSON.stringify(listPayload)}`);
    await pause(150);
    assert.equal(await evaluate(`document.querySelector('#shared-pass-filters').hidden`),true);
    assert.equal(await evaluate(`document.querySelector('#shared-pass-filter-summary').hidden`),true);
    assert.equal(await evaluate(`document.querySelector('#shared-list-filters').hidden`),false);
    const listStorage=await evaluate(`JSON.stringify({...localStorage})`);
    await evaluate(`document.querySelector('[data-shared-row="${fresh.filmIds[0]}"] .intent-want').click();document.querySelector('[data-shared-row="${fresh.filmIds[0]}"] [data-open-shared-film]').click();document.querySelector('dialog[open] .film-detail-close').click()`);
    assert.equal(await evaluate(`document.querySelector('[data-shared-row="${fresh.filmIds[0]}"] .intent-want').getAttribute('aria-pressed')`),'true');
    assert.equal(await evaluate(`JSON.stringify({...localStorage})`),listStorage,'List choice remains staged after returning from detail');
    console.log('Shared itinerary filters preserve order, selections and storage; bulk actions and film navigation respect visible passes at mobile/desktop in both themes.');
  } finally {
    clearTimeout(timeout);
    if (ws) ws.close();
    browser.kill();
    if (browser.exitCode === null && browser.signalCode === null) await new Promise(resolve => browser.once('exit', resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
