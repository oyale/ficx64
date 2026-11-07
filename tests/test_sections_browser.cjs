// Real Chromium regression for cumulative film section filters.
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
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d => d.close())`);
    assert.equal(await evaluate(`document.querySelectorAll('#film-list > li').length`),36,'the first catalogue batch stays small');
    assert.equal(await evaluate(`document.querySelector('#browse-count').textContent`),'224','the heading retains the full result count');
    assert.equal(await evaluate(`document.querySelector('#film-list-more').hidden`),false,'mobile keeps an accessible manual fallback');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#film-list-more')).position`),'absolute','mobile hides the manual fallback visually');
    await evaluate(`document.querySelector('#film-list-more').focus()`);
    assert.equal(await evaluate(`document.activeElement.id`),'film-list-more','show-more control is reachable by keyboard');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
    assert.ok(await evaluate(`document.querySelectorAll('#film-list > li').length`) >= 72,'keyboard fallback loads the next batch');
    const beforeAutomaticLoad = await evaluate(`document.querySelectorAll('#film-list > li').length`);
    await evaluate(`document.querySelector('#film-list-progress').scrollIntoView({block:'end'});`);
    for (let i=0;i<40;i++) {
      if (await evaluate(`document.querySelectorAll('#film-list > li').length`) > beforeAutomaticLoad) break;
      await pause(50);
    }
    assert.ok(await evaluate(`document.querySelectorAll('#film-list > li').length`) > beforeAutomaticLoad,'approaching the end loads another mobile batch automatically');
    await evaluate(`window.scrollTo({top:0,behavior:'instant'});`);
    await evaluate(`document.querySelector('#search-input').value='francia';document.querySelector('#search-input').dispatchEvent(new Event('input'));`);
    assert.equal(await evaluate(`document.querySelectorAll('#film-list > li').length`),36,'search shows the first batch of matches');
    assert.match(await evaluate(`document.querySelector('#film-list-progress').textContent`),/36 de 60 películas/);
    await evaluate(`document.querySelector('#clear-filters').click()`);
    assert.equal(await evaluate(`document.querySelector('#section-subfilters').hidden`),true,'refinements start collapsed');
    const openRefinements = () => evaluate(`if(document.querySelector('#toggle-refinements').getAttribute('aria-expanded')==='false') document.querySelector('#toggle-refinements').click()`);
    assert.equal(await evaluate(`!!document.querySelector('.search-icon svg circle') && !!document.querySelector('.search-icon svg path')`),true,'search uses a magnifying-glass icon');
    const choose = name => evaluate(`document.querySelector('#featured-sections button[data-section="${name}"]').click()`);
    const renderAllMatches = () => evaluate(`(() => { const button=document.querySelector('#film-list-more'); let batches=0; while(!button.hidden && batches++<20) button.click(); })()`);
    const check = async names => {
      await renderAllMatches();
      const actual = await evaluate(`Array.from(document.querySelectorAll('#film-list > li'), row => row.dataset.filmId).sort()`);
      const expected = await evaluate(`window.FICX_FILMS.filter(f => ${JSON.stringify(names)}.length === 0 || f.sections.some(s => ${JSON.stringify(names)}.includes(s))).map(f=>f.id).sort()`);
      assert.deepEqual(actual, expected);
      assert.equal(new Set(actual).size, actual.length, 'a film in several sections appears once');
      const selected = await evaluate(`Array.from(document.querySelectorAll('#featured-sections [aria-pressed="true"]'), b=>b.dataset.section).sort()`);
      assert.deepEqual(selected, [...names].sort());
    };
    const checkCountrySearch = async () => {
      for (const sections of [[], ['Albar', 'Retueyos']]) {
        await evaluate(`document.querySelector('#clear-filters').click()`);
        for (const section of sections) await choose(section);
        await evaluate(`document.querySelector('#search-input').value='  fRaNcIa  '; document.querySelector('#search-input').dispatchEvent(new Event('input'));`);
        await renderAllMatches();
        const actual = await evaluate(`Array.from(document.querySelectorAll('#film-list > li'),row=>row.dataset.filmId).sort()`);
        const expected = await evaluate(`window.FICX_FILMS.filter(f =>
          (${JSON.stringify(sections)}.length===0 || f.sections.some(s=>${JSON.stringify(sections)}.includes(s))) &&
          [f.title, ...(f.directors||[]), ...(f.countries||[]), ...(f.sections||[])].join(' ').toLocaleLowerCase('es').includes('francia')
        ).map(f=>f.id).sort()`);
        assert.ok(expected.length > 0, 'country fixture must return films');
        assert.deepEqual(actual,expected);
      }
      await evaluate(`document.querySelector('#clear-filters').click()`);
      await check([]);
    };
    const checkShortFilmSubsets = async () => {
      await openRefinements();
      await evaluate(`document.querySelector('#clear-filters').click()`);
      const subsets = ['Catalyst Shorts', 'Asturies Curtiumetraxes', 'La Noche del Corto Español', 'Sección Oficial Cortometrajes'];
      const toggle = name => evaluate(`document.querySelector('#section-subfilters input[data-subfilter="${name}"]').click()`);
      const isChecked = name => evaluate(`document.querySelector('#section-subfilters input[data-subfilter="${name}"]').checked`);
      await toggle('Cortometrajes');
      for (const name of ['Cortometrajes',...subsets]) assert.equal(await isChecked(name),false);
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('#film-list > li')).some(row=> window.FICX_FILMS.find(f=>f.id===row.dataset.filmId).sections.includes('Cortometrajes'))`),false);
      await toggle(subsets[0]);
      assert.equal(await isChecked('Cortometrajes'),true);
      assert.equal(await isChecked(subsets[0]),true);
      for (const name of subsets.slice(1)) assert.equal(await isChecked(name),false);
      await toggle('Cortometrajes');
      await toggle('Cortometrajes');
      for (const name of ['Cortometrajes',...subsets]) assert.equal(await isChecked(name),true);
      await check([]);
    };
    const refineAll = async () => {
      await openRefinements();
      assert.equal(await evaluate(`document.querySelector('#section-subfilters').hidden`), false);
      const name = await evaluate(`(() => {
        const input = document.querySelector('#section-subfilters input');
        if(!input) throw new Error('Missing all-films refinements');
        const name=input.dataset.subfilter; input.checked=false;
        input.dispatchEvent(new Event('change',{bubbles:true})); return name;
      })()`);
      await renderAllMatches();
      const actual = await evaluate(`Array.from(document.querySelectorAll('#film-list > li'),row=>row.dataset.filmId).sort()`);
      const expected = await evaluate(`window.FICX_FILMS.filter(f=>!f.sections.includes(${JSON.stringify(name)})).map(f=>f.id).sort()`);
      assert.deepEqual(actual,expected);
      assert.equal(await evaluate(`document.querySelector('#section-subfilters input[data-subfilter="${name}"]').checked`),false);
      await evaluate(`document.querySelector('#section-subfilters input[data-subfilter="${name}"]').click()`);
      await check([]);
      // With no search matches there is nothing to refine; clearing search restores it.
      await evaluate(`document.querySelector('#search-input').value='zzzz-no-film'; document.querySelector('#search-input').dispatchEvent(new Event('input'));`);
      assert.equal(await evaluate(`document.querySelector('#section-subfilters').hidden`),true);
      await evaluate(`document.querySelector('#clear-filters').click()`);
      assert.equal(await evaluate(`document.querySelector('#section-subfilters').hidden`),false);
    };
    for (const [width,height] of [[390,844],[844,390],[1280,800]]) {
      await send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<900});
      await evaluate(`document.querySelector('#clear-filters').click()`);
      await check([]);
      await refineAll();
      await checkCountrySearch();
      await checkShortFilmSubsets();
      await choose('Albar');
      await check(['Albar']);
      assert.equal(await evaluate(`document.querySelector('#section-subfilters').hidden`), false);
      await choose('Retueyos');
      await check(['Albar','Retueyos']);
      assert.ok(await evaluate(`document.querySelectorAll('#section-subfilters .section-subfilter-group').length`) >= 1);
      await choose('Sección Oficial');
      await check(['Albar','Retueyos','Sección Oficial']);
      await choose('Retueyos');
      await check(['Albar','Sección Oficial']);
      const extra = await evaluate(`document.querySelector('#more-sections option[value]:not([value=""])').value`);
      await evaluate(`var select = document.querySelector('#more-sections'); select.value=${JSON.stringify(extra)}; select.dispatchEvent(new Event('change'));`);
      await check(['Albar','Sección Oficial',extra]);
      await choose(extra);
      await check(['Albar','Sección Oficial']);
      const chips = await evaluate(`Array.from(document.querySelectorAll('#section-subfilters label'), label => ({name: label.querySelector('input').dataset.subfilter, count:Number(label.querySelector('b').textContent)}))`);
      assert.equal(new Set(chips.map(chip=>chip.name)).size,chips.length,'each refinement appears once');
      assert.equal(await evaluate(`document.querySelectorAll('#section-subfilters .section-subfilter-group').length`),1);
      for (const chip of chips) {
        const expectedCount = await evaluate(`window.FICX_FILMS.filter(f=> ['Albar','Sección Oficial'].some(s=>f.sections.includes(s)) && f.sections.includes(${JSON.stringify(chip.name)})).length`);
        assert.equal(chip.count,expectedCount,'films shared by selected sections count once');
      }
      // A refinement applies once to the union of selected sections.
      const subfilter = await evaluate(`(() => {
        const input = document.querySelector('#section-subfilters input');
        if(!input) return null;
        const details={excluded:input.dataset.subfilter};
        input.checked=false; input.dispatchEvent(new Event('change',{bubbles:true})); return details;
      })()`);
      if (subfilter) {
        const actual = await evaluate(`Array.from(document.querySelectorAll('#film-list > li'), row => row.dataset.filmId).sort()`);
        const expected = await evaluate(`window.FICX_FILMS.filter(f=> ['Albar','Sección Oficial'].some(s=>f.sections.includes(s)) && !f.sections.includes(${JSON.stringify(subfilter.excluded)})).map(f=>f.id).sort()`);
        assert.deepEqual(actual,expected);
      }
      await evaluate(`document.querySelector('#search-input').value='zzzz-no-film'; document.querySelector('#search-input').dispatchEvent(new Event('input'));`);
      assert.equal(await evaluate(`document.querySelectorAll('#film-list > li').length`),0);
      await evaluate(`document.querySelector('#clear-filters').click()`);
      await check([]);
      await choose('Albar'); await choose('Retueyos');
      await evaluate(`document.querySelector('#show-all-sections').click()`);
      await check([]);
    }
    await send('Emulation.setDeviceMetricsOverride', {width:1280,height:800,deviceScaleFactor:1,mobile:false});
    await evaluate(`document.querySelector('#clear-filters').click(); window.scrollTo({top:0,behavior:'instant'});
      window.sectionScrollCalls=0; window.originalScrollIntoView=Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView=function(...args) { window.sectionScrollCalls++; return window.originalScrollIntoView.apply(this,args); };`);
    assert.equal(await evaluate(`document.querySelectorAll('#film-list > li').length`),224,'desktop renders the complete catalogue immediately');
    assert.equal(await evaluate(`document.querySelector('#film-list-more').hidden`),true,'desktop hides the mobile loading fallback');
    await choose('Albar'); await choose('Sección Oficial');
    await pause(400);
    assert.equal(await evaluate('window.sectionScrollCalls'),0,'desktop selection must not jump to results');
    assert.equal(await evaluate('window.scrollY'),0,'desktop viewport stays at the section picker');
    await check(['Albar','Sección Oficial']);
    await send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
    await choose('Retueyos');
    assert.equal(await evaluate('window.sectionScrollCalls'),0,'mobile selection must not jump to results');
    await send('Emulation.setDeviceMetricsOverride', {width:1280,height:800,deviceScaleFactor:1,mobile:false});
    await evaluate(`document.querySelector('#clear-filters').click(); document.querySelectorAll('dialog[open]').forEach(d=>d.close());`);
    await evaluate(`document.querySelector('#clear-filters').click()`);
    await renderAllMatches();
    assert.equal(await evaluate(`document.querySelectorAll('#film-list .film-card-countries').length`),0,'the obsolete country-credit widget is absent from current cards');
    await choose('Albar');
    assert.equal(await evaluate(`document.querySelectorAll('#featured-sections .section-card-selection').length`),0,'section cards have no checkboxes');
    assert.ok(await evaluate(`parseFloat(getComputedStyle(document.querySelector('#featured-sections [aria-pressed="true"]')).outlineWidth) >= 2`));
    for (const mode of ['duration-asc','duration-desc']) {
      await evaluate(`document.querySelector('#clear-filters').click(); document.querySelector('#sort-order').value=${JSON.stringify(mode)}; document.querySelector('#sort-order').dispatchEvent(new Event('change'));`);
      await renderAllMatches();
      const durations = await evaluate(`Array.from(document.querySelectorAll('#film-list > li'),row=>window.FICX_FILMS.find(f=>f.id===row.dataset.filmId).durationMinutes).filter(n=>Number.isFinite(n)&&n>0)`);
      assert.ok(durations.length>1);
      assert.deepEqual(durations,[...durations].sort((a,b)=>mode==='duration-asc'?a-b:b-a));
    }
    await evaluate(`document.querySelector('#sort-order').value='title';document.querySelector('#sort-order').dispatchEvent(new Event('change'));window.scrollTo({top:0,behavior:'instant'});`);
    for (const [width,height] of [[320,740],[390,844],[727,900],[1280,900]]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
      await evaluate(`document.querySelector('#clear-filters').click(); document.querySelector('#toggle-refinements').click();`);
      if(await evaluate(`document.querySelector('#toggle-refinements').getAttribute('aria-expanded')`)==='true') await evaluate(`document.querySelector('#toggle-refinements').click()`);
      const geometry=await evaluate(`(() => { const bar=document.querySelector('.filters').getBoundingClientRect(), search=document.querySelector('.search-box').getBoundingClientRect();
        return {bar:bar.width,search:search.width,overflow:document.documentElement.scrollWidth>window.innerWidth, controls:Array.from(document.querySelectorAll('.filter-actions button,.filter-actions select'),el=>el.getBoundingClientRect().height)}; })()`);
      assert.ok(Math.abs(geometry.bar-geometry.search)<1,'search has the full toolbar width');
      assert.equal(geometry.overflow,false,'controls do not overflow the viewport');
      assert.ok(geometry.controls.every(h=>h>=44),'controls have touch targets');
      await openRefinements();
      await evaluate(`document.querySelector('#section-subfilters input[data-subfilter="Cortometrajes"]').click()`);
      assert.equal(await evaluate(`document.querySelector('#section-subfilters').hidden`),false,'editing preserves the expanded panel');
      await evaluate(`document.querySelector('#section-subfilters input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
      assert.equal(await evaluate(`document.querySelector('#section-subfilters').hidden`),true);
      assert.equal(await evaluate(`document.activeElement.id`),'toggle-refinements');
      assert.equal(await evaluate(`document.querySelector('#toggle-refinements').classList.contains('is-active')`),true,'closed panel shows active refinements');
      assert.equal(await evaluate(`document.querySelector('#filter-summary').hidden`),false);
      await evaluate(`document.querySelector('#clear-filters').click()`);
      assert.equal(await evaluate(`document.querySelector('#filter-summary').hidden`),true);
    }
    if (process.env.FICX_CAPTURE) {
      for (const [width,height] of [[390,844],[1280,900]]) {
        await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
        await evaluate(`document.querySelector('#clear-filters').click()`);
        await choose('Albar'); await choose('Sección Oficial');
        for(const theme of ['light','dark']) {
          await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};window.scrollTo({top:document.querySelector('#featured-sections').getBoundingClientRect().top+window.scrollY-90,behavior:'instant'});`);
          await pause(100);
          const shot=await send('Page.captureScreenshot',{format:'png'});
          fs.writeFileSync(process.env.FICX_CAPTURE+'-'+width+'-'+theme+'.png',Buffer.from(shot.data,'base64'));
          for(const open of [false,true]) {
            await evaluate(`if(document.querySelector('#toggle-refinements').getAttribute('aria-expanded')!==${JSON.stringify(String(open))}) document.querySelector('#toggle-refinements').click(); window.scrollTo({top:document.querySelector('#browse-area').getBoundingClientRect().top+window.scrollY-90,behavior:'instant'});`);
            await pause(100);
            const toolbar=await send('Page.captureScreenshot',{format:'png'});
            fs.writeFileSync(process.env.FICX_CAPTURE+'-toolbar-'+width+'-'+theme+'-'+open+'.png',Buffer.from(toolbar.data,'base64'));
          }
        }
      }
    }
    console.log('Chromium: cumulative sections, no duplicates, shared refinements, unique counts, desktop scroll preservation, additional sections, deselection and resets passed at 3 viewport sizes');
  } finally {
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
