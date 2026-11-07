// Real Chromium download of an itinerary PDF, including a full offline reload.
// Run python3 build.py first. Requires Node 22+ and chromium (or CHROMIUM_BIN).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const downloadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ficx-pdf-download-'));
  const root = path.join(__dirname, '../dist');
  const server = require('node:http').createServer((req,res) => {
    const pathname = new URL(req.url,'http://localhost').pathname;
    const filename = pathname === '/' ? 'index.html' : pathname.slice(1);
    if(filename.includes('..') || !fs.existsSync(path.join(root,filename))) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', filename.endsWith('.js') ? 'application/javascript' : filename.endsWith('.html') ? 'text/html' : filename.endsWith('.webmanifest') ? 'application/manifest+json' : filename.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
    res.end(fs.readFileSync(path.join(root,filename)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const appURL='http://127.0.0.1:'+server.address().port+'/';
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
    assert.equal(await evaluate(`typeof window.FICXItineraryPDF`),'undefined','the PDF engine is not parsed on the initial PWA visit');
    assert.equal(await evaluate(`document.querySelectorAll('script[src$=".js"]').length`),0,'the PDF bundle is not inserted before export');
    const openPdfDialog = async () => {
      await evaluate(`if(document.querySelector('#program-calendar-panel').hidden) document.querySelector('#program-calendar-toggle').click(); document.querySelector('#itinerary-pdf').click()`);
      for(let i=0;i<50 && !await evaluate(`document.querySelector('#alias-dialog').open`);i++) await pause(25);
      assert.equal(await evaluate(`document.querySelector('#alias-dialog').open`),true,
        await evaluate(`JSON.stringify({url:location.href,buttonDisabled:document.querySelector('#itinerary-pdf')?.disabled,feedback:document.querySelector('#settings-calendar-feedback')?.textContent,passCount:document.querySelector('#program-pass-count')?.textContent,portable:!!document.querySelector('#ficx-pdf-bundle'),pdf:typeof FICXItineraryPDF})`));
    };
    const confirmPdf = async name => {
      await openPdfDialog();
      await evaluate(`document.querySelector('#alias-input').value=${JSON.stringify(name)}; document.querySelector('#alias-input').dispatchEvent(new Event('input')); document.querySelector('#alias-accept').click()`);
    };
    assert.equal(await evaluate(`document.querySelector('#itinerary-pdf').disabled`),true,'empty itinerary cannot be exported');
    await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDirectory});
    const screenings=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/screenings.json'),'utf8')).screenings;
    const byDate=[...new Set(screenings.map(s=>s.date))].sort();
    const picked=byDate.slice(0,2).flatMap(date=>screenings.filter(s=>s.date===date && s.filmIds?.length).slice(0,3));
    const shared=screenings.find(s=>s.filmIds?.length>1); if(shared) picked.push(shared);
    const standalone=screenings.find(s=>!(s.filmIds||[]).length);
    const plan=Object.fromEntries(picked.flatMap(s=>s.filmIds.map(id=>[id,s.candidateId])));
    const selectedIds=[...new Set([...Object.values(plan),...(standalone?[standalone.candidateId]:[])])];
    const expected=selectedIds.map(id=>screenings.find(s=>s.candidateId===id));
    await evaluate(`localStorage.setItem('ficx64-planned-screenings-v1',${JSON.stringify(JSON.stringify(plan))});
      localStorage.setItem('ficx64-film-intentions-v2',${JSON.stringify(JSON.stringify(Object.fromEntries(Object.keys(plan).map(id=>[id,'want']))))});
      localStorage.setItem('ficx64-planned-standalone-v1',${JSON.stringify(JSON.stringify(standalone?[standalone.candidateId]:[]))});
      localStorage.setItem('ficx64-alias-v1','Ángela');
      localStorage.setItem('ficx64-transport-mode-v1','walking');
      document.querySelectorAll('dialog[open]').forEach(d=>d.close());`);
    await evaluate('navigator.serviceWorker.ready.then(()=>true)');
    for(let i=0;i<100 && !await evaluate('!!navigator.serviceWorker.controller');i++) await pause(50);
    assert.equal(await evaluate('!!navigator.serviceWorker.controller'),true);
    await send('Network.enable');
    await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await send('Page.reload');
    for(let i=0;i<100;i++) { if(await evaluate(`document.querySelector('#nav-plan-count')?.textContent===${JSON.stringify(String(expected.length))}`)) break; await pause(50); }
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.querySelector('#go-program').click()`);
    assert.equal(await evaluate(`document.querySelector('#program-pass-count').textContent`),String(expected.length));
    await evaluate(`document.querySelector('#program-day-options button[data-program-date]:not([data-program-date=""])')?.click(); document.querySelector('#program-calendar-toggle').click()`);
    assert.equal(await evaluate(`document.querySelector('#itinerary-pdf').disabled`),false);
    for(const [width,height] of [[390,844],[844,390],[1280,800]]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
      await pause(50);
      const bounds=await evaluate(`(() => { const b=document.querySelector('#itinerary-pdf').getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,height:b.height}; })()`);
      assert.ok(bounds.top>=0 && bounds.bottom<=height && bounds.left>=0 && bounds.right<=width,JSON.stringify(bounds));
    }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate(`document.querySelector('#program-calendar-toggle').textContent.includes('Exportar y compartir')`),true);
    assert.equal(await evaluate(`document.querySelector('#clear-planned-screenings').closest('.program-toolbar-options')!==null`),true);
    assert.equal(await evaluate(`document.querySelectorAll('#program-calendar-panel .settings-action svg').length`),3);
    assert.ok(await evaluate(`document.querySelector('.program-export-note').textContent.includes('Ajustes → Exportar tu programa')`));
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#itinerary-pdf'),'::after').content`),'none');
    await openPdfDialog();
    assert.ok(await evaluate(`document.querySelector('#alias-intro').textContent.includes('Tu itinerario')`));
    if(process.env.FICX_PDF_MENU) {
      const shot=await send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(process.env.FICX_PDF_MENU.replace('.png','-name.png'),Buffer.from(shot.data,'base64'));
    }
    await evaluate(`document.querySelector('#alias-cancel').click()`);
    await pause(25);
    assert.equal(fs.readdirSync(downloadDirectory).filter(name=>name.endsWith('.pdf')).length,0,'cancel does not download');
    assert.equal(await evaluate(`document.querySelector('#itinerary-pdf').disabled`),false);
    await confirmPdf('Lucía');
    for(let i=0;i<200 && !fs.readdirSync(downloadDirectory).some(name=>name.endsWith('.pdf'));i++) await pause(50);
    assert.equal(await evaluate(`typeof window.FICXItineraryPDF`),'object','the PDF engine loads on demand');
    const filename=fs.readdirSync(downloadDirectory).find(name=>name.endsWith('.pdf'));
    assert.equal(filename,'ficx64-itinerario-lucia.pdf');
    const pdf=path.join(downloadDirectory,filename);
    const text=require('node:child_process').execFileSync('pdftotext',['-layout',pdf,'-'],{encoding:'utf8'}).replace(/\s+/g,' ');
    assert.ok(text.includes('El itinerario de Lucía'));
    assert.equal(await evaluate(`localStorage.getItem('ficx64-alias-v1')`),'Ángela','PDF name does not replace the app alias');
    assert.ok(text.includes(expected.length+' pases'),'all planned days are exported regardless of the current day filter');
    for(const s of expected) {
      const titles=s.films?.length?s.films.map(f=>f.title):[s.title];
      for(const title of titles.filter(Boolean)) assert.ok(text.includes(title.slice(0,25)),title);
    }
    if(process.env.FICX_PDF_SAMPLE) fs.copyFileSync(pdf,process.env.FICX_PDF_SAMPLE);
    if(process.env.FICX_PDF_MENU) {
      await evaluate(`if(document.querySelector('#program-calendar-panel').hidden) document.querySelector('#program-calendar-toggle').click()`);
      await pause(200);
      const screenshot=await send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(process.env.FICX_PDF_MENU,Buffer.from(screenshot.data,'base64'));
    }
    const plansBefore=await evaluate(`localStorage.getItem('ficx64-planned-screenings-v1')`);
    await evaluate(`window.originalPdfGenerator=FICXItineraryPDF;window.FICXItineraryPDF={create(){throw new Error('test failure')}}`);
    await confirmPdf('Lucía');
    for(let i=0;i<50 && !await evaluate(`document.querySelector('#settings-calendar-feedback').textContent.includes('No se ha podido')`);i++) await pause(25);
    assert.ok(await evaluate(`document.querySelector('#settings-calendar-feedback').textContent.includes('No se ha podido')`));
    assert.equal(await evaluate(`document.querySelector('#itinerary-pdf').disabled`),false);
    assert.equal(await evaluate(`localStorage.getItem('ficx64-planned-screenings-v1')`),plansBefore);
    // The downloaded standalone HTML must not depend on sibling assets or a service worker.
    const portable=path.join(downloadDirectory,'portable.html');
    fs.copyFileSync(path.join(root,'ficx64-portable.html'),portable);
    const seed = `localStorage.setItem('ficx64-planned-screenings-v1',${JSON.stringify(JSON.stringify(plan))});
      localStorage.setItem('ficx64-film-intentions-v2',${JSON.stringify(JSON.stringify(Object.fromEntries(Object.keys(plan).map(id=>[id,'want']))))});
      localStorage.setItem('ficx64-planned-standalone-v1',${JSON.stringify(JSON.stringify(standalone?[standalone.candidateId]:[]))});
      localStorage.setItem('ficx64-alias-v1','Portable');`;
    await send('Page.addScriptToEvaluateOnNewDocument',{source:seed});
    await send('Page.navigate',{url:pathToFileURL(portable).href});
    for(let i=0;i<100;i++) { if(await evaluate(`document.querySelector('#nav-plan-count')?.textContent===${JSON.stringify(String(expected.length))}`)) break; await pause(50); }
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.querySelector('#go-program').click();document.querySelector('#program-calendar-toggle').click()`);
    assert.equal(await evaluate(`typeof window.FICXItineraryPDF`),'undefined','the portable PDF engine remains dormant until export');
    await confirmPdf('');
    for(let i=0;i<200 && !fs.existsSync(path.join(downloadDirectory,'ficx64-itinerario.pdf'));i++) await pause(50);
    assert.equal(await evaluate(`typeof window.FICXItineraryPDF`),'object','the portable HTML activates its embedded PDF engine on demand');
    assert.equal(fs.existsSync(path.join(downloadDirectory,'ficx64-itinerario.pdf')),true,await evaluate(`JSON.stringify({url:location.href,button:document.querySelector('#itinerary-pdf')?.disabled,feedback:document.querySelector('#settings-calendar-feedback')?.textContent,count:document.querySelector('#program-pass-count')?.textContent,pdf:typeof FICXItineraryPDF,alias:localStorage.getItem('ficx64-alias-v1')})`));
    const anonymousText=require('node:child_process').execFileSync('pdftotext',['-layout',path.join(downloadDirectory,'ficx64-itinerario.pdf'),'-'],{encoding:'utf8'});
    assert.ok(anonymousText.includes('Tu itinerario'));
    assert.ok(!anonymousText.includes('Portable'));
    assert.equal(await evaluate(`localStorage.getItem('ficx64-alias-v1')`),'Portable');
    await openPdfDialog();
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await pause(50);
    assert.equal(await evaluate(`document.querySelector('#alias-dialog').open`),false);
    assert.equal(await evaluate(`document.querySelector('#itinerary-pdf').disabled`),false,'Escape after a previous export cancels safely');
    console.log('Chromium: actual PDFs downloaded after an offline reload and from isolated portable HTML; all days, shared screenings and activities included; error recovery preserves the plan; button fits 3 viewport sizes');
  } finally {
    server.closeAllConnections(); server.close();
    await fs.promises.rm(downloadDirectory,{recursive:true,force:true,maxRetries:20,retryDelay:100});
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
