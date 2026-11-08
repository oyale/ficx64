// Real Chromium regression for reviewed TMDB links and attribution.
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
    const films = JSON.parse(fs.readFileSync('data/films.json','utf8')).films;
    assert.ok(films.some(f=>Number.isSafeInteger(f.tmdbId)&&f.tmdbId>0));
    await send('Page.enable');
    await send('Page.navigate',{url:pathToFileURL(path.resolve('dist/index.html')).href});
    for(let i=0;i<100;i++){if(await evaluate(`!!document.querySelector('#film-list .film-title-line')`))break;await pause(50);}
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close())`);
    for(const width of [1440,390]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
      for(const theme of ['light','dark']){
        await evaluate(`document.documentElement.dataset.theme='${theme}'`);
        for(const id of ['el-debut','el-maletin']){
          const film=films.find(f=>f.id===id);
          await evaluate(`document.querySelector('#search-input').value=${JSON.stringify(film.title)};document.querySelector('#search-input').dispatchEvent(new Event('input'))`);
          await evaluate(`document.querySelector('[data-film-id="${id}"] .film-title-line').click()`);
          const links=await evaluate(`Array.from(document.querySelectorAll('dialog[open] .film-tmdb-source a'),a=>({href:a.href,rel:a.rel,target:a.target}))`);
          assert.equal(links.length,film.tmdbId?1:0);
          if(film.tmdbId){
            assert.equal(links[0].href,`https://www.themoviedb.org/movie/${film.tmdbId}`);
            assert.equal(links[0].target,'_blank');
            assert.match(links[0].rel,/noopener/);
            await evaluate(`document.querySelector('dialog[open] .film-tmdb-source').scrollIntoView({block:'center'})`);
            const overflow=await evaluate(`(()=>{const d=document.querySelector('dialog[open]');return d.scrollWidth>d.clientWidth+1})()`);
            assert.equal(overflow,false,`${width} ${theme}: film overflow`);
            const shot=await send('Page.captureScreenshot',{format:'png'});
            fs.writeFileSync(`/tmp/ficx-tmdb-film-${width}-${theme}.png`,Buffer.from(shot.data,'base64'));
          }
          const cast = film.actors || [];
          assert.equal(await evaluate(`document.querySelectorAll('dialog[open] .film-cast').length`), cast.length ? 1 : 0);
          if(cast.length){
            const paragraphs=await evaluate(`Array.from(document.querySelectorAll('dialog[open] .film-cast-names'),p=>p.textContent)`);
            assert.deepEqual(paragraphs,[cast.slice(0,8).join(', '),...(cast.length>8?[cast.slice(8).join(', ')]:[])]);
            assert.equal(await evaluate(`document.querySelector('dialog[open] .film-cast-source').href`),`https://www.themoviedb.org/movie/${film.tmdbId}/cast`);
            if(cast.length>8){
              assert.equal(await evaluate(`document.querySelector('dialog[open] .film-cast-more').open`),false);
              await evaluate(`document.querySelector('dialog[open] .film-cast-more summary').click()`);
              assert.equal(await evaluate(`document.querySelector('dialog[open] .film-cast-more').open`),true);
              await evaluate(`document.querySelector('dialog[open] .film-cast-more summary').click()`);
            }
            await evaluate(`document.querySelector('dialog[open] .film-cast').scrollIntoView({block:'center',behavior:'instant'})`);
            assert.ok(await evaluate(`(()=>{const r=document.querySelector('dialog[open] .film-cast').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()`));
            const castShot=await send('Page.captureScreenshot',{format:'png'});
            fs.writeFileSync(`/tmp/ficx-tmdb-cast-${width}-${theme}.png`,Buffer.from(castShot.data,'base64'));
          }
          await evaluate(`document.querySelector('dialog[open] .film-detail-close').click()`);
        }
        await evaluate(`(()=>{document.querySelector('#help-toggle').click();const c=document.querySelector('.tmdb-credit');c.closest('details').open=true;c.scrollIntoView({block:'center'});})()`);
        await pause(250);
        await evaluate(`document.querySelector('.tmdb-credit').scrollIntoView({block:'center',behavior:'instant'})`);
        assert.ok(await evaluate(`(()=>{const r=document.querySelector('.tmdb-credit').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()`), 'TMDB credits must be visible');
        assert.ok(await evaluate(`document.querySelector('.tmdb-credit').textContent.includes('This product uses the TMDB API but is not endorsed or certified by TMDB.')`));
        assert.ok(await evaluate(`(()=>{const i=document.querySelector('.tmdb-credit img');return i.complete&&i.naturalWidth>0&&i.src.startsWith('data:')})()`));
        const shot=await send('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(`/tmp/ficx-tmdb-credits-${width}-${theme}.png`,Buffer.from(shot.data,'base64'));
        await evaluate(`document.querySelector('[data-screen-jump="browse-area"]').click()`);
      }
    }
    console.log('TMDB links: accepted only, safe destination and attributed expandable cast; embedded credits logo and notice verified at desktop/mobile in light/dark.');
  } finally {
    clearTimeout(timeout);
    if (ws) ws.close();
    browser.kill();
    if (browser.exitCode === null && browser.signalCode === null) await new Promise(resolve => browser.once('exit', resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
