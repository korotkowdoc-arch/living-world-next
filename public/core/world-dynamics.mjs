/** Branch-local social structures, institutional processes, competing claims
 * and scheduled changes. No automatic side effects, no real-time ticking. */
import {stockOperationError,stockLinesError} from './economy.mjs';
import {parseStoryDate} from './world-time.mjs';
const valid=(v,n=140)=>typeof v==='string'&&!!v.trim()&&v.length<=n;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
const exactDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&parseStoryDate(v)?.precision==='day';
const text=v=>typeof v==='string'?v.trim():'';
const list=(v,min=1,max=12)=>Array.isArray(v)&&v.length>=min&&v.length<=max&&v.every(x=>valid(x))&&new Set(v).size===v.length;
const kinds={
 bond:['active','strained','estranged','ended','unknown'],
 institution:['operating','restricted','suspended','closed','unknown'],
 contest:['open','negotiating','decided','abandoned','unknown'],
 enterprise:['planned','operating','suspended','closed'],
 production_order:['planned','ongoing','completed','cancelled'],
 stock_operation:['recorded'],
 payment_schedule:['active','paused','ended'],
 payment_occurrence:['paid','waived'],
 employment:['offered','active','suspended','ended','declined','unknown'],
 market_offer:['available','reserved','withdrawn','sold','unknown'],
 economic_agreement:['proposed','active','disputed','settled','cancelled','unknown'],
 life_transition:['planned','ongoing','completed','cancelled','unknown'],
 family_duty:['active','paused','ended','unknown'],
 family_event:['planned','ongoing','completed','cancelled','unknown'],
 development:['scheduled','ongoing','completed','cancelled','unknown']
};
const terminal={enterprise:new Set(['closed']),production_order:new Set(['completed','cancelled']),payment_schedule:new Set(['ended']),employment:new Set(['ended','declined']),market_offer:new Set(['withdrawn','sold']),economic_agreement:new Set(['settled','cancelled']),life_transition:new Set(['completed','cancelled']),family_duty:new Set(['ended']),family_event:new Set(['completed','cancelled']),bond:new Set(['ended']),contest:new Set(['decided','abandoned']),development:new Set(['completed','cancelled'])};
const bondTypes=['family','friendship','professional','mentorship','rivalry','community','romantic','marriage','parenthood','cohabitation','other'];
export function dynamicsRecordError(e){
 if(e?.type!=='world')return null;
 if(e.dynamics_version===undefined)return text(e.key).startsWith('dynamics:')?'Ключ динамики требует версию записи.':null;
 const k=e.dynamics_kind;
 if(e.dynamics_version!==1||!Object.hasOwn(kinds,k)||!id(e.record_id)||e.key!=='dynamics:'+k+':'+e.record_id||!kinds[k].includes(e.status)||!valid(e.description,600))return 'Неверная запись динамики мира.';
 if(k==='bond'&&(!valid(e.actor)||!valid(e.counterparty)||e.actor===e.counterparty||!bondTypes.includes(e.bond_type)))return 'Связи нужны два разных участника и тип.';
 if(k==='bond'&&e.bond_type==='parenthood'&&e.actor===e.counterparty)return 'Родитель и ребёнок должны различаться.';
 if(k==='institution'&&(!valid(e.name)||!valid(e.function,300)||!valid(e.place)||!id(e.group_id)))return 'Учреждению нужны название, назначение, место и ID группы.';
 if(k==='contest'&&(!valid(e.resource,300)||!list(e.actors,2)||!valid(e.title)))return 'Конкуренции нужны ресурс, название и минимум два участника.';
 if(k==='stock_operation')return stockOperationError(e);
 if(k==='enterprise'&&(!valid(e.actor)||!valid(e.title)||!valid(e.place)||!id(e.group_id)||!valid(e.business_kind,140)))return 'Предприятию нужны держатель запасов, организация, место и вид деятельности.';
 if(k==='production_order'){
  if(!valid(e.actor)||!valid(e.title)||!id(e.enterprise_id))return 'Заказу нужны держатель и предприятие.';
  const error=stockLinesError(e.stock_lines,'produce');if(error)return error;
  if(e.status==='completed'&&(!id(e.stock_record_id)||!valid(e.outcome,600))||e.status!=='completed'&&e.stock_record_id!=null)return 'Завершение заказа требует выполненную производственную операцию и результат.';
 }
 if(['payment_schedule','payment_occurrence'].includes(k)){
  if(!valid(e.actor)||!valid(e.counterparty)||e.actor===e.counterparty||!valid(e.title)||!Number.isSafeInteger(e.amount)||e.amount<=0||!valid(e.currency,80))return 'Нужны плательщик, получатель, название и точная положительная сумма.';
  if(k==='payment_schedule'&&(!['wage','rent','debt','service','other'].includes(e.payment_kind)||!exactDay(e.starts_on)||!Number.isInteger(e.every_days)||e.every_days<1||e.every_days>366||e.ends_on!=null&&(!exactDay(e.ends_on)||e.ends_on<e.starts_on)))return 'Неверное расписание оплаты.';
  if(k==='payment_occurrence'&&(!id(e.schedule_id)||!exactDay(e.scheduled_on)||!valid(e.outcome,600)||(e.status==='paid'?!valid(e.transfer_event_id,180):e.transfer_event_id!=null)))return 'Нужны дата, расписание, исход и ссылка на перевод только для оплаты.';
 }
 if(['employment','market_offer','economic_agreement'].includes(k)){
  if(!valid(e.actor)||!valid(e.title))return 'Экономической записи нужны участник и название.';
  if(k!=='market_offer'&&(!valid(e.counterparty)||e.counterparty===e.actor))return 'Нужна другая сторона соглашения.';
  if(k==='market_offer'&&e.counterparty!=null&&(!valid(e.counterparty)||e.actor===e.counterparty))return 'Некорректный покупатель.';
  if((e.amount!=null||e.currency!=null)&&(!Number.isSafeInteger(e.amount)||e.amount<0||!valid(e.currency,80)))return 'Сумма должна быть точной неотрицательной, с валютой.';
  if(k==='economic_agreement'&&(!Number.isSafeInteger(e.amount)||e.amount<=0||!['debt','rent','service','other'].includes(e.agreement_kind)))return 'Соглашению нужны положительная сумма и вид.';
  if(k==='employment'&&e.pay_period!=null&&(!['hour','day','week','month','task'].includes(e.pay_period)||e.amount==null))return 'Период оплаты требует установленную сумму.';
  if(k==='market_offer'&&(!['goods','service'].includes(e.offer_kind)||e.item_id!=null&&(e.offer_kind!=='goods'||!valid(e.item_id,180))))return 'Предложению нужен вид товара или услуги.';
  if(k==='market_offer'&&e.status==='reserved'&&!valid(e.counterparty))return 'Резерв требует конкретного покупателя.';
  if(e.group_id!=null&&!id(e.group_id)||e.place!=null&&!valid(e.place))return 'Некорректная организация или место.';
  if((k==='economic_agreement'&&e.status==='settled'||k==='market_offer'&&e.status==='sold')&&!valid(e.outcome,600))return 'Закрытие требует явно описанного результата.';
 }
 if(k==='life_transition'&&(!valid(e.actor)||!valid(e.title)||!['education','employment','relocation','retirement','health','other'].includes(e.transition_kind)))return 'Жизненному переходу нужны герой, название и вид.';
 if(k==='family_duty'&&(!valid(e.title)||!list(e.actors,1)||!['care','education','household','other'].includes(e.family_kind)||!/^\d{4}-\d{2}-\d{2}$/.test(e.starts_on)||parseStoryDate(e.starts_on)?.precision!=='day'||!Number.isInteger(e.every_days)||e.every_days<1||e.every_days>366))return 'Обязанности нужны участники, вид, дата начала и период 1–366 дней.';
 if(k==='family_duty'&&e.ends_on!=null&&(!/^\d{4}-\d{2}-\d{2}$/.test(e.ends_on)||parseStoryDate(e.ends_on)?.precision!=='day'||e.ends_on<e.starts_on))return 'Дата окончания обязанности раньше начала или некорректна.';
 if(k==='family_event'&&(!valid(e.title)||!list(e.actors,1)||!['birth','care','education','birthday','household','other'].includes(e.family_kind)))return 'Семейному событию нужны название, участники и вид.';
 if(k==='family_event'&&(e.duty_id!=null||e.scheduled_on!=null)&&(!id(e.duty_id)||typeof e.scheduled_on!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.scheduled_on)||parseStoryDate(e.scheduled_on)?.precision!=='day'))return 'Экземпляр обязанности требует ID расписания и точной даты.';
 if(k==='development'&&(!valid(e.title)||!valid(e.place)||!list(e.actors,0)))return 'Изменению мира нужны название, место и список участников (может быть пустым).';
 if(e.due_at!=null&&!parseStoryDate(e.due_at))return 'Срок изменения должен быть точной игровой датой.';
 for(const field of ['outcome','obstacle','next_step','terms'])if(e[field]!=null&&!valid(e[field],600))return 'Неверное поле: '+field;
 if((k==='contest'&&e.status==='decided'||['development','family_event','life_transition'].includes(k)&&e.status==='completed')&&!valid(e.outcome,600))return 'Завершённой записи требуется результат.';
 return null;
}
export function dynamicsTransitionError(records,e){
 if(e.dynamics_version!==1)return null;
 const old=records.get(e.key),k=e.dynamics_kind;
 if(old){
  if(old.dynamics_version!==1||old.dynamics_kind!==k||old.record_id!==e.record_id)return 'Нельзя менять идентичность записи динамики.';
  if(k==='bond'&&(old.actor!==e.actor||old.counterparty!==e.counterparty||old.bond_type!==e.bond_type))return 'Нельзя переносить связь на других участников.';
  if(k==='institution'&&old.group_id!==e.group_id)return 'Нельзя переносить учреждение на другую группу.';
  if(k==='stock_operation'||k==='production_order'&&terminal[k].has(old.status))return 'Выполненная операция или закрытый заказ неизменяемы.';
  if(k==='enterprise'&&(old.actor!==e.actor||old.group_id!==e.group_id))return 'Новый держатель или организация требует нового предприятия.';
  if(k==='production_order'&&(old.actor!==e.actor||old.enterprise_id!==e.enterprise_id||JSON.stringify(old.stock_lines)!==JSON.stringify(e.stock_lines)))return 'Изменение состава заказа требует нового ID.';
  if(k==='payment_occurrence')return 'Закрытая дата оплаты не может быть записана повторно.';
  if(k==='payment_schedule'&&['actor','counterparty','amount','currency','payment_kind','starts_on','every_days'].some(field=>old[field]!==e[field]))return 'Изменение условий оплаты требует нового расписания.';
  if(['employment','market_offer','economic_agreement'].includes(k)&&(old.actor!==e.actor||(old.group_id??null)!==(e.group_id??null)
    ||(k!=='market_offer'&&old.counterparty!==e.counterparty)
    ||(k==='market_offer'&&(old.offer_kind!==e.offer_kind||(old.item_id??null)!==(e.item_id??null)))
    ||(k==='economic_agreement'&&(old.agreement_kind!==e.agreement_kind||old.amount!==e.amount||old.currency!==e.currency))))return 'Новая сторона, предмет или сумма соглашения требуют нового ID.';
  if(k==='market_offer'&&old.status==='reserved'&&e.status==='sold'&&old.counterparty!==e.counterparty)return 'Продажа другому покупателю требует снятия резерва.';
  if(k==='life_transition'&&(old.actor!==e.actor||old.transition_kind!==e.transition_kind))return 'Новый герой или вид жизненного перехода требует нового ID.';
  if(k==='family_duty'&&(old.family_kind!==e.family_kind||old.starts_on!==e.starts_on||old.every_days!==e.every_days||JSON.stringify(old.actors.slice().sort())!==JSON.stringify(e.actors.slice().sort())))return 'Изменение участников или периодичности требует новой обязанности.';
  if(k==='family_event'&&(old.family_kind!==e.family_kind||(old.duty_id??null)!==(e.duty_id??null)||(old.scheduled_on??null)!==(e.scheduled_on??null)))return 'Нельзя менять вид семейного события.';
  if(k==='contest'&&old.resource!==e.resource)return 'Новый ресурс требует новой записи конкуренции.';
  if(terminal[k]?.has(old.status)&&old.status!==e.status)return 'Новая попытка требует нового ID.';
 }
 if(k==='enterprise'&&!records.has('social:group:'+e.group_id))return 'Сначала нужна организация предприятия.';
 if(k==='production_order'){
  const enterprise=records.get('dynamics:enterprise:'+e.enterprise_id);
  if(!enterprise||enterprise.actor!==e.actor)return 'Заказ не связан с действительным предприятием и держателем.';
  if(e.status==='completed'){
   const op=records.get('dynamics:stock_operation:'+e.stock_record_id);
   if(enterprise.status!=='operating'||op?.stock_action!=='produce'||op.actor!==e.actor||JSON.stringify(op.stock_lines)!==JSON.stringify(e.stock_lines))return 'Для завершения нужны работающее предприятие и совпадающая производственная операция.';
   for(const x of records.values())if(x.dynamics_kind==='production_order'&&x.stock_record_id===e.stock_record_id)return 'Операция уже использована для другого заказа.';
  }
 }
 if(k==='payment_occurrence'){
  const schedule=records.get('dynamics:payment_schedule:'+e.schedule_id);
  if(!schedule||['actor','counterparty','amount','currency'].some(field=>schedule[field]!==e[field])||e.scheduled_on<schedule.starts_on||schedule.ends_on&&e.scheduled_on>schedule.ends_on||
    (parseStoryDate(e.scheduled_on).order-parseStoryDate(schedule.starts_on).order)%(1440*schedule.every_days)!==0)return 'Оплата не соответствует условиям или календарю.';
  for(const x of records.values())if(x.dynamics_kind==='payment_occurrence'&&x.schedule_id===e.schedule_id&&x.scheduled_on===e.scheduled_on)return 'Дата оплаты уже закрыта.';
 }
 if(k==='family_event'&&e.duty_id!=null){
  const duty=records.get('dynamics:family_duty:'+e.duty_id),day=parseStoryDate(e.scheduled_on),start=parseStoryDate(duty?.starts_on);
  if(!duty||!day||!start||duty.family_kind!==e.family_kind||JSON.stringify(duty.actors.slice().sort())!==JSON.stringify(e.actors.slice().sort())||
    day.order<start.order||duty.ends_on&&e.scheduled_on>duty.ends_on||(day.order-start.order)%(1440*duty.every_days)!==0)return 'Дата или участники не соответствуют расписанию обязанности.';
  for(const x of records.values())if(x.key!==e.key&&x.dynamics_kind==='family_event'&&x.duty_id===e.duty_id&&x.scheduled_on===e.scheduled_on)return 'На эту дату уже есть запись исполнения обязанности.';
 }
 if(['employment','market_offer','economic_agreement'].includes(k)&&e.group_id!=null&&!records.has('social:group:'+e.group_id))return 'Сначала нужна запись организации.';
 if(k==='institution'&&!records.has('social:group:'+e.group_id))return 'Сначала нужна запись организации.';
 return null;
}
export function dynamicsView(projection={},opts={}){
 const actor=text(opts.actor),place=text(opts.place);
 if(actor.length>140||place.length>140)throw Error('Слишком длинный фильтр.');
 const limit=Math.max(1,Math.min(40,Math.floor(Number(opts.limit)||20))),offset=Math.max(0,Math.floor(Number(opts.offset)||0));
 const rows=(projection.worldFacts||[]).filter(r=>r.dynamics_version===1&&!dynamicsRecordError(r)&&(!actor||r.actor===actor||r.counterparty===actor||r.actors?.includes(actor))&&(!place||r.place===place));
 const byKind=Object.fromEntries(Object.keys(kinds).map(k=>[k,rows.filter(x=>x.dynamics_kind===k)]));
 const compact=r=>({id:r.record_id,key:r.key,kind:r.dynamics_kind,business_kind:r.business_kind,enterprise_id:r.enterprise_id,stock_action:r.stock_action,stock_lines:r.stock_lines,stock_record_id:r.stock_record_id,payment_kind:r.payment_kind,schedule_id:r.schedule_id,transfer_event_id:r.transfer_event_id,offer_kind:r.offer_kind,agreement_kind:r.agreement_kind,amount:r.amount,currency:r.currency,pay_period:r.pay_period,item_id:r.item_id,transition_kind:r.transition_kind,family_kind:r.family_kind,duty_id:r.duty_id,scheduled_on:r.scheduled_on,starts_on:r.starts_on,ends_on:r.ends_on,every_days:r.every_days,status:r.status,actor:r.actor,counterparty:r.counterparty,bond_type:r.bond_type,actors:r.actors,name:r.name,title:r.title,resource:r.resource,group_id:r.group_id,place:r.place,function:r.function,description:r.description,due_at:r.due_at,terms:r.terms,obstacle:r.obstacle,next_step:r.next_step,outcome:r.outcome,source:r.source,evidence:String(r.evidence||'').slice(0,600)});
 const page=k=>byKind[k].slice().reverse().slice(offset,offset+limit).map(compact);
 return {bonds:page('bond'),institutions:page('institution'),contests:page('contest'),developments:page('development'),family_events:page('family_event'),family_duties:page('family_duty'),life_transitions:page('life_transition'),employment:page('employment'),market_offers:page('market_offer'),economic_agreements:page('economic_agreement'),payment_schedules:page('payment_schedule'),payment_occurrences:page('payment_occurrence'),enterprises:page('enterprise'),production_orders:page('production_order'),stock_operations:page('stock_operation'),
 counts:Object.fromEntries(Object.entries(byKind).map(([k,v])=>[k,v.length])),next_offset:Math.max(...Object.values(byKind).map(x=>x.length))>offset+limit?offset+limit:null,memory_complete:opts.complete!==false,
 policy:'A social bond is not an emotion, consent or knowledge. Institutions are not individual characters. Contests do not transfer resources automatically. Scheduled developments are not completed events.'};
}

