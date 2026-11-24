import test from 'node:test';
import assert from 'node:assert/strict';
import {storyDrivers,storyDriverPrompt} from '../public/core/story-drivers.mjs';
import {promptForNarrator} from '../public/core/world.mjs';
import {buildNextContext} from '../public/core/continuity.mjs';
const world={id:'11111111-1111-4111-8111-111111111111',seed:'Хогвартс, 1991 год.',title:'Хогвартс'};
const rule={text:'Гарри и Малфой — непримиримые враги.',active:true,metadata:{relationship_lock:{
 a:'Гарри',b:'Малфой',forbid_reconciliation:true,forbid_respect:true}}};
const projection={
 plans:[{actor:'Драко',goal:'Победить в состязании',status:'active',source:{scene_id:'scene-1'}},
  {actor:'Гарри',goal:'Уехать из школы',status:'completed',source:{scene_id:'scene-2'}}],
 relationships:[{a:'Гарри',b:'Малфой',stance:'enemies',source:{scene_id:'scene-3'}},
  {a:'Снейп',b:'Люпин',stance:'hostile',source:{scene_id:'scene-4'}}],
 obligations:[{commitment_id:'letter',actor:'Гарри',status:'pending',evidence:'обещал передать письмо',source:{scene_id:'scene-5'}},
  {commitment_id:'done',actor:'Гермиона',status:'fulfilled'}]
};
test('story drivers never auto-complete goals or erase hatred with goodwill',()=>{
 const list=storyDrivers(projection,[rule]);
 assert.equal(list.filter(x=>x.kind==='author_relationship_boundary').length,1);
 assert.equal(list.filter(x=>x.kind==='npc_intention').length,1);
 assert.equal(list.find(x=>x.kind==='npc_intention').actor,'Драко');
 assert.ok(list.some(x=>x.kind==='recorded_commitment'&&x.commitment_id==='letter'));
 assert.equal(list.some(x=>x.commitment_id==='done'),false);
 assert.ok(list.some(x=>x.kind==='established_antagonism'&&x.actors[0]==='Снейп'));
 assert.ok(!list.some(x=>x.kind==='established_antagonism'&&x.actors[0]==='Гарри'));
 assert.equal(list.some(x=>x.kind==='npc_intention'&&x.actor==='Гарри'),false);
});
test('narration prompt makes NPCs act instead of performing ritual permission loops',()=>{
 const prompt=promptForNarrator({world,projection,directives:[rule]});
 assert.match(prompt,/ПРОВЕРЕННЫЕ НЕРЕШЁННЫЕ МОТИВЫ/);
 assert.match(prompt,/Драко намерен/);
 assert.match(prompt,/не форсируй компромисс|не выводи из намерения/i);
 assert.match(prompt,/не заставляй их спрашивать разрешение/i);
 assert.match(prompt,/без примирения: true/);
});
test('recorded commitment with unknown status is never labeled outstanding as a fact',()=>{
 const list=storyDrivers({obligations:[{commitment_id:'c1',actor:'Профессор',evidence:'Пообещал помощь'}]},[]);
 assert.equal(list[0].status,'unknown');
 assert.equal(list[0].certainty,'completion_status_unknown');
});
test('the narrator receives story drivers only from actual active branch replay',()=>{
 const s={id:'s1',parent_scene_id:null,world_time:'1991',body:'Драко решил действовать самостоятельно.',
 events:[{id:'p1',type:'plan',actor:'Драко',plan_id:'self',action:'start',goal:'Найти союзника',evidence:'решил действовать'}]};
 const ctx=buildNextContext({world,scenes:[s],directives:[rule]});
 assert.equal(ctx.active_story_drivers.some(x=>x.kind==='npc_intention'),true);
 const empty=buildNextContext({world,scenes:[],directives:[]});
 assert.equal(empty.active_story_drivers.length,0);
});

test('independent open threads are available to narrator without revealing them to actors',()=>{
 const worldFacts=[{social_record_version:1,social_kind:'thread',status:'open',title:'Тайное расследование',actors:['Снейп','Люпин'],visibility:'private',source:{scene_id:'s'}},
 {social_record_version:1,social_kind:'thread',status:'resolved',title:'Завершённая линия',actors:['Снейп']}];
 const d=storyDrivers({worldFacts});
 assert.equal(d.length,1);assert.equal(d[0].kind,'independent_thread');
 assert.match(storyDriverPrompt(d),/Тайное расследование/);
 assert.match(storyDriverPrompt(d),/Не раскрывай/);
});
