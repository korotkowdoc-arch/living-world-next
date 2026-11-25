/** Recorded property title and sales, transport tickets, lessons and assignments.
 * No separate money system, automatic grades, or automatic travel. */
import {parseStoryDate} from './world-time.mjs';
const valid=(x,n=140)=>typeof x==='string'&&x.trim()===x&&!!x&&x.length<=n;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const money=x=>Number.isSafeInteger(x)&&x>=0;
const exact=x=>{const t=parseStoryDate(x);return t?.precision==='minute'?t.order:null};
const interval=e=>exact(e.starts_at)!==null&&exact(e.ends_at)!==null&&exact(e.starts_at)<exact(e.ends_at);
const same=(a,b,keys)=>keys.every(k=>a[k]===b[k]);
const states={estate:['owned'],estate_sale:['offered','accepted','settled','cancelled'],estate_condition:['good','worn','damaged','unsafe','unknown'],transport_ticket:['reserved','used','cancelled'],lesson:['scheduled','attended','missed','cancelled'],assignment:['assigned','submitted','graded','cancelled']};
const transitions={estate_sale:{offered:['accepted','cancelled'],accepted:['settled','cancelled']},transport_ticket:{reserved:['used','cancelled']},lesson:{scheduled:['scheduled','attended','missed','cancelled']},assignment:{assigned:['submitted','cancelled'],submitted:['graded','cancelled']}};
export const PROPERTY_KINDS=Object.keys(states);
export function propertyRecordError(e){
 if(!valid(e.actor)||!states[e.life_kind]?.includes(e.status))return 'Invalid property or education record';
 switch(e.life_kind){
 case 'estate':
  if(!valid(e.title,200)||!valid(e.place)||!['house','apartment','land','commercial','other'].includes(e.estate_kind))return 'Invalid estate title';break;
 case 'estate_sale':
  if(!id(e.estate_id)||!valid(e.buyer)||e.actor===e.buyer||!money(e.amount)||!valid(e.currency,80))return 'Invalid estate sale';
  if(e.status==='settled'&&(!valid(e.outcome,600)||e.amount>0&&!valid(e.transfer_event_id,180)||e.amount===0&&e.transfer_event_id!=null)||e.status!=='settled'&&e.transfer_event_id!=null)return 'Settlement requires exact payment and outcome';break;
 case 'estate_condition':
  if(!id(e.estate_id)||!valid(e.area)||!valid(e.description,600))return 'Invalid estate condition';break;
 case 'transport_ticket':
  if(!id(e.notice_id)||!id(e.reservation_id)||!id(e.visit_id)||!valid(e.title,200)||!valid(e.from)||!valid(e.to)||e.from===e.to||exact(e.departs_at)===null||exact(e.arrives_at)===null||exact(e.arrives_at)<=exact(e.departs_at))return 'Invalid transport ticket';break;
 case 'lesson':
  if(!id(e.enrollment_id)||!valid(e.teacher)||e.actor===e.teacher||!valid(e.title,200)||!valid(e.place)||!interval(e)||(['attended','missed'].includes(e.status)&&!valid(e.outcome,600)))return 'Invalid lesson';break;
 case 'assignment':
  if(!id(e.lesson_id)||!valid(e.title,200)||!parseStoryDate(e.due_at)||(['submitted','graded'].includes(e.status)&&!valid(e.submission,600))||e.status==='graded'&&(!valid(e.grade,80)||!valid(e.outcome,600)))return 'Invalid assignment';break;
 }
 return null;
}
export function propertyTransition(records,e){
 const k=e.life_kind,old=records.get(e.key),get=(kind,id)=>records.get('player-life:'+kind+':'+id);
 const other=fn=>[...records.values()].some(x=>x.life_kind===k&&x.key!==e.key&&fn(x));
 if(old&&old.actor!==e.actor&&k!=='estate_condition')return 'Changed record actor';
 if(old&&transitions[k]&&!transitions[k][old.status]?.includes(e.status))return 'Invalid property or education transition';
 if(k==='estate'){
  if(old)return 'Estate title cannot be rewritten directly; record a sale';
 }else if(k==='estate_sale'){
  const estate=get('estate',e.estate_id);
  if(!estate||estate.actor!==e.actor&&e.status!=='cancelled'||!old&&e.status!=='offered'||old&&!same(old,e,['estate_id','buyer','amount','currency']))return 'Sale requires current owner and immutable terms';
  if(e.status==='accepted'&&other(x=>x.estate_id===e.estate_id&&x.status==='accepted'))return 'Estate already under accepted sale';
 }else if(k==='estate_condition'){
  const estate=get('estate',e.estate_id);
  if(!estate||estate.actor!==e.actor||old&&!same(old,e,['estate_id','area'])||other(x=>x.estate_id===e.estate_id&&x.area===e.area))return 'Estate condition requires current owner and unique area';
 }else if(k==='transport_ticket'){
  const notice=get('transit_notice',e.notice_id),reservation=get('reservation',e.reservation_id),visit=get('service_visit',e.visit_id),slot=reservation&&get('capacity_slot',reservation.slot_id);
  const service=visit&&get('venue_service',visit.service_id);
  if(!notice||notice.actor!==e.actor||!reservation||reservation.actor!==e.actor||reservation.visit_id!==e.visit_id||!visit||visit.actor!==e.actor||visit.provider!==notice.provider||!service||service.category!=='transport'||!slot||slot.starts_at!==e.departs_at||slot.ends_at!==e.arrives_at||other(x=>x.reservation_id===e.reservation_id)||old&&!same(old,e,['notice_id','reservation_id','visit_id','title','from','to','departs_at','arrives_at']))return 'Ticket needs own matching transit, reservation and service';
  if(!old&&(e.status!=='reserved'||notice.status!=='scheduled'||!same(notice,e,['from','to','departs_at','arrives_at'])||reservation.status!=='reserved'||visit.status!=='accepted'||visit.amount!==notice.amount||visit.currency!==notice.currency))return 'Ticket must start from current observed reserved service';
  if(e.status==='used'&&(reservation.status!=='used'||visit.status!=='completed')||e.status==='cancelled'&&(reservation.status!=='cancelled'||visit.status!=='cancelled'))return 'Resolve service and reservation before ticket';
 }else if(k==='lesson'){
  const course=get('enrollment',e.enrollment_id);
  if(!course||course.actor!==e.actor||course.status!=='enrolled'||course.place!==e.place||!old&&e.status!=='scheduled'||old&&!same(old,e,['enrollment_id','teacher','title','place'])||old&&e.status!=='scheduled'&&!same(old,e,['starts_at','ends_at']))return 'Lesson needs active enrollment and fixed attendance';
 }else if(k==='assignment'){
  const lesson=get('lesson',e.lesson_id);
  if(!lesson||lesson.actor!==e.actor||lesson.status!=='attended'||!old&&e.status!=='assigned'||old&&!same(old,e,['lesson_id','title','due_at'])||old?.status==='submitted'&&old.submission!==e.submission)return 'Assignment requires attended lesson and fixed submission';
 }
 return null;
}
/** Sale settlement is the sole transfer of the existing title. Both projections
 * share this transition, and payment belongs to the same accepted scene. */
