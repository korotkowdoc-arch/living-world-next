import test from 'node:test';
import assert from 'node:assert/strict';
import {focusedSceneContext,sceneFocusInput,literalFocusHits} from '../public/core/scene-context.mjs';
const source={scene_id:'scene-1',event_id:'ev'};
test('scene focus preserves directional relationships and separate holders of knowledge',()=>{
 const projection={people:[{name:'А',description:'Упрямый',source},{name:'В',description:'Другой',source}],
  relationships:[{a:'А',b:'Б',stance:'hate',source},{a:'В',b:'Б',stance:'friend',source}],
  knowledge:[{actor:'Б',fact:'пароль',channel:'heard',source},{actor:'А',fact:'встреча',channel:'seen',source}],
  plans:[{actor:'А',goal:'Победить',status:'active',source}],items:[{item_id:'book',holder:'А',source}]};
 const result=focusedSceneContext(projection,{actors:['А']});
 assert.equal(result.memory.records.people.length,1);
 assert.equal(result.memory.records.relationships.length,1);
 assert.equal(result.memory.records.relationships[0].stance,'hate');
 assert.equal(result.memory.records.knowledge.length,1);
 assert.equal(result.memory.records.knowledge[0].actor,'А');
 assert.equal(result.memory.records.items[0].source.scene_id,'scene-1');
 assert.match(result.knowledge_policy,/only to its recorded holder/);
});
test('query finds a secret without magically transferring it to selected characters',()=>{
 const result=focusedSceneContext({knowledge:[{actor:'Б',fact:'тайное письмо',source}]},{actors:['А'],queries:['письмо']},{complete:false});
 assert.equal(result.memory.records.knowledge[0].actor,'Б');
 assert.equal(result.memory_complete,false);
 assert.equal(result.matched_actor_names.length,0);
});
test('literal snippets are bounded, not promoted to facts, and focus constraints hold',()=>{
 const hits=literalFocusHits('письмо',[{scene_id:'s',snippet:'А'.repeat(1000)}]);
 assert.equal(hits.kind,'literal_text_only');assert.equal(hits.hits[0].excerpt.length,320);
 assert.equal(hits.hits[0].excerpt_truncated,true);assert.equal(hits.hits[0].scene_id,'s');
 assert.throws(()=>sceneFocusInput({actors:Array(9).fill('А')}));
 assert.throws(()=>sceneFocusInput({queries:['x']}));
 assert.throws(()=>sceneFocusInput({}));
 assert.deepEqual(sceneFocusInput({actors:[' А ','А']}),{actors:['А'],queries:[]});
});
test('focused memory remains bounded for thousands of matching records',()=>{
 const result=focusedSceneContext({knowledge:Array.from({length:3000},(_,i)=>({actor:'А',fact:'Факт '+i,source}))},{actors:['А']},{maxChars:5000});
 assert.ok(JSON.stringify(result.memory).length<=5000);
 assert.equal(result.memory.counts.knowledge,3000);
 assert.ok(result.memory.omitted.knowledge>2900);
});

test('exact stable ID query retrieves an old task or item despite many recent actor matches',()=>{
 const plans=[{actor:'A',plan_id:'old-task',goal:'Old exact task',status:'completed',source:{scene_id:'old'}},...Array.from({length:100},(_,i)=>({actor:'A',plan_id:'new-'+i,goal:'Recent task '+i,status:'active',source:{scene_id:'new'}}))];
 const items=[{holder:'A',item_id:'old-glasses',name:'Glasses',source:{scene_id:'old'}},...Array.from({length:100},(_,i)=>({holder:'A',item_id:'new-'+i,name:'Recent item '+i,source:{scene_id:'new'}}))];
 const r=focusedSceneContext({plans,items},{actors:['A'],queries:['old-task','old-glasses']},{scenes:[{id:'old'},{id:'new'}],maxChars:5000});
 assert.equal(r.memory.records.plans[0].plan_id,'old-task');assert.equal(r.memory.records.items[0].item_id,'old-glasses');assert.ok(r.active_tasks.total>=100);
});
