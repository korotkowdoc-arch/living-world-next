/** Current tasks are projections of accepted plan events, never inferred from prose.
 * Keep the original stable plan identity; history entries are evidence, not invented percentages. */
import {parseStoryDate} from './world-time.mjs';
const text=v=>typeof v==='string'&&v.trim()?v.slice(0,600):null;
const page=(rows,limit=30)=>({records:rows.slice(0,limit),total:rows.length,omitted:Math.max(0,rows.length-limit)});
const terminal=new Set(['completed','abandoned']);
// Explicit namespace within the existing plan event protocol. No extra database
// table or synthetic completion: every child is an ordinary accepted plan.
export function parentPlanId(id){
 const match=typeof id==='string'&&/^([A-Za-z0-9_-]{1,80})\/step\/([A-Za-z0-9_-]{1,80})$/.exec(id);
 return match?match[1]:null;
}
export function taskLinks(projection={},actor){
 const rows=(projection.plans||[]).filter(p=>p.actor===actor),byId=new Map(rows.map(p=>[p.plan_id,p])),children=new Map(),orphans=[];
 for(const p of rows){const parent=parentPlanId(p.plan_id);if(!parent)continue;
  if(!byId.has(parent)){orphans.push(p.plan_id);continue;}
  if(!children.has(parent))children.set(parent,[]);children.get(parent).push(p);
 }
 const linked=new Set([...children.values()].flatMap(rows=>rows.map(p=>p.plan_id)));
 return {rows,byId,children,linked,orphans};
}
const stepRow=p=>({id:p.plan_id,title:text(p.goal),status:p.status,next_step:terminal.has(p.status)?null:text(p.next_step),obstacle:terminal.has(p.status)?null:text(p.obstacle),due_at:p.due_at??p.deadline??p.due??null,source:p.source??null});
export function taskChecklist(children=[]){
 const completed=children.filter(p=>p.status==='completed').length,abandoned=children.filter(p=>p.status==='abandoned').length;
 return {records:children.slice(0,20).map(stepRow),total:children.length,completed,abandoned,open:children.length-completed-abandoned,omitted:Math.max(0,children.length-20)};
}
export function activeTaskRecall(projection={},actors=[],{priorities=[],clock=null,complete=true,limit=16,maxChars=9500}={}){
 const time=parseStoryDate(clock),queues=[];
 for(const actor of [...new Set(actors)].slice(0,8)){
  const links=taskLinks(projection,actor),rows=links.rows.filter(p=>!terminal.has(p.status)&&(!links.linked.has(p.plan_id)||terminal.has(links.byId.get(parentPlanId(p.plan_id))?.status)));
  const rank=p=>{const due=parseStoryDate(p.due_at??p.deadline??p.due);return due&&time&&due.order<=time.order?0:priorities.includes('plan:'+p.plan_id)?1:p.status==='active'?2:3;};
  rows.sort((a,b)=>rank(a)-rank(b));
  queues.push({actor,rows:rows.map(p=>({...stepRow(p),actor,plan_id:p.plan_id,checklist:taskChecklist(links.children.get(p.plan_id)||[]),parent_plan_id:parentPlanId(p.plan_id),priority:priorities.includes('plan:'+p.plan_id)}))});
 }
 const records=[],total=queues.reduce((n,q)=>n+q.rows.length,0);
 for(let i=0;i<limit&&records.length<limit;i++)for(const q of queues){const row=q.rows[i];if(!row||records.length>=limit)continue;records.push(row);if(JSON.stringify(records).length>maxChars)records.pop();}
 return {records,total,omitted:total-records.length,history_complete:complete,policy:'Current accepted tasks, including dated and prioritized records. Inspect omitted tasks before a related action. Do not close parent or child automatically.'};
}
export function taskSaveReview(projection={},events=[],body=''){
 const updates=new Map();
 for(const e of events)if(e.type==='plan'){const key=JSON.stringify([e.actor,e.plan_id]);if(!updates.has(key))updates.set(key,[]);updates.get(key).push(e.action);}
 const open=(projection.plans||[]).filter(p=>!terminal.has(p.status)),touched=[],cues=[];
 const normalized=String(body).normalize('NFKC').toLocaleLowerCase('ru');
 const tokens=s=>String(s??'').normalize('NFKC').toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{5,}/gu)||[];
 for(const p of open){const key=JSON.stringify([p.actor,p.plan_id]),actions=updates.get(key);
  if(actions){touched.push({actor:p.actor,plan_id:p.plan_id,actions});continue;}
  const words=[...new Set([...tokens(p.goal),...tokens(p.next_step),...tokens(p.obstacle)])].filter(w=>!['нужно','можно','сегодня','завтра','сделать','должен','после','потом','перед','который','которого'].includes(w));
  const matching=words.filter(w=>normalized.includes(w));
  if(matching.length>=2||matching.length===1&&words.length===1)cues.push({actor:p.actor,plan_id:p.plan_id,goal:text(p.goal),next_step:text(p.next_step),matched_terms:matching.slice(0,5),source:p.source??null,kind:'possible_task_update_not_a_fact'});
 }
 const parent_warnings=[];
 for(const e of events.filter(e=>e.type==='plan'&&e.action==='start'&&parentPlanId(e.plan_id))){
  const parent=parentPlanId(e.plan_id),existing=(projection.plans||[]).find(p=>p.actor===e.actor&&p.plan_id===parent),start=events.find(x=>x.type==='plan'&&x.actor===e.actor&&x.plan_id===parent&&x.action==='start');
  if(!existing&&!start||terminal.has(existing?.status))parent_warnings.push({actor:e.actor,plan_id:e.plan_id,parent_plan_id:parent,kind:'missing_or_closed_parent'});
 }
 return {open_count:open.length,touched:touched.slice(0,40),omitted_touched:Math.max(0,touched.length-40),possible_missing_updates:cues.slice(0,20),omitted_cues:Math.max(0,cues.length-20),parent_warnings,policy:'Lexical matches are review prompts only; unchanged tasks need no event. Verify actual scene actions and stable IDs.'};
}
export function taskTracker(projection={},actor,scenes=[],{clock=null,complete=true,limit=30,offset=0}={}){
 const sources=new Map(scenes.map(s=>[s.id,s])),links=taskLinks(projection,actor);
 const time=parseStoryDate(clock),max=Math.max(1,Math.min(40,Math.floor(Number(limit)||30))),skip=Math.max(0,Math.floor(Number(offset)||0));
 const rows=links.rows.filter(p=>text(p.goal)&&(!links.linked.has(p.plan_id)||!terminal.has(p.status)&&terminal.has(links.byId.get(parentPlanId(p.plan_id))?.status))).map(p=>{
  const history=Array.isArray(p.history)?p.history:[],updates=[];
  for(const source of history){
   const e=sources.get(source.scene_id)?.events?.find(e=>e.id===source.event_id&&e.type==='plan'&&e.actor===actor&&e.plan_id===p.plan_id);
   if(!e)continue;
   updates.push({action:e.action,description:text(e.evidence),next_step:text(e.plan_patch?.next_step??(e.action==='start'?e.next_step:null)),obstacle:text(e.plan_patch?.obstacle??(e.action==='start'?e.obstacle:null)),source});
  }
  const due=p.due_at??p.deadline??p.due??null,d=parseStoryDate(due);
  const timing=terminal.has(p.status)?'closed':!d||!time?'unknown':d.precision!==time.precision&&d.day===time.day?'same_day_uncertain':d.order<time.order?'past_unresolved':d.order===time.order?'due_now':'upcoming';
  return {id:'plan:'+p.plan_id,plan_id:p.plan_id,title:text(p.goal),status:p.status,source:p.source??null,started_at:history[0]?.world_time??null,due_at:due,timing,parent_plan_id:parentPlanId(p.plan_id),checklist:taskChecklist(links.children.get(p.plan_id)||[]),next_step:terminal.has(p.status)?null:text(p.next_step),obstacle:terminal.has(p.status)?null:text(p.obstacle),progress:{confirmed_updates:history.length,recorded_advances:updates.filter(x=>x.action==='advance').length,history_complete:complete&&updates.length===history.length,history:page(updates.slice().reverse(),12)},sort:sources.get(p.source?.scene_id)?.world_time??p.source?.world_time??''};
 });
 rows.sort((a,b)=>String(b.sort).localeCompare(String(a.sort)));
 const clean=({sort,...r})=>r,active=rows.filter(p=>!terminal.has(p.status)).map(clean),finished=rows.filter(p=>terminal.has(p.status)).map(clean);
 const paged=rows=>({records:rows.slice(skip,skip+max),total:rows.length,omitted:Math.max(0,rows.length-skip-max),next_offset:skip+max<rows.length?skip+max:null});
 return {active:paged(active),finished:paged(finished),history_complete:complete,unlinked_step_ids:links.orphans,policy:'Only accepted plan transitions. A progress update is not a percentage or proof of completion. No task is created by menu navigation.'};
}
export const TASK_TRACKER_GUIDANCE='ТРЕКЕР ЗАДАНИЙ: до новой сцены проверь активные планы героя и NPC, их plan_id, сроки, следующий шаг и препятствия. Если герой явно принял конкретное дело, сохрани plan action=start с постоянным plan_id, goal и при наличии due_at, next_step, obstacle. Предложение или чужое требование без принятия не является задачей героя. При подтверждённом продвижении используй тот же plan_id action=advance, plan_patch с изменившимися goal/due_at/next_step/obstacle (null очищает необязательное поле); evidence должна подтверждать продвижение. Если стало известно новое препятствие, обнови его, не создавай копию задачи. При реальной паузе, возобновлении, отказе — pause/resume/abandon. При завершении — complete с performed_event_id реального события world/offscreen в той же сцене. Не закрывай дела по истечению срока, не сбрасывай историю, не выдумывай проценты. Для подтверждённых конкретных этапов используй обычный plan с ID <ID родителя>/step/<ID этапа> (латиница, цифры, _ или -, максимум 80 символов на часть), того же actor; сначала создай родительский план, затем этапы. Каждый этап самостоятельно проходит start/advance/complete/abandon; завершение этапа не завершает родителя и наоборот. Не создавай этапы задним числом без сцены и не придумывай проценты. В каждом сохранении сверь открытые задачи с событиями: затронутые планы обнови, незатронутые оставь как есть.';
