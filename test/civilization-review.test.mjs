import test from 'node:test';
import assert from 'node:assert/strict';
import {npcInitiativeView} from '../public/core/npc-initiatives.mjs';
import {civilizationReview,orderTurnCandidates,continuityAnchors} from '../public/core/civilization-review.mjs';
const source={scene_id:'s1',event_id:'e1'};
const clock='1994-07-01 09:00',until='1994-07-01 15:00';
const life=(kind,id,fields)=>({player_life_version:1,life_kind:kind,key:'player-life:'+kind+':'+id,record_id:id,source,...fields});
const schedule=(id,amount,currency='GBP')=>({type:'world',dynamics_version:1,dynamics_kind:'payment_schedule',record_id:id,key:'dynamics:payment_schedule:'+id,actor:'A',counterparty:'B',title:'Rent',description:'Recorded obligation',status:'active',amount,currency,payment_kind:'rent',starts_on:'1994-07-01',every_days:1,source});
test('cross-system conflicts count real overlaps, teacher but not employer attendance; touching windows are not conflicts',()=>{
 const rows=[life('lesson','one',{actor:'A',teacher:'T',status:'scheduled',starts_at:'1994-07-01 10:00',ends_at:'1994-07-01 11:00'}),life('work_shift','two',{actor:'A',employer:'T',status:'scheduled',starts_at:'1994-07-01 10:30',ends_at:'1994-07-01 12:00'}),life('appointment','three',{participants:['A','T'],status:'confirmed',starts_at:'1994-07-01 12:00',ends_at:'1994-07-01 13:00'})];
 const result=civilizationReview({worldFacts:rows},[],{clock,until});
 assert.equal(result.schedule_conflicts.total,1);assert.equal(result.schedule_conflicts.records[0].overlap_minutes,30);assert.equal(result.schedule_conflicts.records[0].actor,'A');
});
test('aggregates distinct schedules by currency without crediting incoming funds or inventing debt',()=>{
 const p={worldFacts:[schedule('a',7),schedule('b',8),schedule('c',2,'G')],balances:[{actor:'A',currency:'GBP',known:true,balance:10,source}]};
 const r=civilizationReview(p,[],{clock,until}).scheduled_funds.records;
 assert.equal(r[0].scheduled_review_amount,15);assert.equal(r[0].possible_shortfall,5);assert.equal(r[1].possible_shortfall,null);
 p.worldFacts.push({dynamics_version:1,dynamics_kind:'payment_occurrence',schedule_id:'a',status:'paid',scheduled_on:'1994-07-01'});
 assert.equal(civilizationReview(p,[],{clock,until}).scheduled_funds.records[0].scheduled_review_amount,8);
});
test('never advances pending choice or incomplete clock; only segment deadlines with sources',()=>{
 const a={key:'a',kind:'intention',actors:['A'],review_at:'1994-07-01',source};
 const b={...a,key:'b',review_at:'1994-07-02 10:00'};
 assert.equal(civilizationReview({},[a,b],{clock,until,pending:true}).status,'player_choice_pending');
 assert.equal(civilizationReview({},[a,b],{clock,until,complete:false}).status,'unavailable');
 const result=civilizationReview({},[a,b,a],{clock,until});assert.equal(result.due_queue.total,1);assert.equal(result.due_queue.records[0].certainty,'same_day_time_unknown');
});

test('all urgent items precede ordinary opportunities, fair category rounds and stable pagination',()=>{
 const a=[{key:'a1',kind:'lesson',rank:0},{key:'a2',kind:'lesson',rank:0},{key:'a3',kind:'lesson',rank:2}];
 const b=[{key:'b1',kind:'work',rank:0},{key:'b2',kind:'work',rank:1}];
 const c=[{key:'c1',kind:'habit',rank:2}];
 assert.deepEqual(orderTurnCandidates([a,b,c],x=>x.rank).map(x=>x.key),['a1','b1','a2','b2','a3','c1']);
 assert.deepEqual(orderTurnCandidates([a,b,c],x=>x.rank,{offset:2,limit:2}).map(x=>x.key),['a2','b2']);
});
test('rotation prefers a less recently active equally urgent NPC, without changing mandatory order',()=>{
 const scenes=[{id:'s0'},{id:'s1'},{id:'s2'},{id:'s3'}];
 const c=(actor,key,timing='requires_character_choice')=>({actor,actors:[actor],kind:'intention',key,title:key,timing,source:{scene_id:'s0'},status:'active'});
 const opts={player:'Hero',scenes,offscreen:[{actor:'A',source:{scene_id:'s3'}}],settings:{agency:'low',events:'low'}};
 assert.equal(npcInitiativeView([c('A','a'),c('B','b')],opts).initiatives[0].actor,'B');
 assert.equal(npcInitiativeView([c('A','a','reached_requires_story'),c('B','b')],opts).initiatives[0].actor,'A');
});
test('older callback anchors use only active source event IDs and focus, deduplicate and ignore unrelated text',()=>{
 const scenes=['s0','s1','s2','s3','s4','s5'].map(id=>({id}));
 const old={actor:'A',goal:'Find hidden library',source:{scene_id:'s0',event_id:'e1'}};
 const p={plans:[old,{...old,actor:'B',source:{scene_id:'s1',event_id:'e2'}},{...old,source:{scene_id:'other-branch',event_id:'e3'}}],knowledge:[old,{...old,source:{scene_id:'s5',event_id:'recent'}}]};
 const r=continuityAnchors(scenes,p,{focus:['A'],candidates:[{actors:['A'],title:'Hidden library'}]});
 assert.equal(r.total,1);assert.equal(r.records[0].source.event_id,'e1');assert.deepEqual(r.records[0].matched_words,['hidden','library']);
 assert.equal(continuityAnchors(scenes,p,{focus:['A'],complete:false}).status,'unavailable');
});

import {dashboardSummary} from '../public/core/game-menu.mjs';
test('player dashboard announces only its own already visible calendar conflicts',()=>{
 const overview={actor:'Hero',inventory:{total:0},tasks:{total:0},life:{letters:{incoming:{records:[],total:0}},calendar:{entries:[],conflicts:[{first:'a',second:'b',from:'1994-07-01 10:00'}],omitted_conflicts:2}}};
 const n=dashboardSummary(overview).notifications.records.find(x=>x.kind==='calendar_conflict');assert.equal(n.conflict_count,3);assert.equal(n.section,'calendar');assert.equal(n.priority,'urgent');
 overview.life.calendar.conflicts=[];assert.equal(dashboardSummary(overview).notifications.total,0);
});