export function applyPropertySettlement(records,e,value){
 if(e.player_life_version!==1||e.life_kind!=='estate_sale'||e.status!=='settled')return;
 const k='player-life:estate:'+e.estate_id,estate=records.get(k);
 records.set(k,{...estate,actor:e.buyer,previous_owner:e.actor,last_sale_id:e.record_id,source:value.source});
 // Other still-open offers remain historical proposals, not transferable rights.
}
export function propertyPaymentError(e,events,i,used){
 if(e.player_life_version!==1||e.life_kind!=='estate_sale'||e.status!=='settled'||e.amount===0)return null;
 const t=events.slice(0,i).find(x=>x?.id===e.transfer_event_id);
 if(!t||t.type!=='money'||t.operation!=='transfer'||t.actor!==e.buyer||t.counterparty!==e.actor||t.currency!==e.currency||t.delta!==-e.amount||used.has(e.transfer_event_id))return 'Estate sale requires its own preceding exact payment';
 used.add(e.transfer_event_id);return null;
}
export function propertyView(projection={},actor){
 const rows=(projection.worldFacts||[]).filter(x=>x.player_life_version===1),byKey=new Map(rows.map(x=>[x.key,x])),get=(k,id)=>byKey.get('player-life:'+k+':'+id),page=records=>({records:records.slice(0,40),total:records.length,omitted:Math.max(0,records.length-40)});
 const pick=k=>rows.filter(x=>x.life_kind===k&&x.actor===actor);
 const conditions=new Map();for(const x of rows)if(x.life_kind==='estate_condition'){const list=conditions.get(x.estate_id)||[];list.push(x);conditions.set(x.estate_id,list);}
 const estates=pick('estate').map(x=>({id:x.record_id,title:x.title,place:x.place,kind:x.estate_kind,status:x.status,conditions:(conditions.get(x.record_id)||[]).map(c=>({area:c.area,status:c.status,description:c.description,source:c.source})),source:x.source}));
 const sales=rows.filter(x=>x.life_kind==='estate_sale'&&(x.actor===actor||x.buyer===actor)).map(x=>({id:x.record_id,estate_id:x.estate_id,seller:x.actor,buyer:x.buyer,title:get('estate',x.estate_id)?.title??null,amount:x.amount,currency:x.currency,status:['offered','accepted'].includes(x.status)&&get('estate',x.estate_id)?.actor!==x.actor?'obsolete':x.status,source:x.source}));
 const tickets=pick('transport_ticket').map(x=>({id:x.record_id,title:x.title,status:x.status,from:x.from,to:x.to,departs_at:x.departs_at,arrives_at:x.arrives_at,visit_id:x.visit_id,source:x.source}));
 const lessons=pick('lesson').map(x=>({id:x.record_id,title:x.title,teacher:x.teacher,place:x.place,starts_at:x.starts_at,ends_at:x.ends_at,status:x.status,outcome:x.outcome??null,source:x.source}));
 const assignments=pick('assignment').map(x=>({id:x.record_id,title:x.title,lesson_id:x.lesson_id,due_at:x.due_at,status:x.status,grade:x.grade??null,submission:x.submission??null,source:x.source}));
 return {estates:page(estates),sales:page(sales),tickets:page(tickets),lessons:page(lessons),assignments:page(assignments),policy:'Only own titles, targeted offers, reserved travel and attended study; no automatic cash, boarding, grades or attendance.'};
}
export const PROPERTY_GUIDANCE='СОБСТВЕННОСТЬ, БИЛЕТЫ И УРОКИ: estate (player_life_version=1, key=player-life:estate:<ID>, record_id, actor=установленный собственник,title,place,estate_kind=house/apartment/land/commercial/other,status=owned,evidence). Не переписывай owner: estate_sale с actor=продавец,buyer,estate_id,amount,currency,status=offered/accepted/settled/cancelled, при settled outcome и отдельный предшествующий transfer_event_id от покупателя продавцу (0 — без перевода). Settled передаёт право собственности только после подтверждённого расчёта. estate_condition: actor=текущий владелец,estate_id,area,status=good/worn/damaged/unsafe/unknown,description. Билет transport_ticket: actor,notice_id,reservation_id,visit_id,title,from,to,departs_at,arrives_at,status=reserved/used/cancelled; сначала известное расписание, совпадающая транспортная услуга и резерв места; условия билета фиксируются при выдаче и не меняются от последующего объявления расписания. Оплата пока через завершение service_visit, не отдельная предоплата; использован/отменён после соответствующих записей услуги и резерва. lesson: actor=ученик,enrollment_id,teacher,title,place,starts_at/ends_at,status=scheduled/attended/missed/cancelled, outcome для посещения/пропуска. assignment: actor,lesson_id,title,due_at,status=assigned/submitted/graded/cancelled, submission при сдаче, grade/outcome при оценке. Не выдумывай оценки, посещение или оплату. Все записи требуют evidence.';
