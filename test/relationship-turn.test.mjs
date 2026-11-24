import test from 'node:test';
import assert from 'node:assert/strict';
import {replay,validateScene} from '../public/core/continuity.mjs';
import {memoryReviewPage,draftEvidenceCoverage} from '../public/core/annotation-passages.mjs';
import {relationshipHistory} from '../public/core/relationship-memory.mjs';
import {reviewSceneDraft} from '../public/core/scene-draft.mjs';
import {focusedSceneContext} from '../public/core/scene-context.mjs';
import {characterAge,characterStateView} from '../public/core/character-state.mjs';
import {familyDutyWindow,dynamicsTransitionError} from '../public/core/world-dynamics.mjs';
import {parseStoryDate} from '../public/core/world-time.mjs';
import {prepareStoryTurn} from '../public/core/story-turn.mjs';
const body='Анна и Борис сходили на свидание. Позднее они расстались.';
const event={id:'date1',type:'world',interaction_version:1,interaction_kind:'date',actors:['Анна','Борис'],description:'Свидание',evidence:'сходили на свидание'};
test('personal episodes require two participants and evidence',()=>{
 for(const kind of ['date','romantic_milestone','intimacy','separation']){
  const e={...event,interaction_kind:kind};
  assert.equal(validateScene({body,events:[e]}).ok,true);
  assert.equal(validateScene({body,events:[{...e,actors:['Анна','Борис','Вера']}]}).ok,false);
  assert.equal(validateScene({body,events:[{...e,evidence:'нет такой цитаты'}]}).ok,false);
 }
});
test('personal episodes enter history and focused turn once, not inferred emotions',()=>{
 const scenes=[{id:'s',body,events:[event,{...event,id:'split',interaction_kind:'separation',description:'Расставание',evidence:'они расстались'}]}];
 const p=replay(scenes);
 assert.equal(p.relationships.length,0);
 const h=relationshipHistory(scenes,p,{actor:'Анна',other:'Борис'});
 assert.deepEqual(h.history.map(x=>x.kind),['separation','date']);
 const before=JSON.stringify(p);
 const turn=prepareStoryTurn(scenes,p,[],{actors:['Анна','Борис']});
 assert.equal(turn.relationship_context.length,2);
 assert.ok(turn.relationship_context.every(x=>x.source.scene_id==='s'));
 assert.equal(prepareStoryTurn(scenes,p,[],{actors:['Вера']}).relationship_context.length,0);
 assert.equal(JSON.stringify(p),before);
});

test('focused turn counts all omitted accepted interactions in reverse order',()=>{
 const scenes=Array.from({length:20},(_,i)=>({id:'s'+i,body,events:[{...event,id:'d'+i}]}));
 const p=replay(scenes);
 const turn=prepareStoryTurn(scenes,p,[],{actors:['Анна','Борис']});
 assert.equal(turn.relationship_context.length,12);
 assert.equal(turn.relationship_context_omitted,8);
 assert.equal(turn.relationship_context[0].source.scene_id,'s19');
});
test('draft preview includes keyless interaction without committing it',()=>{
 const memory={scenes:[],complete:true};
 const review=reviewSceneDraft(memory,{body,events:[event]});
 assert.equal(review.ok,true);
 assert.equal(review.saved,false);
 assert.equal(review.changes[0].category,'interaction');
 assert.deepEqual(review.changes[0].actors,['Анна','Борис']);
 assert.deepEqual(memory.scenes,[]);
});

test('personal feelings and family bonds remain independent',()=>{
 const body='Анна ревнует Бориса. Анна и Борис состоят в браке.';
 const feeling={id:'f',type:'relationship',a:'Анна',b:'Борис',relationship_version:1,relationship_patch:{jealousy:'jealous',attraction:'ambivalent'},evidence:'Анна ревнует Бориса'};
 const bond={id:'b',type:'world',dynamics_version:1,dynamics_kind:'bond',record_id:'marriage1',key:'dynamics:bond:marriage1',actor:'Анна',counterparty:'Борис',bond_type:'marriage',status:'active',description:'Брак',evidence:'состоят в браке'};
 const scenes=[{id:'s',body,events:[feeling,bond]}];
 assert.equal(validateScene({body,events:[feeling,bond]}).ok,true);
 const p=replay(scenes);assert.equal(p.relationships.length,1);assert.equal(p.relationships[0].relationship_fields.length,2);
 assert.equal(prepareStoryTurn(scenes,p,[],{actors:['Борис']}).candidates.find(x=>x.kind==='personal_bond').bond_type,'marriage');
 assert.equal(prepareStoryTurn(scenes,p,[],{actors:['Вера']}).candidates.some(x=>x.kind==='personal_bond'),false);
});

