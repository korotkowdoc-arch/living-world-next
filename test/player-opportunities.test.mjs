import test from 'node:test';
import assert from 'node:assert/strict';
import {playerOpportunities} from '../public/core/player-opportunities.mjs';
import {playerMenuOverview,menuActionIntent} from '../public/core/game-menu.mjs';
const actor='Harry',src={scene_id:'s',event_id:'e',world_time:'1994-08-01 10:00'};
test('context menu uses own visited places and habits but never lists unknown NPC locations',()=>{
 const p={people:[{name:actor,state_fields:[{field:'location',value:'Library',source:src},{field:'residence',value:'Home',source:src}]},{name:'Lia',state_fields:[{field:'location',value:'Secret',source:src}]}],worldFacts:[{world_record_version:1,record_kind:'place',name:'Secret',status:'open',source:src},{world_record_version:1,record_kind:'place',name:'Library',status:'open',source:src},{activity_version:1,activity_kind:'habit',actor,name:'Reading',record_id:'reading',place:'Library',status:'active',source:src},{activity_version:1,activity_kind:'habit',actor:'Lia',name:'Hidden habit',status:'active',source:src}]};
 const scenes=[{id:'s',world_time:src.world_time,events:[]}];
 const v=playerOpportunities(p,actor,{scenes});
 assert.deepEqual(v.known_places.records.map(x=>x.name),['Library','Home']);
 assert.ok(v.options.some(x=>x.action==='explore'));assert.ok(v.options.some(x=>x.action==='practice_habit'));assert.ok(v.options.some(x=>x.action==='travel'&&x.place==='Home'));
 assert.equal(v.known_places.records[0].access,'open');
 const menu=playerMenuOverview(p,actor,src.world_time,{scenes});
 assert.equal(menuActionIntent({action:'explore',detail:'Look around'},menu).saved,false);
 assert.equal(playerOpportunities(p,actor,{scenes:[...scenes,{id:'later',events:[]}]}).options.some(x=>x.action==='explore'),false);
});
test('offscreen access changes are not exposed as player knowledge',()=>{
 const p={people:[{name:actor,state_fields:[{field:'location',value:'Library',source:src}]}],worldFacts:[{world_record_version:1,record_kind:'place',name:'Library',status:'closed',source:{...src,scene_id:'secret'}}]};
 const v=playerOpportunities(p,actor,{scenes:[{id:'s',events:[]},{id:'secret',events:[]}]});
 assert.equal(v.known_places.records[0].access,'unknown');
});
