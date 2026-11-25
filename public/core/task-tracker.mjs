/** Current tasks are projections of accepted plan events, never inferred from prose.
 * Keep the original stable plan identity; history entries are evidence, not invented percentages. */
import {parseStoryDate} from './world-time.mjs';
const text=v=>typeof v==='string'&&v.trim()?v.slice(0,600):null;
const page=(rows,limit=30)=>({records:rows.slice(0,limit),total:rows.length,omitted:Math.max(0,rows.length-limit)});
const terminal=new Set(['completed','abandoned']);
export function taskTracker(projection={},actor,scenes=[],{clock=null,complete=true,limit=30,offset=0}={}){
 const sources=new Map(scenes.map(s=>[s.id,s]));
 const time=parseStoryDate(clock),max=Math.max(1,Math.min(40,Math.floor(Number(limit)||30))),skip=Math.max(0,Math.floor(Number(offset)||0));
 const rows=(projection.plans||[]).filter(p=>p.actor===actor&&text(p.goal)).map(p=>{
  const history=Array.isArray(p.history)?p.history:[],updates=[];
  for(const source of history){
   const e=sources.get(source.scene_id)?.events?.find(e=>e.id===source.event_id&&e.type==='plan'&&e.actor===actor&&e.plan_id===p.plan_id);
   if(!e)continue;
   updates.push({action:e.action,description:text(e.evidence),next_step:text(e.plan_patch?.next_step??(e.action==='start'?e.next_step:null)),obstacle:text(e.plan_patch?.obstacle??(e.action==='start'?e.obstacle:null)),source});
  }
  const due=p.due_at??p.deadline??p.due??null,d=parseStoryDate(due);
  const timing=terminal.has(p.status)?'closed':!d||!time?'unknown':d.precision!==time.precision&&d.day===time.day?'same_day_uncertain':d.order<time.order?'past_unresolved':d.order===time.order?'due_now':'upcoming';
  return {id:'plan:'+p.plan_id,plan_id:p.plan_id,title:text(p.goal),status:p.status,source:p.source??null,started_at:history[0]?.world_time??null,due_at:due,timing,next_step:terminal.has(p.status)?null:text(p.next_step),obstacle:terminal.has(p.status)?null:text(p.obstacle),progress:{confirmed_updates:history.length,recorded_advances:updates.filter(x=>x.action==='advance').length,history_complete:complete&&updates.length===history.length,history:page(updates.slice().reverse(),12)},sort:sources.get(p.source?.scene_id)?.world_time??p.source?.world_time??''};
 });
 rows.sort((a,b)=>String(b.sort).localeCompare(String(a.sort)));
 const clean=({sort,...r})=>r,active=rows.filter(p=>!terminal.has(p.status)).map(clean),finished=rows.filter(p=>terminal.has(p.status)).map(clean);
 const paged=rows=>({records:rows.slice(skip,skip+max),total:rows.length,omitted:Math.max(0,rows.length-skip-max),next_offset:skip+max<rows.length?skip+max:null});
 return {active:paged(active),finished:paged(finished),history_complete:complete,policy:'Only accepted plan transitions. A progress update is not a percentage or proof of completion. No task is created by menu navigation.'};
}
export const TASK_TRACKER_GUIDANCE='ТРЕКЕР ЗАДАНИЙ: до новой сцены проверь активные планы героя и NPC, их plan_id, сроки, следующий шаг и препятствия. Если герой явно принял конкретное дело, сохрани plan action=start с постоянным plan_id, goal и при наличии due_at, next_step, obstacle. Предложение или чужое требование без принятия не является задачей героя. При подтверждённом продвижении используй тот же plan_id action=advance, plan_patch с изменившимися goal/due_at/next_step/obstacle (null очищает необязательное поле); evidence должна подтверждать продвижение. Если стало известно новое препятствие, обнови его, не создавай копию задачи. При реальной паузе, возобновлении, отказе — pause/resume/abandon. При завершении — complete с performed_event_id реального события world/offscreen в той же сцене. Не закрывай дела по истечению срока, не сбрасывай историю, не выдумывай проценты. В каждом сохранении сверь открытые задачи с событиями: затронутые планы обнови, незатронутые оставь как есть.';
