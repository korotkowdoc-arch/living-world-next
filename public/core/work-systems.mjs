/** Work, stock-backed services and timetables. No real-time ticking. */
import {parseStoryDate} from './world-time.mjs';
import {stockLinesError} from './economy.mjs';
const valid=(v,n=140)=>typeof v==='string'&&v.trim()===v&&!!v&&v.length<=n;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
const money=v=>Number.isSafeInteger(v)&&v>=0;
const exact=v=>{const t=parseStoryDate(v);return t?.precision==='minute'?t.order:null;};
const same=(a,b,keys)=>keys.every(k=>a[k]===b[k]);
const equalLines=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>same(x,b[i],['product_id','unit','quantity']));
export const WORK_KINDS=['work_shift','wage','service_recipe','transit_notice'];
const shifts={scheduled:['scheduled','working','cancelled','missed'],working:['working','worked','cancelled'],worked:[],cancelled:[],missed:[]};
export function workRecordError(e){
 const k=e.life_kind;
 if(k==='work_shift'){
  if(!valid(e.actor)||!valid(e.employer)||e.actor===e.employer||!id(e.employment_id)||!valid(e.title,200)||!valid(e.place)||exact(e.starts_at)===null||exact(e.ends_at)===null||exact(e.ends_at)<=exact(e.starts_at)||!Object.hasOwn(shifts,e.status))return 'Invalid shift';
  if(e.status==='worked'){
   if(!Number.isSafeInteger(e.worked_minutes)||e.worked_minutes<1||e.worked_minutes>exact(e.ends_at)-exact(e.starts_at)||!valid(e.outcome,600))return 'Invalid worked shift';
  }else if(e.worked_minutes!=null||e.outcome!=null)return 'Shift has no completed work yet';
  if(e.pay_period!=null&&(!['hour','task','day','week','month'].includes(e.pay_period)||!money(e.rate)||!valid(e.currency,80)))return 'Invalid shift pay terms';
  if(e.pay_period==null&&(e.rate!=null||e.currency!=null))return 'Incomplete shift pay terms';
 }else if(k==='wage'){
  if(!valid(e.actor)||!valid(e.employer)||e.actor===e.employer||!id(e.shift_id)||e.status!=='paid'||!money(e.amount)||!valid(e.currency,80)||e.amount>0&&!valid(e.transfer_event_id,180)||e.amount===0&&e.transfer_event_id!=null)return 'Invalid wage receipt';
 }else if(k==='service_recipe'){
  if(!valid(e.actor)||!id(e.service_id)||!['active','retired'].includes(e.status)||stockLinesError(e.stock_lines,'consume'))return 'Invalid service recipe';
 }else if(k==='transit_notice'){
  if(!valid(e.actor)||!valid(e.provider)||!valid(e.title,200)||!valid(e.from)||!valid(e.to)||e.from===e.to||!['road','rail','air','water','magic','other'].includes(e.mode)||exact(e.departs_at)===null||exact(e.arrives_at)===null||exact(e.arrives_at)<=exact(e.departs_at)||!['scheduled','cancelled'].includes(e.status)||!money(e.amount)||!valid(e.currency,40))return 'Invalid observed transit notice';
 }
 return null;
}
export function shiftWage(shift){
 if(shift.status!=='worked'||!money(shift.rate))return null;
 if(shift.pay_period==='task')return shift.rate;
 if(shift.pay_period==='hour'){
  // Only exact ledger-unit amounts; no hidden rounding or invented currency units.
  const v=BigInt(shift.rate)*BigInt(shift.worked_minutes);
  if(v%60n!==0n||v/60n>BigInt(Number.MAX_SAFE_INTEGER))return null;
  return Number(v/60n);
 }
 return null;
}
export function workTransition(records,e){
 const old=records.get(e.key),k=e.life_kind;
 if(k==='work_shift'){
  const job=records.get('dynamics:employment:'+e.employment_id);
  if(!old){
   if(e.status!=='scheduled'||!job||job.status!=='active'||job.actor!==e.actor||job.counterparty!==e.employer||job.place&&job.place!==e.place||(job.pay_period??null)!==(e.pay_period??null)||(e.pay_period!=null&&(job.amount!==e.rate||job.currency!==e.currency)))return 'Shift requires active matching employment';
  }else{
   if(!same(old,e,['actor','employer','employment_id','pay_period','rate','currency'])||!shifts[old.status]?.includes(e.status))return 'Invalid shift transition';
   if(old.status!=='scheduled'&&!same(old,e,['starts_at','ends_at','place']))return 'Cannot rewrite a started shift';
   if(old.status==='scheduled'&&e.status==='working'&&(!job||job.status!=='active'))return 'Employment is not active';
  }
  if(e.status==='working'&&[...records.values()].some(x=>x.life_kind==='work_shift'&&x.actor===e.actor&&x.key!==e.key&&x.status==='working'))return 'Another shift is already in progress';
 }else if(k==='wage'){
  const shift=records.get('player-life:work_shift:'+e.shift_id);
  if(old||[...records.values()].some(x=>x.life_kind==='wage'&&x.shift_id===e.shift_id)||!shift||shift.actor!==e.actor||shift.employer!==e.employer||shift.currency!==e.currency||shiftWage(shift)!==e.amount)return 'Wage must settle one completed shift at exact agreed rate';
 }else if(k==='service_recipe'){
  const service=records.get('player-life:venue_service:'+e.service_id);
  if(!service||service.actor!==e.actor||!old&&(e.status!=='active'||[...records.values()].some(x=>x.life_kind==='service_recipe'&&x.service_id===e.service_id&&x.status==='active'))||old&&(!same(old,e,['actor','service_id'])||!equalLines(old.stock_lines,e.stock_lines)||old.status!=='active'||e.status!=='retired'))return 'Recipe must be immutable and belong to its service';
 }else if(k==='transit_notice'){
  if(old&&!same(old,e,['actor','provider','from','to','mode']))return 'Changed transit identity';
 }
 return null;
}
export function visitRecipeError(records,e){
 if(e.player_life_version!==1||e.life_kind!=='service_visit')return null;
 const old=records.get(e.key);
 if(old&&old.status==='accepted'&&(old.recipe_id??null)!==(e.recipe_id??null))return 'Cannot change recipe after acceptance';
 if(e.status==='accepted'&&old?.status!=='accepted'){
  const recipe=[...records.values()].find(x=>x.life_kind==='service_recipe'&&x.service_id===e.service_id&&x.status==='active');
  if((recipe?.record_id??null)!==(e.recipe_id??null))return 'Accepted service must pin its current stock recipe';
 }
 if(e.status==='completed'&&e.recipe_id!=null){
  const recipe=records.get('player-life:service_recipe:'+e.recipe_id);
  if(!recipe||recipe.service_id!==e.service_id||recipe.actor!==e.provider)return 'Missing accepted stock recipe';
 }
 return null;
}
export function workSceneError(e,events,i,usedPayments,usedStock){
 if(e.player_life_version!==1)return null;
 if(e.life_kind==='wage'&&e.amount>0){
  const ref=e.transfer_event_id,t=events.slice(0,i).find(x=>x?.id===ref);
  if(!t||t.type!=='money'||t.operation!=='transfer'||t.actor!==e.employer||t.counterparty!==e.actor||t.currency!==e.currency||t.delta!==-e.amount||usedPayments.has(ref))return 'Wage requires a separate preceding exact transfer';
  usedPayments.add(ref);
 }
 if(e.life_kind==='service_visit'){
  if(e.recipe_id!=null&&!id(e.recipe_id)||e.stock_event_id!=null&&!valid(e.stock_event_id,180))return 'Invalid recipe reference';
  if(e.status==='completed'&&e.recipe_id!=null){
   const ref=e.stock_event_id,t=events.slice(0,i).find(x=>x?.id===ref);
   if(!t||t.dynamics_version!==1||t.dynamics_kind!=='stock_operation'||t.stock_action!=='consume'||t.actor!==e.provider||usedStock.has(ref))return 'Stock-backed service needs its own preceding consumption';
   usedStock.add(ref);
  }else if(e.stock_event_id!=null)return 'Only completed stock-backed service consumes recipe';
 }
 return null;
}
export function workReplayError(records,e,acceptedStock,acceptedMoney){
 if(e.player_life_version!==1)return null;
 if(e.life_kind==='wage'&&e.amount>0&&!acceptedMoney.has(e.transfer_event_id))return 'Wage transfer was rejected';
 if(e.life_kind==='service_visit'&&e.status==='completed'&&e.recipe_id!=null){
  const recipe=records.get('player-life:service_recipe:'+e.recipe_id),stock=acceptedStock.get(e.stock_event_id);
  if(!recipe||!stock||!equalLines(recipe.stock_lines,stock.stock_lines))return 'Service consumption does not match accepted recipe';
 }
 return null;
}
export function workView(projection={},actor,clock=null){
 const rows=(projection.worldFacts||[]).filter(x=>x.player_life_version===1);
 const receipts=new Map(rows.filter(x=>x.life_kind==='wage').map(x=>[x.shift_id,x]));
 const page=records=>({records:records.slice(0,40),total:records.length,omitted:Math.max(0,records.length-40)});
 const shifts=rows.filter(x=>x.life_kind==='work_shift'&&(x.actor===actor||x.employer===actor)).map(x=>({id:x.record_id,title:x.title,actor:x.actor,employer:x.employer,place:x.place,starts_at:x.starts_at,ends_at:x.ends_at,status:x.status,worked_minutes:x.worked_minutes??null,earned:shiftWage(x),currency:x.currency??null,settlement:receipts.has(x.record_id)?'paid':shiftWage(x)!==null?'unpaid':'not_calculated',source:x.source}));
 const transit=rows.filter(x=>x.life_kind==='transit_notice'&&x.actor===actor).map(x=>({id:x.record_id,title:x.title,provider:x.provider,from:x.from,to:x.to,mode:x.mode,departs_at:x.departs_at,arrives_at:x.arrives_at,amount:x.amount,currency:x.currency,status:x.status,timing:exact(clock)===null?'unknown':exact(x.departs_at)<exact(clock)?'past':'upcoming',source:x.source}));
 const recipes=rows.filter(x=>x.life_kind==='service_recipe'&&x.actor===actor).map(x=>({id:x.record_id,service_id:x.service_id,status:x.status,stock_lines:x.stock_lines.map(l=>{const stock=(projection.stock||[]).find(s=>s.holder===actor&&s.product_id===l.product_id&&s.unit===l.unit);return {...l,available:stock?.known?stock.quantity:null,sufficient:stock?.known?stock.quantity>=-l.quantity:null};}),source:x.source}));
 return {shifts:page(shifts),transport:page(transit),recipes:page(recipes),policy:'Recorded shifts and known timetables only; no assumed attendance, automatic wages or hidden schedule changes.'};
}
export const WORK_GUIDANCE='РАБОТА И РЕСУРСЫ: записи player_life_version=1, key=player-life:<life_kind>:<record_id>. work_shift: actor=работник, employer, employment_id (существующая активная employment), title,place,starts_at/ends_at точные игровые минуты, pay_period/rate/currency из договора (или все отсутствуют), status=scheduled/working/worked/cancelled/missed; worked требует worked_minutes (в пределах смены), outcome,evidence. Зарплата wage: actor,employer,shift_id,status=paid,amount,currency,transfer_event_id на отдельный предшествующий перевод от работодателя работнику; бесплатно — без перевода. Только за реально завершённую смену, task=rate, hour=rate*worked_minutes/60 при точном целом результате; day/week/month — обычное payment_schedule, не дублировать. Не начисляй автоматически. service_recipe: actor=поставщик,service_id,status=active/retired,stock_lines отрицательные количества в существующих единицах склада; рецепт неизменяем, новый ID после снятия старого. При принятии service_visit закрепляй recipe_id активного рецепта, если он есть; completed требует stock_event_id на отдельный предшествующий stock_operation consume с точным составом, плюс обычная оплата. Не создавай запасы из воздуха. transit_notice: actor=узнавший герой, provider,title,from,to,mode,departs_at,arrives_at,amount,currency,status=scheduled/cancelled,evidence. Только реально узнанное расписание, не гарантия отправления, наличия билета и места. Для поездки используй journey и подтверждённые действия. Меню overview.work_systems показывает смены, оплату, известный транспорт и собственные рецепты/ресурсы.';
