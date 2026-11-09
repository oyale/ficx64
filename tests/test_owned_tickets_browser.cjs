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
    const screening = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/screenings.json'), 'utf8')).screenings.find(item => item.filmIds?.length && item.accessType === "public" && !(item.eventLabels || []).some(label => ["ENTRADA LIBRE", "ACCESO LIBRE", "ACTO DE INAUGURACIÓN", "ACTO DE CLAUSURA"].includes(label)));
    assert.ok(screening, 'fixture must include a film screening');
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('ficx64-planned-screenings-v1', ${JSON.stringify(JSON.stringify(Object.fromEntries(screening.filmIds.map(id => [id, screening.candidateId]))))})` });
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: pathToFileURL(path.join(__dirname, '../dist/index.html')).href });
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!!document.querySelector('#film-list .film-title-line')`)) break;
      await pause(50);
    }
    assert.ok(await evaluate(`!!document.querySelector('#film-list .film-title-line')`), 'app should open');
    assert.equal(await evaluate(`document.querySelector('#ticket-intro').open`), true, 'first visit should show the feature intro');
    assert.match(await evaluate(`document.querySelector('#ticket-intro').innerText`), /recordatorio personal/i);
    const introSize = await evaluate(`(() => { const r = document.querySelector('#ticket-intro').getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:r.height,viewport:innerHeight}; })()`);
    assert.ok(introSize.top >= 0 && introSize.bottom <= introSize.viewport && introSize.height > 0, `intro should fit the mobile viewport: ${JSON.stringify(introSize)}`);
    await evaluate(`document.querySelector('#ticket-intro-program').click()`);
    assert.equal(await evaluate(`document.querySelector('#ticket-intro').open`), false, 'primary action should close the intro');
    assert.equal(await evaluate(`document.querySelector('#screen-program').hidden`), false, 'primary action should open Mi programa');
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!!document.querySelector('#program-agenda .program-ticket-toggle')`)) break;
      await pause(50);
    }
    const selector = `#program-agenda [data-program-action="toggle-owned-ticket"][data-candidate-id="${screening.candidateId}"]`;
    assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`), 1);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-pressed')`), 'false');
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-pressed')`), 'true');
    assert.match(await evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`), /Tengo entrada/);
    assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('ficx64-owned-tickets-v1'))`), [screening.candidateId]);
    // The shared plan button in film details must reflect ticket ownership.
    const quickSelector = `dialog[open] [data-quick-action="plan"][data-candidate="${screening.candidateId}"]`;
    const checkQuickLabel = async expected => {
      await evaluate(`document.querySelector('#program-agenda [data-open-film]').click()`);
      await evaluate(`document.querySelector('dialog[open] .film-screenings-foldout').open=true`);
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(quickSelector)}).textContent`), expected);
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(quickSelector)}).getAttribute('aria-pressed')`), 'true');
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(quickSelector)}).disabled`), expected === '✓ Con entrada');
      if (expected === '✓ Con entrada') {
        await evaluate(`document.querySelector(${JSON.stringify(quickSelector)}).click()`);
        assert.equal(await evaluate(`Object.values(JSON.parse(localStorage.getItem('ficx64-planned-screenings-v1'))).includes(${JSON.stringify(screening.candidateId)})`), true, 'disabled Con entrada action must preserve the planned pass');
      }
      await evaluate(`document.querySelector('dialog[open] .film-detail-close').click()`);
    };
    await checkQuickLabel('✓ Con entrada');

    await send('Page.reload');
    await pause(300);
    assert.equal(await evaluate(`document.querySelector('#ticket-intro').open`), false, 'intro should stay dismissed on later visits');
    await evaluate(`document.querySelector('#go-program').click()`);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-pressed')`), 'true', 'mark persists after reload');
    const targetSize = await evaluate(`({height:document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().height,width:innerWidth,media:matchMedia('(max-width: 650px)').matches})`);
    assert.ok(targetSize.media && targetSize.height >= 44, `mobile touch target must be at least 44px: ${JSON.stringify(targetSize)}`);
    await send('Emulation.setDeviceMetricsOverride', {width:320,height:740,deviceScaleFactor:1,mobile:true});
    const narrowTargetSize = await evaluate(`({height:document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().height,width:document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().width})`);
    assert.ok(narrowTargetSize.width >= 44 && narrowTargetSize.height >= 44, `narrow mobile touch target must remain at least 44px: ${JSON.stringify(narrowTargetSize)}`);
    for (const width of [320, 374, 390, 650]) {
      await send('Emulation.setDeviceMetricsOverride', {width,height:844,deviceScaleFactor:1,mobile:true});
      const overflow = await evaluate(`Array.from(document.querySelectorAll('#program-agenda .program-event')).flatMap(card => {
        const bounds = card.getBoundingClientRect();
        return Array.from(card.querySelectorAll('.program-event-actions button')).filter(button => {
          const rect = button.getBoundingClientRect();
          return rect.bottom > bounds.bottom || rect.right > bounds.right || rect.top < bounds.top;
        }).map(button => button.className);
      })`);
      assert.deepEqual(overflow, [], `actions must fit inside cards at ${width}px`);
    }
    for (const width of [390,700,900,1100,1280]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      const colors = await evaluate(`(() => {const b=document.querySelector(${JSON.stringify(selector)});const before=getComputedStyle(b).backgroundColor; b.click(); return {before,after:getComputedStyle(b).backgroundColor,pressed:b.getAttribute('aria-pressed')};})()`);
      assert.notEqual(colors.before, colors.after, `ticket state must change color at ${width}px: ${JSON.stringify(colors)}`);
    }
    await evaluate(`(() => {const b=document.querySelector(${JSON.stringify(selector)}); if(b.getAttribute('aria-pressed')!=='true')b.click();})()`);
    assert.equal(await evaluate(`document.querySelector('#program-ticket-filter').textContent`),'Entradas: todas');
    await evaluate(`document.querySelector('#program-ticket-filter').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('#program-agenda .program-event').length`),1);
    assert.equal(await evaluate(`document.querySelector('#program-ticket-filter').textContent`),'Entradas: con entrada');
    await evaluate(`document.querySelector('#program-ticket-filter').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('#program-agenda .program-event').length`),0);
    assert.equal(await evaluate(`document.querySelector('#program-ticket-filter').textContent`),'Entradas: sin entrada');
    await evaluate(`document.querySelector('#program-ticket-filter').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('#program-agenda .program-event').length`),1);
    for (const width of [320,390,650,900,1280]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=650});
      const positions=[];
      for (let state=0;state<3;state++) {
        positions.push(await evaluate(`(() => {const r=document.querySelector('#program-transport').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};})()`));
        await evaluate(`document.querySelector('#program-ticket-filter').click()`);
      }
      assert.deepEqual(positions[0],positions[1],`transport must stay still at ${width}px`);
      assert.deepEqual(positions[1],positions[2],`transport must stay still at ${width}px`);
      await evaluate(`document.querySelector('.program-toolbar').scrollIntoView();window.scrollBy(0,-80)`);
      await pause(100);
      const shot=await send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(`/tmp/ficx-toolbar-${width}.png`,Buffer.from(shot.data,'base64'));
    }
    // The separate remove action in Mi parrilla remains available, with its existing confirmation.
    const removeSelector = `#program-agenda [data-program-action="remove-program-screening"][data-candidate-id="${screening.candidateId}"]`;
    await evaluate(`document.querySelector(${JSON.stringify(removeSelector)}).click()`);
    assert.match(await evaluate(`document.querySelector(${JSON.stringify(removeSelector)}).getAttribute('aria-label')`), /Confirmar/);
    await evaluate(`document.querySelector(${JSON.stringify(removeSelector)}).click()`);
    assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(removeSelector)}).length`), 0, 'Mi parrilla remove action must still remove a ticket-owned pass');
    assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('ficx64-owned-tickets-v1'))`), [screening.candidateId], 'removing a pass from Mi parrilla must preserve ticket ownership');
  } finally {
    clearTimeout(timeout);
    if (ws) ws.close();
    browser.kill();
    if (browser.exitCode === null && browser.signalCode === null) await new Promise(resolve => browser.once('exit', resolve));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
