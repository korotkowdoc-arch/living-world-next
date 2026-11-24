import test from 'node:test';import assert from 'node:assert/strict';
import {prepareRevision} from '../public/core/revisions.mjs';
const old={body:'Гарри открыл дверь.\n\nМалфой ушёл.\n\nГарри вернулся домой.',events:[
  {id:'x',type:'world',key:'door',evidence:'открыл дверь'},
  {id:'y',type:'relationship',a:'Гарри',b:'Малфой',evidence:'Малфой ушёл.'}
]};
test('preserve exact scene prefix and only events literally inside it',()=>{
 const r=prepareRevision(old,{lastKeptQuote:'Малфой ушёл.',newContinuation:'Малфой остался в замке.'});
 assert.ok(r.body.startsWith('Гарри открыл дверь.\n\nМалфой ушёл.'));
 assert.equal(r.preservedEvents.length,2);
 assert.equal(r.droppedEvents,0);
 assert.equal(r.body.includes('Гарри вернулся домой.'),false);
});
test('replacement from start does not import events from cancelled scene',()=>{
 const r=prepareRevision(old,{newContinuation:'Это было совсем другое начало.'});
 assert.equal(r.prefix,'');assert.equal(r.preservedEvents.length,0);assert.equal(r.droppedEvents,2);
});
test('original scene is unchanged and ambiguous anchor is rejected',()=>{
 const snapshot=JSON.stringify(old);
 assert.throws(()=>prepareRevision({body:'Ход событий. Ход событий.'},{lastKeptQuote:'Ход событий.',newContinuation:'Позже всё изменилось.'}),/повторяется/);
 assert.throws(()=>prepareRevision(old,{lastKeptQuote:'Несуществующая фраза',newContinuation:'Новое'}),/отсутствует/);
 assert.equal(JSON.stringify(old),snapshot);
});

test('revision preflight rejects incomplete or mixed ancestry and ignores discarded state',async()=>{
 const {revisionStatePreflight}=await import('../public/core/revisions.mjs');
 const project={id:'p',type:'world',growth_version:1,growth_kind:'project',record_id:'p',key:'growth:project:p',actor:'А',title:'Работа',description:'Проект',status:'active',evidence:'Проект начат'};
 const original={id:'s',parent_scene_id:'a',body:'Проект начат. Потом он ушёл.',events:[project]};
 const finish={...project,id:'p2',status:'completed',outcome:'Готово',evidence:'Работа закончена'};
 const args={prefix:'',continuation:'Работа закончена.',events:[finish]};
 const memory={complete:true,scenes:[{id:'a',parent_scene_id:null,events:[]},original]};
 assert.equal(revisionStatePreflight(memory,original,args).ok,true); // first recorded project state may be completed
 assert.equal(revisionStatePreflight({...memory,complete:false},original,args).ok,false);
 assert.equal(revisionStatePreflight({complete:true,scenes:[{id:'b',events:[]},original]},original,args).ok,false);
 const prior={...memory.scenes[0],events:[{...project,status:'abandoned'}]};
 assert.equal(revisionStatePreflight({complete:true,scenes:[prior,original]},original,args).ok,false);
});
