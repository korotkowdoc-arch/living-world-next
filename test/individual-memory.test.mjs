import test from 'node:test';
import assert from 'node:assert/strict';
import {individualMemory,individualSaveReview} from '../public/core/individual-memory.mjs';
import {replay} from '../public/core/continuity.mjs';
import {prepareStoryTurn} from '../public/core/story-turn.mjs';
const evidence='Recorded action.';
const k=(id,actor,status,fact,extra={})=>({id,type:'knowledge',knowledge_version:1,topic_id:'letter',actor,status,fact,channel:'conversation',evidence,...extra});
const s=(id,events)=>({id,world_time:'1994-09-05 17:00',events,body:evidence});
test('holder-specific knowledge evolves without propagation, forgotten content is withheld',()=>{
 const a=s('a',[k('k1','A','believes','Letter stolen'),k('k2','B','knows','Letter delivered')]);
 const b=s('b',[k('k3','A','knows','Letter delivered',{informant:'B'})]);
 const c=s('c',[k('k4','B','forgotten','Letter delivered')]);
 const p=replay([a,b,c]),m=individualMemory(p,[a,b,c],{actors:['A','B','C']});
 const A=m.actors.find(x=>x.actor==='A').knowledge.records[0],B=m.actors.find(x=>x.actor==='B').knowledge.records[0];
 assert.equal(A.status,'knows');assert.equal(A.informant,'B');assert.equal(A.history.records[0].content,'Letter stolen');assert.equal(A.history.records[0].source.scene_id,'a');assert.equal(A.history.total,1);assert.equal(A.history.omitted,0);
 assert.equal(B.content,null);assert.deepEqual(B.history.records,[]);assert.equal(m.actors.find(x=>x.actor==='C').knowledge.total,0);
 assert.equal(m.director_only_topic_differences.total,1);
});
test('own attitudes, obligations and accepted episodes do not copy others feelings or knowledge',()=>{
 const a=s('a',[{id:'r',type:'relationship',a:'B',b:'A',stance:'hate',evidence},{id:'c',type:'commitment',commitment_id:'promise',actor:'A',status:'open',description:'Return book',evidence},{id:'i',type:'world',interaction_version:1,interaction_kind:'meeting',actors:['A','B'],description:'Met',evidence}]);
 const p=replay([a]),m=individualMemory(p,[a],{actors:['A','B']});
 assert.equal(m.actors[0].own_attitudes.total,0);assert.equal(m.actors[1].own_attitudes.records[0].other,'A');
 assert.equal(m.actors[0].own_open_commitments.total,1);assert.equal(m.actors[0].recorded_encounters.total,1);assert.equal(m.actors[0].knowledge.total,0);
 const turn=prepareStoryTurn([a],p,[],{actors:['A','B']});const incoming=turn.actor_context.find(x=>x.actor==='A').relationships[0];assert.equal(incoming.direction,'incoming_director_only');assert.equal(incoming.stance,undefined);
});
test('exact topic wins over recent topics; review warns without mutation or inventing access',()=>{
 const a=s('a',[k('k','A','believes','Letter stolen')]);const p=replay([a]);
 const b=s('b',Array.from({length:18},(_,i)=>k('k'+i,'A','knows','Other '+i,{topic_id:'topic-'+i})));
 const r=individualMemory(replay([a,b]),[a,b],{actors:['A'],queries:['letter'],limit:1});assert.equal(r.actors[0].knowledge.records[0].topic_id,'letter');
 const review=individualSaveReview(p,[k('dup','A','knows','Letter stolen',{topic_id:'duplicate',informant:'C'})]);
 assert.equal(review.warnings.length,2);assert.equal(p.knowledge.length,1);assert.equal(review.changes[0].previous_status,null);
});

test('partial loaded history does not accidentally discard its last earlier observation',()=>{
 const a=s('a',[k('k1','A','believes','Old belief')]);const b=s('b',[k('k2','A','knows','New belief')]);const p=replay([a,b]);const r=individualMemory(p,[a],{actors:['A'],complete:false});assert.equal(r.actors[0].knowledge.records[0].history.records[0].content,'Old belief');assert.equal(r.history_complete,false);
});
