import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStoryDate,recordedWorldAgenda,agendaNarrationGuidance} from '../public/core/world-time.mjs';
import {buildNextContext,branchAncestry} from '../public/core/continuity.mjs';
import {promptForNarrator} from '../public/core/world.mjs';

const scene=(id,when,parent_scene_id=null)=>({id,world_time:when,parent_scene_id,
 body:'Это достоверно записанная сцена.',events:[]});
test('story clock accepts only real calendar dates, never vague or invented times',()=>{
 assert.equal(parseStoryDate('1991-09-01 10:15').precision,'minute');
 assert.equal(parseStoryDate('1991-09-01').precision,'day');
 assert.equal(parseStoryDate('2000-02-29').day,'2000-02-29');
 for(const bad of ['1991-02-29','1991-13-01','1991-09-31','1991-09-01 24:00',
   '1991-09-01T10:60','1991 год','через день','1991-09','2024-02-31']){
  assert.equal(parseStoryDate(bad),null,bad);
 }
});
test('last known date is NOT asserted as present day after undated scenes',()=>{
 const a=recordedWorldAgenda([scene('a','1991-09-01 10:00'),scene('b',null,'a')],{});
 assert.equal(a.latest_recorded_time,'1991-09-01 10:00');
 assert.equal(a.anchor_scene_id,'a');
 assert.equal(a.anchor_is_latest_scene,false);
 assert.equal(a.undated_scenes_after_anchor,1);
 assert.match(agendaNarrationGuidance(a),/текущее время неизвестно/);
});
test('a commitment past its recorded deadline is flagged for verification, NOT automatically broken',()=>{
 const projection={obligations:[
  {commitment_id:'letter',actor:'Гарри',status:'pending',description:'Передать письмо',
    due_at:'1991-09-01 09:00',source:{scene_id:'s1'}},
  {commitment_id:'meeting',actor:'Малфой',status:'active',description:'Встретиться',
    due_at:'1991-09-03',source:{scene_id:'s2'}},
  {commitment_id:'finish',status:'completed',due_at:'1991-08-01'}
 ]};
 const agenda=recordedWorldAgenda([scene('s3','1991-09-02 10:00')],projection);
 assert.equal(agenda.items.length,2);
 assert.equal(agenda.items[0].timing,'date_past_status_requires_verification');
 assert.equal(agenda.items[0].source.scene_id,'s1');
 assert.equal(agenda.items[1].timing,'future_date_as_recorded');
 assert.match(agenda.clock_policy,/no automatic deadline failure/);
});
test('same-day unknown precision never silently interprets midnight as a deadline',()=>{
 const a=recordedWorldAgenda([scene('a','1991-09-01')],{
  obligations:[{commitment_id:'night',actor:'Рон',status:'open',due_at:'1991-09-01 19:00'}]});
 assert.equal(a.items[0].timing,'same_day_time_uncertain');
});
test('unparseable deadlines remain textual and unknown, including promises without dates',()=>{
 const a=recordedWorldAgenda([scene('a',null)],{
  obligations:[{commitment_id:'x',status:'pending',due_at:'следующей весной'},
   {commitment_id:'y',status:'pending'}]});
 assert.equal(a.latest_recorded_time,null);
 assert.equal(a.items[0].timing,'unparsed_time_reference');
 assert.equal(a.items[1].timing,'time_not_established');
});
test('backdated scenes are flagged as possible flashback, never rewritten or deleted',()=>{
 const a=recordedWorldAgenda([scene('a','1991-10-02'),scene('b','1991-09-01','a')],{});
 assert.equal(a.chronology_to_review.length,1);
 assert.equal(a.chronology_to_review[0].from_scene_id,'a');
 assert.equal(a.chronology_to_review[0].to_scene_id,'b');
 assert.match(a.chronology_to_review[0].interpretation,/флешбэк/i);
});
test('old discarded branch cannot contribute deadlines to active timeline',()=>{
 const root=scene('root','1991-09-01');
 const other=scene('abandoned','1992-10-01','root');
 const active=scene('active','1991-09-02','root');
 const scenes=branchAncestry([root,other,active],'active');
 const a=recordedWorldAgenda(scenes,{});
 assert.equal(a.latest_recorded_time,'1991-09-02');
});
test('narrator receives recorded time as a caution, not a simulated clock',()=>{
 const s=scene('a','1991-09-01 08:30');
 const context=buildNextContext({world:{id:'x',seed:'Драматическая школа 1991',title:'Школа'},scenes:[s]});
 assert.equal(context.recorded_agenda.latest_recorded_time,'1991-09-01 08:30');
 const prompt=promptForNarrator({world:{seed:'Драматическая школа 1991'},
  projection:context.memory,history:[s],timeContext:context.recorded_agenda});
 assert.match(prompt,/Последнее указанное игровое время: 1991-09-01 08:30/);
 assert.match(prompt,/не означают, что герой опоздал/i);
});
