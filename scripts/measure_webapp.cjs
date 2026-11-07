#!/usr/bin/env node
// Local, repeatable interaction and layout-shift measurements for the built PWA.
// Usage: node scripts/measure_webapp.cjs [url] [output.json]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

const url = process.argv[2] || 'http://127.0.0.1:18766/';
const output = process.argv[3] || path.join(os.tmpdir(), 'ficx-webapp-measurement.json');
const filmData = require('../data/films.json').films;
const screeningData = require('../data/screenings.json').screenings;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ficx-measure-'));
const downloads = path.join(profile, 'downloads');
fs.mkdirSync(downloads);

const pickedScreening = screeningData.find(s => s.filmIds?.length && s.candidateId);
const pickedFilmId = pickedScreening?.filmIds?.[0];
const seed = process.env.FICX_NO_SEED ? {} : pickedFilmId ? {
  'ficx64-planned-screenings-v1': JSON.stringify({[pickedFilmId]: pickedScreening.candidateId}),
  'ficx64-film-intentions-v2': JSON.stringify({[pickedFilmId]: 'want'}),
} : {};

(async () => {
  const browser = spawn(process.env.CHROMIUM_BIN || 'chromium', [
    '--headless', '--no-sandbox', '--disable-gpu', '--disable-extensions',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], {stdio: ['ignore', 'ignore', 'pipe']});
  let ws;
  const timeout = setTimeout(() => { browser.kill(); process.exitCode = 1; }, 90000);
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
      pending.set(id, {resolve, reject});
      ws.send(JSON.stringify({id, method, params}));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const waitFor = async (expression, timeoutMs = 10000) => {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        if (await evaluate(expression)) return true;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return false;
    };
    const click = async selector => {
      const clicked = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return false; e.scrollIntoView({block:'center',inline:'nearest'}); e.click(); return true; })()`);
      if (!clicked) throw new Error(`No target for ${selector}`);
    };
    const settle = async () => evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    const action = async (name, operation, settled) => {
      const start = Date.now();
      await operation();
      const stateSettled = settled ? await waitFor(settled, 10000) : true;
      await settle();
      const state = await evaluate(`({dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id),screen:[...document.querySelectorAll('.app-screen')].filter(e=>!e.hidden).map(e=>e.id),active:document.activeElement?.id||document.activeElement?.tagName,query:document.querySelector('#search-input')?.value,rows:document.querySelectorAll('#film-list .film-row').length,pressed:document.querySelectorAll('#featured-sections [aria-pressed="true"]').length,detail:!!document.querySelector('#film-list dialog.film-expanded[open]')})`);
      return {name, actionToTwoFramesMs: Date.now() - start, stateSettled, state};
    };

    await send('Page.enable');
    await send('Runtime.enable');
    if (process.env.FICX_CPU_SLOWDOWN) {
      await send('Emulation.setCPUThrottlingRate', {rate: Number(process.env.FICX_CPU_SLOWDOWN)});
    }
    await send('Emulation.setDeviceMetricsOverride', {width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true});
    await send('Page.addScriptToEvaluateOnNewDocument', {source: `
      try { for (const [k,v] of Object.entries(${JSON.stringify(seed)})) localStorage.setItem(k,v); } catch (_) {}
      window.__ficxMeasure = {layoutShifts: [], longTasks: [], eventTimings: []};
      try { new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__ficxMeasure.layoutShifts.push({value:e.value,startTime:e.startTime,sources:(e.sources||[]).map(s=>({node:s.node?{tag:s.node.tagName,id:s.node.id,className:typeof s.node.className==='string'?s.node.className:'',text:s.node.textContent?.slice(0,90)}:null,previousRect:s.previousRect,currentRect:s.currentRect}))}); }).observe({type:'layout-shift',buffered:true}); } catch (_) {}
      try { new PerformanceObserver(list => { for (const e of list.getEntries()) window.__ficxMeasure.longTasks.push({startTime:e.startTime,duration:e.duration,attribution:(e.attribution||[]).map(a=>({containerType:a.containerType,containerName:a.containerName,containerSrc:a.containerSrc}))}); }).observe({type:'longtask',buffered:true}); } catch (_) {}
      try { new PerformanceObserver(list => { for (const e of list.getEntries()) window.__ficxMeasure.eventTimings.push({name:e.name,duration:e.duration,interactionId:e.interactionId,target:e.target?.id||e.target?.className||e.target?.tagName}); }).observe({type:'event',buffered:true,durationThreshold:16}); } catch (_) {}
    `});
    await send('Page.navigate', {url});
    if (!await waitFor(`document.readyState === 'complete' && document.querySelectorAll('#film-list .film-row').length > 0`, 30000)) {
      throw new Error(`App did not finish rendering: ${await evaluate(`JSON.stringify({title:document.title,readyState:document.readyState,rows:document.querySelectorAll('#film-list .film-row').length})`)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1200));
    const initial = await evaluate(`(() => ({
      title:document.title, renderedFilmCount:document.querySelectorAll('#film-list .film-row').length,
      totalFilmCount:Number(document.querySelector('#browse-count')?.textContent||0),
      dialogOpen:[...document.querySelectorAll('dialog[open]')].map(d=>d.id),
      nav:{fcp:performance.getEntriesByType('paint').find(e=>e.name==='first-contentful-paint')?.startTime||null,
        domInteractive:performance.timing.domInteractive-performance.timing.navigationStart,
        domContentLoaded:performance.timing.domContentLoadedEventEnd-performance.timing.navigationStart,
        load:performance.timing.loadEventEnd-performance.timing.navigationStart},
      resources:performance.getEntriesByType('resource').map(e=>({name:e.name.split('/').pop(),transferSize:e.transferSize,encodedBodySize:e.encodedBodySize,decodedBodySize:e.decodedBodySize,duration:e.duration})),
      shifts:window.__ficxMeasure.layoutShifts,longTasks:window.__ficxMeasure.longTasks,
      memory:performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize}:null,
    }))()`);

    const results = [];
    if (await evaluate(`!!document.querySelector('#ticket-intro[open]')`)) {
      results.push(await action('dismiss-ticket-intro', () => click('#ticket-intro-dismiss'), `!document.querySelector('#ticket-intro')?.open`));
    }
    if (await evaluate(`!!document.querySelector('#wizard-skip') && document.querySelector('#wizard')?.open`)) {
      results.push(await action('dismiss-first-run-wizard', () => click('#wizard-skip'), `!document.querySelector('#wizard')?.open`));
    }
    const rowCountBeforeSearch = await evaluate(`Number(document.querySelector('#browse-count').textContent)`);
    results.push(await action('search-type-query', async () => {
      await evaluate(`(() => { const e=document.querySelector('#search-input'); e.focus(); e.value='francia'; e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    }, `document.querySelector('#search-input').value === 'francia' && Number(document.querySelector('#browse-count').textContent) < ${rowCountBeforeSearch}`));
    const found = await evaluate(`document.querySelectorAll('#film-list .film-row').length`);
    results[results.length - 1].matchingRows = found;
    results[results.length - 1].totalMatchingRows = await evaluate(`Number(document.querySelector('#browse-count').textContent)`);
    await click('#search-input');
    await send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Control', code: 'ControlLeft', modifiers: 2});
    await send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2});
    await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2});
    await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Control', code: 'ControlLeft'});
    await send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Backspace', code: 'Backspace'});
    await send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Backspace', code: 'Backspace'});
    await settle();
    if (await evaluate(`!!document.querySelector('#featured-sections [data-section]')`)) {
      const beforeSelected = await evaluate(`document.querySelector('#featured-sections [aria-pressed="true"]')?.dataset.section || ''`);
      results.push(await action('filter-by-featured-section', () => click('#featured-sections [data-section]'), `document.querySelector('#featured-sections [aria-pressed="true"]')?.dataset.section !== ${JSON.stringify(beforeSelected)}`));
      await click('#featured-sections [data-section]');
    }
    await settle();
    results.push(await action('open-first-film-detail', () => click('#film-list .film-row'), `!!document.querySelector('#film-list dialog.film-expanded[open]')`));
    results[results.length - 1].visibleDetail = await evaluate(`!!document.querySelector('#film-list dialog.film-expanded[open]')`);
    if (await evaluate(`!!document.querySelector('#film-list dialog.film-expanded[open] .film-detail-close')`)) {
      await click('#film-list dialog.film-expanded[open] .film-detail-close');
      await settle();
    }
    results.push(await action('navigate-to-screenings', () => click('.nav-link[data-screen="sessions"]'), `!document.querySelector('#screen-sessions').hidden`));
    results.push(await action('navigate-to-programme', () => click('#go-program'), `!document.querySelector('#screen-program').hidden`));
    const planCount = await evaluate(`document.querySelectorAll('#program-agenda .program-event').length`);
    const report = {
      capturedAt: new Date().toISOString(), url, browser: process.env.CHROMIUM_BIN || 'chromium',
      viewport: {width: 412, height: 823, deviceScaleFactor: 1.75}, seed: pickedScreening ? {filmId: pickedFilmId, candidateId: pickedScreening.candidateId} : null,
      initial, interactions: results, programmeEvents: planCount,
      final: await evaluate(`({layoutShifts:window.__ficxMeasure.layoutShifts,longTasks:window.__ficxMeasure.longTasks,eventTimings:window.__ficxMeasure.eventTimings,usedJSHeapSize:performance.memory?.usedJSHeapSize||null})`),
    };
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({output,initialDialogs:initial.dialogOpen,filmCount:initial.filmCount,shifts:initial.shifts,interactions:results,longTasks:report.final.longTasks,programmeEvents:planCount}, null, 2));
  } finally {
    clearTimeout(timeout);
    ws?.close();
    if (browser.exitCode === null && browser.signalCode === null) {
      const exited = new Promise(resolve => browser.once('exit', resolve));
      browser.kill();
      await exited;
    }
    await fs.promises.rm(profile, {recursive: true, force: true, maxRetries: 20, retryDelay: 100});
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
