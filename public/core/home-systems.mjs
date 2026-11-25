/** Housing, savings plans, capacity reservations and education. All actual
 * monetary changes remain in the existing ledger. No automatic outcomes. */
import {parseStoryDate} from './world-time.mjs';
const valid=(x,n=140)=>typeof x==='string'&&x.trim()===x&&!!x&&x.length<=n;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const uint=x=>Number.isSafeInteger(x)&&x>=0;
const time=x=>{const t=parseStoryDate(x);return t?.precision==='minute'?t.order:null};
const interval=e=>time(e.starts_at)!==null&&time(e.ends_at)!==null&&time(e.starts_at)<time(e.ends_at);
const same=(a,b,keys)=>keys.every(k=>(a[k]??null)===(b[k]??null));
const statuses={
 lease:['proposed','active','ended','cancelled'],
 home_condition:['good','worn','damaged','unsafe','unknown'],
 budget:['active','paused','closed'],
 capacity_slot:['open','closed'],
 reservation:['reserved','used','cancelled'],
 enrollment:['applied','enrolled','completed','withdrawn','rejected'],
 assessment:['scheduled','passed','failed','cancelled'],
 practice_record:['recorded'],
 reputation:['positive','neutral','negative','mixed','unknown']
};
export const HOME_KINDS=Object.freeze(Object.keys(statuses));
export function homeRecordError(e){
 const k=e.life_kind;
 if(!valid(e.actor)||!statuses[k]?.includes(e.status))return 'Invalid life record actor/status';
 switch(k){
 case 'lease':
  if(!valid(e.landlord)||e.landlord===e.actor||!valid(e.place)||!valid(e.title,200)||!id(e.agreement_id)||!id(e.schedule_id))return 'Invalid lease';break;
 case 'home_condition':
  if(!id(e.lease_id)||!valid(e.area)||!valid(e.description,600))return 'Invalid home condition';break;
 case 'budget':
  if(!valid(e.title,200)||!valid(e.currency,80)||!uint(e.monthly_limit)||!uint(e.savings_target))return 'Invalid budget';break;
 case 'capacity_slot':
  if(!id(e.service_id)||!valid(e.resource)||!interval(e)||!Number.isInteger(e.capacity)||e.capacity<1||e.capacity>10000)return 'Invalid capacity slot';break;
 case 'reservation':
  if(!id(e.slot_id)||!id(e.visit_id)||!Number.isInteger(e.units)||e.units<1||e.units>10000)return 'Invalid reservation';break;
 case 'enrollment':
  if(!id(e.institution_id)||!valid(e.title,200)||!valid(e.place))return 'Invalid enrollment';break;
 case 'assessment':
  if(!id(e.enrollment_id)||!valid(e.title,200)||!interval(e)||(['passed','failed'].includes(e.status)&&!valid(e.outcome,600)))return 'Invalid assessment';break;
 case 'practice_record':
  if(!id(e.skill_id)||!['work_shift','assessment'].includes(e.origin_kind)||!id(e.origin_id)||!valid(e.description,600))return 'Invalid practice evidence';break;
 case 'reputation':
  if(!id(e.group_id)||!valid(e.observer)||e.actor===e.observer||!valid(e.description,600)||typeof e.known_to_actor!=='boolean')return 'Invalid reputation observation';break;
 default:return 'Unknown life record';
 }
 return null;
}
const transitions={
 lease:{proposed:['proposed','active','cancelled'],active:['active','ended']},
 budget:{active:['active','paused','closed'],paused:['active','paused','closed']},
 capacity_slot:{open:['open','closed']},
 reservation:{reserved:['used','cancelled']},
 enrollment:{applied:['enrolled','rejected','withdrawn'],enrolled:['completed','withdrawn']},
 assessment:{scheduled:['scheduled','passed','failed','cancelled']}
};
export function homeTransition(records,e){
 const k=e.life_kind,old=records.get(e.key);
 const get=(kind,id)=>records.get('player-life:'+kind+':'+id);
 const duplicate=predicate=>[...records.values()].some(x=>x.life_kind===k&&x.key!==e.key&&predicate(x));
 if(old&&old.actor!==e.actor)return 'Cannot change record actor';
 if(old&&transitions[k]&&!transitions[k][old.status]?.includes(e.status))return 'Invalid life transition';
 if(k==='lease'){
  const a=records.get('dynamics:economic_agreement:'+e.agreement_id),s=records.get('dynamics:payment_schedule:'+e.schedule_id);
  if(old&&!same(old,e,['landlord','place','agreement_id','schedule_id'])||!old&&!['proposed','active'].includes(e.status)||duplicate(x=>x.agreement_id===e.agreement_id||x.schedule_id===e.schedule_id))return 'Invalid or duplicate lease terms';
  if(!a||a.agreement_kind!=='rent'||a.actor!==e.actor||a.counterparty!==e.landlord||a.place!==e.place||!s||s.payment_kind!=='rent'||s.actor!==e.actor||s.counterparty!==e.landlord||s.amount!==a.amount||s.currency!==a.currency)return 'Lease requires matching rent agreement and payment schedule';
  if(e.status==='active'&&(a.status!=='active'||s.status!=='active'))return 'Active lease requires active rent terms';
  if(e.status==='ended'&&(!['settled','cancelled'].includes(a.status)||s.status!=='ended'))return 'Close rent agreement and schedule before ending lease';
 }else if(k==='home_condition'){
  const l=get('lease',e.lease_id);
  if(!l||l.actor!==e.actor||l.status!=='active'||old&&!same(old,e,['lease_id','area'])||duplicate(x=>x.lease_id===e.lease_id&&x.area===e.area))return 'Home observation needs own active lease and unique area';
 }else if(k==='budget'){
  if(!old&&e.status!=='active'||old&&old.currency!==e.currency||e.status!=='closed'&&duplicate(x=>x.actor===e.actor&&x.currency===e.currency&&x.status!=='closed'))return 'One active or paused budget per currency';
 }else if(k==='capacity_slot'){
  const service=get('venue_service',e.service_id);
  if(!service||service.actor!==e.actor||!old&&e.status!=='open'||old&&!same(old,e,['service_id','resource','starts_at','ends_at','capacity']))return 'Slot needs owned service and immutable capacity';
  if(duplicate(x=>x.actor===e.actor&&x.resource===e.resource&&time(x.starts_at)<time(e.ends_at)&&time(e.starts_at)<time(x.ends_at)))return 'Overlapping capacity slots for same resource';
 }else if(k==='reservation'){
  const slot=get('capacity_slot',e.slot_id),visit=get('service_visit',e.visit_id);
  if(!slot||!visit||visit.actor!==e.actor||visit.provider!==slot.actor||visit.service_id!==slot.service_id||old&&!same(old,e,['slot_id','visit_id','units'])||duplicate(x=>x.visit_id===e.visit_id))return 'Reservation must match own service visit';
  if(!old){
   if(e.status!=='reserved'||slot.status!=='open'||visit.status!=='accepted')return 'Reservation requires open slot and accepted service';
   let used=e.units;for(const x of records.values())if(x.life_kind==='reservation'&&x.slot_id===e.slot_id&&['reserved','used'].includes(x.status))used+=x.units;
   if(used>slot.capacity)return 'Capacity exhausted';
  }else if(e.status==='used'&&visit.status!=='completed'||e.status==='cancelled'&&visit.status!=='cancelled')return 'Close matching service visit before reservation';
 }else if(k==='enrollment'){
  const institution=records.get('dynamics:institution:'+e.institution_id);
  if(!institution||institution.place!==e.place||!old&&!['applied','enrolled'].includes(e.status)||old&&!same(old,e,['institution_id','title','place'])||!old&&institution.status!=='operating')return 'Enrollment requires recorded operating institution';
 }else if(k==='assessment'){
  const course=get('enrollment',e.enrollment_id);
  if(!course||course.actor!==e.actor||course.status!=='enrolled'||!old&&e.status!=='scheduled'||old&&!same(old,e,['enrollment_id','title'])||old&&e.status!=='scheduled'&&!same(old,e,['starts_at','ends_at']))return 'Assessment needs active enrollment and scheduled interval';
 }else if(k==='practice_record'){
  const skill=records.get('growth:skill:'+e.skill_id),origin=get(e.origin_kind,e.origin_id);
  if(old||!skill||skill.actor!==e.actor||!origin||origin.actor!==e.actor||!(e.origin_kind==='work_shift'?origin.status==='worked':['passed','failed'].includes(origin.status))||duplicate(x=>x.actor===e.actor&&x.skill_id===e.skill_id&&x.origin_kind===e.origin_kind&&x.origin_id===e.origin_id))return 'Practice must link one completed activity to own recorded skill';
 }else if(k==='reputation'){
  const group=records.get('social:group:'+e.group_id);
  if(old||!group)return 'Reputation requires a new observation of an existing group';
 }
 return null;
}
/** Flow summaries are computed only from accepted money events, not reconciliations.
 * BigInt avoids unsafe accumulated totals; serialize large amounts as exact strings. */
