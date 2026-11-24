import test from 'node:test';import assert from 'node:assert/strict';
import {createAncestryReader} from '../public/core/ancestry-reader.mjs';
import {reviewSceneDraft} from '../public/core/scene-draft.mjs';
import {parseStoryDate} from '../public/core/world-time.mjs';
const chain=[{id:'c',parent_scene_id:'b'},{id:'b',parent_scene_id:'a'},{id:'a',parent_scene_id:null}];
test('strict ancestry rejects broken or mixed pages and marks capped reads',()=>{
 let r=createAncestryReader('c',{maxScenes:3,pageSize:2});r.accept(chain.slice(0,2));r.accept(chain.slice(2));assert.equal(r.next(),null);assert.deepEqual(r.result().scenes.map(s=>s.id),['a','b','c']);assert.equal(r.result().complete,true);
 r=createAncestryReader('c',{maxScenes:2,pageSize:2});r.accept(chain.slice(0,2));r.accept(chain.slice(2));assert.equal(r.result().complete,false);
 r=createAncestryReader('c');assert.throws(()=>r.accept([chain[0],chain[2]]),/missing|mixed/);
 r=createAncestryReader('c');assert.throws(()=>r.accept([chain[0]]),/root/);
});
test('draft preview never mutates canon and rejects wrong resource changes',()=>{
 const e={id:'p',type:'world',dynamics_version:1,dynamics_kind:'contest',record_id:'p',key:'dynamics:contest:p',title:'Спор',resource:'Книга',actors:['А','Б'],status:'open',description:'Спор начался',evidence:'Спор начался'};
 const memory={complete:true,scenes:[{id:'a',parent_scene_id:null,body:'Спор начался.',events:[e]}]};
 const snapshot=JSON.stringify(memory),body='Спор завершился. Книга осталась на полке.';
 const finish={...e,id:'p2',status:'decided',outcome:'Книга осталась на полке',evidence:'Книга осталась на полке'};
 const result=reviewSceneDraft(memory,{body,events:[finish]});assert.equal(result.ok,true);assert.equal(result.saved,false);assert.equal(result.changes[0].status,'decided');assert.equal(JSON.stringify(memory),snapshot);
 assert.equal(reviewSceneDraft(memory,{body,events:[{...finish,resource:'Другой предмет'}]}).ok,false);
});
test('early historical year parsed correctly',()=>{assert.ok(parseStoryDate('0099-01-01 12:00'));assert.equal(parseStoryDate('0099-02-30'),null);});
