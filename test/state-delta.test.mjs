import test from 'node:test';
import assert from 'node:assert/strict';
import {compareRegistryState,recentRegistryState,remapDeltaScene} from '../public/core/state-delta.mjs';
import {replay,validateStateAppend} from '../public/core/continuity.mjs';
import {reviewSceneDraft} from '../public/core/scene-draft.mjs';
import {eventRoute} from '../public/core/scene-memory-routing.mjs';
const evidence='Hero performed the recorded actions.';
const sc=(id,events)=>({id,world_time:'1994-09-05 17:00',body:evidence,events});
const ev=(id,type,fields)=>({id,type,evidence,...fields});
test('draft delta tracks both transfer legs, injury clearing, directed relationship and knowledge identity',()=>{
 const first=sc('old',[ev('cash','money',{actor:'Hero',currency:'GBP',delta:0,operation:'reconcile',balance:100}),ev('inj','character',{name:'Hero',state_patch:{injury:'Bruise',location:'Park'}}),ev('rel','relationship',{a:'Hero',b:'Friend',relationship_version:1,relationship_patch:{trust:'conditional'}}),ev('know','knowledge',{actor:'Hero',knowledge_version:1,topic_id:'shop',fact:'Maybe closed',status:'believes',channel:'heard'})]);
 const next=sc('new',[ev('pay','money',{actor:'Hero',counterparty:'Friend',currency:'GBP',delta:-20,operation:'transfer'}),ev('clear','character',{name:'Hero',state_patch:{injury:null}}),ev('rel2','relationship',{a:'Hero',b:'Friend',relationship_version:1,relationship_patch:{trust:'trusted'}}),ev('know2','knowledge',{actor:'Hero',knowledge_version:1,topic_id:'shop',fact:'Open',status:'knows',channel:'seen'})]);
 const before=replay([first]),after=replay([first,next]),d=compareRegistryState(before,after,{sceneId:'new'});
 assert.equal(d.records.find(r=>r.registry==='balances'&&r.identity[0]==='Hero').fields.find(f=>f.field==='balance').after,80);
 assert.equal(d.records.filter(r=>r.registry==='balances').length,2);
 const person=d.records.find(r=>r.registry==='people');assert.equal(person.fields.find(f=>f.field==='injury').after,null);assert.equal(person.fields.find(f=>f.field==='injury').after_present,true);assert.ok(!person.fields.some(f=>f.field==='location'));
 assert.deepEqual(d.records.find(r=>r.registry==='knowledge').identity,['Hero','topic','shop']);assert.equal(d.records.find(r=>r.registry==='relationships').fields.find(f=>f.field==='trust').after,'trusted');
 const report=reviewSceneDraft({scenes:[first],complete:true,projection:before},{body:next.body,events:next.events,world_time:next.world_time});assert.ok(report.ok);assert.equal(report.state_delta.total,d.total);
 const checked=validateStateAppend([first],next.events,next.body,{includeProjection:true,worldTime:next.world_time});assert.ok(checked.ok);assert.equal(checked.projection.balances.find(x=>x.actor==='Hero').balance,80);
});
test('indirect outfit change and refreshed item observation keep original source',()=>{
 const old={scene_id:'old',event_id:'x'},fresh={scene_id:'new',event_id:'y'};
 const before={effective_outfits:[{actor:'Hero',slots:{head:'hat'},source:old}],items:[{item_id:'hat',holder:'Hero',custody_status:'held',source:old}]};
 const after={effective_outfits:[{actor:'Hero',slots:{},source:old}],items:[{...before.items[0],last_observation:{actor:'Hero',source:fresh}}]};
 const delta=compareRegistryState(before,after,{sceneId:'new'});assert.equal(delta.records.find(r=>r.registry==='effective_outfits').derived_change,true);
 assert.equal(delta.records.find(r=>r.registry==='items').operation,'observation_refreshed');assert.equal(remapDeltaScene(delta,'new','saved').records.find(r=>r.registry==='items').observation_source.scene_id,'saved');
});
test('recent recall returns latest fields only and preserves actor boundaries',()=>{
 const a=sc('a',[ev('loc','character',{name:'Hero',state_patch:{location:'Park',injury:'Bruise'}}),ev('other','character',{name:'Other',state_patch:{location:'Secret'}})]);
 const b=sc('b',[ev('loc2','character',{name:'Hero',state_patch:{location:'Shop'}})]);
 const r=recentRegistryState(replay([a,b]),[a,b],{actors:['Hero'],window:1});
 assert.deepEqual(r.records.find(x=>x.registry==='people').fields.map(x=>[x.field,x.value]),[['location','Shop']]);assert.ok(!JSON.stringify(r).includes('Secret'));assert.ok(!JSON.stringify(r).includes('Park'));
});
test('growth routing separates skill, project, rumor and cause',()=>{for(const [growth_kind,domain] of [['skill','education'],['project','goals'],['rumor','knowledge'],['cause','world']])assert.equal(eventRoute({type:'world',growth_version:1,growth_kind}).domain,domain);});

import {identityReview} from '../public/core/state-delta.mjs';
import {needsStatePreflight} from '../public/core/continuity.mjs';
test('ordinary character, relationship, knowledge and commitment changes get state preflight',()=>{for(const type of ['character','relationship','knowledge','commitment','offscreen','world'])assert.equal(needsStatePreflight([{type}]),true);assert.equal(needsStatePreflight([{type:'world',scene_memory_version:1}]),false);});
test('identity review spots duplicate need/skill/plan scopes without confusing independent actors or completed tasks',()=>{
 const need={id:'a',type:'world',player_life_version:1,life_kind:'need',key:'need:a',actor:'Hero',need:'hunger'};
 const skill={id:'s',type:'world',growth_version:1,growth_kind:'skill',key:'skill:a',actor:'Hero',name:'Repair'};
 const plan={type:'plan',actor:'Hero',plan_id:'p',goal:'Find work',status:'active'};
 const proposed=[{...need,id:'b',key:'need:b'},{...need,id:'c',key:'need:c',actor:'Other'},{...skill,id:'s2',key:'skill:b'},{...plan,id:'p2',plan_id:'p2',action:'start'},{...plan,id:'p3',plan_id:'p3',action:'start',actor:'Other'}];
 const r=identityReview({worldFacts:[need,skill],plans:[plan]},proposed);assert.equal(r.total,3);assert.deepEqual(r.records.map(x=>x.existing_id),['need:a','skill:a','p']);
});

test('inherited descriptive text is not presented as a newly observed field',()=>{const a=sc('a',[ev('desc','character',{name:'Hero',description:'Old description',state_patch:{location:'Park'}})]);const b=sc('b',[ev('loc','character',{name:'Hero',state_patch:{location:'Shop'}})]);const r=recentRegistryState(replay([a,b]),[a,b],{actors:['Hero'],window:1});assert.ok(!r.records[0].fields.some(f=>f.field==='description'));});
