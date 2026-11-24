/** Evidence-backed per-field character continuity. No simulation, diagnosis or inference. */
const text=v=>typeof v==='string'?v.trim():'';
export const CHARACTER_FIELDS=Object.freeze({
 location:'Последнее известное место',occupation:'Занятие',condition:'Физическое состояние',
 injury:'Травма или ограничение',appearance:'Внешность',mood:'Последнее выраженное настроение',
 habit:'Привычка',preference:'Предпочтение',aversion:'Неприязнь',affiliation:'Принадлежность',
 role:'Роль',availability:'Доступность',personal_goal:'Личная цель'
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
export function characterStateView(projection,actor,{complete=true,offset=0,limit=40}={}){
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
 const rows=[...relations,...plans,...knowledge,...commitments];
 const start=Math.max(0,Math.floor(Number(offset)||0)),size=Math.max(1,Math.min(100,Math.floor(Number(limit)||40)));
 return {actor:subject,character:character?{name:character.name,description:character.description??null,
  state_fields:character.state_fields||[],latest_event_source:character.source}:null,
  ambiguous_names:matches.length>1&&!exact?matches.map(p=>p.name):[],
  records:rows.slice(start,start+size),total_records:rows.length,
  next_offset:start+size<rows.length?start+size:null,memory_complete:complete,
  interpretation:'Last explicitly recorded observations, NOT omniscient or real-time facts. Location/mood may be outdated. Do not infer recovery, consent, affection or knowledge from absence of records. Source scene decides context.'};
}