/** Scheduled dates in (from, to], or target day alone if no reliable from. No synthetic outcomes. */
export function familyDutyWindow(record,from,to,occurrences=[]){
 if(record?.dynamics_kind!=='family_duty'||record.status!=='active'||dynamicsRecordError(record)||!to)return null;
 const start=Math.floor(parseStoryDate(record.starts_on).order/1440),end=record.ends_on?Math.floor(parseStoryDate(record.ends_on).order/1440):Infinity;
 const target=Math.floor(to.order/1440),prior=from?Math.floor(from.order/1440):target-1;
 const lo=Math.max(start,prior===target?target:prior+1),hi=Math.min(target,end),step=record.every_days;
 const first=Math.max(0,Math.ceil((lo-start)/step)),last=Math.floor((hi-start)/step);
 if(last<first)return null;
 const day=i=>new Date((start+i*step)*86400000).toISOString().slice(0,10);
 const resolved=new Map();
 for(const e of occurrences)if(e.duty_id===record.record_id&&['completed','cancelled'].includes(e.status)&&typeof e.scheduled_on==='string'){
  const date=parseStoryDate(e.scheduled_on);if(!date)continue;
  const idx=(Math.floor(date.order/1440)-start)/step;
  if(Number.isInteger(idx)&&idx>=first&&idx<=last)resolved.set(idx,e.status);
 }
 let firstPending=first,lastPending=last;
 while(firstPending<=last&&resolved.has(firstPending))firstPending++;
 while(lastPending>=first&&resolved.has(lastPending))lastPending--;
 const pending=last-first+1-resolved.size;
 if(!pending)return null;
 return {occurrences:last-first+1,pending_occurrences:pending,recorded_completed:[...resolved.values()].filter(x=>x==='completed').length,recorded_cancelled:[...resolved.values()].filter(x=>x==='cancelled').length,first_due_on:day(firstPending),last_due_on:day(lastPending),window:prior===target||!from?'target_day_only':'elapsed_calendar_days'};
}

