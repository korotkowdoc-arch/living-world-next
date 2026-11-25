import test from 'node:test';
import assert from 'node:assert/strict';
import {replay} from '../public/core/continuity.mjs';
import {taskTracker} from '../public/core/task-tracker.mjs';
import {playerMenuOverview,menuSection} from '../public/core/game-menu.mjs';
import {sceneSaveAudit} from '../public/core/scene-memory-routing.mjs';
const ev=(id,action,extra={})=>({id,type:'plan',actor:'Hero',plan_id:'glasses',action,evidence:'He did the task.',...extra});
const sc=(id,events)=>({id,body:'He did the task.',world_time:'2000-01-01 09:00',events});
test('one task grows by stable identity, exposes next step, then archives without duplicate',()=>{
 const first=sc('s1',[ev('p1','start',{goal:'Replace glasses',next_step:'Find a shop',due_at:'2000-01-02'})]);
 const second=sc('s2',[ev('p2','advance',{plan_patch:{next_step:'Buy glasses',obstacle:'Need money'}})]);
 const third=sc('s3',[{id:'actual',type:'world',key:'glasses-bought',description:'Bought glasses',evidence:'He did the task.'},ev('p3','complete',{performed_event_id:'actual'})]);
 let scenes=[first,second],p=replay(scenes);let t=taskTracker(p,'Hero',scenes);
 assert.equal(t.active.total,1);assert.equal(t.active.records[0].next_step,'Buy glasses');assert.equal(t.active.records[0].progress.recorded_advances,1);
 assert.equal(t.active.records[0].progress.history.records[0].action,'advance');assert.equal(taskTracker(p,'Other',scenes).active.total,0);
 const menu=playerMenuOverview(p,'Hero',null,{scenes});assert.equal(menuSection(menu,'tasks').data.task_tracker.active.total,1);
 scenes.push(third);p=replay(scenes);t=taskTracker(p,'Hero',scenes);assert.equal(t.active.total,0);assert.equal(t.finished.total,1);assert.equal(t.finished.records[0].next_step,null);assert.equal(t.finished.records[0].progress.confirmed_updates,3);
 assert.equal(sceneSaveAudit(second.body,second.events).task_updates[0].plan_id,'glasses');
});
test('unaccepted plan transition and missing source do not count as progress',()=>{
 const first=sc('s1',[ev('p1','start',{goal:'Replace glasses'})]),second=sc('s2',[ev('p2','start',{goal:'Duplicate'})]);
 const p=replay([first,second]),t=taskTracker(p,'Hero',[first,second]);assert.equal(t.active.records[0].progress.confirmed_updates,1);
 assert.equal(taskTracker(p,'Hero',[],{complete:false}).active.records[0].progress.history_complete,false);
});

import {activeTaskRecall,taskSaveReview} from '../public/core/task-tracker.mjs';
test('explicit stages use normal accepted plans, group once, keep independent completion and actor boundaries',()=>{
 const child=(id,action,extra={})=>ev(id,action,{plan_id:'glasses/step/find',...extra});
 const a=sc('a',[ev('parent','start',{goal:'Replace glasses'}),child('step','start',{goal:'Find optician'})]);
 const b=sc('b',[{id:'actual',type:'world',key:'found',description:'Found a shop',evidence:'He did the task.'},child('done','complete',{performed_event_id:'actual'})]);
 const p=replay([a,b]);const t=taskTracker(p,'Hero',[a,b]);assert.equal(t.active.total,1);assert.equal(t.finished.total,0);
 assert.equal(t.active.records[0].checklist.completed,1);assert.equal(t.active.records[0].status,'active');
 assert.equal(activeTaskRecall(p,['Hero']).records[0].checklist.completed,1);
 assert.equal(playerMenuOverview(p,'Hero',null,{scenes:[a,b]}).tasks.total,1);
 assert.equal(taskTracker(p,'Other',[a,b]).active.total,0);
 const missing=replay([sc('orphan',[child('step','start',{goal:'Find optician'})])]);assert.equal(taskTracker(missing,'Hero').active.total,1);
 assert.equal(taskSaveReview({},[child('step','start',{goal:'Find optician'})],'Find optician').parent_warnings.length,1);
});
test('review calls out possible stale task and never creates progress',()=>{
 const a=sc('a',[ev('parent','start',{goal:'Replace broken glasses',next_step:'Find optician'})]),p=replay([a]);
 const r=taskSaveReview(p,[],'Hero decided to replace broken glasses.');assert.equal(r.possible_missing_updates[0].plan_id,'glasses');assert.equal(p.plans[0].history.length,1);
 assert.equal(taskSaveReview(p,[ev('update','advance')],'Replace broken glasses').possible_missing_updates.length,0);
});
