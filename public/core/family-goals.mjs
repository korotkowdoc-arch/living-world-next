/** Family history and agreed shared goals. No simulated birth, automatic consent,
 * maturity, relationship or skill change. Dates use only the fictional calendar. */
import {parseStoryDate} from './world-time.mjs';
const valid=(x,n=140)=>typeof x==='string'&&x.trim()===x&&!!x&&x.length<=n;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&parseStoryDate(x)?.precision==='day';
const date=x=>typeof x==='string'&&x.trim()===x&&!!parseStoryDate(x);
const get=(r,k,i)=>r.get('player-life:'+k+':'+i);
const same=(a,b,ks)=>ks.every(k=>(a[k]??null)===(b[k]??null));
const stepsEqual=(a,b)=>a.length===b.length&&a.every((x,i)=>same(x,b[i],['id','title']));
const parents=(r,child)=>[...r.values()].filter(x=>x.dynamics_version===1&&x.dynamics_kind==='bond'&&x.bond_type==='parenthood'&&x.counterparty===child&&['active','strained','estranged'].includes(x.status));
const member=(r,g,actor)=>g.actor===actor||[...r.values()].some(x=>x.life_kind==='shared_goal_member'&&x.goal_id===g.record_id&&x.actor===actor&&x.status==='accepted');
export const FAMILY_GOAL_KINDS=['child_birth','child_milestone','shared_goal','shared_goal_member','shared_goal_step'];
export function familyGoalError(e){
 if(!valid(e.actor))return 'Invalid family/goal actor';
 switch(e.life_kind){
 case 'child_birth':
  if(!valid(e.parent)||e.actor===e.parent||!day(e.born_on)||!id(e.family_event_id)||e.status!=='recorded')return 'Invalid birth record';break;
 case 'child_milestone':
  if(!id(e.child_id)||!id(e.family_event_id)||!day(e.occurred_on)||!valid(e.title,200)||!['care','education','birthday','development','other'].includes(e.category)||!valid(e.description,600)||e.status!=='recorded')return 'Invalid child milestone';break;
 case 'shared_goal':
  if(!valid(e.title,200)||!valid(e.description,600)||!date(e.due_at)||!Array.isArray(e.steps)||e.steps.length<1||e.steps.length>12||e.steps.some(x=>!x||Object.keys(x).length!==2||!id(x.id)||!valid(x.title,200))||new Set(e.steps.map(x=>x.id)).size!==e.steps.length||!['proposed','active','completed','cancelled'].includes(e.status)||(['completed','cancelled'].includes(e.status)&&!valid(e.outcome,600)))return 'Invalid shared goal';break;
 case 'shared_goal_member':
  if(!id(e.goal_id)||!valid(e.organizer)||e.actor===e.organizer||!['invited','accepted','declined','left','removed'].includes(e.status)||e.status!=='invited'&&!valid(e.outcome,600))return 'Invalid shared goal invitation';break;
 case 'shared_goal_step':
  if(!id(e.goal_id)||!id(e.step_id)||!id(e.completion_id)||!['activity','family_event'].includes(e.completion_kind)||!valid(e.outcome,600)||e.status!=='completed')return 'Invalid goal step';break;
 }
 return null;
}
export function familyGoalTransition(r,e){
 const old=r.get(e.key),k=e.life_kind,rows=[...r.values()],others=fn=>rows.some(x=>x.life_kind===k&&x.key!==e.key&&fn(x));
 if(old&&old.actor!==e.actor)return 'Changed family/goal actor';
 if(k==='child_birth'){
  const f=r.get('dynamics:family_event:'+e.family_event_id);
  if(old||others(x=>x.actor===e.actor||x.family_event_id===e.family_event_id)||!f||f.family_kind!=='birth'||f.status!=='completed'||!f.actors?.includes(e.actor)||!f.actors.includes(e.parent)||!parents(r,e.actor).some(x=>x.actor===e.parent))return 'Birth requires distinct completed birth event and recorded parenthood';
 }else if(k==='child_milestone'){
  const c=get(r,'child_birth',e.child_id),f=r.get('dynamics:family_event:'+e.family_event_id);
  const categories={care:'care',education:'education',birthday:'birthday',development:'other',other:'other'};
  if(old||!c||!parents(r,c.actor).some(x=>x.actor===e.actor)||e.occurred_on<c.born_on||!f||f.status!=='completed'||f.family_kind!==categories[e.category]||!f.actors?.includes(c.actor)||!f.actors.includes(e.actor)||others(x=>x.family_event_id===e.family_event_id))return 'Milestone needs child, parenthood and actual matching family event';
 }else if(k==='shared_goal'){
  const accepted=rows.filter(x=>x.life_kind==='shared_goal_member'&&x.goal_id===e.record_id&&x.status==='accepted');
  if(!old){if(e.status!=='proposed')return 'Shared goal starts as proposal';}
  else {
   const next={proposed:['active','cancelled'],active:['completed','cancelled']};
   if(!same(old,e,['title','description','due_at'])||!stepsEqual(old.steps,e.steps)||!next[old.status]?.includes(e.status))return 'Invalid shared goal transition';
  }
  if(['active','completed'].includes(e.status)&&!accepted.length)return 'Shared goal needs another accepted participant';
  if(e.status==='completed'&&!e.steps.every(s=>rows.some(x=>x.life_kind==='shared_goal_step'&&x.goal_id===e.record_id&&x.step_id===s.id)))return 'All goal steps need actual completion';
 }else if(k==='shared_goal_member'){
  const g=get(r,'shared_goal',e.goal_id);
  if(!g||g.actor!==e.organizer||!['proposed','active'].includes(g.status))return 'Invitation needs open shared goal';
  if(!old){
   if(e.status!=='invited'||others(x=>x.goal_id===e.goal_id&&x.actor===e.actor&&['invited','accepted'].includes(x.status)))return 'One open invitation per participant';
  }else {
   const next={invited:['accepted','declined','removed'],accepted:['left','removed']};
   if(!same(old,e,['goal_id','organizer'])||!next[old.status]?.includes(e.status))return 'Invalid goal membership transition';
  }
 }else if(k==='shared_goal_step'){
  const g=get(r,'shared_goal',e.goal_id),f=r.get((e.completion_kind==='activity'?'activity:activity:':'dynamics:family_event:')+e.completion_id);
  if(old||!g||g.status!=='active'||!member(r,g,e.actor)||!rows.some(x=>x.life_kind==='shared_goal_member'&&x.goal_id===g.record_id&&x.status==='accepted')||!g.steps.some(x=>x.id===e.step_id)||!f||f.status!=='completed'||!f.actors?.includes(e.actor)||!valid(f.outcome,600)||others(x=>x.goal_id===e.goal_id&&(x.step_id===e.step_id||x.completion_kind===e.completion_kind&&x.completion_id===e.completion_id)))return 'Step requires active shared goal, accepted participant and unique actual completion';
 }
 return null;
}
export function familyBirthDateError(records,e){
 if(e.type!=='character'||!Object.hasOwn(e.state_patch||{},'birth_date'))return null;
 const birth=[...records.values()].find(x=>x.life_kind==='child_birth'&&x.actor===e.name?.trim());
 return birth&&birth.born_on!==e.state_patch.birth_date?'Recorded birth date cannot be changed by character patch':null;
}
export function familyGoalSceneError(e,events,i,worldTime){
 if(e.player_life_version!==1)return null;
 const prior=events.slice(0,i);
 if(['child_birth','child_milestone'].includes(e.life_kind)){
  const stamp=parseStoryDate(worldTime);
  if(worldTime!==undefined&&(!stamp||stamp.day!==(e.born_on??e.occurred_on)))return 'Birth and milestone require recorded scene calendar date';
  if(e.life_kind==='child_birth'&&prior.filter(x=>x.type==='character'&&x.name?.trim()===e.actor&&Object.hasOwn(x.state_patch||{},'birth_date')).at(-1)?.state_patch.birth_date!==e.born_on)return 'Birth needs matching character birth_date in same scene';
  if(!prior.some(x=>x.dynamics_version===1&&x.dynamics_kind==='family_event'&&x.record_id===e.family_event_id&&x.status==='completed'))return 'Family event must be completed in same scene';
 }
 if(e.life_kind==='shared_goal_step'&&!prior.some(x=>x.record_id===e.completion_id&&x.status==='completed'&&(e.completion_kind==='activity'?x.activity_version===1&&x.activity_kind==='activity':x.dynamics_version===1&&x.dynamics_kind==='family_event')))return 'Goal step requires actual completion in same scene';
 return null;
}
export function fictionalAge(born,clock){
 const now=parseStoryDate(clock);if(!day(born)||!now||now.day<born)return null;
 const [y,m,d]=born.split('-').map(Number),[cy,cm,cd]=now.day.split('-').map(Number);
 return cy-y-(cm<m||cm===m&&cd<d?1:0);
}
export function familyGoalView(projection={},actor,clock=null){
 const rows=projection.worldFacts||[],r=new Map(rows.map(x=>[x.key,x])),page=a=>({records:a.slice(0,40),total:a.length,omitted:Math.max(0,a.length-40)});
 const children=rows.filter(x=>x.life_kind==='child_birth'&&(x.actor===actor||parents(r,x.actor).some(p=>p.actor===actor))).map(x=>({id:x.record_id,name:x.actor,born_on:x.born_on,age_years:fictionalAge(x.born_on,clock),parents:parents(r,x.actor).map(p=>p.actor),milestones:page(rows.filter(m=>m.life_kind==='child_milestone'&&m.child_id===x.record_id&&(m.actor===actor||x.actor===actor)).map(m=>({id:m.record_id,title:m.title,category:m.category,occurred_on:m.occurred_on,description:m.description,source:m.source}))),source:x.source}));
 const goals=rows.filter(x=>x.life_kind==='shared_goal'&&(x.actor===actor||rows.some(m=>m.life_kind==='shared_goal_member'&&m.goal_id===x.record_id&&m.actor===actor&&['invited','accepted','left'].includes(m.status)))).map(x=>{
  const own=rows.find(m=>m.life_kind==='shared_goal_member'&&m.goal_id===x.record_id&&m.actor===actor&&['invited','accepted'].includes(m.status));
  const canSee=x.actor===actor||own?.status==='accepted';
  return {id:x.record_id,title:x.title,description:x.description,organizer:x.actor,due_at:x.due_at,status:x.status,membership:own?.status??(x.actor===actor?'organizer':'left'),membership_id:own?.record_id??null,steps:x.steps.map(s=>({...s,completed:canSee?rows.some(m=>m.life_kind==='shared_goal_step'&&m.goal_id===x.record_id&&m.step_id===s.id):null})),participants:rows.filter(m=>m.life_kind==='shared_goal_member'&&m.goal_id===x.record_id&&(x.actor===actor||m.actor===actor||canSee&&m.status==='accepted')).map(m=>({id:m.record_id,actor:m.actor,status:m.status})),outcome:canSee?x.outcome??null:null,source:x.source};
 });
 return {children:page(children),goals:page(goals),policy:'Age is derived from recorded birth day and fictional date only. Milestones and goals require recorded events; no automatic development, consent or relationship change.'};
}
export const FAMILY_GOAL_GUIDANCE='СЕМЬЯ И СОВМЕСТНЫЕ ЦЕЛИ: player_life_version=1,record_id,key=player-life:<life_kind>:<ID>,evidence. child_birth: actor=ребёнок,parent,born_on (дата сцены),family_event_id (completed birth, в той же сцене, оба участника),status=recorded. Нужны bond parenthood parent→child и character state_patch.birth_date той же даты в этой сцене. Не придумывай рождение или согласие персонажей. child_milestone: actor=родитель,child_id,family_event_id (completed в той же сцене),occurred_on=дата сцены,title,category=care/education/birthday/development/other,description,status=recorded; категория соответствует family_event care/education/birthday/other/other, оба участника. Возраст только от даты рождения и игрового времени, не повышает автоматически навыки или самостоятельность. shared_goal: actor=организатор,title,description,due_at,steps:[{id,title}] (1–12),status=proposed/active/completed/cancelled; хотя бы один другой участник должен явно принять для active/completed; все шаги пройдены для completed, outcome при закрытии. shared_goal_member: actor=приглашённый,organizer,goal_id,status=invited/accepted/declined/left/removed,outcome после приглашения. shared_goal_step: actor=принявший участник/организатор,goal_id,step_id,completion_kind=activity/family_event,completion_id, status=completed,outcome; отдельное completed событие с участием исполнителя в этой сцене, не использовать повторно для шагов одной цели. Не выбирать за игрока; совместная цель не означает общие деньги или автоматический успех.';
