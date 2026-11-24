/** Recorded fictional time, not a real-time simulation.
 * No wall-clock, no guessed duration, no invented NPC actions.
 */
const text=v=>typeof v==='string'?v.trim():'';
const completed=new Set(['complete','completed','fulfilled','done','resolved','cancelled','canceled','abandoned']);
export function parseStoryDate(raw){
 const value=text(raw);
 // Accept only unambiguous calendar-day and local clock strings. A date has no timezone.
 const m=/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(value);
 if(!m)return null;
 const [,yyyy,mm,dd,hh='00',minute='00']=m;
 const year=+yyyy,month=+mm,day=+dd,hour=+hh,min=+minute;
 if(year<1||year>9999||hour>23||min>59)return null;
 const d=new Date(Date.UTC(year,month-1,day,hour,min));
 if(d.getUTCFullYear()!==year||d.getUTCMonth()+1!==month||d.getUTCDate()!==day||
    d.getUTCHours()!==hour||d.getUTCMinutes()!==min)return null;
 return {literal:value,precision:m[4]!==undefined?'minute':'day',day:yyyy+'-'+mm+'-'+dd,
  order:Math.trunc(d.getTime()/60000)};
}
function deadlineOf(record){
 // Only exact, authored ISO dates are comparable. Vague "tomorrow" stays unresolved.
 const raw=[record?.due_at,record?.deadline,record?.due].find(x=>text(x));
 return {original:raw||null,parsed:parseStoryDate(raw)};
}
function agendaEntry(record,kind,anchor){
 const {original,parsed}=deadlineOf(record);
 const status=text(record?.status).toLowerCase()||'unknown';
 // A calendar day is NOT comparable to a minute of the same day (no arbitrary midnight).
 const compare=anchor&&parsed&&
   (parsed.precision===anchor.precision||parsed.day!==anchor.day);
 let timing='time_not_established';
 if(completed.has(status))timing='recorded_closed';
 else if(original&&!parsed)timing='unparsed_time_reference';
 else if(parsed&&!anchor)timing='no_story_clock';
 else if(parsed&&anchor&&!compare)timing='same_day_time_uncertain';
 else if(parsed&&anchor)timing=parsed.order<anchor.order?
  'date_past_status_requires_verification':parsed.order===anchor.order?
  'date_reached_status_requires_verification':'future_date_as_recorded';
 return {kind,actor:record.actor||null,
  id:kind==='npc_plan'?record.plan_id:record.commitment_id,
  title:kind==='npc_plan'?record.goal:(record.description||record.evidence||'Обязательство'),
  status,deadline:original,source:record.source||null,timing,
  evidence_level:kind==='npc_plan'?'recorded_intention':'recorded_commitment',
  interpretation:'Указанный срок и состояние не доказывают, что действие произошло либо что обещание нарушено.'};
}
export function recordedWorldAgenda(scenes=[],projection={}, {maxEntries=30}={}){
 if(!Array.isArray(scenes))throw Error('Некорректная история для временного анализа.');
 const limit=Math.max(1,Math.min(100,Number.isInteger(maxEntries)?maxEntries:30));
 const dated=[];let undatedAfterAnchor=0;
 for(const scene of scenes){
  const time=parseStoryDate(scene?.world_time);
  if(time){dated.push({scene_id:scene.id,...time});undatedAfterAnchor=0;}
  else if(dated.length)undatedAfterAnchor++;
 }
 const anchor=dated.at(-1)||null;
 const backward=[];
 for(let i=1;i<dated.length;i++){
  const prev=dated[i-1],next=dated[i];
  if(next.order<prev.order)
   backward.push({from_scene_id:prev.scene_id,to_scene_id:next.scene_id,
    from:prev.literal,to:next.literal,
    interpretation:'Дата стала раньше: это может быть флешбэк, ошибка или новая временная линия; проверить исходные сцены.'});
 }
 const obligations=Array.isArray(projection?.obligations)?projection.obligations:[];
 const plans=Array.isArray(projection?.plans)?projection.plans:[];
 // Return actionable items before already closed ones; never fabricate missing obligations.
 const openRecords=[
  ...obligations.filter(r=>!completed.has(text(r?.status).toLowerCase())).map(x=>agendaEntry(x,'commitment',anchor)),
  ...plans.filter(r=>['active','paused'].includes(text(r?.status).toLowerCase())).map(x=>agendaEntry(x,'npc_plan',anchor))
 ];
 const dateRank={date_past_status_requires_verification:0,date_reached_status_requires_verification:1,
  same_day_time_uncertain:2,future_date_as_recorded:3,no_story_clock:4,
  unparsed_time_reference:5,time_not_established:6};
 openRecords.sort((a,b)=>(dateRank[a.timing]??10)-(dateRank[b.timing]??10));
 return {latest_recorded_time:anchor?.literal??null,anchor_scene_id:anchor?.scene_id??null,
  anchor_is_latest_scene:!!anchor&&undatedAfterAnchor===0&&scenes.at(-1)?.id===anchor.scene_id,
  undated_scenes_after_anchor:undatedAfterAnchor,
  time_precision:anchor?.precision??null,items:openRecords.slice(0,limit),
  omitted_items:Math.max(0,openRecords.length-limit),
  chronology_to_review:backward.slice(-20),omitted_chronology_warnings:Math.max(0,backward.length-20),
  clock_policy:'Fictional time advances only when saved in an actual scene. No real-time ticking, no automatic deadline failure or unseen NPC action. Undated and vague times remain unknown.'};
}
export function agendaNarrationGuidance(agenda){
 if(!agenda)return '';
 const head=agenda.latest_recorded_time?
  'Последнее указанное игровое время: '+agenda.latest_recorded_time+
   (agenda.anchor_is_latest_scene?'.':'. После этой даты есть сцены без точной даты — текущее время неизвестно.') :
  'Точная дата в сыгранных сценах не установлена.';
 const lines=(agenda.items||[]).slice(0,12).map(x=>'• '+(x.actor||'Участник не указан')+
  ': '+x.title+'; срок '+(x.deadline||'не установлен')+
  '; состояние '+x.status+'; временная оценка '+x.timing+
  '; источник '+(x.source?.scene_id||'не указан')+'.');
 return 'ИГРОВОЕ ВРЕМЯ И ОБЯЗАТЕЛЬСТВА — только доказанные записи, без фоновой симуляции:\n'+
  head+'\n'+lines.join('\n')+
  '\nНикакие сроки сами по себе не означают, что герой опоздал, нарушил обещание или выполнил задачу. Для вывода проверь точный текст сцены. Время с неизвестной точностью не додумывай.';
}
