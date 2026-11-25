import test from 'node:test';
import assert from 'node:assert/strict';
import {needForecast,playerCalendar,planTimeAdvance} from '../public/core/life-calendar.mjs';
import {replay,validateStateAppend} from '../public/core/continuity.mjs';
import {playerLifeView} from '../public/core/player-life.mjs';
import {playerMenuOverview,menuActionIntent} from '../public/core/game-menu.mjs';
const ev=(life_kind,record_id,extra)=>({id:life_kind+'-'+record_id,type:'world',player_life_version:1,life_kind,record_id,key:'player-life:'+life_kind+':'+record_id,evidence:'Recorded event.',...extra});
const sc=(id,world_time,events=[])=>({id,world_time,body:'Recorded event.',events});
const actor='Harry',clock='1994-08-01 08:00';
const need=ev('need','hunger',{actor,need:'hunger',status:'comfortable',description:'Ate breakfast'});
const meet=ev('appointment','visit',{actor,participants:[actor,'Lia'],title:'Visit',place:'Cafe',starts_at:'1994-08-01 12:00',ends_at:'1994-08-01 13:00',status:'confirmed'});
test('fictional needs forecast is conditional and anchored to exact continuous time',()=>{
 const scenes=[sc('s',clock,[need]),sc('later','1994-08-01 16:00')];
 const p=replay(scenes),n=p.worldFacts[0];
 const f=needForecast(n,scenes);
 assert.equal(f.recorded_status,'comfortable');assert.equal(f.estimated_status,'urgent');assert.equal(f.elapsed_minutes,480);assert.equal(f.next_review_at,'1994-08-01 20:00');
 assert.equal(needForecast(n,[scenes[0],sc('unknown',null),scenes[1]]).estimated_status,null);
 assert.equal(needForecast(n,scenes,null,{complete:false}).estimated_status,null);
 assert.equal(playerLifeView(p,actor,{scenes}).needs.find(x=>x.need==='hunger').forecast.estimated_status,'urgent');
 assert.equal(n.status,'comfortable');
});
test('time advance respects pending player choice, pace, deadline and critical need',()=>{
 const scenes=[sc('s',clock,[need,meet])],p=replay(scenes);
 assert.equal(planTimeAdvance(scenes,p,actor,'1994-08-02 08:00',{pending:true}).can_advance,false);
 assert.equal(planTimeAdvance(scenes,p,actor,'1994-08-02 08:00',{pace:'slow'}).proposed_until,'1994-08-01 10:00');
 const fast=planTimeAdvance(scenes,p,actor,'1994-08-02 08:00',{pace:'fast'});
 assert.equal(fast.proposed_until,'1994-08-01 12:00');assert.equal(fast.gate.kind,'appointment');
 const noMeet=replay([scenes[0]].map(s=>({...s,events:[need]})));
 assert.equal(planTimeAdvance(scenes,noMeet,actor,'1994-08-02 08:00').gate.kind,'need');
 assert.equal(planTimeAdvance([sc('s','1994-08-01')],p,actor,'1994-08-02 08:00').can_advance,false);
});
test('calendar includes confirmed meetings, own obligations and overnight recurring windows',()=>{
 const p=replay([sc('s',clock,[meet])]);
 p.worldFacts.push({world_record_version:1,record_kind:'routine',record_id:'shift',actor,activity:'Shift',place:'Shop',status:'active',weekdays:[1],start:'11:30',end:'12:30'});
 p.worldFacts.push({world_record_version:1,record_kind:'routine',record_id:'night',actor,activity:'Night',place:'Home',status:'active',weekdays:[1],start:'23:00',end:'01:00'});
 p.plans=[{actor,plan_id:'work',goal:'Work',status:'active',due_at:'1994-08-02'}];
 const v=playerCalendar(p,actor,clock);
 assert.ok(v.conflicts.some(x=>x.first.includes('shift')&&x.second==='appointment:visit'));
 assert.ok(v.entries.some(x=>x.kind==='routine'&&x.ends_at==='1994-08-02 01:00'));
 assert.ok(v.entries.some(x=>x.kind==='task'&&x.id==='work'));
 assert.equal(playerCalendar(p,'Other',clock).entries.length,0);
 assert.equal(validateStateAppend([sc('s',clock,[meet])],[{...meet,status:'completed',place:'Elsewhere'}],'Recorded event.').ok,false);
});
test('presets require current ownership and never alter equipment; impressions are filtered',()=>{
 const item={id:'item',type:'item',custody_version:1,item_id:'coat',name:'Coat',action:'acquire',actor,evidence:'Recorded event.'};
 const garment=ev('garment','coat',{item_id:'coat',slot:'outer',style:'formal',description:'Formal coat'});
 const preset=ev('preset','formal',{actor,title:'Formal',status:'active',slots:{outer:'coat'}});
 const seen=ev('impression','seen',{actor,observer:'Lia',description:'Compliment',basis:'Coat',status:'positive',known_to_actor:true});
 const hidden=ev('impression','hidden',{actor,observer:'Other',description:'Secret dislike',basis:'Coat',status:'negative',known_to_actor:false});
 const s=sc('s',clock,[item,garment,preset,seen,hidden]);
 let p=replay([s]);assert.equal(p.validation_warnings.length,0);
 let menu=playerMenuOverview(p,actor);assert.equal(menu.life.outfit,null);
 assert.equal(menu.life.impressions.total,1);
 assert.equal(menuActionIntent({action:'apply_outfit',preset_id:'formal',detail:'Wear'},menu).saved,false);
 p=replay([s,sc('transfer','1994-08-01 09:00',[{...item,action:'transfer',counterparty:'Lia'}])]);
 menu=playerMenuOverview(p,actor);assert.equal(menu.life.presets.records[0].missing.length,1);
 assert.throws(()=>menuActionIntent({action:'apply_outfit',preset_id:'formal',detail:'Wear'},menu));
 assert.equal(validateStateAppend([s],[{...meet,status:'completed'}],'Recorded event.').ok,false);
});
test('time gates do not disappear when the calendar display is paginated',()=>{
 const scenes=[sc('s',clock)],p=replay(scenes);
 p.plans=Array.from({length:150},(_,i)=>({actor,plan_id:'p'+i,goal:'Goal '+i,status:'active',due_at:'1994-08-01 09:00'}));
 p.plans.push({actor,plan_id:'urgent',goal:'Urgent',status:'active',due_at:'1994-08-01 08:30'});
 assert.equal(planTimeAdvance(scenes,p,actor,'1994-08-01 15:00').proposed_until,'1994-08-01 08:30');
});

 test('long unobserved interval is not current critical deprivation and requires review before further skip',()=>{
 const scenes=[sc('s',clock,[need]),sc('jump','1994-08-15 08:00')],p=replay(scenes),n=p.worldFacts[0];
 const f=needForecast(n,scenes);assert.equal(f.estimated_status,null);assert.equal(f.certainty,'unobserved_gap');assert.equal(f.recorded_status,'comfortable');
 assert.equal(playerLifeView(p,actor,{scenes}).quick_actions.find(x=>x.need==='hunger').status,'unknown');
 const menu=playerMenuOverview(p,actor,scenes.at(-1).world_time,{scenes});assert.ok(menu.dashboard.notifications.records.some(x=>x.kind==='need_review'&&x.priority==='normal'));
 const next=planTimeAdvance(scenes,p,actor,'1994-08-16 08:00');assert.equal(next.can_advance,false);assert.equal(next.gate.reason,'need_observation_after_gap');
 });
