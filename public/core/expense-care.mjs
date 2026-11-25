/** Actual household expenses, explicit member shares, and care plans.
 * Money is moved only by existing ledger events; no implicit joint account. */
import {parseStoryDate} from './world-time.mjs';
import {householdAccessible} from './households-careers.mjs';
const valid=(x,n=140)=>typeof x==='string'&&x.trim()===x&&!!x&&x.length<=n;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const get=(r,k,i)=>r.get('player-life:'+k+':'+i);
const same=(a,b,ks)=>ks.every(k=>(a[k]??null)===(b[k]??null));
const money=x=>Number.isSafeInteger(x)&&x>0;
const deadline=x=>typeof x==='string'&&x===x.trim()&&!!parseStoryDate(x);
const activeShare=x=>['proposed','accepted','paid'].includes(x.status);
const joined=(r,h,actor)=>!!h&&[...r.values()].some(x=>x.life_kind==='household_member'&&x.household_id===h.record_id&&x.actor===actor&&x.status==='joined');
export const EXPENSE_CARE_KINDS=['household_expense','expense_share','care_plan'];
export function expenseCareError(e){
 if(!valid(e.actor)||!valid(e.title,200))return 'Invalid expense or care actor/title';
 switch(e.life_kind){
 case 'household_expense':
  if(!id(e.household_id)||!valid(e.provider)||e.actor===e.provider||!money(e.amount)||!valid(e.currency,80)||!['food','utilities','housing','furnishing','care','education','leisure','other'].includes(e.category)||e.status!=='recorded'||!['direct','service'].includes(e.source_kind))return 'Invalid household expense';
  if(e.source_kind==='direct'?(!valid(e.transfer_event_id,180)||e.visit_id!=null):(!id(e.visit_id)||e.transfer_event_id!=null))return 'Expense needs exact direct payment or own completed service';break;
 case 'expense_share':
  if(!id(e.expense_id)||!id(e.household_id)||!valid(e.host)||e.actor===e.host||!money(e.amount)||!valid(e.currency,80)||!deadline(e.due_at)||!['proposed','accepted','declined','paid','cancelled'].includes(e.status))return 'Invalid expense share';
  if(e.status==='paid'?!id(e.contribution_id):e.contribution_id!=null)return 'Paid share needs contribution';break;
 case 'care_plan':
  if(!id(e.episode_id)||e.supporter!=null&&(!valid(e.supporter)||e.supporter===e.actor)||!deadline(e.due_at)||!['rest','nutrition','activity','consultation','support','other'].includes(e.action_kind)||!valid(e.description,600)||!['proposed','accepted','completed','cancelled'].includes(e.status))return 'Invalid care plan';
  if(e.status==='completed'){
   if(!['activity','care_record'].includes(e.completion_kind)||!id(e.completion_id)||e.completion_kind==='care_record'&&(e.action_kind!=='consultation'||e.supporter!=null)||e.action_kind==='consultation'&&e.completion_kind!=='care_record')return 'Care plan needs matching actual activity or medical service';
  }else if(e.completion_kind!=null||e.completion_id!=null)return 'Uncompleted care plan cannot claim outcome evidence';break;
 }
 if(e.life_kind!=='household_expense'&&e.status!=='proposed'&&!valid(e.outcome,600))return 'Explicit response or outcome required';
 return null;
}
export function expenseCareTransition(r,e){
 const old=r.get(e.key),k=e.life_kind,rows=[...r.values()],others=fn=>rows.some(x=>x.life_kind===k&&x.key!==e.key&&fn(x));
 if(old&&old.actor!==e.actor)return 'Changed actor';
 if(k==='household_expense'){
  const h=get(r,'household',e.household_id);
  if(old||!h||h.actor!==e.actor||!householdAccessible(r,h))return 'Expense requires current household host';
  if(e.source_kind==='service'){
   const v=get(r,'service_visit',e.visit_id);
   if(!v||v.actor!==e.actor||v.provider!==e.provider||v.status!=='completed'||v.amount!==e.amount||v.currency!==e.currency||others(x=>x.visit_id===e.visit_id))return 'Expense must link one actual completed service, once';
  }
 }else if(k==='expense_share'){
  const expense=get(r,'household_expense',e.expense_id),h=get(r,'household',e.household_id);
  if(!expense||!h||expense.actor!==e.host||h.actor!==e.host||expense.household_id!==e.household_id||expense.currency!==e.currency)return 'Share must match household expense';
  if(!old){
   if(e.status!=='proposed'||!householdAccessible(r,h)||!joined(r,h,e.actor)||others(x=>x.expense_id===e.expense_id&&x.actor===e.actor&&activeShare(x)))return 'Share requires joined member and unique active proposal';
   const allocated=rows.filter(x=>x.life_kind==='expense_share'&&x.expense_id===e.expense_id&&activeShare(x)).reduce((n,x)=>n+BigInt(x.amount),0n);
   if(allocated+BigInt(e.amount)>BigInt(expense.amount))return 'Shares exceed actual expense';
  }else{
   const steps={proposed:['accepted','declined','cancelled'],accepted:['paid','cancelled']};
   if(!same(old,e,['title','expense_id','household_id','host','amount','currency','due_at'])||!steps[old.status]?.includes(e.status))return 'Invalid expense share transition';
  }
  if(['accepted','paid'].includes(e.status)&&(!householdAccessible(r,h)||!joined(r,h,e.actor)))return 'Share needs active membership';
  if(e.status==='paid'){
   const p=get(r,'household_contribution',e.contribution_id);
   if(!p||!same(p,e,['actor','host','household_id','amount','currency'])||others(x=>x.contribution_id===e.contribution_id))return 'Share requires matching unique contribution';
  }
 }else if(k==='care_plan'){
  const episode=get(r,'health_episode',e.episode_id);
  if(!episode||episode.actor!==e.actor)return 'Plan needs own observed health episode';
  if(!old){
   if(e.status!=='proposed'||episode.status==='resolved'||others(x=>x.episode_id===e.episode_id&&x.action_kind===e.action_kind&&['proposed','accepted'].includes(x.status)))return 'Plan needs unresolved episode and unique open action';
  }else{
   const steps={proposed:['accepted','cancelled'],accepted:['completed','cancelled']};
   if(!same(old,e,['title','episode_id','supporter','due_at','action_kind','description'])||!steps[old.status]?.includes(e.status))return 'Invalid care plan transition';
  }
  if(e.status==='accepted'&&episode.status==='resolved')return 'Resolved episode needs no new acceptance';
  if(e.status==='completed'){
   if(others(x=>x.completion_kind===e.completion_kind&&x.completion_id===e.completion_id))return 'Completion evidence already used';
   if(e.completion_kind==='care_record'){
    const c=get(r,'care_record',e.completion_id);
    if(!c||c.actor!==e.actor||c.episode_id!==e.episode_id)return 'Care plan needs matching own consultation';
   }else{
    const a=r.get('activity:activity:'+e.completion_id);
    if(!a||a.status!=='completed'||!a.actors?.includes(e.actor)||e.supporter&&!a.actors.includes(e.supporter)||!valid(a.outcome,600))return 'Care plan needs actual completed activity of participants';
   }
  }
 }
 return null;
}
export function expenseCareSceneError(e,events,i,used){
 if(e.player_life_version!==1)return null;
 const before=events.slice(0,i);
 if(e.life_kind==='household_expense'&&e.source_kind==='direct'){
  const p=before.find(x=>x.id===e.transfer_event_id);
  if(!p||p.type!=='money'||p.operation!=='transfer'||p.actor!==e.actor||p.counterparty!==e.provider||p.currency!==e.currency||p.delta!==-e.amount||used.has(p.id))return 'Expense needs its own preceding exact transfer';
  used.add(p.id);
 }
 if(e.life_kind==='expense_share'&&e.status==='paid'&&!before.some(x=>x.player_life_version===1&&x.life_kind==='household_contribution'&&x.record_id===e.contribution_id))return 'Pay share with new contribution in same scene';
 if(e.life_kind==='care_plan'&&e.status==='completed'&&!before.some(x=>e.completion_kind==='care_record'?x.player_life_version===1&&x.life_kind==='care_record'&&x.record_id===e.completion_id:x.activity_version===1&&x.activity_kind==='activity'&&x.record_id===e.completion_id&&x.status==='completed'))return 'Care plan needs actual completion in same scene';
 return null;
}
export function expenseCareReplayError(e,money){
 return e.player_life_version===1&&e.life_kind==='household_expense'&&e.source_kind==='direct'&&!money.has(e.transfer_event_id)?'Expense transfer rejected':null;
}
export function expenseCareView(projection={},actor){
 const rows=projection.worldFacts||[],page=a=>({records:a.slice(0,40),total:a.length,omitted:Math.max(0,a.length-40)});
 const shares=rows.filter(x=>x.life_kind==='expense_share'&&(x.actor===actor||x.host===actor));
 const linked=new Set(shares.map(x=>x.expense_id));
 const expenses=rows.filter(x=>x.life_kind==='household_expense'&&(x.actor===actor||linked.has(x.record_id))).map(x=>{
  const ss=shares.filter(s=>s.expense_id===x.record_id);
  const paid=ss.filter(s=>s.status==='paid').reduce((n,s)=>n+s.amount,0);
  const agreed=ss.filter(s=>s.status==='accepted').reduce((n,s)=>n+s.amount,0);
  return {id:x.record_id,title:x.title,host:x.actor,household_id:x.household_id,provider:x.provider,category:x.category,amount:x.amount,currency:x.currency,own_share_paid: x.actor===actor?null:paid,host_net_paid:x.actor===actor?x.amount-paid:null,accepted_unpaid:x.actor===actor?agreed:null,source:x.source};
 });
 const care=rows.filter(x=>x.life_kind==='care_plan'&&(x.actor===actor||x.supporter===actor)).map(x=>({id:x.record_id,title:x.title,actor:x.actor,supporter:x.supporter??null,episode_id:x.actor===actor?x.episode_id:null,action_kind:x.action_kind,description:x.description,due_at:x.due_at,status:x.status,outcome:x.outcome??null,source:x.source}));
 return {expenses:page(expenses),shares:page(shares.map(x=>({id:x.record_id,title:x.title,actor:x.actor,host:x.host,expense_id:x.expense_id,household_id:x.household_id,amount:x.amount,currency:x.currency,due_at:x.due_at,status:x.status,outcome:x.outcome??null,source:x.source}))),care_plans:page(care),policy:'Shares are explicit agreed reimbursements, not a second ledger or joint account. Only own or hosted shares; care plan completion does not establish recovery.'};
}
export const EXPENSE_CARE_GUIDANCE='СЕМЕЙНЫЕ РАСХОДЫ И ЗДОРОВЬЕ: player_life_version=1,record_id,key=player-life:<life_kind>:<ID>,evidence. household_expense: actor=хозяин,household_id,provider,title,category=food/utilities/housing/furnishing/care/education/leisure/other,amount>0,currency,status=recorded,source_kind=direct (свой предшествующий transfer_event_id хозяин→поставщик) или service (visit_id уже оплаченной completed услуги хозяина, не повторяй перевод). expense_share: actor=участник,host,expense_id,household_id,title,amount>0,currency,due_at,status=proposed/accepted/declined/paid/cancelled. Сумма активных долей не выше расхода; paid только после новой matching household_contribution в той же сцене (contribution_id). Не выбирай за героя; отмена/отказ без платежа. Не создавай общий баланс. care_plan: actor=пациент,episode_id,title,optional supporter (явно участвующий персонаж),due_at,action_kind=rest/nutrition/activity/consultation/support/other,description,status=proposed/accepted/completed/cancelled; completed с completion_kind=activity или care_record и completion_id; фактическое завершение в той же сцене, участники совпадают, для консультации собственный care_record того же эпизода, без supporter. Принятие/закрытие требует outcome. План не лечит автоматически и не даёт скрытой информации о здоровье.';