export function addBudgetFlow(flows,e,source){
 if(e.operation==='reconcile')return;
 const month=parseStoryDate(source.world_time)?.day.slice(0,7)??'unknown';
 const add=(actor,delta)=>{
  const key=JSON.stringify([actor,e.currency,month]),old=flows.get(key)||{actor,currency:e.currency,month,income:0n,expense:0n,count:0};
  if(delta>=0)old.income+=BigInt(delta);else old.expense-=BigInt(delta);
  old.count++;flows.set(key,old);
 };
 add(e.actor,e.delta);if(e.operation==='transfer')add(e.counterparty,-e.delta);
}
const safe=n=>n<=BigInt(Number.MAX_SAFE_INTEGER)?Number(n):String(n);
export function budgetFlowRows(flows){return [...flows.values()].map(x=>({...x,income:safe(x.income),expense:safe(x.expense)}));}
export function homeView(projection={},actor,clock=null){
 const rows=(projection.worldFacts||[]).filter(x=>x.player_life_version===1);
 const page=records=>({records:records.slice(0,40),total:records.length,omitted:Math.max(0,records.length-40)});
 const byKey=new Map((projection.worldFacts||[]).map(x=>[x.key,x]));
 const own=new Map(),allocations=new Map(),conditions=new Map();
 for(const x of rows){
  if(x.actor===actor){const list=own.get(x.life_kind)||[];list.push(x);own.set(x.life_kind,list);}
  if(x.life_kind==='reservation'&&['reserved','used'].includes(x.status))allocations.set(x.slot_id,(allocations.get(x.slot_id)||0)+x.units);
  if(x.life_kind==='home_condition'&&x.actor===actor){const list=conditions.get(x.lease_id)||[];list.push(x);conditions.set(x.lease_id,list);}
 }
 const pick=k=>own.get(k)||[];
 const month=parseStoryDate(clock)?.day.slice(0,7)??null;
 const housing=pick('lease').map(x=>{const s=byKey.get('dynamics:payment_schedule:'+x.schedule_id);return {id:x.record_id,title:x.title,place:x.place,landlord:x.landlord,status:x.status,rent:s?{amount:s.amount,currency:s.currency,every_days:s.every_days,starts_on:s.starts_on,ends_on:s.ends_on??null,status:s.status}:null,conditions:(conditions.get(x.record_id)||[]).map(c=>({area:c.area,status:c.status,description:c.description,source:c.source})),source:x.source};});
 const budgets=pick('budget').map(x=>{const flow=month?(projection.budget_flows||[]).find(f=>f.actor===actor&&f.currency===x.currency&&f.month===month):null;const balance=(projection.balances||[]).find(b=>b.actor===actor&&b.currency===x.currency);return {id:x.record_id,title:x.title,status:x.status,currency:x.currency,monthly_limit:x.monthly_limit,savings_target:x.savings_target,month,recorded_income:flow?.income??null,recorded_expense:flow?.expense??null,balance:balance?.known?balance.balance:null,over_recorded_limit:flow?BigInt(flow.expense)>BigInt(x.monthly_limit):null,source:x.source};});
 const reservations=pick('reservation').map(x=>{const slot=byKey.get('player-life:capacity_slot:'+x.slot_id),visit=byKey.get('player-life:service_visit:'+x.visit_id);return {id:x.record_id,title:visit?.title??null,place:visit?.place??null,status:x.status,units:x.units,starts_at:slot?.starts_at??null,ends_at:slot?.ends_at??null,source:x.source};});
 const capacity=pick('capacity_slot').map(x=>({id:x.record_id,resource:x.resource,status:x.status,capacity:x.capacity,starts_at:x.starts_at,ends_at:x.ends_at,allocated:allocations.get(x.record_id)||0,source:x.source}));
 const enrollment=pick('enrollment').map(x=>({id:x.record_id,title:x.title,place:x.place,status:x.status,source:x.source}));
 const assessments=pick('assessment').map(x=>({id:x.record_id,enrollment_id:x.enrollment_id,title:x.title,status:x.status,starts_at:x.starts_at,ends_at:x.ends_at,outcome:x.outcome??null,source:x.source}));
 const practice=pick('practice_record').map(x=>({id:x.record_id,skill_id:x.skill_id,origin_kind:x.origin_kind,origin_id:x.origin_id,description:x.description,source:x.source}));
 const reputation=pick('reputation').filter(x=>x.known_to_actor).map(x=>({id:x.record_id,group_id:x.group_id,group:byKey.get('social:group:'+x.group_id)?.name??null,observer:x.observer,status:x.status,description:x.description,source:x.source}));
 return {housing:page(housing),budgets:page(budgets),reservations:page(reservations),capacity:page(capacity),enrollment:page(enrollment),assessments:page(assessments),practice:page(practice),reputation:page(reputation),policy:'Recorded housing and personal plans, not ownership or actual escrow. Budget flows exclude reconciliation and include only accepted annotated transactions. Reservations require accepted services; no automatic attendance. Reputation is an observed opinion, not group consensus.'};
}
export const HOME_GUIDANCE='ЖИЛЬЁ, БЮДЖЕТ, БРОНИРОВАНИЕ, УЧЁБА: player_life_version=1, key=player-life:<life_kind>:<record_id>. lease: actor=арендатор,landlord,place,title,agreement_id (economic_agreement rent с actor/counterparty/place),schedule_id (payment_schedule rent, те же стороны/сумма/валюта),status=proposed/active/ended/cancelled. Завершение требует закрытого договора и расписания. home_condition: actor,lease_id,area,description,status=good/worn/damaged/unsafe/unknown. Ремонт требует действия, затрат через существующий реестр и при необходимости stock; не даёт собственность. budget: actor,title,currency,monthly_limit,savings_target,status=active/paused/closed; одна действующая запись на валюту, лимит и цель не являются отдельным счётом. capacity_slot: actor=поставщик,service_id,resource (стабильное имя ресурса),starts_at/ends_at,capacity,status=open/closed; непересекающиеся интервалы ресурса. reservation: actor=клиент,slot_id,visit_id (принятая service_visit того же поставщика/услуги),units,status=reserved/used/cancelled; вместимость не превышается, закрытие только после completed/cancelled заказа. Деньги через service_visit, не второй платёж. enrollment: actor,institution_id (dynamics:institution),title,place,status=applied/enrolled/completed/withdrawn/rejected. assessment: actor,enrollment_id,title,starts_at/ends_at,status=scheduled/passed/failed/cancelled,outcome для результата. practice_record: actor,skill_id (growth:skill),origin_kind=work_shift/assessment,origin_id,description,status=recorded; только завершённая работа/экзамен, один источник на навык, отдельно записывай реальное изменение growth:skill, не автоматически. reputation: actor,group_id (social:group),observer,description,status=positive/neutral/negative/mixed/unknown,known_to_actor; конкретное мнение, не глобальные очки. Каждое событие требует evidence. Меню home_systems показывает только собственные записи и известные впечатления. Не выполняй решения игрока за него.';
