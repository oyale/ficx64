// Real Chromium regression: swipe to another film, then tap Add once.
// Run python3 build.py first. Requires Node 22+ and chromium (or CHROMIUM_BIN).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
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
    await send('Page.navigate', { url: pathToFileURL(path.join(__dirname, '../dist/index.html')).href });
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!!document.querySelector('#film-list .film-title-line')`)) break;
      await pause(50);
    }
    assert.ok(await evaluate(`!!document.querySelector('#film-list .film-title-line')`), await evaluate(`JSON.stringify({url:location.href,title:document.title,body:document.body?.innerText.slice(0,700)})`));
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d => d.close());document.querySelector('#film-list .film-title-line').click()`);
    const button = () => evaluate(`(() => {
      const b = document.querySelector('dialog[open] .intent-want'), r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: b.dataset.id, selected: b.getAttribute('aria-pressed') };
    })()`);
    const touch = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points });
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
      for (let i = 0; i < 10; i++) {
        const previous = await button();
        await touch('touchStart', [{ x: 300, y: 230 }]);
        for (const x of [260, 210, 150, 80]) await touch('touchMove', [{ x, y: 230 }]);
        await touch('touchEnd', []);
        const next = await button();
        assert.notEqual(next.id, previous.id, 'Horizontal swipe must navigate');
        await touch('touchStart', [{ x: next.x, y: next.y }]);
        await touch('touchEnd', []);
        assert.equal((await button()).selected, next.selected === 'true' ? 'false' : 'true',
          `${theme}: first tap after swipe must toggle Add exactly once`);
      }
    }
    // The compact layout can fit short synopses entirely; use a long one to test scrolling.
    await evaluate(`(() => {
      document.querySelector('dialog[open] .film-detail-close').click();
      const card = [...window.FICX_FILMS]
        .sort((a, b) => (b.synopsis || '').length - (a.synopsis || '').length)
        .map(film => document.querySelector('[data-film-id="' + CSS.escape(film.id) + '"] .film-title-line'))
        .find(Boolean);
      card.click();
    })()`);
    const previous = await button();
    const scrollBefore = await evaluate(`document.querySelector('dialog[open]').scrollTop`);
    await touch('touchStart', [{ x: 200, y: 520 }]);
    for (const y of [480, 430, 380, 300]) await touch('touchMove', [{ x: 200, y }]);
    await touch('touchEnd', []);
    await pause(150);
    assert.equal((await button()).id, previous.id, 'Vertical scroll must not navigate');
    assert.ok(await evaluate(`document.querySelector('dialog[open]').scrollTop`) > scrollBefore,
      'Vertical scrolling must remain available');
    console.log('20/20 first taps after swipe passed (light/dark); vertical scroll preserved');
    // Readability and paragraph layout share the same real mobile dialog.
    async function openFilm(id) {
      await evaluate(`(() => {
        document.querySelector('dialog[open] .film-detail-close')?.click();
        document.querySelector('[data-film-id="${id}"] .film-title-line').click();
      })()`);
      await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    }
    for (const [width, height, id] of [
      [390, 844, 'aquarium'], [375, 667, 'aquarium'],
      [390, 844, 'por-fortuna-o-por-desgracia-tu-nunca-moriras'],
      [320, 667, 'la-libertad-doble'], [390, 844, 'tina'], [1280, 900, 'el-debut'],
    ]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 650 });
      await openFilm(id);
      const result = await evaluate(String.raw`(() => {
        const dialog = document.querySelector('dialog[open]');
        const film = window.FICX_FILMS.find(film => dialog.id === 'film-detail-' + film.id);
        const paragraphs = [...dialog.querySelectorAll('.detail-synopsis')];
        const country = dialog.querySelector('.detail-countryline')?.getBoundingClientRect();
        const link = dialog.querySelector('.film-web-link')?.getBoundingClientRect();
        return {
          size: parseFloat(getComputedStyle(paragraphs[0]).fontSize),
          complete: paragraphs.map(p => p.textContent).join('').replace(/\s/g, '') === film.synopsis.replace(/\s/g, ''),
          paragraphCount: paragraphs.length, expectedCount: film.synopsis.split(/\n\s*\n/).length,
          scroll: dialog.scrollHeight > dialog.clientHeight + 1,
          overflow: dialog.scrollWidth > dialog.clientWidth,
          heading: getComputedStyle(dialog.querySelector('.film-synopsis-heading h4')).display,
          countryOverlap: country && link ? country.right > link.left : false,
        };
      })()`);
      assert.equal(result.complete, true, `${id}: synopsis remains complete`);
      assert.equal(result.paragraphCount, result.expectedCount, `${id}: paragraph boundaries preserved`);
      assert.equal(result.overflow, false, `${id}: no horizontal overflow`);
      if (width <= 650) {
        assert.ok(result.size >= 15 && result.size <= 17, `${id}: readable mobile size`);
        if (result.scroll) assert.equal(result.size, 15, `${id}: minimum size before falling back to scroll`);
        assert.equal(result.heading, 'none', 'Mobile hides the Synopsis label');
        assert.equal(result.countryOverlap, false, 'Countries and official link do not overlap');
      } else assert.notEqual(result.heading, 'none', 'Desktop retains its heading');
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await openFilm('aquarium');
    const fontSize = () => evaluate(`getComputedStyle(document.querySelector('dialog[open] .detail-synopsis')).fontSize`);
    const foldedSize = await fontSize();
    await evaluate(`document.querySelector('dialog[open] .film-screenings-foldout > summary').click()`);
    await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    assert.equal(await fontSize(), foldedSize, 'Unfolding passes does not shrink the synopsis');
    await openFilm('por-fortuna-o-por-desgracia-tu-nunca-moriras');
    await evaluate(`document.documentElement.style.fontSize = '20px';window.dispatchEvent(new Event('resize'))`);
    await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    assert.ok(parseFloat(await fontSize()) >= 18.75, 'Larger root font preferences are respected');
    console.log('Full paragraphs, adaptive font, countries/link layout and font preferences passed');

  } finally {
    clearTimeout(timeout);
    ws?.close();
    if (browser.exitCode === null) {
      const exited = new Promise(resolve => browser.once('exit', resolve));
      browser.kill();
      await exited;
    }
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
