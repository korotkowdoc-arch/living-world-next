/** Fictional clock projections: advisory, no wall clock and no implicit player actions. */
import {parseStoryDate} from './world-time.mjs';
const DAY=1440;
const ranks=['comfortable','noticeable','urgent','critical'];
// Game pacing constants, not medical claims. Each value is minutes per urgency step.
export const NEED_INTERVALS=Object.freeze({hunger:240,thirst:180,energy:480,hygiene:720});
const active=x=>!['completed','complete','fulfilled','resolved','cancelled','canceled','abandoned','ended','missed','done'].includes(x);
const date=x=>parseStoryDate(x);
function literal(min){
 const d=new Date(min*60000),s=d.toISOString();
 if(!/^\d{4}-/.test(s)||s.startsWith('0000'))throw Error('Fictional time outside supported calendar');
 return s.slice(0,10)+' '+s.slice(11,16);
}
export function needForecast(need,scenes=[],targetTime=null,{complete=true}={}){
 const base={need:need.need,recorded_status:need.status,recorded_at:need.source?.world_time??null,estimated_status:null,elapsed_minutes:null,next_review_at:null,certainty:'unknown'};
 if(!complete||!NEED_INTERVALS[need.need]||!ranks.includes(need.status))return base;
 const idx=scenes.findIndex(s=>s.id===need.source?.scene_id);
 const start=date(need.source?.world_time),end=date(targetTime??scenes.at(-1)?.world_time);
 if(idx<0||start?.precision!=='minute'||end?.precision!=='minute'||end.order<start.order)return base;
 let previous=start.order;
 for(const s of scenes.slice(idx)){
  const t=date(s.world_time);
  if(t?.precision!=='minute'||t.order<previous)return {...base,certainty:'chronology_uncertain'};
  previous=t.order;
 }
 if(end.order<previous)return {...base,certainty:'chronology_uncertain'};
 const elapsed=end.order-start.order,step=NEED_INTERVALS[need.need],rank=ranks.indexOf(need.status),next=Math.min(3,rank+Math.floor(elapsed/step));
 return {...base,estimated_status:ranks[next],elapsed_minutes:elapsed,next_review_at:next<3?literal(start.order+(next-rank+1)*step):null,certainty:'estimate_if_no_relief'};
}
function timing(at,clock){
 if(!at||!clock)return 'unknown';
 if(at.precision!==clock.precision&&at.day===clock.day)return 'same_day_uncertain';
 return at.order<clock.order?'past_unresolved':at.order===clock.order?'due_now':'upcoming';
}
function overlaps(a,b){return a.start<b.end&&b.start<a.end;}
const str=v=>typeof v==='string'?v.slice(0,300):null;
export function playerCalendar(projection={},actor,clockTime,{days=7,limit=40}={}){
 const clock=date(clockTime),records=projection.worldFacts||[],rows=[],windows=[];
 days=Math.max(1,Math.min(31,Math.floor(Number(days)||7)));limit=Math.max(1,Math.min(100,Math.floor(Number(limit)||40)));
 const end=clock?Math.floor(clock.order/DAY)*DAY+days*DAY:null;
 const add=(kind,id,title,raw,status,source,extra={})=>{
  const at=date(raw);rows.push({kind,id,title:str(title),when:raw??null,status,timing:timing(at,clock),source,...extra,_order:at?.order??null});
 };
 for(const x of projection.plans||[])if(x.actor===actor&&['active','paused'].includes(x.status))add('task',x.plan_id,x.goal,x.due_at||x.deadline||x.due,x.status,x.source);
 for(const x of projection.obligations||[])if(x.actor===actor&&active(x.status))add('commitment',x.commitment_id,x.description||x.evidence,x.due_at||x.deadline||x.due,x.status,x.source);
 for(const x of records){
  if(x.player_life_version===1&&x.life_kind==='lesson'&&x.actor===actor&&x.status==='scheduled'){add('lesson',x.record_id,x.title,x.starts_at,x.status,x.source,{ends_at:x.ends_at,place:x.place});const a=date(x.starts_at),b=date(x.ends_at);if(clock&&a&&b&&b.order>clock.order&&a.order<end)windows.push({id:'lesson:'+x.record_id,title:x.title,start:a.order,end:b.order});}
  if(x.player_life_version===1&&x.life_kind==='supply_contract'&&(x.actor===actor||x.supplier===actor)&&['active','disputed'].includes(x.status))add('supply_contract',x.record_id,x.title,x.due_at,x.status,x.source);
  if(x.player_life_version===1&&x.life_kind==='assignment'&&x.actor===actor&&x.status==='assigned')add('assignment',x.record_id,x.title,x.due_at,x.status,x.source);
  if(x.player_life_version===1&&x.life_kind==='assessment'&&x.actor===actor&&x.status==='scheduled'){add('assessment',x.record_id,x.title,x.starts_at,x.status,x.source,{ends_at:x.ends_at});const a=date(x.starts_at),b=date(x.ends_at);if(clock&&a&&b&&b.order>clock.order&&a.order<end)windows.push({id:'assessment:'+x.record_id,title:x.title,start:a.order,end:b.order});}
  if(x.player_life_version===1&&x.life_kind==='reservation'&&x.actor===actor&&x.status==='reserved'){const s=records.find(r=>r.key==='player-life:capacity_slot:'+x.slot_id);if(s){add('reservation',x.record_id,s.resource,s.starts_at,x.status,x.source,{ends_at:s.ends_at});const a=date(s.starts_at),b=date(s.ends_at);if(clock&&a&&b&&b.order>clock.order&&a.order<end)windows.push({id:'reservation:'+x.record_id,title:s.resource,start:a.order,end:b.order});}}
  if(x.player_life_version===1&&x.life_kind==='work_shift'&&x.actor===actor&&['scheduled','working'].includes(x.status)){add('work_shift',x.record_id,x.title,x.starts_at,x.status,x.source,{ends_at:x.ends_at,place:x.place});const a=date(x.starts_at),b=date(x.ends_at);if(clock&&a&&b&&b.order>clock.order&&a.order<end)windows.push({id:'work_shift:'+x.record_id,title:x.title,start:a.order,end:b.order});}
  if(x.player_life_version===1&&x.life_kind==='appointment'&&x.participants.includes(actor)&&(x.status!=='proposed'||x.actor===actor)&&active(x.status)){
   add('appointment',x.record_id,x.title,x.starts_at,x.status,x.source,{ends_at:x.ends_at,place:x.place,participants:x.participants});
   const a=date(x.starts_at),b=date(x.ends_at);
   if(a?.precision==='minute'&&b?.precision==='minute'&&x.status==='confirmed'&&clock&&b.order>clock.order&&a.order<end)windows.push({id:'appointment:'+x.record_id,title:x.title,start:a.order,end:b.order});
  }
  if(x.world_record_version===1&&x.record_kind==='routine'&&x.actor===actor&&x.status==='active'&&clock?.precision==='minute'){
   const start=Number(x.start.slice(0,2))*60+Number(x.start.slice(3)),finish=Number(x.end.slice(0,2))*60+Number(x.end.slice(3));
   for(let day=Math.floor(clock.order/DAY)-1;day<Math.floor(end/DAY);day++){
    if(!x.weekdays.includes(new Date(day*86400000).getUTCDay()||7))continue;
    const a=day*DAY+start,b=day*DAY+finish+(finish<start?DAY:0);if(b<=clock.order||a>=end)continue;
    const id=x.record_id+':'+literal(a);add('routine',id,x.activity,literal(a),x.status,x.source,{ends_at:literal(b),place:x.place});windows.push({id,title:x.activity,start:a,end:b});
   }
  }
 }
 const conflicts=[];let conflictCount=0;
 windows.sort((a,b)=>a.start-b.start);
 for(let i=0;i<windows.length;i++)for(let j=i+1;j<windows.length&&windows[j].start<windows[i].end;j++)if(overlaps(windows[i],windows[j])){
  conflictCount++;if(conflicts.length<20)conflicts.push({first:windows[i].id,second:windows[j].id,from:literal(Math.max(windows[i].start,windows[j].start)),to:literal(Math.min(windows[i].end,windows[j].end))});
 }
 rows.sort((a,b)=>(a._order??Infinity)-(b._order??Infinity)||String(a.id).localeCompare(String(b.id)));
 return {clock:clock?.literal??null,days,entries:rows.slice(0,limit).map(({_order,...r})=>r),total:rows.length,omitted:Math.max(0,rows.length-limit),conflicts,omitted_conflicts:Math.max(0,conflictCount-conflicts.length),policy:'Scheduled windows are not presence, completion or failure. Conflicts require a decision. Date-only clocks do not generate exact routine windows.'};
}
export function planTimeAdvance(scenes,projection,actor,targetTime,{pending=false,complete=true,pace='dynamic'}={}){
 const clock=date(scenes.at(-1)?.world_time),target=date(targetTime);
 if(!target||target.precision!=='minute')throw Error('Time advance needs exact fictional date and time YYYY-MM-DD HH:MM');
 if(!complete||clock?.precision!=='minute')return {status:'clock_or_history_unknown',target:target.literal,can_advance:false};
 if(target.order<=clock.order)throw Error('Target must follow the current fictional time');
 if(pending)return {status:'player_choice_pending',target:target.literal,can_advance:false};
 const horizon=Math.max(1,Math.min(31,Math.ceil((target.order-clock.order)/DAY)+1));
 const calendar=playerCalendar(projection,actor,clock.literal,{days:horizon,limit:100});
 const gates=[];
 const deadlines=[...(projection.plans||[]).filter(x=>x.actor===actor&&x.status==='active').map(x=>({kind:'task',id:x.plan_id,title:x.goal,when:x.due_at||x.deadline||x.due,status:x.status})),...(projection.obligations||[]).filter(x=>x.actor===actor&&active(x.status)).map(x=>({kind:'commitment',id:x.commitment_id,title:x.description||x.evidence,when:x.due_at||x.deadline||x.due,status:x.status})),...(projection.worldFacts||[]).filter(x=>x.player_life_version===1&&x.life_kind==='appointment'&&x.status==='confirmed'&&x.participants.includes(actor)).map(x=>({kind:'appointment',id:x.record_id,title:x.title,when:x.starts_at,status:x.status}))];
 for(const x of deadlines){
  if(!['task','commitment','appointment'].includes(x.kind)||x.status==='paused'||x.status==='proposed')continue;
  const t=date(x.when);if(!t||t.order>target.order)continue;
  gates.push({kind:x.kind,id:x.id,title:x.title,at:literal(Math.max(clock.order,t.order)),reason:t.precision==='day'?'date_only_requires_review':'scheduled_or_unresolved'});
 }
 for(const x of projection.worldFacts||[])if(x.player_life_version===1&&x.life_kind==='supply_contract'&&(x.actor===actor||x.supplier===actor)&&['active','disputed'].includes(x.status)){const t=date(x.due_at);if(t&&t.order<=target.order)gates.push({kind:'supply_contract',id:x.record_id,title:x.title,at:literal(Math.max(clock.order,t.order)),reason:'supply_deadline_requires_review'});}
 for(const x of projection.worldFacts||[])if(x.player_life_version===1&&x.actor===actor){
  if(x.life_kind==='lesson'&&x.status==='scheduled'||x.life_kind==='assignment'&&x.status==='assigned'){const t=date(x.life_kind==='lesson'?x.starts_at:x.due_at);if(t&&t.order<=target.order)gates.push({kind:x.life_kind,id:x.record_id,title:x.title,at:literal(Math.max(clock.order,t.order)),reason:'education_requires_review'});}
  if(x.life_kind==='assessment'&&x.status==='scheduled'){const t=date(x.starts_at);if(t&&t.order<=target.order)gates.push({kind:'assessment',id:x.record_id,title:x.title,at:literal(Math.max(clock.order,t.order)),reason:'exam_requires_review'});}
  if(x.life_kind==='reservation'&&x.status==='reserved'){const s=(projection.worldFacts||[]).find(r=>r.key==='player-life:capacity_slot:'+x.slot_id),t=date(s?.starts_at);if(t&&t.order<=target.order)gates.push({kind:'reservation',id:x.record_id,title:s.resource,at:literal(Math.max(clock.order,t.order)),reason:'booking_requires_review'});}
  if(x.life_kind==='work_shift'&&['scheduled','working'].includes(x.status)){const t=date(x.status==='working'?x.ends_at:x.starts_at);if(t&&t.order<=target.order)gates.push({kind:'work_shift',id:x.record_id,title:x.title,at:literal(Math.max(clock.order,t.order)),reason:'work_schedule_requires_review'});}
  if(x.life_kind==='journey'&&x.status==='travelling')gates.push({kind:'journey',id:x.record_id,title:x.title,at:clock.literal,reason:'resolve_current_leg_before_skip'});
  if(x.life_kind==='service_visit'&&x.status==='accepted')gates.push({kind:'service_visit',id:x.record_id,title:x.title,at:clock.literal,reason:'review_accepted_service_before_skip'});
 }
 const records=(projection.worldFacts||[]).filter(x=>x.player_life_version===1&&x.life_kind==='need'&&x.actor===actor);
 const forecasts=records.map(x=>needForecast(x,scenes,target.literal,{complete}));
 for(const f of forecasts)if(f.estimated_status==='critical'){
  const start=date(f.recorded_at),rank=ranks.indexOf(f.recorded_status),at=start.order+(3-rank)*NEED_INTERVALS[f.need];
  gates.push({kind:'need',id:f.need,title:f.need,at:literal(Math.max(clock.order,at)),reason:'estimated_critical_if_no_relief'});
 }
 // Long jumps must be staged; background NPC and world events are still evaluated by prepare_story_turn.
 const paceHours={slow:2,normal:8,dynamic:24,fast:72};
 const cap=Math.min(target.order,clock.order+(paceHours[pace]??24)*60);
 gates.sort((a,b)=>date(a.at).order-date(b.at).order);
 const first=gates[0],stop=Math.min(cap,first?date(first.at).order:Infinity);
 return {status:stop===clock.order?'review_now':'proposed',can_advance:stop>clock.order,from:clock.literal,target:target.literal,proposed_until:literal(stop),remaining_minutes:target.order-stop,gate:first&&date(first.at).order<=cap?first:null,calendar_omitted:calendar.omitted,forecast:forecasts,policy:'Proposal only. Check all world candidates and pending choices before each committed segment. Never auto-eat, sleep, complete an appointment or make a decision for the player.'};
}
export const TIME_LIFE_GUIDANCE='ВРЕМЯ И КАЛЕНДАРЬ: состояние потребности из сцены и оценка при отсутствии удовлетворения различаются. estimate_if_no_relief — игровой прогноз, не медицинская модель и не доказательство голода/усталости. При точных часах оценка ухудшается по игровому времени, при неизвестных датах и флешбэках прогноз неизвестен. Не записывай прогноз как уже произошедший факт. Перед длинной перемоткой используй plan_game_time или prepare_story_turn с target_time: соблюдай proposed_until и gate, проверяй обязательства, встречи, NPC и срочные потребности, прерывайся на важных решениях. Темп меняет максимальную длину шага, а не скорость реальных часов. Календарь показывает собственные сроки, повторяющиеся занятия и встречи, конфликты не означают пропуск или нарушение. Не создавай сцену при просмотре.';