test('family state survives independent health updates',()=>{
 const body='Анна сообщила о беременности. Позже она простудилась.';
 const scenes=[{id:'s',body,events:[{id:'p',type:'character',name:'Анна',state_patch:{pregnancy:'Подтверждена'},evidence:'сообщила о беременности'},{id:'h',type:'character',name:'Анна',state_patch:{condition:'Простуда'},evidence:'она простудилась'}]}];
 const p=replay(scenes);assert.equal(p.validation_warnings.length,0);assert.equal(p.people[0].state_fields.find(x=>x.field==='pregnancy').value,'Подтверждена');assert.equal(p.people[0].state_fields.find(x=>x.field==='condition').value,'Простуда');
});

test('family milestones become due candidates without completing themselves',()=>{
 const body='Анна запланировала семейный праздник.';
 const e={id:'family1',type:'world',dynamics_version:1,dynamics_kind:'family_event',record_id:'party',key:'dynamics:family_event:party',family_kind:'birthday',title:'Праздник',actors:['Анна'],description:'Семейный праздник',status:'planned',due_at:'2026-12-01',evidence:'запланировала семейный праздник'};
 const scenes=[{id:'s',body,world_time:'2026-11-24',events:[e]}];
 assert.equal(validateScene({body,events:[e]}).ok,true);
 assert.equal(validateScene({body,events:[{...e,status:'completed'}]}).ok,false);
 const p=replay(scenes);const turn=prepareStoryTurn(scenes,p,[],{target_time:'2026-12-02'});
 assert.equal(turn.candidates.find(x=>x.kind==='family_event').timing,'reached_requires_story');
 assert.equal(p.worldFacts[0].status,'planned');
});

test('calendar age and birthdays follow fictional time without overwriting state',()=>{
 const body='Анна родилась 29 февраля 2000 года.';
 const e={id:'birth',type:'character',name:'Анна',state_patch:{birth_date:'2000-02-29'},evidence:body};
 assert.equal(validateScene({body,events:[e]}).ok,true);
 assert.equal(validateScene({body,events:[{...e,state_patch:{birth_date:'2001-02-29'}}]}).ok,false);
 const scenes=[{id:'s',body,world_time:'2023-02-28',events:[e]}],p=replay(scenes),snapshot=JSON.stringify(p);
 assert.equal(characterAge(p.people[0],'2023-02-28').years,22);
 assert.equal(characterStateView(p,'Анна',{worldTime:'2023-03-01'}).character.age.years,23);
 assert.equal(characterAge(p.people[0],'1999-01-01').status,'before_recorded_birth');
 assert.equal(characterAge(p.people[0],null),null);
 const turn=prepareStoryTurn(scenes,p,[],{actors:['Анна'],target_time:'2025-03-01'});
 assert.equal(turn.life_context[0].target_age.years,25);
 assert.equal(turn.candidates.find(x=>x.kind==='age_milestone').birthdays_crossed,3);
 assert.equal(JSON.stringify(p),snapshot);
});
test('recurring duties count elapsed calendar days, not performed actions',()=>{
 const body='Анна забирает ребёнка каждые два дня.';
 const e={id:'d',type:'world',dynamics_version:1,dynamics_kind:'family_duty',record_id:'care',key:'dynamics:family_duty:care',family_kind:'care',title:'Забрать ребёнка',actors:['Анна'],description:body,evidence:body,status:'active',starts_on:'2026-01-01',every_days:2,ends_on:'2026-01-09'};
 assert.equal(validateScene({body,events:[e]}).ok,true);
 assert.equal(validateScene({body,events:[{...e,every_days:0}]}).ok,false);
 assert.ok(dynamicsTransitionError(new Map([[e.key,e]]),{...e,every_days:3}));
 const scenes=[{id:'s',body,world_time:'2026-01-02',events:[e]}],p=replay(scenes);
 const turn=prepareStoryTurn(scenes,p,[],{target_time:'2026-01-15'});
 const duty=turn.candidates.find(x=>x.kind==='family_duty');
 assert.equal(duty.occurrences,4);assert.equal(duty.first_due_on,'2026-01-03');assert.equal(duty.last_due_on,'2026-01-09');
 assert.equal(p.worldFacts[0].status,'active');
 assert.equal(familyDutyWindow({...e,status:'paused'},null,parseStoryDate('2026-01-03')),null);
 assert.equal(familyDutyWindow(e,null,parseStoryDate('2026-01-04')),null);
});

test('focused context carries age for exact selected names only',()=>{
 const body='Анна родилась в 2000 году, Борис в 1999 году.';
 const events=[{id:'a',type:'character',name:'Анна',state_patch:{birth_date:'2000-01-01'},evidence:'Анна родилась в 2000 году'},{id:'b',type:'character',name:'Борис',state_patch:{birth_date:'1999-01-01'},evidence:'Борис в 1999 году'}];
 const p=replay([{id:'s',body,events}]);
 const r=focusedSceneContext(p,{actors:['Анна']},{worldTime:'2026-01-01'});
 assert.equal(r.life_context.length,1);assert.equal(r.life_context[0].age.years,26);
 assert.equal(focusedSceneContext(p,{actors:['анна']},{worldTime:'2026-01-01'}).life_context.length,0);
});

