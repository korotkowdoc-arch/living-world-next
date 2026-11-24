import test from 'node:test';
import assert from 'node:assert/strict';
import {replay,validateScene} from '../public/core/continuity.mjs';
import {relationshipHistory} from '../public/core/relationship-memory.mjs';
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
