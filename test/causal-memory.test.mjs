import test from 'node:test';
import assert from 'node:assert/strict';
import {causalMemory,causalSaveReview} from '../public/core/causal-memory.mjs';
import {replay} from '../public/core/continuity.mjs';
import {prepareStoryTurn} from '../public/core/story-turn.mjs';
const source=(scene_id,event_id)=>({scene_id,event_id,world_time:'1994-09-05 17:00'});
const rec=(key,fields)=>({type:'world',key,record_id:key.split(':').at(-1),source:source('old',key),...fields});
test('old open consequence retains origin and attempted response, claims never propagate',()=>{
 const incident=rec('incident:conflict',{actor:'Hero',description:'Conflict'});
 const consequence=rec('consequence:bruise',{consequence_version:1,consequence_kind:'physical',actor:'Hero',status:'active',description:'Bruised shoulder',source_incident:'conflict'});
 const response=rec('player-life:consequence_response:care',{player_life_version:1,life_kind:'consequence_response',actor:'Hero',consequence_id:'bruise',status:'performed',result:'attempted',title:'Care',outcome:'Still sore'});
 const unrelated=rec('incident:secret',{actor:'Other',description:'Secret event'});
 const remote=rec('incident:remote',{actor:'Third',description:'Unrelated hidden chain'});
 const claim=rec('growth:cause:claim',{growth_version:1,growth_kind:'cause',from_key:consequence.key,to_key:unrelated.key,status:'claimed',actor:'Witness'});
 const edge=rec('growth:cause:edge',{growth_version:1,growth_kind:'cause',from_key:unrelated.key,to_key:remote.key,status:'established'});
 const p={worldFacts:[incident,consequence,response,unrelated,remote,claim,edge]},scenes=[{id:'old',events:[{id:'conflict',key:incident.key,type:'world',description:'Conflict'}]}];
 const m=causalMemory(p,scenes,{actors:['Hero']});
 assert.equal(m.open_consequences.total,1);const c=m.open_consequences.records[0];assert.equal(c.incident.source.scene_id,'old');assert.equal(c.incident.status,'linked_source_not_proof_of_cause');assert.equal(c.responses[0].result,'attempted');assert.equal(c.status,'active');
 assert.equal(m.causal_links.total,1);assert.equal(m.causal_links.records[0].status,'claimed');assert.equal(m.causal_links.records[0].claimant,'Witness');
 assert.ok(!JSON.stringify(m).includes('Unrelated hidden chain'));
});
test('ambiguous incident does not invent exact source; pending responses are review prompts',()=>{
 const c=rec('consequence:c',{consequence_version:1,actor:'Hero',status:'active',description:'Broken glasses',source_incident:'duplicate'});
 const p={worldFacts:[c,rec('incident:duplicate',{actor:'Hero'}),rec('other:duplicate',{actor:'Other'}),rec('player-life:consequence_response:r',{life_kind:'consequence_response',consequence_id:'c',status:'planned',actor:'Hero'})]};
 assert.equal(causalMemory(p,[],{actors:['Hero']}).open_consequences.records[0].incident.status,'ambiguous');
 assert.equal(causalSaveReview(p,[],'Hero looked at his broken glasses.').possible_missing_updates.length,1);
 assert.equal(causalSaveReview(p,[{...c,status:'resolved'}],'Fixed glasses').open_response_warnings.length,1);assert.equal(c.status,'active');
});
test('turn recalls old consequence even when no recent event changes it',()=>{
 const e={id:'c',type:'world',key:'consequence:c',record_id:'c',consequence_version:1,consequence_kind:'material',actor:'Hero',status:'active',description:'Glasses broken',evidence:'Glasses broken'};
 const s=[{id:'a',body:'Glasses broken',events:[e],world_time:'1994-09-01 10:00'},...Array.from({length:12},(_,i)=>({id:'b'+i,body:'Nothing changed',events:[],world_time:'1994-09-05 10:00'}))];
 const p=replay(s);const t=prepareStoryTurn(s,p,[],{actors:['Hero']});assert.equal(t.causal_memory.open_consequences.records[0].source.scene_id,'a');assert.equal(t.causal_memory.open_consequences.records[0].status,'active');
});

import {playerConsequenceTracker} from '../public/core/duty-career.mjs';
test('player consequence tracker exposes own effects and responses, not director-only causes or other actors plans',()=>{
 const a=rec('consequence:a',{consequence_version:1,actor:'Hero',status:'active',description:'Broken glasses',cause:'Hidden conspiracy',responsible:'Other'});
 const b=rec('consequence:b',{consequence_version:1,actor:'Other',status:'resolved',description:'Other secret'});
 const own=rec('player-life:consequence_response:r',{player_life_version:1,life_kind:'consequence_response',actor:'Hero',consequence_id:'a',status:'performed',result:'attempted'});
 const foreign={...own,record_id:'secret',actor:'Other',title:'Secret plan'};
 const r=playerConsequenceTracker({worldFacts:[a,b,own,foreign]},'Hero');assert.equal(r.open.total,1);assert.equal(r.archive.total,0);assert.equal(r.open.records[0].responses[0].result,'attempted');assert.ok(!JSON.stringify(r).includes('Hidden conspiracy'));assert.ok(!JSON.stringify(r).includes('Secret plan'));assert.ok(!JSON.stringify(r).includes('Other secret'));
});
