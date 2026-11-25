/** Shared duties, explicit career transitions and scheduled consequence responses.
 * All outcomes are narrated and committed; schedules never perform actions. */
import {parseStoryDate} from './world-time.mjs';
import {householdAccessible} from './households-careers.mjs';
const valid=(x,n=140)=>typeof x==='string'&&x.trim()===x&&!!x&&x.length<=n;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const get=(r,k,i)=>r.get('player-life:'+k+':'+i);
const same=(a,b,ks)=>ks.every(k=>(a[k]??null)===(b[k]??null));
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&parseStoryDate(x)?.precision==='day';
const deadline=x=>typeof x==='string'&&x.trim()===x&&!!parseStoryDate(x);
const activeTask=x=>['proposed','accepted'].includes(x.status);
export const DUTY_CAREER_KINDS=['household_task','career_change','consequence_response'];
export function dutyCareerError(e){
 if(!valid(e.actor)||!valid(e.title,200))return 'Invalid duty or career actor/title';
 if(e.life_kind==='household_task'){
  if(!id(e.household_id)||!id(e.duty_id)||!day(e.scheduled_on)||!valid(e.host)||!['proposed','accepted','declined','completed','missed','cancelled'].includes(e.status))return 'Invalid household task';
  if(['completed','missed'].includes(e.status)?!id(e.family_event_id):e.family_event_id!=null)return 'Completed or missed task needs family event';
 }else if(e.life_kind==='career_change'){
  if(!id(e.previous_job_id)||!['promotion','transfer','new_employer','resignation','dismissal','retirement'].includes(e.change_kind)||!['proposed','completed','cancelled'].includes(e.status)||(['promotion','transfer','new_employer'].includes(e.change_kind)?!id(e.next_job_id)||e.next_job_id===e.previous_job_id:e.next_job_id!=null))return 'Invalid career change';
 }else if(e.life_kind==='consequence_response'){
  if(!id(e.consequence_id)||!deadline(e.due_at)||!valid(e.action_description,600)||!['planned','performed','cancelled'].includes(e.status))return 'Invalid consequence response';
  if(e.status==='performed'&&!['attempted','resolved'].includes(e.result)||e.status!=='performed'&&e.result!=null)return 'Invalid consequence response result';
 }
 if(!['proposed','planned'].includes(e.status)&&!valid(e.outcome,600))return 'Explicit response outcome required';
 return null;
}
const member=(r,h,actor)=>h.actor===actor||[...r.values()].some(x=>x.life_kind==='household_member'&&x.household_id===h.record_id&&x.actor===actor&&x.status==='joined');
export function taskAccessible(r,e){
 const h=get(r,'household',e.household_id);
 return !!h&&h.actor===e.host&&householdAccessible(r,h)&&member(r,h,e.actor);
}
export function dutyCareerTransition(r,e){
 const old=r.get(e.key),k=e.life_kind,rows=[...r.values()],others=fn=>rows.some(x=>x.life_kind===k&&x.key!==e.key&&fn(x));
 if(old&&old.actor!==e.actor)return 'Changed duty or career actor';
 if(k==='household_task'){
  const h=get(r,'household',e.household_id),d=r.get('dynamics:family_duty:'+e.duty_id);
  const at=parseStoryDate(e.scheduled_on),start=parseStoryDate(d?.starts_on);
  if(!h||h.actor!==e.host||!d||!d.actors?.includes(e.actor)||!d.actors.includes(e.host)||!at||!start||at.order<start.order||d.ends_on&&e.scheduled_on>d.ends_on||(at.order-start.order)%(1440*d.every_days)!==0)return 'Task must match household and family duty date';
  if(!old){
   if(e.status!=='proposed'||!taskAccessible(r,e)||d.status!=='active'||others(x=>x.duty_id===e.duty_id&&x.scheduled_on===e.scheduled_on&&(activeTask(x)||['completed','missed'].includes(x.status)))||rows.some(x=>x.dynamics_kind==='family_event'&&x.duty_id===e.duty_id&&x.scheduled_on===e.scheduled_on&&['completed','cancelled'].includes(x.status)))return 'Task requires unique available duty occurrence';
  }else{
   const steps={proposed:['accepted','declined','cancelled'],accepted:['completed','missed','cancelled']};
   if(!same(old,e,['title','household_id','duty_id','host','scheduled_on'])||!steps[old.status]?.includes(e.status))return 'Invalid task transition';
  }
  if(['accepted','completed'].includes(e.status)&&!taskAccessible(r,e))return 'Task requires current household access';
  if(['completed','missed'].includes(e.status)){
   const f=r.get('dynamics:family_event:'+e.family_event_id);
   if(!f||f.duty_id!==e.duty_id||f.scheduled_on!==e.scheduled_on||f.status!==(e.status==='completed'?'completed':'cancelled'))return 'Task outcome must match family event';
  }
 }else if(k==='career_change'){
  const a=r.get('dynamics:employment:'+e.previous_job_id),b=e.next_job_id?r.get('dynamics:employment:'+e.next_job_id):null;
  if(!a||a.actor!==e.actor||e.next_job_id&&(!b||b.actor!==e.actor)||b&&((e.change_kind==='new_employer')===(a.counterparty===b.counterparty)))return 'Career change needs own matching jobs';
  if(!old){
   if(e.status!=='proposed'||!['active','suspended'].includes(a.status)||b&&b.status!=='offered'||others(x=>x.status==='proposed'&&(x.previous_job_id===e.previous_job_id||e.next_job_id&&x.next_job_id===e.next_job_id)))return 'Career change requires existing job and distinct offer';
  }else if(old.status!=='proposed'||!['completed','cancelled'].includes(e.status)||!same(old,e,['title','change_kind','previous_job_id','next_job_id']))return 'Invalid career transition';
  if(e.status==='completed'&&(a.status!=='ended'||b&&b.status!=='active'||rows.some(x=>x.life_kind==='work_shift'&&x.employment_id===e.previous_job_id&&['scheduled','working'].includes(x.status))))return 'Close old job and unresolved shifts, activate new job before completing career change';
 }else if(k==='consequence_response'){
  const c=r.get('consequence:'+e.consequence_id);
  if(!c||c.actor!==e.actor&&c.responsible!==e.actor)return 'Response must concern participant in recorded consequence';
  if(!old){
   if(e.status!=='planned'||c.status==='resolved'||others(x=>x.actor===e.actor&&x.consequence_id===e.consequence_id&&x.status==='planned'))return 'One open response per participant and consequence';
  }else if(old.status!=='planned'||!['performed','cancelled'].includes(e.status)||!same(old,e,['title','consequence_id','due_at','action_description']))return 'Invalid consequence response transition';
  if(e.status==='performed'&&e.result==='resolved'&&c.status!=='resolved')return 'Resolution requires recorded consequence resolution';
 }
 return null;
}
/** Preserve explicit assignment when the ordinary family occurrence closes. */
export function dutyCrossError(r,e,events,i){
 if(e.dynamics_version!==1||e.dynamics_kind!=='family_event'||!e.duty_id||!['completed','cancelled'].includes(e.status))return null;
 const t=[...r.values()].find(x=>x.life_kind==='household_task'&&x.duty_id===e.duty_id&&x.scheduled_on===e.scheduled_on&&activeTask(x));
 if(!t)return null;
 const statuses=e.status==='completed'?['completed','cancelled']:['missed','cancelled'];
 if(!events.slice(i+1).some(x=>x.player_life_version===1&&x.life_kind==='household_task'&&x.key===t.key&&x.actor===t.actor&&statuses.includes(x.status)&&(x.status==='cancelled'||x.family_event_id===e.record_id)))return 'Resolve assigned task in same scene as family event';
 return null;
}
export function dutyCareerView(projection={},actor){
 const rows=projection.worldFacts||[],r=new Map(rows.map(x=>[x.key,x])),page=a=>({records:a.slice(0,40),total:a.length,omitted:Math.max(0,a.length-40)});
 const tasks=rows.filter(x=>x.life_kind==='household_task'&&(x.actor===actor||x.host===actor)).map(x=>({id:x.record_id,title:x.title,actor:x.actor,host:x.host,household_id:x.household_id,duty_id:x.duty_id,scheduled_on:x.scheduled_on,status:x.status,accessible:taskAccessible(r,x),outcome:x.outcome??null,source:x.source}));
 const careers=rows.filter(x=>x.life_kind==='career_change'&&x.actor===actor).map(x=>({id:x.record_id,title:x.title,kind:x.change_kind,previous_job_id:x.previous_job_id,next_job_id:x.next_job_id??null,status:x.status,outcome:x.outcome??null,source:x.source}));
 const responses=rows.filter(x=>x.life_kind==='consequence_response'&&x.actor===actor).map(x=>({id:x.record_id,title:x.title,consequence_id:x.consequence_id,due_at:x.due_at,action_description:x.action_description,status:x.status,result:x.result??null,outcome:x.outcome??null,source:x.source}));
 return {tasks:page(tasks),careers:page(careers),responses:page(responses),policy:'No assignment acceptance, employment change, or consequence resolution without a recorded outcome. Own responses only.'};
}
export const DUTY_CAREER_GUIDANCE='ОБЯЗАННОСТИ, КАРЬЕРА И ПОСЛЕДСТВИЯ: player_life_version=1,record_id,key=player-life:<life_kind>:<ID>,evidence. household_task: actor=исполнитель,host,household_id,duty_id (family_duty),title,scheduled_on (дата расписания),status=proposed/accepted/declined/completed/missed/cancelled; явное принятие; completed/missed требуют ранее записанного family_event completed/cancelled для той же даты (family_event_id), оба изменения в одной сцене. Один исполнитель на конкретный экземпляр обязанности; отмена/отказ не означают выполнение. career_change: actor,title,previous_job_id,next_job_id (для promotion/transfer/new_employer),change_kind=promotion/transfer/new_employer/resignation/dismissal/retirement,status=proposed/completed/cancelled. Прежняя работа active/suspended, новая offered; при завершении старый job ended, запланированные/текущие смены закрыты, новая active с её реальными условиями. Не списывай невыплаченные зарплаты. consequence_response: actor (affected/responsible),title,consequence_id,due_at,action_description,status=planned/performed/cancelled; performed result=attempted/resolved; resolved только после отдельно подтверждённого consequence resolved. Все ответы/закрытия требуют outcome. Не превращай попытку исправить последствия в прощение, доверие или автоматический успех.';
