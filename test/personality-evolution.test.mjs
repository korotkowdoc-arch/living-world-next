import test from 'node:test';
import assert from 'node:assert/strict';
import {personalityEvolution,personalitySaveReview} from '../public/core/personality-evolution.mjs';
import {replay} from '../public/core/continuity.mjs';
import {prepareStoryTurn} from '../public/core/story-turn.mjs';
import {npcNeedOpportunities} from '../public/core/npc-life.mjs';
const evidence='Recorded action.';
const s=(id,events,world_time='1994-09-05 17:00')=>({id,body:evidence,events,world_time});
const c=(id,name,state_patch)=>({id,type:'character',name,state_patch,evidence});
const motive=(id,status,intensity)=>({id,type:'world',advanced_version:1,advanced_kind:'motive',record_id:'trust',key:'advanced:motive:trust',actor:'A',title:'Trust',motive_kind:'value',description:'Trust matters',status,intensity,evidence});
test('temporary mood and shared conflict do not silently modify personality; explicit change has original source',()=>{
 const a=s('a',[c('p','A',{temperament:'Calm'}),c('other','B',{temperament:'Other private trait'}),motive('m','active','medium')]);
 const b=s('b',[c('mood','A',{mood:'Angry'}),{id:'i',type:'world',interaction_version:1,interaction_kind:'conflict',actors:['A','B'],description:'Conflict',evidence}]);
 const d=s('d',[c('p2','A',{temperament:'Reserved'}),motive('m2','changed','high')]);
 const p=replay([a,b,d]),r=personalityEvolution(p,[a,b,d],{actors:['A']}).actors[0];
 assert.equal(r.traits.total,1);const t=r.traits.records[0];assert.equal(t.value,'Reserved');assert.equal(t.history.first.value,'Calm');assert.equal(t.history.total_changes,1);assert.equal(t.history.changes.records[0].source.scene_id,'d');
 assert.equal(r.motives.records[0].intensity,'high');assert.equal(r.motives.records[0].history.total_changes,1);assert.equal(r.life_experience.records[0].kind,'conflict');assert.ok(!JSON.stringify(r).includes('Other private trait'));
 assert.equal(prepareStoryTurn([a,b,d],p,[],{actors:['A']}).personality_evolution.actors[0].traits.records[0].value,'Reserved');
});
test('rejected motive update cannot replace accepted state',()=>{
 const a=s('a',[motive('m','resolved','low')]),b=s('b',[motive('m2','active','high')]);const p=replay([a,b]);
 assert.equal(personalityEvolution(p,[a,b],{actors:['A']}).actors[0].motives.records[0].status,'resolved');
});
test('review distinguishes mood from durable change and partial ancestry is visible',()=>{
 const a=s('a',[c('p','A',{temperament:'Calm'})]),p=replay([a]);
 const r=personalitySaveReview(p,[c('p2','A',{mood:'Angry',temperament:'Angry'})]);assert.equal(r.warnings.length,1);assert.equal(r.temporary_moods.length,1);assert.equal(p.people[0].state_fields[0].value,'Calm');
 const partial=personalityEvolution(p,[],{actors:['A'],complete:false});assert.equal(partial.history_complete,false);assert.equal(partial.actors[0].traits.records[0].history.history_verified,false);
});
test('NPC long unobserved gap does not turn comfortable observation into critical certainty',()=>{
 const a=s('a',[],'1994-08-22 12:00'),b=s('b',[],'1994-09-05 12:00');
 const need={actor:'A',key:'need',player_life_version:1,life_kind:'need',need:'hunger',status:'comfortable',source:{scene_id:'a',world_time:a.world_time}};
 assert.equal(npcNeedOpportunities([need],[a,b],b.world_time).length,0);
});

test('long history counts include omitted changes, large actor focus retains current traits',()=>{
 const scenes=Array.from({length:12},(_,i)=>s('s'+i,[c('p'+i,'A',{temperament:'Trait '+i})]));const p=replay(scenes),r=personalityEvolution(p,scenes,{actors:['A']}).actors[0].traits.records[0].history;
 assert.equal(r.total_changes,11);assert.equal(r.changes.total,11);assert.equal(r.changes.omitted,7);
 const actors=Array.from({length:12},(_,i)=>'Actor '+i),a=s('many',actors.map((name,i)=>c('person'+i,name,{temperament:'Calm'})));
 const many=personalityEvolution(replay([a]),[a],{actors});assert.ok(many.actors.every(r=>r.traits.records[0]?.value==='Calm'));
});
