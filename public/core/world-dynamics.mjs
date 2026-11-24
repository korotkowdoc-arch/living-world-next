/** Branch-local social structures, institutional processes, competing claims
 * and scheduled changes. No automatic side effects, no real-time ticking. */
import {parseStoryDate} from './world-time.mjs';
const valid=(v,n=140)=>typeof v==='string'&&!!v.trim()&&v.length<=n;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
const text=v=>typeof v==='string'?v.trim():'';
const list=(v,min=1,max=12)=>Array.isArray(v)&&v.length>=min&&v.length<=max&&v.every(x=>valid(x))&&new Set(v).size===v.length;
const kinds={
 bond:['active','strained','estranged','ended','unknown'],
 institution:['operating','restricted','suspended','closed','unknown'],
 contest:['open','negotiating','decided','abandoned','unknown'],
 life_transition:['planned','ongoing','completed','cancelled','unknown'],
 family_duty:['active','paused','ended','unknown'],
 family_event:['planned','ongoing','completed','cancelled','unknown'],
 development:['scheduled','ongoing','completed','cancelled','unknown']
};
const terminal={life_transition:new Set(['completed','cancelled']),family_duty:new Set(['ended']),family_event:new Set(['completed','cancelled']),bond:new Set(['ended']),contest:new Set(['decided','abandoned']),development:new Set(['completed','cancelled'])};
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
  if(k==='life_transition'&&(old.actor!==e.actor||old.transition_kind!==e.transition_kind))return 'Новый герой или вид жизненного перехода требует нового ID.';
  if(k==='family_duty'&&(old.family_kind!==e.family_kind||old.starts_on!==e.starts_on||old.every_days!==e.every_days||JSON.stringify(old.actors.slice().sort())!==JSON.stringify(e.actors.slice().sort())))return 'Изменение участников или периодичности требует новой обязанности.';
  if(k==='family_event'&&(old.family_kind!==e.family_kind||(old.duty_id??null)!==(e.duty_id??null)||(old.scheduled_on??null)!==(e.scheduled_on??null)))return 'Нельзя менять вид семейного события.';
  if(k==='contest'&&old.resource!==e.resource)return 'Новый ресурс требует новой записи конкуренции.';
  if(terminal[k]?.has(old.status)&&old.status!==e.status)return 'Новая попытка требует нового ID.';
 }
 if(k==='family_event'&&e.duty_id!=null){
  const duty=records.get('dynamics:family_duty:'+e.duty_id),day=parseStoryDate(e.scheduled_on),start=parseStoryDate(duty?.starts_on);
  if(!duty||!day||!start||duty.family_kind!==e.family_kind||JSON.stringify(duty.actors.slice().sort())!==JSON.stringify(e.actors.slice().sort())||
    day.order<start.order||duty.ends_on&&e.scheduled_on>duty.ends_on||(day.order-start.order)%(1440*duty.every_days)!==0)return 'Дата или участники не соответствуют расписанию обязанности.';
  for(const x of records.values())if(x.key!==e.key&&x.dynamics_kind==='family_event'&&x.duty_id===e.duty_id&&x.scheduled_on===e.scheduled_on)return 'На эту дату уже есть запись исполнения обязанности.';
 }
 if(k==='institution'&&!records.has('social:group:'+e.group_id))return 'Сначала нужна запись организации.';
 return null;
}
export function dynamicsView(projection={},opts={}){
 const actor=text(opts.actor),place=text(opts.place);
 if(actor.length>140||place.length>140)throw Error('Слишком длинный фильтр.');
 const limit=Math.max(1,Math.min(40,Math.floor(Number(opts.limit)||20))),offset=Math.max(0,Math.floor(Number(opts.offset)||0));
 const rows=(projection.worldFacts||[]).filter(r=>r.dynamics_version===1&&!dynamicsRecordError(r)&&(!actor||r.actor===actor||r.counterparty===actor||r.actors?.includes(actor))&&(!place||r.place===place));
 const byKind=Object.fromEntries(Object.keys(kinds).map(k=>[k,rows.filter(x=>x.dynamics_kind===k)]));
 const compact=r=>({id:r.record_id,key:r.key,kind:r.dynamics_kind,transition_kind:r.transition_kind,family_kind:r.family_kind,duty_id:r.duty_id,scheduled_on:r.scheduled_on,starts_on:r.starts_on,ends_on:r.ends_on,every_days:r.every_days,status:r.status,actor:r.actor,counterparty:r.counterparty,bond_type:r.bond_type,actors:r.actors,name:r.name,title:r.title,resource:r.resource,group_id:r.group_id,place:r.place,function:r.function,description:r.description,due_at:r.due_at,terms:r.terms,obstacle:r.obstacle,next_step:r.next_step,outcome:r.outcome,source:r.source,evidence:String(r.evidence||'').slice(0,600)});
 const page=k=>byKind[k].slice().reverse().slice(offset,offset+limit).map(compact);
 return {bonds:page('bond'),institutions:page('institution'),contests:page('contest'),developments:page('development'),family_events:page('family_event'),family_duties:page('family_duty'),life_transitions:page('life_transition'),
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