/** Outstanding calendar slots, not established arrears. Pauses/waivers need explicit
 * history; no accrued balance or synthetic money. Full backlog remains visible. */
export function paymentScheduleWindow(schedule,to,occurrences=[]){
 if(schedule?.dynamics_kind!=='payment_schedule'||schedule.status!=='active'||dynamicsRecordError(schedule)||!to)return null;
 const start=Math.floor(parseStoryDate(schedule.starts_on).order/1440),target=Math.floor(to.order/1440);
 const end=schedule.ends_on?Math.floor(parseStoryDate(schedule.ends_on).order/1440):target;
 const step=schedule.every_days,last=Math.floor((Math.min(target,end)-start)/step);
 if(last<0)return null;
 const closed=new Set();
 for(const e of occurrences)if(e.schedule_id===schedule.record_id&&['paid','waived'].includes(e.status)){
  const date=parseStoryDate(e.scheduled_on);if(!date)continue;
  const idx=(Math.floor(date.order/1440)-start)/step;if(Number.isInteger(idx)&&idx>=0&&idx<=last)closed.add(idx);
 }
 const pending=last+1-closed.size;if(!pending)return null;
 let first=0,final=last;while(closed.has(first))first++;while(closed.has(final))final--;
 const day=i=>new Date((start+i*step)*86400000).toISOString().slice(0,10);
 return {occurrences:last+1,pending_occurrences:pending,first_due_on:day(first),last_due_on:day(final),window:'unreviewed_schedule_dates_not_debt'};
}
