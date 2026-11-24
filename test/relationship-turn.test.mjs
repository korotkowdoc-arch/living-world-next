import test from 'node:test';
import assert from 'node:assert/strict';
import {replay,validateScene} from '../public/core/continuity.mjs';
import {relationshipHistory} from '../public/core/relationship-memory.mjs';
import {reviewSceneDraft} from '../public/core/scene-draft.mjs';
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
