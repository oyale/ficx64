// Access-label regression: adjacent calendar-cell labels must not leak.
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
    const screenings=JSON.parse(fs.readFileSync('data/screenings.json','utf8')).screenings;
    const target=screenings.find(s=>s.candidateId==='calendar-p03-g01-d14-1930');
    const next=screenings.find(s=>s.candidateId==='calendar-p03-g01-d14-2230');
    assert.deepEqual(target.eventLabels,['ENCUENTRO']);
    assert.equal(target.hasMeeting,true);
    assert.equal(target.meetingMinutes,15);
    assert.ok(next.eventLabels.includes('ENTRADA LIBRE'));
    assert.ok(next.eventLabels.includes('PELÍCULA DE SENSACINE'));
    const institute=screenings.find(s=>s.venueGroup==='antiguo-instituto'&&s.filmIds?.length);
    assert.ok(institute.eventLabels.includes('ACCESO LIBRE'));
    const films=JSON.parse(fs.readFileSync('data/films.json','utf8')).films;
    const film=films.find(f=>f.id===target.filmIds[0]);
    assert.deepEqual(film.screenings.find(s=>s.candidateId===target.candidateId).eventLabels,['ENCUENTRO']);
    await send('Page.enable');
    const planned=Object.fromEntries([target,next,institute].flatMap(s=>s.filmIds.map(id=>[id,s.candidateId])));
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('ficx64-planned-screenings-v1', ${JSON.stringify(JSON.stringify(planned))})`});
    await send('Page.navigate',{url:pathToFileURL(path.resolve('dist/index.html')).href});
    for(let i=0;i<100;i++){if(await evaluate(`!!document.querySelector('#film-list .film-title-line')`))break;await pause(50);}
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.querySelector('#go-program').click()`);
    for(const width of [390,1440]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
      for(const s of [target,next]){
        const text=await evaluate(`document.querySelector('[data-program-action="remove-program-screening"][data-candidate-id="${s.candidateId}"]').closest('.program-event').textContent`);
        if(s===target){assert.doesNotMatch(text,/entrada libre|sensacine/i);}
        else assert.match(text,/entrada libre/i);
      }
    }
    const instituteText=await evaluate(`document.querySelector('[data-program-action="remove-program-screening"][data-candidate-id="${institute.candidateId}"]').closest('.program-event').textContent`);
    assert.match(instituteText,/sin necesidad de retirar entrada/i);
    assert.match(instituteText,/hasta completar aforo/i);
    assert.doesNotMatch(instituteText,/imprescindible retirar|máximo 4/i);
    console.log('November 14 19:30 retains Encuentro without free-entry/Sensacine labels; Freddy 22:30 remains free in mobile and desktop itinerary.');
  } finally {
    clearTimeout(timeout);
    if (ws) ws.close();
    browser.kill();
    if (browser.exitCode === null && browser.signalCode === null) await new Promise(resolve => browser.once('exit', resolve));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
