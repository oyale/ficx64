// Chromium regression for responsive programme controls and mobile poster overlays.
// Run python3 build.py first. Requires Node 22+ and chromium (or CHROMIUM_BIN).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ficx-card-poster-'));
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
    const film = id => JSON.parse(fs.readFileSync(path.join(__dirname, '../data/films.json'), 'utf8')).films.find(item => item.id === id);
    const withImage = film(filmWithImageId());
    const withoutImage = film(filmWithoutImageId());
    assert.ok(withImage?.imageUrl && withoutImage, 'fixture film should include a remote poster');
    const screenings = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/screenings.json'), 'utf8')).screenings;
    const restricted = screenings.find(item => item.accessType === 'restricted' && item.filmIds?.length);
    const publicPass = screenings.find(item => item.accessType === 'public' && item.filmIds?.length);
    assert.ok(restricted && publicPass, 'fixtures need public and restricted passes');
    const planned = Object.fromEntries([...restricted.filmIds, ...publicPass.filmIds].map(id => [id, id === publicPass.filmIds[0] ? publicPass.candidateId : restricted.candidateId]));
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('ficx64-planned-screenings-v1', ${JSON.stringify(JSON.stringify(planned))});localStorage.setItem('ficx64-remote-images-enabled-v1','false')` });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: pathToFileURL(path.join(__dirname, '../dist/index.html')).href });
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!!document.querySelector('#film-list .film-title-line')`)) break;
      await pause(50);
    }
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d => d.close());document.querySelector('#go-program').click()`);
    const counterColor = await evaluate(`getComputedStyle(document.querySelector('#wanted-unplanned-count')).color`);
    assert.notEqual(counterColor, 'rgb(255, 255, 255)', `programme list counter should contrast with its pale background: ${counterColor}`);
    const controlState = async (selector) => evaluate(`(() => {const card=document.querySelector(${JSON.stringify(selector)});const control=card?.querySelector('.program-event-control');const info=control?.querySelector('.program-access-help > summary');const ticket=control?.querySelector('.program-ticket-toggle');const time=card?.querySelector('.program-event-time');const body=card?.querySelector('.program-event-body');const actions=card?.querySelector('.program-event-actions');const cr=card?.getBoundingClientRect(),ir=info?.getBoundingClientRect(),tr=ticket?.getBoundingClientRect(),hr=time?.getBoundingClientRect(),br=body?.getBoundingClientRect(),ar=actions?.getBoundingClientRect(),pr=control?.getBoundingClientRect();return {card:cr&&{left:cr.left,right:cr.right,top:cr.top,bottom:cr.bottom},info:ir&&{left:ir.left,right:ir.right,top:ir.top,bottom:ir.bottom,width:ir.width,height:ir.height},ticket:tr&&{left:tr.left,right:tr.right,top:tr.top,bottom:tr.bottom,width:tr.width,height:tr.height},ticketRadius:ticket&&getComputedStyle(ticket).borderTopLeftRadius,time:hr&&{left:hr.left,right:hr.right,top:hr.top,bottom:hr.bottom},body:br&&{left:br.left,right:br.right,top:br.top,bottom:br.bottom},actions:ar&&{left:ar.left,right:ar.right,top:ar.top,bottom:ar.bottom},control:pr&&{left:pr.left,right:pr.right,top:pr.top,bottom:pr.bottom},height:cr?.height};})()`);
    for (const width of [1440, 1100, 900, 801, 800, 700, 651, 650, 390]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width <= 650 });
      const state = await controlState('#program-agenda .program-event:has(.program-access-help)');
      assert.ok(state.info, `${width}px: access instructions should be present in their pass card`);
      assert.ok(state.info.left >= state.card.left && state.info.right <= state.card.right && state.info.top >= state.card.top && state.info.bottom <= state.card.bottom, `${width}px access control must stay inside its card: ${JSON.stringify(state)}`);
      if (width > 1100) assert.ok(state.height < 180, `desktop card should not grow a controls-only row: ${JSON.stringify(state)}`);
      if (width <= 650) assert.ok(state.info.width >= 36 && state.info.height >= 36, `mobile access trigger should remain comfortably tappable: ${JSON.stringify(state)}`);
      const ticketCard = await controlState('#program-agenda .program-event:has(.program-ticket-toggle)');
      assert.ok(ticketCard.ticket && ticketCard.actions, `${width}px: ticket and action controls should both render`);
      if (width > 800) assert.ok(ticketCard.control.top >= ticketCard.actions.bottom, `desktop ticket control should sit below the actions: ${JSON.stringify(ticketCard)}`);
      if (width >= 651 && width <= 1100) {
        assert.ok(ticketCard.control.top >= ticketCard.actions.bottom, `${width}px: entry controls should follow the action row: ${JSON.stringify(ticketCard)}`);
        assert.ok(ticketCard.body.right < ticketCard.control.left, `${width}px: body text must not enter the controls rail: ${JSON.stringify(ticketCard)}`);
        assert.ok(ticketCard.ticket.width >= 116 && ticketCard.ticket.height === 36, `${width}px: ticket control should match the compact desktop action height: ${JSON.stringify(ticketCard)}`);
        assert.equal(state.info.height, 36, `${width}px: information control should match the ticket control height`);
        assert.notEqual(ticketCard.ticketRadius, '50%', `${width}px: wide ticket button must not inherit the old circular radius: ${JSON.stringify(ticketCard)}`);
        assert.ok(ticketCard.ticket.right <= ticketCard.card.right && ticketCard.ticket.left >= ticketCard.body.right, `${width}px: ticket control should stay in its reserved rail: ${JSON.stringify(ticketCard)}`);
      }
      if (width > 1100) {
        assert.equal(ticketCard.ticket.height, 36, `desktop ticket control should match the information control height: ${JSON.stringify(ticketCard)}`);
        assert.equal((await controlState('#program-agenda .program-event:has(.program-access-help)')).info.height, 36);
      }
      if (width >= 651) {
        const tagHeights = await evaluate(`(() => {const card=document.querySelector('#program-agenda .program-event:has(.program-ticket-toggle)'),flags=card?.querySelector('.program-event-flags');if(!card||!flags)return null;const saved=flags.innerHTML;flags.replaceChildren();const emptyHeight=card.getBoundingClientRect().height;flags.innerHTML='<span class="program-access-tag">Prensa/acreditados</span>';const taggedHeight=card.getBoundingClientRect().height;flags.innerHTML=saved;return {emptyHeight,taggedHeight,display:getComputedStyle(flags).display,visibility:getComputedStyle(flags).visibility,minHeight:parseFloat(getComputedStyle(flags).minHeight)};})()`);
        assert.ok(tagHeights && Math.abs(tagHeights.emptyHeight - tagHeights.taggedHeight) <= 1, `${width}px: access tag presence must not change card height: ${JSON.stringify(tagHeights)}`);
        assert.equal(tagHeights.display, 'flex');
        assert.equal(tagHeights.visibility, 'hidden');
        assert.ok(tagHeights.minHeight >= 20);
      }
      if (width > 1100) {
        assert.equal(await evaluate(`document.querySelector('#program-agenda .program-access-help > summary span').textContent`), 'Entradas', 'desktop information control should use a generic label');
        const infoLayout = await evaluate(`(() => {const s=document.querySelector('#program-agenda .program-access-help > summary'),i=s.querySelector('svg').getBoundingClientRect(),t=s.querySelector('span').getBoundingClientRect();return {width:s.getBoundingClientRect().width,iconCenter:i.top+i.height/2,textCenter:t.top+t.height/2};})()`);
        assert.ok(infoLayout.width >= 108 && infoLayout.width <= 124 && Math.abs(infoLayout.iconCenter-infoLayout.textCenter) <= 1, `desktop access button should be a horizontal pill: ${JSON.stringify(infoLayout)}`);
      }
      if (width <= 650) assert.ok(Math.abs((ticketCard.ticket.left + ticketCard.ticket.right) / 2 - (ticketCard.time.left + ticketCard.time.right) / 2) <= 2 && ticketCard.ticket.top >= ticketCard.time.bottom, `mobile ticket control should be centered under the time: ${JSON.stringify(ticketCard)}`);
      if (width <= 650) {
        await evaluate(`document.querySelector('#program-agenda .program-event:has(.program-access-help) .program-access-help > summary').click()`);
        const panel = await evaluate(`(() => {const r=document.querySelector('#program-agenda .program-access-help > div').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight};})()`);
        assert.ok(panel.left >= 0 && panel.right <= panel.width && panel.top >= 0 && panel.bottom <= panel.height, `mobile access panel must stay inside the viewport: ${JSON.stringify(panel)}`);
        await evaluate(`document.querySelector('#program-agenda .program-event:has(.program-access-help) .program-access-help > summary').click()`);
      }
    }
    const stableActions = await evaluate(`(() => {const card=document.querySelector('#program-agenda .program-event:has(.program-ticket-toggle)'),buttons=[...card.querySelectorAll('.program-event-actions button')];return {card:card.getBoundingClientRect().toJSON(),buttons:buttons.map(button=>button.getBoundingClientRect().toJSON())};})()`);
    await evaluate(`document.querySelector('#program-agenda .program-event:has(.program-ticket-toggle) .program-remove-event').click()`);
    const confirmingActions = await evaluate(`(() => {const card=document.querySelector('#program-agenda .program-event:has(.program-ticket-toggle)'),button=card.querySelector('.program-remove-event'),buttons=[...card.querySelectorAll('.program-event-actions button')];return {card:card.getBoundingClientRect().toJSON(),buttons:buttons.map(item=>item.getBoundingClientRect().toJSON()),label:button.getAttribute('aria-label'),text:button.textContent};})()`);
    assert.deepEqual(confirmingActions.card, stableActions.card, 'mobile remove confirmation must not resize the pass card');
    assert.deepEqual(confirmingActions.buttons, stableActions.buttons, 'mobile remove confirmation must not move the action column');
    assert.match(confirmingActions.label, /Confirmar/);
    assert.equal(confirmingActions.text, '?');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('ficx64-remote-images-enabled-v1','false')` });
    await evaluate(`document.querySelector('#search-input').value='El debut';document.querySelector('#search-input').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#remote-images-toggle').checked=false;document.querySelector('#remote-images-toggle').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-film-id="${withoutImage.id}"] .film-copy').click()`);
    await pause(150);
    const noImage = await evaluate(`(() => {const p=document.querySelector('dialog.film-expanded .film-detail-poster');if(!p)return null;const m=p.querySelector('.poster-mobile-metadata'),s=getComputedStyle(p,'::after');return {hasImage:p.classList.contains('poster-has-image'),gradient:s.backgroundImage,metadataPosition:getComputedStyle(m).position,metadataColor:getComputedStyle(m).color,ink:getComputedStyle(p).getPropertyValue('--poster-ink').trim()};})()`);
    assert.equal(noImage.hasImage, false);
    assert.equal(noImage.gradient, 'none', `poster without an image must not get a dark overlay: ${JSON.stringify(noImage)}`);
    assert.equal(noImage.metadataPosition, 'relative', `poster text without an image should flow in the poster: ${JSON.stringify(noImage)}`);
    assert.notEqual(noImage.metadataColor, 'rgb(255, 255, 255)', `flat poster text should use its tone ink: ${JSON.stringify(noImage)}`);
    await send('Page.navigate', { url: pathToFileURL(path.join(__dirname, '../dist/index.html')).href });
    await pause(300);
    await evaluate(`document.querySelector('#search-input').value='El debut';document.querySelector('#search-input').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#remote-images-toggle').checked=true;document.querySelector('#remote-images-toggle').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-film-id="${withImage.id}"] .film-copy').click()`);
    await pause(150);
    const withPoster = await evaluate(`(() => {const p=document.querySelector('dialog.film-expanded .film-detail-poster');if(!p)return null;const metadata=p.querySelector('.poster-mobile-metadata'),title=metadata.querySelector('h2').getBoundingClientRect(),director=metadata.querySelector(':scope > p').getBoundingClientRect();return {hasImage:p.classList.contains('poster-has-image'),gradient:getComputedStyle(p,'::after').backgroundImage,metadataBackground:getComputedStyle(metadata).backgroundImage,titleDirectorGap:director.top-title.bottom};})()`);
    assert.equal(withPoster.hasImage, true, `film poster should be enabled: ${JSON.stringify(withPoster)}`);
    assert.match(withPoster.gradient, /linear-gradient/);
    assert.match(withPoster.gradient, /0\.58/);
    assert.match(withPoster.gradient, /0\.78/);
    assert.ok(withPoster.titleDirectorGap <= 1, `poster title should sit close to its director: ${JSON.stringify(withPoster)}`);
    assert.equal(withPoster.metadataBackground, 'none', `poster should receive a single overlay: ${JSON.stringify(withPoster)}`);
    console.log('Chromium card/poster checks passed at 1440, 1100, 900, 801, 800, 700, 651, 650 and 390px.');
  } finally {
    clearTimeout(timeout);
    if (ws) ws.close();
    browser.kill();
    if (browser.exitCode === null && browser.signalCode === null) await new Promise(resolve => browser.once('exit', resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

function filmWithImageId() { return 'el-debut'; }
function filmWithoutImageId() { return 'el-debut'; }
