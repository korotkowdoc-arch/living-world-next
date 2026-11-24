import test from 'node:test';
import assert from 'node:assert/strict';
import {replay,validateScene,branchAncestry} from '../public/core/continuity.mjs';
import {characterStateView} from '../public/core/character-state.mjs';
import {limitedNarratorMemory} from '../public/core/narration-budget.mjs';
const body='Персонаж остался в комнате, рука всё ещё болела.';
const character=(id,name,state_patch,extra={})=>({id,type:'character',name,state_patch,evidence:body,...extra});
const s=(id,parent_scene_id,...events)=>({id,parent_scene_id,body,world_time:'1991',events});
test('new field updates never erase earlier character traits and injury sources',()=>{
 const scenes=[s('a',null,character('a','Гарри',{injury:'Болит рука',habit:'Рано встаёт'},{description:'Упрямый'})),
  s('b','a',character('b','Гарри',{location:'Гостиная'})),s('c','b',character('c','Гарри',{mood:'Зол'}))];
 const p=replay(scenes),person=p.people[0];
 assert.equal(person.description,'Упрямый');
 assert.equal(person.state_fields.find(x=>x.field==='injury').source.scene_id,'a');
 assert.equal(person.state_fields.find(x=>x.field==='location').value,'Гостиная');
 assert.equal(person.state_fields.length,4);
 const ctx=limitedNarratorMemory(p).records.people[0];
 assert.equal(ctx.state_fields.find(x=>x.field==='injury').source.scene_id,'a');
});
test('a null patch marks uncertainty only in that one field and does not erase original scenes',()=>{
 const scenes=[s('a',null,character('a','А',{location:'Дом',condition:'Устал'})),
  s('b','a',character('b','А',{location:null}))];
 const result=replay(scenes).people[0];
 assert.equal(result.state_fields.find(x=>x.field==='location').state,'explicitly_unknown');
 assert.equal(result.state_fields.find(x=>x.field==='condition').value,'Устал');
 assert.equal(scenes[0].events[0].state_patch.location,'Дом');
});
test('unknown keys, oversized values, non-string objects and missing actor fail validation',()=>{
 for(const event of [character('a','А',{unknown:'x'}),character('b','А',{location:'x'.repeat(601)}),
  character('c','А',{mood:{a:1}}),character('d','',{location:'Дом'})])
  assert.equal(validateScene({body,events:[event]}).ok,false);
});
test('alternative scene field values do not leak into active branch',()=>{
 const all=[s('a',null,character('a','А',{condition:'Устал'})),
  s('b','a',character('b','А',{location:'Дом'})),s('c','a',character('c','А',{location:'Улица'}))];
 const p=replay(branchAncestry(all,'c'));
 assert.equal(p.people[0].state_fields.find(x=>x.field==='location').value,'Улица');
 assert.equal(p.people[0].state_fields.find(x=>x.field==='condition').value,'Устал');
});
test('legacy character events remain readable without erasing explicit independent fields',()=>{
 const p=replay([s('a',null,character('a','А',{injury:'Перелом'})),
  s('b','a',{id:'b',type:'character',name:'А',description:'Устал',evidence:body})]);
 assert.equal(p.people[0].state_fields[0].value,'Перелом');
});
test('directed knowledge and relationships remain distinct, unknown profile is not invented',()=>{
 const p=replay([s('a',null,character('a','А',{mood:'Сердится'}),
  {id:'r',type:'relationship',a:'А',b:'Б',stance:'hate',evidence:body},
  {id:'k',type:'knowledge',actor:'Б',fact:'Пароль',channel:'heard',evidence:body})]);
 const a=characterStateView(p,'А',{complete:false}),b=characterStateView(p,'Б');
 assert.equal(a.memory_complete,false);assert.equal(a.records.filter(x=>x.kind==='knowledge').length,0);
 assert.equal(b.character,null);assert.equal(b.records.find(x=>x.kind==='relationship').a,'А');
 assert.equal(b.records.find(x=>x.kind==='knowledge').fact,'Пароль');
});
