import test from 'node:test';
import assert from 'node:assert/strict';
import {limitedNarratorMemory,narratorSceneExcerpt,boundedMcpScene} from '../public/core/narration-budget.mjs';
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

test('MCP world context scenes are bounded even when individual scenes reach 200k characters',()=>{
 const record=boundedMcpScene({id:'scene-abc',world_time:'1991-09-01',body:'A'.repeat(198000)});
 assert.equal(record.body_truncated,true);
 assert.equal(record.original_body_chars,198000);
 assert.ok(record.body.length<12500);
 assert.match(record.body,/get_story_scene\(scene-abc\)/);
 const short=boundedMcpScene({id:'s',body:'Текст сцены'});
 assert.equal(short.body_truncated,false);
 assert.equal(short.body,'Текст сцены');
});

test('tight context includes multiple categories rather than only plans and fits final JSON',()=>{
 const projection={plans:Array.from({length:1000},(_,i)=>({actor:'Герой '+i,goal:'Цель '+i+'x'.repeat(200),status:'active',source})),
  relationships:[{a:'А',b:'Б',stance:'enemies',source}],knowledge:[{actor:'А',fact:'Секрет',source}],items:[{item_id:'letter',holder:'Б',source}],events_replayed:1000};
 const summary=limitedNarratorMemory(projection,{maxChars:2500,maxEntriesPerCategory:40});
 assert.ok(JSON.stringify(summary).length<=2500);
 for(const k of ['plans','relationships','knowledge','items'])assert.ok(summary.records[k].length>0,k);
 assert.equal(summary.counts.plans,1000);assert.equal(summary.omitted.plans,1000-summary.records.plans.length);
});
test('all recorded participants survive context compaction',()=>{
 const actors=Array.from({length:12},(_,i)=>'Герой '+i);
 const summary=limitedNarratorMemory({worldFacts:[{actors,title:'Собрание',source}]});
 assert.deepEqual(summary.records.worldFacts[0].actors,actors);
});

test('connected narrator prompt uses compact menu instructions without losing user rules and source links',()=>{
 const rule='Установленное правило: '+ 'не изменять канон. '.repeat(200);
 const p=promptForNarrator({world:{seed:'Мир'},directives:[{active:true,text:rule}],projection:{plans:[]},history:[{id:'source',world_time:'1994-07-01',body:'Сцена'.repeat(12000)}],technicalGuidance:false});
 assert.ok(p.includes(rule));assert.match(p,/narrator_workflow/);assert.match(p,/get_story_scene\(source\)/);assert.ok(p.length<53000);
});

test('updated old identity ranks by latest source instead of first insertion, and stable keys survive compaction',()=>{
 const old={...Object.fromEntries(Array.from({length:25},(_,i)=>['unimportant_'+i,'text'])),key:'growth:skill:old',record_id:'old',actor:'Hero',status:'competent',source:{scene_id:'latest'}};
 const r=limitedNarratorMemory({worldFacts:[old,{key:'recent-insertion',source:{scene_id:'earlier'}}]},{scenes:[{id:'earlier'},{id:'latest'}],maxEntriesPerCategory:1});
 assert.equal(r.records.worldFacts[0].key,'growth:skill:old');assert.equal(r.records.worldFacts[0].record_id,'old');assert.equal(r.records.worldFacts[0].source.scene_id,'latest');
});
