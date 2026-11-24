/** Recorded places and routines use ordinary world events; no new storage table.
 * A schedule suggests an opportunity, never proves presence or a performed action.
 */
import {parseStoryDate} from './world-time.mjs';
const text=v=>typeof v==='string'?v.trim():'';
const idPattern=/^[a-zA-Z0-9_-]{1,80}$/;
const statuses={place:new Set(['open','closed','restricted','damaged','destroyed','unknown']),routine:new Set(['active','paused','ended'])};
const clock=v=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
const mins=v=>Number(v.slice(0,2))*60+Number(v.slice(3));
const short=(v,max=600)=>typeof v==='string'&&!!v.trim()&&v.length<=max;
export function lifeRecordError(e){
 if(e.type!=='world'||e.world_record_version===undefined)return null;
 if(e.world_record_version!==1)return 'Неизвестная версия записи мира.';
 if(!['place','routine'].includes(e.record_kind)||(typeof e.record_id!=='string'||!idPattern.test(e.record_id))||
  e.key!==e.record_kind+':'+e.record_id)return 'Нужны согласованные вид, ID и ключ записи мира.';
 if(!statuses[e.record_kind].has(e.status))return 'Неизвестное состояние записи мира.';
 if(e.record_kind==='place'){
  if(!short(e.name,140))return 'У места должно быть название.';
  for(const k of ['description','access','parent_place'])if(e[k]!=null&&!short(e[k]))return 'Неверное описание места: '+k;
 }else{
  if(!short(e.actor,140)||!short(e.activity,300)||!short(e.place,140))return 'Распорядок требует героя, занятия и места.';
  if(!clock(e.start)||!clock(e.end)||e.start===e.end)return 'Интервал распорядка требует два различных времени HH:MM.';
  if(!Array.isArray(e.weekdays)||!e.weekdays.length||e.weekdays.length>7||
    e.weekdays.some(x=>!Number.isInteger(x)||x<1||x>7)||new Set(e.weekdays).size!==e.weekdays.length)
   return 'Дни недели: неповторяющиеся числа от 1 (понедельник) до 7 (воскресенье).';
 }
 return null;
}
export function routineWindow(record,anchor){
 if(record.status!=='active')return 'inactive_as_recorded';
 if(!anchor||anchor.precision!=='minute')return 'clock_unknown';
 const date=new Date(anchor.order*60000),day=date.getUTCDay()||7,previous=day===1?7:day-1;
 const minute=date.getUTCHours()*60+date.getUTCMinutes(),start=mins(record.start),end=mins(record.end);
 const inside=start<end?record.weekdays.includes(day)&&minute>=start&&minute<end:
  (record.weekdays.includes(day)&&minute>=start)||(record.weekdays.includes(previous)&&minute<end);
 return inside?'scheduled_window_not_actual_presence':'outside_recorded_window';
}
function clip(v,max=500){return typeof v==='string'?v.slice(0,max):null;}
function sourceOf(row){return row.source||null;}
export function livingWorldView(scenes=[],projection={},opts={}){
 const actor=text(opts.actor),place=text(opts.place);
 if(actor.length>140||place.length>140)throw Error('Слишком длинное имя героя или места.');
 const limit=Math.max(1,Math.min(40,Math.floor(Number(opts.limit)||20)));
 const offset=Math.max(0,Math.floor(Number(opts.offset)||0));
 const last=scenes.at(-1),anchor=parseStoryDate(last?.world_time);
 const rows=(projection.worldFacts||[]).filter(x=>x.world_record_version===1&&!lifeRecordError(x));
 const places=rows.filter(x=>x.record_kind==='place'&&(!place||x.name===place||x.record_id===place));
 const names=new Set(places.map(p=>p.name));if(place)names.add(place);
 const routines=rows.filter(x=>x.record_kind==='routine'&&(!actor||x.actor===actor)&&(!place||names.has(x.place)));
 const locations=[];
 for(const p of projection.people||[]){
  if(actor&&p.name!==actor)continue;
  const location=(p.state_fields||[]).find(f=>f.field==='location');
  if(location&&(!place||names.has(location.value)))
   locations.push({actor:p.name,location:location.value,state:location.state,source:location.source,evidence:clip(location.evidence),certainty:'last_recorded_not_live'});
 }
 const offscreen=(projection.offscreen||[]).filter(x=>
  (!actor||x.actor===actor||(Array.isArray(x.actors)&&x.actors.includes(actor)))&&
  (!place||names.has(x.place)||x.location_id===place));
 const position=new Map(scenes.map((s,i)=>[s.id,i]));
 const sortLatest=x=>x.slice().reverse().sort((a,b)=>(position.get(b.source?.scene_id)??-1)-(position.get(a.source?.scene_id)??-1));
 const page=x=>sortLatest(x).slice(offset,offset+limit);
 return {memory_complete:opts.complete!==false,clock:anchor?.literal??null,clock_source:anchor?last.id:null,
  places:page(places).map(x=>({id:x.record_id,name:x.name,status:x.status,description:clip(x.description),access:clip(x.access),parent_place:clip(x.parent_place),source:sourceOf(x),evidence:clip(x.evidence)})),
  routines:page(routines).map(x=>({id:x.record_id,actor:x.actor,activity:x.activity,place:x.place,status:x.status,weekdays:x.weekdays,start:x.start,end:x.end,window:routineWindow(x,anchor),source:sourceOf(x),evidence:clip(x.evidence)})),
  last_known_locations:page(locations),
  offscreen_events:page(offscreen).map(x=>({actor:clip(x.actor,140),actors:Array.isArray(x.actors)?x.actors.slice(0,12).map(v=>clip(v,140)):[],place:clip(x.place,140),description:clip(x.description||x.evidence),source:sourceOf(x),evidence:clip(x.evidence)})),
  counts:{places:places.length,routines:routines.length,last_known_locations:locations.length,offscreen_events:offscreen.length},
  next_offset:[places,routines,locations,offscreen].some(x=>x.length>offset+limit)?offset+limit:null,
  policy:'Recorded place state, routine and last known locations are evidence, not a live simulation. A scheduled window never proves an NPC arrived. Offscreen actions only exist when written and recorded in a committed scene. No inferred travel, access, knowledge or reconciliation.'};
}
