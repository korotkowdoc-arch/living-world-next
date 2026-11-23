import test from 'node:test';
import assert from 'node:assert/strict';
import {limitedNarratorMemory,narratorSceneExcerpt} from '../public/core/narration-budget.mjs';
import {promptForNarrator} from '../public/core/world.mjs';

const source={scene_id:'a-source',event_id:'a-event',world_time:'1991-09-01'};
test('memory budget keeps newest active intentions with source references, and counts omissions',()=>{
 const projection={plans:Array.from({length:1200},(_,i)=>({actor:'Герой '+i,goal:'Необычная цель '+i,status:i===5?'paused':'active',source})),
  relationships:Array.from({length:100},(_,i)=>({a:'А',b:'Б'+i,stance:'hate',source})),events_replayed:5555};
 const summary=limitedNarratorMemory(projection,{maxChars:8500,maxEntriesPerCategory:8});
 assert.ok(JSON.stringify(summary).length<=8500);
 assert.equal(summary.memory_is_not_exhaustive,true);
 assert.equal(summary.counts.plans,1200);
 assert.ok(summary.omitted.plans>1000);
 assert.ok(summary.records.plans.length<=8);
 assert.ok(summary.records.plans[0].source.scene_id);
 assert.equal(summary.events_replayed,5555);
});
test('long scene excerpt displays start and end with explicit omitted count and recoverable scene ID',()=>{
 const scene={id:'exact-scene-id',world_time:'1991-09-01',body:'A'.repeat(4000)+'M'.repeat(24000)+'Z'.repeat(4000)};
 const output=narratorSceneExcerpt(scene,{maxChars:5000});
 assert.ok(output.length<6000);
 assert.ok(output.startsWith('[exact-scene-id; 1991-09-01]'));
 assert.ok(output.endsWith('Z'.repeat(2500)));
 assert.match(output,/get_story_scene\(exact-scene-id\)/);
 assert.match(output,/фрагмент сцены сокращён/);
});
test('partial history never masquerades as complete knowledge',()=>{
 const truncated=limitedNarratorMemory({incomplete:true});
 assert.equal(truncated.status,'explicitly_incomplete');
 assert.match(truncated.notice,/загружена частично/);
});
test('narration with 3000 old memories and giant history stays readable, but rules survive verbatim',()=>{
 const projection={plans:Array.from({length:3000},(_,i)=>({actor:'Драко',goal:'Цель '+i,source})),
  knowledge:Array.from({length:1000},(_,i)=>({actor:'Гарри',fact:'письмо '+i,source}))};
 const rules=[{active:true,text:'Гарри и Малфой — непримиримые враги, уважения не бывает.'}];
 const history=[{id:'long-source',world_time:'1991',body:'Начало'.repeat(30000)}];
 const p=promptForNarrator({world:{seed:'Школа магии 1991'},projection,directives:rules,history});
 assert.ok(p.length<53000, 'too large: '+p.length);
 assert.match(p,/непримиримые враги/);
 assert.match(p,/не исчерпывающий архив/);
 assert.match(p,/пропущенн/i);
 assert.match(p,/get_story_scene\(long-source\)/);
});
test('explicitly unknown facts do not become invented confirmed events',()=>{
 const summary=limitedNarratorMemory({plans:[],knowledge:[],people:[]});
 assert.equal(summary.records.knowledge.length,0);
 assert.equal(summary.memory_is_not_exhaustive,true);
 assert.match(summary.source_rule,/не заменяет первоисточник/);
});
