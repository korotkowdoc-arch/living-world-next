import {magicIndex} from './magic-world.mjs';
import {advancedIndex} from './advanced-world.mjs';
import {worldDepthIndex} from './world-depth.mjs';
import {buildLongLifeIndex} from './npc-long-life.mjs';
import {personalityHistory} from './npc-life.mjs';
import {playerLifeView} from './player-life.mjs';
/** Evidence-backed per-field character continuity. No simulation, diagnosis or inference. */
import {parseStoryDate} from './world-time.mjs';
const text=v=>typeof v==='string'?v.trim():'';
export const CHARACTER_FIELDS=Object.freeze({
 location:'Последнее известное место',occupation:'Занятие',condition:'Физическое состояние',
 birth_date:'Дата рождения',life_stage:'Установленный жизненный этап',education:'Образование',career_goal:'Профессиональная цель',
 pregnancy:'Последнее установленное состояние беременности',family_goal:'Семейные намерения',residence:'Место проживания',
 injury:'Травма или ограничение',appearance:'Внешность',mood:'Последнее выраженное настроение',
 habit:'Привычка',preference:'Предпочтение',aversion:'Неприязнь',affiliation:'Принадлежность',
 role:'Роль',availability:'Доступность',personal_goal:'Личная цель',
 speech_style:'Манера речи',register:'Регистр речи',temperament:'Темперамент',values:'Ценности',coping_style:'Реакция на трудности',humor:'Чувство юмора'
});
export function characterStateError(event){
 if(event.state_patch===undefined)return null; // keep legacy unstructured character events readable.
 if(!text(event.name))return 'Для состояния требуется имя героя.';
 const patch=event.state_patch;
 if(!patch||typeof patch!=='object'||Array.isArray(patch))return 'Состояние должно быть объектом полей.';
 const entries=Object.entries(patch);
 if(!entries.length||entries.length>Object.keys(CHARACTER_FIELDS).length)return 'Неверное количество полей состояния.';
 for(const [field,value] of entries){
  if(!Object.hasOwn(CHARACTER_FIELDS,field))return 'Неизвестное поле состояния: '+field;
  if(field==='birth_date'&&value!==null&&(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||parseStoryDate(value)?.precision!=='day'))return 'Дата рождения должна быть точной датой ГГГГ-ММ-ДД.';
  if(value!==null&&(typeof value!=='string'||!value.trim()||value.length>600))
   return 'Значение поля должно быть непустым текстом до 600 символов или null.';
 }
 return null;
}
export function applyCharacter(previous,event,source){
 const known=new Map((previous?.state_fields||[]).map(record=>[record.field,record]));
 for(const [field,value] of Object.entries(event.state_patch||{})){
  known.set(field,{field,label:CHARACTER_FIELDS[field],value:value===null?null:value.trim(),
   state:value===null?'explicitly_unknown':'last_recorded',source,evidence:event.evidence});
 }
 // A later character event may describe only one property. It never deletes the others.
 const {state_patch,...latest}=event;
 return {...latest,name:text(event.name),
  description:typeof event.description==='string'?event.description:previous?.description,
  state_fields:[...known.values()],source};
}
/** Gregorian birthday convention: Feb 29 reaches next age on March 1 in non-leap years. */
export function characterAge(character,worldTime){
 const birth=character?.state_fields?.find(x=>x.field==='birth_date');
 const date=parseStoryDate(birth?.value),clock=parseStoryDate(worldTime);
 if(!date||date.precision!=='day'||!clock)return null;
 const [by,bm,bd]=date.day.split('-').map(Number),[cy,cm,cd]=clock.day.split('-').map(Number);
 if(clock.day<date.day)return {status:'before_recorded_birth',birth_date:date.day,as_of:clock.day,source:birth.source};
 return {status:'calendar_derived',years:cy-by-Number(cm<bm||cm===bm&&cd<bd),birth_date:date.day,as_of:clock.day,source:birth.source};
}
export function characterStateView(projection,actor,{complete=true,offset=0,limit=40,worldTime=null,scenes=[]}={}){
 const name=text(actor);
 if(!name||name.length>140)throw Error('Укажи имя персонажа длиной до 140 символов.');
 const canonical=name.toLocaleLowerCase('ru');
 const match=v=>text(v).toLocaleLowerCase('ru')===canonical;
 const matches=(projection.people||[]).filter(p=>match(p.name));
 // Do not merge distinct recorded character names on a case-insensitive search.
 const exact=matches.find(p=>p.name===name);
 const character=exact||(matches.length===1?matches[0]:null);
 const subject=character?.name||name;
 const identity=v=>text(v)===subject;
 const relations=(projection.relationships||[]).filter(x=>identity(x.a)||identity(x.b)).map(x=>({kind:'relationship',...x}));
 const plans=(projection.plans||[]).filter(x=>identity(x.actor)).map(x=>({kind:'plan',...x,history_events:x.history?.length||0,history:undefined}));
 const knowledge=(projection.knowledge||[]).filter(x=>identity(x.actor)).map(x=>({kind:'knowledge',...x}));
 const commitments=(projection.obligations||[]).filter(x=>identity(x.actor)).map(x=>({kind:'commitment',...x}));
 const activities=(projection.worldFacts||[]).filter(x=>x.activity_version===1&&(identity(x.actor)||x.actors?.some(identity))).map(x=>({kind:x.activity_kind,...x}));
 const growth=(projection.worldFacts||[]).filter(x=>x.growth_version===1&&(identity(x.actor)||identity(x.sender)||identity(x.recipient)||identity(x.teacher))).map(x=>({kind:x.growth_kind,...x}));
 const dynamics=(projection.worldFacts||[]).filter(x=>x.dynamics_version===1&&(identity(x.actor)||identity(x.counterparty)||x.actors?.some(identity))).map(x=>({kind:x.dynamics_kind,...x}));
 const rows=[...relations,...plans,...knowledge,...commitments,...activities,...growth,...dynamics];
 const start=Math.max(0,Math.floor(Number(offset)||0)),size=Math.max(1,Math.min(100,Math.floor(Number(limit)||40)));
 return {actor:subject,magic_system:magicIndex(scenes,projection,{complete}).view(subject,{director:true,offset,limit:Math.min(limit,40)}),advanced:advancedIndex(scenes,projection,{complete}).view(subject,{director:true,offset,limit:Math.min(limit,40)}),world_depth:worldDepthIndex(scenes,projection,{complete}).view(subject,{director:true,offset,limit:Math.min(limit,40)}),long_life:buildLongLifeIndex(scenes,projection,{complete}).view(subject,{clock:worldTime,limit:8}),personality_history:personalityHistory(scenes,projection,[subject],{complete,limit:8}).get(subject)??{records:[],total:0},life:playerLifeView(projection,subject,{scenes,clock:worldTime,complete}),character:character?{name:character.name,description:character.description??null,
  state_fields:character.state_fields||[],age:characterAge(character,worldTime),latest_event_source:character.source}:null,
  ambiguous_names:matches.length>1&&!exact?matches.map(p=>p.name):[],
  records:rows.slice(start,start+size),total_records:rows.length,
  next_offset:start+size<rows.length?start+size:null,memory_complete:complete,
  interpretation:'Last explicitly recorded observations, NOT omniscient or real-time facts. Location/mood may be outdated. Do not infer recovery, consent, affection or knowledge from absence of records. Source scene decides context.'};
}
