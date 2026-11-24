import test from 'node:test';
import assert from 'node:assert/strict';
import {validateScene,replay,branchAncestry} from '../public/core/continuity.mjs';
import {promptForNarrator} from '../public/core/world.mjs';
const ev=(id,type,evidence,rest={})=>({id,type,evidence,...rest});
const scene=(id,parent_scene_id,body,events=[])=>({id,parent_scene_id,body,events,world_time:'1991-10'});
test('NPC plan persists with individual goal and never silently becomes a completed action',()=>{
 const s1=scene('a',null,'Драко решил выиграть конкурс.',[ev('start','plan','решил выиграть',{actor:'Драко',plan_id:'competition',action:'start',goal:'Выиграть конкурс'})]);
 const s2=scene('b','a','Драко отложил подготовку.',[ev('pause','plan','отложил подготовку',{actor:'Драко',plan_id:'competition',action:'pause'})]);
 const p=replay([s1,s2]);
 assert.equal(p.plans.length,1);assert.equal(p.plans[0].status,'paused');assert.equal(p.plans[0].goal,'Выиграть конкурс');
 assert.equal(p.plans[0].history.length,2);assert.equal(p.offscreen.length,0);
 const prompt=promptForNarrator({world:{seed:'История о школе магии'},projection:p});
 assert.match(prompt,/ЕЩЁ НЕ произошедшие действия/);assert.match(prompt,/Драко/);
});
test('plan cannot complete from a promise or hypothetical intention alone',()=>{
 const body='Он пообещал выиграть. Даже если не сможет.';
 const orphan=ev('finish','plan','пообещал выиграть',{actor:'Драко',plan_id:'competition',action:'complete'});
 assert.equal(validateScene({body,events:[orphan]}).ok,false);
 assert.equal(validateScene({body,events:[{...orphan,performed_event_id:'missing'}]}).ok,false);
 const actual=ev('performed','offscreen','Он пообещал выиграть',{actor:'Драко'});
 assert.equal(validateScene({body,events:[{...orphan,performed_event_id:'performed'},actual]}).ok,true);
});
test('a real performed event completes an existing plan without changing unrelated hostility',()=>{
 const a=scene('a',null,'Драко решил поступить в клуб.',[ev('p1','plan','решил поступить',{actor:'Драко',plan_id:'club',action:'start',goal:'Поступить в клуб'})]);
 const b=scene('b','a','Драко зачислен в клуб, а Гарри отвернулся.',[
  ev('done','offscreen','Драко зачислен в клуб',{actor:'Драко'}),
  ev('p2','plan','Драко зачислен в клуб',{actor:'Драко',plan_id:'club',action:'complete',performed_event_id:'done'})
 ]);
 const p=replay([a,b]);assert.equal(p.plans[0].status,'completed');assert.equal(p.plans[0].performed_event_id,'done');assert.equal(p.relationships.length,0);
});
test('cancelled alternative branch never contributes NPC plans to the current narrative',()=>{
 const root=scene('root',null,'Общая сцена без решений.');
 const left=scene('left','root','Снейп планировал увольнение.',[ev('old','plan','планировал увольнение',{actor:'Снейп',plan_id:'leave',action:'start',goal:'Уволиться'})]);
 const right=scene('right','root','Снейп решил остаться в школе.',[ev('new','plan','решил остаться',{actor:'Снейп',plan_id:'teach',action:'start',goal:'Продолжить преподавание'})]);
 const p=replay(branchAncestry([root,left,right],'right'));
 assert.deepEqual(p.plans.map(x=>x.plan_id),['teach']);
});
test('invalid plan transitions are reported without inventing a goal',()=>{
 const orphan=scene('orphan',null,'План внезапно завершён.',[ev('p','plan','План внезапно завершён',{actor:'Драко',plan_id:'nothing',action:'abandon'})]);
 const p=replay([orphan]);assert.equal(p.plans.length,0);assert.equal(p.events_replayed,0);assert.equal(p.validation_warnings.length,1);
});
test('structured SQL memory can be replayed without literary bodies only when flagged verified',()=>{
 const history=[{id:'a',world_time:'1991',events:[ev('p','plan','освоить метлу',{actor:'Гарри',plan_id:'fly',action:'start',goal:'Освоить метлу'})]}];
 assert.equal(replay(history).plans.length,0);
 assert.equal(replay(history,[],{evidencePrevalidated:true}).plans.length,1);
});

test('a changed NPC goal and deadline keep separate sources, with old deadline explicitly removed',()=>{
 const first=scene('a',null,'Драко решил выиграть конкурс.',[ev('p','plan','решил выиграть',{actor:'Драко',plan_id:'c',action:'start',goal:'Выиграть',due_at:'1991-10-01'})]);
 const second=scene('b','a','Драко решил искать союзника.',[ev('p2','plan','решил искать союзника',{actor:'Драко',plan_id:'c',action:'advance',plan_patch:{goal:'Искать союзника',due_at:null,obstacle:'Нет доступа'}})]);
 const result=replay([first,second]);const plan=result.plans[0];
 assert.equal(plan.goal,'Искать союзника');assert.equal(plan.due_at,null);assert.equal(plan.obstacle,'Нет доступа');
 assert.equal(plan.field_sources.goal.scene_id,'b');assert.equal(plan.status,'active');assert.equal(plan.history.length,2);
 assert.equal(validateScene({body:second.body,events:[{...second.events[0],plan_patch:{goal:null}}]}).ok,false);
});