test('turn attaches bounded independent actor context and background NPC motives',()=>{
 const p={people:[{name:'Анна',state_fields:[{field:'temperament',value:'Решительная',source:{scene_id:'s1'}}]}],
 plans:[{actor:'Борис',plan_id:'b',goal:'Устроиться на работу',status:'active',source:{scene_id:'s1'}},{actor:'Анна',plan_id:'a',goal:'Переехать',status:'active',source:{scene_id:'s2'}}],
 knowledge:Array.from({length:6},(_,i)=>({actor:'Анна',fact:'Факт '+i,channel:'Разговор',source:{scene_id:'s2'}})).concat({actor:'Борис',fact:'Тайна Бориса',source:{scene_id:'s1'}}),
 relationships:[{a:'Анна',b:'Борис',stance:'enemies',source:{scene_id:'s2'}}],
 offscreen:[{actor:'Борис',description:'Сходил на собеседование',source:{scene_id:'s2'}}]};
 const scenes=[{id:'s1',world_time:'2026-01-01'},{id:'s2',world_time:'2026-01-02'}],snapshot=JSON.stringify(p);
 const turn=prepareStoryTurn(scenes,p,[],{actors:['Анна'],limit:10});
 const a=turn.actor_context[0],b=turn.actor_context.find(x=>x.actor==='Борис');
 assert.equal(a.actor,'Анна');assert.equal(a.knowledge.length,4);assert.equal(a.omitted.knowledge,2);
 assert.ok(a.knowledge.every(k=>k.holder==='Анна'));assert.equal(b.knowledge[0].holder,'Борис');
 assert.equal(a.relationships[0].a,'Анна');assert.equal(b.relationships[0].b,'Борис');
 assert.equal(b.recent_offscreen[0].description,'Сходил на собеседование');
 assert.equal(turn.drivers.find(x=>x.kind==='npc_intention').actor,'Анна');
 assert.equal(JSON.stringify(p),snapshot);
});

test('actor context has a total size budget and reports every omitted record',()=>{
 const actors=Array.from({length:8},(_,i)=>'Герой '+i);
 const p={plans:actors.map((actor,i)=>({actor,plan_id:'p'+i,status:'active',goal:'Цель'})),
 knowledge:actors.flatMap(actor=>Array.from({length:10},(_,i)=>({actor,fact:'Данные '+i+'я'.repeat(800),channel:'Канал'.repeat(80),source:{scene_id:'s'}})))};
 const turn=prepareStoryTurn([{id:'s',world_time:'2026-01-01'}],p,[],{actors});
 assert.ok(JSON.stringify(turn.actor_context).length<=18000);
 for(const ctx of turn.actor_context){assert.equal(ctx.knowledge.length+(ctx.omitted.knowledge||0),10);assert.ok(ctx.knowledge.every(k=>k.holder===ctx.actor));}
 assert.ok(turn.actor_context.every(x=>x.intentions.length===1));
});

test('memory review pages overlap and preserve explicit ancestry',()=>{
 const rows=[{id:'c',parent_scene_id:'b',events:[]},{id:'b',parent_scene_id:'a',events:[{id:'e'}]},{id:'a',parent_scene_id:null,events:[]}];
 const page=memoryReviewPage(rows,{head:'c',limit:2});
 assert.deepEqual(page.items.map(x=>x.annotation_state),['no_structured_events','has_structured_events']);assert.equal(page.next_offset,2);
 assert.equal(memoryReviewPage(rows.slice(1),{head:'c',offset:2,limit:2}).items[0].scene_id,'a');
 assert.throws(()=>memoryReviewPage([rows[0],rows[2]],{head:'c',limit:2}));
});
test('draft evidence coverage remains diagnostic',()=>{
 const body='Анна вошла в дом. '+('Описание комнаты. '.repeat(200));
 const events=[{id:'a',type:'character',name:'Анна',state_patch:{location:'Дом'},evidence:'Анна вошла в дом.'}];
 const result=reviewSceneDraft({complete:true,scenes:[]},{body,events});
 assert.equal(result.ok,true);assert.ok(result.evidence_coverage.passages_without_local_evidence>0);
 assert.equal(result.saved,false);assert.ok(draftEvidenceCoverage(body,events).uncovered_examples.length<=5);
});
test('life transitions do not automatically change occupation or stage',()=>{
 const body='Анна собирается сменить работу.';
 const e={id:'job',type:'world',key:'dynamics:life_transition:job',dynamics_version:1,dynamics_kind:'life_transition',record_id:'job',transition_kind:'employment',actor:'Анна',title:'Новая работа',description:body,evidence:body,status:'planned',due_at:'2026-12-01'};
 const scenes=[{id:'s',body,world_time:'2026-11-24',events:[e]}];const p=replay(scenes);
 assert.equal(p.worldFacts.length,1);assert.equal(p.people.length,0);
 assert.equal(prepareStoryTurn(scenes,p,[],{target_time:'2026-12-02'}).candidates.find(x=>x.kind==='life_transition').timing,'reached_requires_story');
 assert.equal(validateScene({body,events:[{...e,status:'completed'}]}).ok,false);
 assert.ok(dynamicsTransitionError(new Map([[e.key,e]]),{...e,actor:'Борис'}));
});

