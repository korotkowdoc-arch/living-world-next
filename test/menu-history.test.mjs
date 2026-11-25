import test from 'node:test';
import assert from 'node:assert/strict';
import {menuHistory,explicitGoalTasks,hasMenuRecords,reviewedMenuHistory} from '../public/core/menu-history.mjs';
import {playerMenuOverview,menuSection} from '../public/core/game-menu.mjs';
import {replay} from '../public/core/continuity.mjs';
const body='Hero worked and received money. Hero met Anna. Hero wants to study.';
const src={scene_id:'s',event_id:'g'};
const note={id:'n',type:'world',scene_memory_version:1,memory_kind:'intention',domain:'education',actor:'Hero',actors:['Hero','Anna'],summary:'Study someday',evidence:'Hero wants to study.'};
const pay={id:'m',type:'money',operation:'transfer',actor:'Anna',counterparty:'Hero',currency:'GBX',delta:-400,evidence:'Hero worked and received money.'};
const episode={id:'e',type:'world',interaction_version:1,interaction_kind:'meeting',actors:['Hero','Anna'],description:'Met Anna',evidence:'Hero met Anna.'};
const goal={id:'g',type:'character',name:'Hero',state_patch:{personal_goal:'Live independently'},evidence:'Hero wants to study.'};
const scene={id:'s',body,world_time:'2000-01-01 09:00',events:[note,pay,episode,goal]};
test('accepted episodes populate top-level contacts and explicit goals populate priorities without manufacturing a plan',()=>{
 const p=replay([scene]);const o=playerMenuOverview(p,'Hero',scene.world_time,{scenes:[scene]});
 assert.equal(o.contacts.total,1);assert.equal(o.contacts.records[0].name,'Anna');
 assert.equal(o.social_dashboard.contacts.total,1);assert.equal(o.tasks.records[0].id,'goal:Hero:personal_goal');
 assert.equal(p.plans.length,0);assert.equal(menuSection(o,'tasks').data.current_tasks.total,1);
 assert.equal(o.historical.intentions.records[0].title,'Study someday');
 assert.equal(o.historical.work_payments.records[0].amount,400);
 assert.equal(o.work_systems.shifts.total,0);
});
test('historical intent does not leak another holder or rejected data and never becomes a task',()=>{
 const p={validation_warnings:[{scene_id:'s',event_id:'m'}]};
 const h=menuHistory(p,'Hero',[scene]);
 assert.equal(h.work_payments.total,0);assert.equal(h.intentions.total,1);
 assert.equal(menuHistory(p,'Anna',[scene]).intentions.total,0);
 assert.equal(menuHistory({},'Hero',[scene],{complete:false}).intentions.total,0);
 assert.deepEqual(explicitGoalTasks({goals:{records:[{field:'personal_goal',title:'Goal',source:src}]}},'Hero').map(x=>x.id),['goal:Hero:personal_goal']);
 assert.equal(hasMenuRecords({a:{records:[],total:0}}),false);assert.equal(hasMenuRecords({a:{records:[{}],total:1}}),true);
});

test('reviewed historical annotations have a single explicit holder and active ancestry',()=>{
 const rows=[{scene_id:'s',note_key:'menu-work-1',note:{kind:'action',summary:'Worked',quote:'Hero worked',actors:['Hero']}},{scene_id:'s',note_key:'menu-goals-2',note:{kind:'intention',summary:'Old intention',quote:'Hero said',actors:['Hero','Anna']}},{scene_id:'elsewhere',note_key:'menu-work-3',note:{kind:'action',summary:'Outside branch',quote:'Worked',actors:['Hero']}}];
 const h=reviewedMenuHistory(rows,[scene],'Hero',{complete:true});
 assert.equal(h.work.total,1);assert.equal(h.goals.total,0);assert.equal(h.canonical,false);
 assert.equal(reviewedMenuHistory(rows,[scene],'Anna').work.total,0);
});
import {prepareStoryTurn} from '../public/core/story-turn.mjs';
import {MENU_PREFIX} from '../public/core/game-menu.mjs';
test('selected explicit goal appears as a prioritized narrative opportunity without performing it',()=>{
 const b='10000000-0000-4000-8000-000000000001',p=replay([scene]),rules=[{id:'r',active:true,text:MENU_PREFIX+JSON.stringify({kind:'focus',branch_id:b,priorities:['goal:Hero:personal_goal']})}];
 const t=prepareStoryTurn([scene],p,rules,{actors:['Hero'],branchId:b});
 const g=t.candidates.find(x=>x.kind==='life_goal');assert.equal(g.player_priority,1);assert.equal(g.certainty,'candidate_only_not_performed');
});

 test('health, calendar and inventory history are displayed without creating current records',()=>{
 const rows=['health','calendar','inventory'].map(k=>({scene_id:'s',note_key:'menu-'+k+'-1',note:{kind:k==='calendar'?'claim':'action',summary:k+' history',quote:'Hero worked',actors:['Hero']}}));
 const reviewedHistory=reviewedMenuHistory(rows,[scene],'Hero',{complete:true});const p=replay([scene]);const o=playerMenuOverview(p,'Hero',scene.world_time,{scenes:[scene],reviewedHistory});
 assert.equal(menuSection(o,'health').data.reviewed_health.total,1);assert.equal(menuSection(o,'calendar').data.reviewed_calendar.total,1);assert.equal(menuSection(o,'inventory').data.reviewed_inventory.total,1);
 assert.equal(o.inventory.total,0);assert.equal(o.life.calendar.total,0);assert.equal(o.social_dashboard.health.total,0);
 });
