import test from 'node:test';
import assert from 'node:assert/strict';
import {lifeRecordError,livingWorldView} from '../public/core/living-world.mjs';
import {annotationPassages} from '../public/core/annotation-passages.mjs';
import {replay,validateScene,buildNextContext} from '../public/core/continuity.mjs';
const place={id:'p',type:'world',world_record_version:1,record_kind:'place',record_id:'hall',key:'place:hall',name:'Зал',status:'open',evidence:'Зал открыт'};
const routine={id:'r',type:'world',world_record_version:1,record_kind:'routine',record_id:'guard',key:'routine:guard',actor:'Снейп',activity:'Дежурство',place:'Зал',status:'active',weekdays:[1],start:'22:00',end:'02:00',evidence:'Дежурство'};
const scene=(id,time,body,events)=>({id,world_time:time,body,events});
test('routine and place are validated without inventing NPC presence',()=>{
 assert.equal(lifeRecordError(place),null);assert.equal(lifeRecordError(routine),null);
 assert.ok(lifeRecordError({...routine,weekdays:[1,1]}));assert.ok(lifeRecordError({...routine,start:'25:00'}));
 assert.ok(lifeRecordError({...place,key:'routine:hall'}));
 const s=scene('one','1991-09-03 01:00','Зал открыт. Дежурство.',[place,routine]);
 assert.equal(validateScene(s).ok,true);
 const v=livingWorldView([s],replay([s]));
 assert.equal(v.routines[0].window,'scheduled_window_not_actual_presence');
 assert.equal(v.last_known_locations.length,0);
 assert.equal(v.places[0].source.scene_id,'one');
});
test('new state supersedes a place, offscreen remains evidence, no stale clock',()=>{
 const a=scene('one','1991-09-02 23:00','Зал открыт. Дежурство.',[place,routine]);
 const b=scene('two',null,'Зал закрыт. Снейп ушёл в зал.',[{...place,id:'p2',status:'closed',evidence:'Зал закрыт'},{id:'o',type:'offscreen',actor:'Снейп',place:'Зал',evidence:'Снейп ушёл в зал'}]);
 const p=replay([a,b]),v=livingWorldView([a,b],p,{place:'Зал'});
 assert.equal(v.places[0].status,'closed');assert.equal(v.routines[0].window,'clock_unknown');
 assert.equal(v.offscreen_events[0].source.scene_id,'two');
 assert.equal(buildNextContext({world:{seed:'Мир'},scenes:[a,b]}).living_world.places[0].status,'closed');
});
test('source passages preserve exact text and paginate without loss, including emoji',()=>{
 const body='Герой ушёл. '+('🌙 Разговор продолжается. '.repeat(200));
 const s={id:'s',body,events:[{id:'e',evidence:'Герой ушёл.'}]};
 let offset=0,parts=[],first;
 do{const result=annotationPassages(s,{offset,limit:2,maxChars:401});first??=result;parts.push(...result.passages);offset=result.next_offset;}while(offset!==null);
 assert.equal(parts.map(x=>x.quote).join(''),body);
 assert.deepEqual(first.passages[0].existing_event_ids,['e']);
 for(const part of parts)assert.equal(body.slice(part.start,part.end),part.quote);
 assert.throws(()=>annotationPassages(s,{offset:-1}));
});