test('recorded family duty occurrences close only their exact scheduled dates',()=>{
 const duty={type:'world',dynamics_version:1,dynamics_kind:'family_duty',record_id:'care',key:'dynamics:family_duty:care',family_kind:'care',title:'Уход',actors:['Анна'],description:'Уход',status:'active',starts_on:'2026-01-01',every_days:2};
 const e={type:'world',dynamics_version:1,dynamics_kind:'family_event',record_id:'visit1',key:'dynamics:family_event:visit1',family_kind:'care',title:'Уход',actors:['Анна'],description:'Уход',status:'completed',outcome:'Выполнено',duty_id:'care',scheduled_on:'2026-01-03'};
 const records=new Map([[duty.key,duty]]);assert.equal(dynamicsTransitionError(records,e),null);
 assert.ok(dynamicsTransitionError(records,{...e,scheduled_on:'2026-01-02'}));
 records.set(e.key,e);assert.ok(dynamicsTransitionError(records,{...e,record_id:'other',key:'dynamics:family_event:other'}));
 assert.ok(dynamicsTransitionError(records,{...e,scheduled_on:'2026-01-05'}));
 assert.equal(familyDutyWindow(duty,parseStoryDate('2026-01-03'),parseStoryDate('2026-01-03'),[e]),null);
 const window=familyDutyWindow(duty,parseStoryDate('2026-01-01'),parseStoryDate('2026-01-05'),[e]);
 assert.equal(window.occurrences,2);assert.equal(window.pending_occurrences,1);assert.equal(window.first_due_on,'2026-01-05');
});

test('turn links independent plans to actual means and possible constraints without performing them',()=>{
 const src={scene_id:'s',event_id:'x'};
 const p={people:[{name:'Анна',state_fields:[{field:'location',value:'Дом',source:src}]}],
 plans:[{actor:'Анна',plan_id:'buy',goal:'Купить книгу',status:'paused',place:'Магазин',obstacle:'Закрыт',source:src}],
 balances:[{actor:'Анна',currency:'coin',known:false,balance:null,delta:10,source:src},{actor:'Борис',currency:'coin',known:true,balance:20,source:src}],
 items:[{item_id:'book',name:'Книга',holder:'Борис',custody_status:'held',source:src},{item_id:'key',holder:'Анна',custody_status:'held',source:src}],
 worldFacts:[{world_record_version:1,record_kind:'place',key:'place:shop',name:'Магазин',status:'closed',source:src},
 {world_record_version:1,record_kind:'routine',key:'routine:work',actor:'Анна',activity:'Работа',place:'Офис',status:'active',weekdays:[2],start:'09:00',end:'18:00',source:src},
 {growth_version:1,growth_kind:'skill',actor:'Анна',name:'Письмо',status:'competent',source:src},
 {consequence_version:1,consequence_kind:'access',actor:'Анна',status:'active',description:'Пропуск ограничен',source:src}]};
 const snapshot=JSON.stringify(p),turn=prepareStoryTurn([{id:'s',world_time:'2026-11-24 12:00'}],p,[],{actors:['Анна']});
 const plan=turn.candidates.find(x=>x.key==='buy'),a=turn.actor_context.find(x=>x.actor==='Анна');
 for(const kind of ['paused_intention','recorded_obstacle','recorded_place_constraint','travel_requires_story','competing_schedule'])assert.ok(plan.checks.some(x=>x.kind===kind),kind);
 assert.equal(a.resources.find(x=>x.kind==='balance').balance,null);assert.equal(a.resources.find(x=>x.kind==='balance').known,false);
 assert.deepEqual(a.resources.filter(x=>x.kind==='held_item').map(x=>x.item_id),['key']);
 assert.equal(a.experience[0].name,'Письмо');assert.equal(a.responsibilities[0].kind,'consequence');
 assert.equal(JSON.stringify(p),snapshot);assert.ok(JSON.stringify(turn.actor_context).length<=18000);
});
