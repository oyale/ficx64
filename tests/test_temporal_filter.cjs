const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('src/app.js','utf8');
const model=source.split('  // Temporal model: pure, independent of personal selections.')[1]?.split('  // End temporal model.')[0];
assert.ok(model,'temporal model exists');
const ctx=vm.createContext({Intl,Date,Map,Set});
vm.runInContext(model,ctx);
const timing=(date,time,durationMinutes=90,meetingMinutes=0)=>ctx.screeningTiming({date,time,durationMinutes,meetingMinutes});
test('Madrid instants, DST gaps/overlaps and malformed input',()=>{
 assert.equal(timing('2026-11-13','09:00').startMs,Date.parse('2026-11-13T08:00Z'));
 assert.equal(timing('2026-07-01','09:00').startMs,Date.parse('2026-07-01T07:00Z'));
 for(const [date,time] of [['2026-03-29','02:30'],['2026-10-25','02:30'],['2026-02-30','09:00'],[null,'09:00'],['2026-11-13','24:00']])assert.equal(timing(date,time).startMs,null);
 assert.equal(timing('2026-11-13','09:00',-1).endMs,null);
});
test('exact start/end, encounter and unknown end',()=>{
 const t=timing('2026-11-18','22:00',115,15);
 assert.equal(t.endMs,Date.parse('2026-11-18T23:10Z'));
 assert.equal(ctx.screeningTemporalState(t,t.startMs-1),'future');
 assert.equal(ctx.screeningTemporalState(t,t.startMs),'ongoing');
 assert.equal(ctx.screeningTemporalState(t,t.endMs),'ended');
 const u=timing('2026-11-13','09:00',null);
 assert.equal(ctx.screeningTemporalState(u,u.startMs),'startedUnknownEnd');
});
test('day closes at maximum end and unknown data prevents false festival end',()=>{
 const records=[{candidateId:'a',date:'2026-11-18',time:'22:00',durationMinutes:150},{candidateId:'b',date:'2026-11-18',time:'22:15',durationMinutes:127}];
 const end=Date.parse('2026-11-18T23:30Z');
 assert.equal(ctx.buildTemporalView(records,end-1).closedDates.has('2026-11-18'),false);
 assert.equal(ctx.buildTemporalView(records,end).festivalEnded,true);
 assert.equal(ctx.buildTemporalView([...records,{candidateId:'u'}],end).festivalEnded,false);
 assert.equal(ctx.buildTemporalView([],end).festivalEnded,false);
});

test('preference defaults enabled for absent/invalid/blocked storage; only false disables',()=>{
 const start=source.indexOf('  function readHidePast('),end=source.indexOf('\n  }',start)+4;
 for(const value of [null,'true','false','invalid']){
  const c=vm.createContext({localStorage:{getItem:()=>value},temporalStorageKey:'key'});vm.runInContext(source.slice(start,end),c);
  assert.equal(c.readHidePast(),value!=='false');
 }
 const blocked=vm.createContext({localStorage:{getItem(){throw Error('blocked')}},temporalStorageKey:'key'});vm.runInContext(source.slice(start,end),blocked);assert.equal(blocked.readHidePast(),true);
});

test('ongoing labels use Madrid end time, including next-day endings',()=>{
 const start=source.indexOf('  function temporalStatusMarkup('),end=source.indexOf('\n  }',start)+4;
 const record={candidateId:'night',date:'2026-11-18',time:'22:00',durationMinutes:115,meetingMinutes:15};
 const t=ctx.screeningTiming(record);
 const c=vm.createContext({Intl,Number,temporalView:{states:new Map([['night','ongoing']])},screeningTimings:new Map([['night',t]])});
 vm.runInContext(source.slice(start,end),c);
 assert.match(c.temporalStatusMarkup(record),/En curso · hasta las 00:10 · 19\/11/);
 c.temporalView.states.set('night','ended');assert.equal(c.temporalStatusMarkup(record),'');
 c.temporalView.states.set('night','startedUnknownEnd');assert.match(c.temporalStatusMarkup(record),/fin sin confirmar/);
});
