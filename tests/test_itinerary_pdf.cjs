const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {jsPDF} = require('../src/pdf-assets/jspdf-4.2.1.umd.min.js');
const {create} = require('../src/pdf-itinerary.js');
const source = fs.readFileSync('src/app.js','utf8');
function extract(name) {
  const start=source.indexOf('  function '+name+'(');
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n  }',start)+4);
}
const fonts=Object.fromEntries(fs.readdirSync('src/pdf-assets').filter(name=>name.endsWith('.ttf'))
  .map(name=>[name,fs.readFileSync('src/pdf-assets/'+name).toString('base64')]));
const logo='data:image/png;base64,'+fs.readFileSync('src/pdf-assets/ficx-mark.png').toString('base64');
function context() {
  const a={candidateId:'a',date:'2026-11-16',time:'13:00',durationMinutes:60,meetingMinutes:15,venue:'Teatro Jovellanos',accessType:'public',filmIds:['one','two'],films:[{id:'one',title:'La película pequeña'},{id:'two',title:'Memória e coração'}],title:'Una sesión compartida'};
  const b={candidateId:'b',date:'2026-11-16',time:'14:20',durationMinutes:80,venue:'OCINE',room:'Sala 1',accessType:'restricted',filmIds:['three'],films:[{id:'three',title:'Por fortuna o por desgracia, tú nunca morirás'}]};
  const c={candidateId:'c',date:'2026-11-17',time:'19:00',durationMinutes:null,venue:'Antiguo Instituto',filmIds:[],films:[],title:'Encuentro sin película'};
  const sandbox=vm.createContext({screeningRecords:[c,b,a], plannedScreenings:new Map([['one','a'],['two','a'],['three','b'],['stale','missing']]), plannedStandalone:new Set(['c']),
    filmById:new Map([['one',{sections:['Albar'],durationMinutes:12}],['two',{sections:['Cortometrajes']}],['three',{sections:['Retueyos']}]]),
    transportMode:'walking',userAlias:'Ángela', transferMinutes:()=>10, Date, Intl});
  vm.runInContext(['findScreening','selectedPlanEvents','plannedMinutes','startMinute','formatClock','compareScreenings','analyzeProgram','sectionNames','itineraryScreeningTitles','buildItineraryDocument'].map(extract).join('\n'),sandbox);
  return sandbox;
}
test('PDF snapshot includes every day, shared sessions once and standalone activities',()=>{
  const sandbox=context();
  const model=vm.runInContext("buildItineraryDocument(undefined,new Date('2026-11-04T12:00:00Z'))",sandbox);
  assert.deepEqual(Array.from(model.events,event=>event.id),['a','b','c']);
  assert.equal(model.events[0].end,'14:15');
  assert.equal(model.events[0].duration,'75 min de pase');
  assert.equal(model.events[0].films.length,2);
  assert.equal(model.events[0].meeting,true);
  assert.doesNotMatch(model.events[0].details.join(' '),/presentación|15 min|encuentro/i);
  assert.match(model.events[0].warnings.join(' '),/No da tiempo al traslado/);
  assert.match(model.events[0].transition,/faltan 5 min/);
  assert.equal(model.events[1].end,'15:40');
  assert.match(model.events[1].details.join(' '),/Prensa y acreditados/);
  assert.equal(model.events[2].title,'Encuentro sin película');
  assert.equal(model.events[2].end,'');
  assert.match(model.events[2].warnings.join(' '),/Duración por confirmar/);
});
test('unknown transfer and unknown end never become invented travel/finish times',()=>{
  const sandbox=context(); vm.runInContext('transferMinutes=()=>null',sandbox);
  const model=vm.runInContext('buildItineraryDocument()',sandbox);
  assert.match(model.events[0].transition,/por confirmar/);
  assert.equal(model.events[2].end,'');
});
test('an event crossing midnight has an explicit next-day end',()=>{
  const sandbox=context();
  const model=vm.runInContext(`screeningRecords.find(s=>s.candidateId==='a').time='23:30'; buildItineraryDocument()`,sandbox);
  assert.equal(model.events.find(event=>event.id==='a').end,'00:45 (+1 día)');
});
test('an explicit main film becomes the title and accompanying films keep their names',()=>{
  const sandbox=context();
  const model=vm.runInContext(`screeningRecords.find(s=>s.candidateId==='a').mainFilmId='two'; buildItineraryDocument()`,sandbox);
  assert.equal(model.events[0].title,'Memória e coração');
  assert.deepEqual(Array.from(model.events[0].films),['La película pequeña (12 min)']);
  assert.equal(model.events[0].filmsLabel,'Incluye');
});
test('unannotated groups retain their actual group title, never guess the longest film',()=>{
  const sandbox=context();
  const model=vm.runInContext(`filmById.get('one').durationMinutes=2;filmById.get('two').durationMinutes=200;screeningRecords.find(s=>s.candidateId==='a').title='';buildItineraryDocument()`,sandbox);
  assert.equal(model.events[0].title,'Programa de 2 películas');
  assert.equal(model.events[0].films.length,2);
});
test('curated main-film data covers the confirmed pairings and references linked films',()=>{
  const screenings=JSON.parse(fs.readFileSync('data/screenings.json','utf8')).screenings;
  const examples=screenings.filter(s=>s.mainFilmId);
  assert.equal(examples.filter(s=>s.mainFilmSource!=="duration-proposal").length,10);
  for(const s of examples) assert.ok(s.filmIds.includes(s.mainFilmId));
  assert.equal(examples.filter(s=>s.mainFilmId==='the-day-she-returns').length,2);
  assert.equal(examples.filter(s=>s.mainFilmId==='a-donde-vauste').length,1);
});
test('four ordinary screenings across two days fit on one A4 page',async()=>{
  const base=vm.runInContext('buildItineraryDocument()',context());
  const events=[...base.events,{...base.events[1],id:'extra',date:'2026-11-17',time:'22:00'}];
  const pdf=create({...base,events},{jsPDF,fonts,logo});
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ficx-pdf-density-'));
  try {
    const file=path.join(directory,'compact.pdf');fs.writeFileSync(file,Buffer.from(await pdf.arrayBuffer()));
    const text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});
    assert.equal(text.split('\f').filter(page=>page.trim()).length,1);
    assert.ok(text.includes('ENCUENTRO CON EL EQUIPO'));
    assert.doesNotMatch(text,/Incluye presentación|Incluye encuentro/);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test('a day heading stays on the same page as its first ordinary screening',async()=>{
  const base=vm.runInContext('buildItineraryDocument()',context());
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ficx-pdf-day-'));
  try {
    for(const count of [6,7,8,9,10]) {
      const events=Array.from({length:count},(_,index)=>({...base.events[1],id:'prior-'+index,title:'Un pase anterior',time:String(8+index).padStart(2,'0')+':00',warnings:[],transition:''}));
      events.push({...base.events[1],id:'second-day',date:'2026-11-17',title:'DAY-SECOND-EVENT '+('Una película de título largo. '.repeat(16)),warnings:[],transition:''});
      const blob=create({...base,events},{jsPDF,fonts,logo});
      const file=path.join(directory,'day.pdf');fs.writeFileSync(file,Buffer.from(await blob.arrayBuffer()));
      const text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});
      for(const page of text.split('\f').filter(page=>page.includes('MARTES'))) assert.ok(page.includes('DAY-SECOND-EVENT'),'day heading must not be orphaned');
    }
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test('PDF export refuses an empty plan' ,()=>{
  assert.throws(()=>create({events:[]},{jsPDF,fonts,logo}),/No hay pases/);
});
test('real PDF preserves Unicode, paginates long content and keeps text inside A4 margins',async()=>{
  const sandbox=context();
  const base=vm.runInContext("buildItineraryDocument(undefined,new Date('2026-11-04T12:00:00Z'))",sandbox);
  const events=[...base.events];
  for(let i=0;i<45;i++) events.push({...base.events[0],id:'stress-'+i,date:'2026-11-18',time:`${String(8+Math.floor(i/3)).padStart(2,'0')}:${String((i%3)*20).padStart(2,'0')}`,
    title:i===0 ? 'Título extraordinariamente largo: '+('Memória, corazón y montañas. '.repeat(70))+' FINAL-LARGO' : 'Película número '+i,
    warnings:i%3===0 ? ['No da tiempo al traslado al siguiente pase'] : [], transition:''});
  const blob=create({...base,events},{jsPDF,fonts,logo});
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ficx-pdf-test-'));
  try {
    const output=path.join(directory,'itinerario.pdf');
    fs.writeFileSync(output,Buffer.from(await blob.arrayBuffer()));
    const text=execFileSync('pdftotext',['-layout',output,'-'],{encoding:'utf8'});
    for(const expected of ['Ángela','Una sesión compartida','Memória e coração','Por fortuna','Encuentro sin película','FINAL-LARGO','Película número 44']) assert.ok(text.includes(expected),expected);
    assert.ok(text.split('\f').length>3,'long itinerary must paginate');
    const bbox=execFileSync('pdftotext',['-bbox',output,'-'],{encoding:'utf8'});
    for(const match of bbox.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g)) {
      const [xMin,yMin,xMax,yMax]=match.slice(1).map(Number);
      assert.ok(xMin>=45 && yMin>=35 && xMax<=550 && yMax<=825,`text outside margins: ${match[0]}`);
    }
    assert.ok(blob.size<500000,'text document should remain compact');
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
