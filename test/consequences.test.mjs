import test from 'node:test';import assert from 'node:assert/strict';
import {replay,validateScene,needsStatePreflight,validateStateAppend} from '../public/core/continuity.mjs';
import {consequenceView} from '../public/core/consequences.mjs';
import {storyDrivers} from '../public/core/story-drivers.mjs';
const body='После ссоры доступ в зал закрыт. Позднее запрет сняли.';
const e={id:'c',type:'world',consequence_version:1,record_id:'ban',key:'consequence:ban',consequence_kind:'access',actor:'Драко',description:'Нет доступа в зал',status:'active',evidence:'доступ в зал закрыт'};
const scene=(id,events)=>({id,body,events});
test('persistent consequence is not removed by unrelated scenes or dispute',()=>{
 const p=replay([scene('a',[e]),scene('b',[]),scene('c',[{...e,status:'contested'}])]);
 assert.equal(consequenceView(p).current[0].status,'contested');
 assert.equal(storyDrivers(p).some(x=>x.kind==='lasting_consequence'),true);
 assert.equal(p.relationships.length,0);
});
test('explicit resolution requires outcome and cannot be reopened under same id',()=>{
 assert.equal(validateScene({body,events:[{...e,status:'resolved'}]}).ok,false);
 const resolved={...e,status:'resolved',outcome:'Запрет сняли',evidence:'запрет сняли'};
 const chain=[scene('a',[e]),scene('b',[resolved])];
 assert.equal(consequenceView(replay(chain)).resolved.length,1);
 assert.equal(validateStateAppend(chain,[e],body).ok,false);
 assert.equal(needsStatePreflight([e]),true);
 assert.equal(needsStatePreflight([{type:'plan'}]),true);
 assert.equal(needsStatePreflight([]),false);
});
test('reserved consequence keys cannot be overwritten with unversioned event',()=>{
 assert.equal(validateScene({body,events:[{id:'x',type:'world',key:'consequence:ban',evidence:'запрет сняли'}]}).ok,false);
 assert.equal(validateStateAppend([scene('a',[e])],[{...e,actor:'Гарри'}],body).ok,false);
});
