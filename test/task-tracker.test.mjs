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
