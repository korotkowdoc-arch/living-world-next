import test from 'node:test';
import assert from 'node:assert/strict';
import {civilizationReview} from '../public/core/civilization-review.mjs';
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
