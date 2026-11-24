/** Evidence-backed fictional property ledger. No guessed ownership or cash. */
const text=v=>typeof v==='string'?v.trim():'';
const key=(actor,currency)=>JSON.stringify([text(actor),text(currency)]);
const actions=new Set(['acquire','transfer','take','drop','destroy','recover','observe']);
export function economyShapeError(e){
 if(e.type==='money'){
  if(!text(e.actor)||!text(e.currency)||!Number.isSafeInteger(e.delta))return 'Нужны владелец, валюта и точное целое изменение.';
  if(e.operation==='reconcile'&&(!Number.isSafeInteger(e.balance)||e.balance<0||e.delta!==0))return 'Сверка требует неотрицательного точного остатка и delta=0.';
  if(e.operation==='transfer'&&(!text(e.counterparty)||text(e.actor)===text(e.counterparty)||e.delta>=0))return 'Перевод требует другого получателя и отрицательного delta отправителя.';
 }
 if(e.type==='item'){
  if(!text(e.item_id)||!text(e.action))return 'Нужны ID предмета и действие.';
  // Older events remain readable without inferring ownership from arbitrary action labels.
  if(e.custody_version===1){
   if(!actions.has(e.action))return 'Неизвестное действие с предметом.';
   if(['acquire','recover','observe','drop','destroy','transfer','take'].includes(e.action)&&!text(e.actor))return 'Нужен участник действия с предметом.';
   if(['transfer','take'].includes(e.action)&&(!text(e.counterparty)||text(e.actor)===text(e.counterparty)))return 'Передача требует другого получателя.';
  }
 }
 return null;
}
export function applyMoney(balances,e,source){
 const initial=actor=>balances.get(key(actor,e.currency))||{actor:text(actor),currency:text(e.currency),known:false,balance:null,delta:0};
 const sender=initial(e.actor);
 if(e.operation==='reconcile'){
  balances.set(key(e.actor,e.currency),{...sender,known:true,balance:e.balance,delta:0,source});return null;
 }
 const step=(old,delta)=>{
  const next=old.known?old.balance+delta:null;
  const net=old.delta+delta;
  if(!Number.isSafeInteger(net)||(old.known&&!Number.isSafeInteger(next)))return {error:'Переполнение точного денежного остатка.'};
  if(old.known&&next<0)return {error:'Недостаточно подтверждённых средств.'};
  return {value:{...old,balance:next,delta:net,source}};
 };
 const debit=step(sender,e.delta);
 if(debit.error)return debit.error;
 if(e.operation==='transfer'){
  const credit=step(initial(e.counterparty),-e.delta);
  if(credit.error)return credit.error;
  // Both legs succeed or neither changes the projection.
  balances.set(key(e.counterparty,e.currency),credit.value);
 }
 balances.set(key(e.actor,e.currency),debit.value);return null;
}
export function applyItem(items,e,source){
 const old=items.get(e.item_id);
 if(e.custody_version!==1){
  // Legacy action is recorded but does not imply a particular current holder.
  items.set(e.item_id,{...e,source,custody_status:'unknown',holder:null});return null;
 }
 const actor=text(e.actor), recipient=text(e.counterparty);
 const status=old?.custody_status||'unknown';
 const holder=old?.holder||null;
 if(e.action==='observe'){
  // A sighting does not establish possession and does not erase earlier custody.
  items.set(e.item_id,{...(old||{item_id:e.item_id,name:e.name,custody_status:'unknown',holder:null,source}),last_observation:{actor,source},action:old?.action||'observe'});
  return null;
 }
 if(status==='destroyed')return 'Предмет уже уничтожен; нужен новый ID для другого экземпляра.';
 if(e.action==='take'){
  if(status==='lost')return 'Потерянный предмет сначала нужно найти.';
  if(status==='held'&&holder!==recipient)return 'Указан неверный прежний держатель предмета.';
 }else if(status==='held'&&holder!==actor)return 'Действие приписано не подтверждённому держателю предмета.';
 if(e.action==='acquire'&&status==='held')return 'Предмет уже находится у держателя; повторное получение не подтверждено.';
 if(e.action==='acquire'&&status==='lost')return 'Потерянный предмет сначала нужно найти.';
 if(e.action==='recover'&&status==='held')return 'Предмет не потерян.';
 if(e.action==='transfer'&&status==='lost')return 'Потерянный предмет сначала нужно найти.';
 if(e.action==='drop'&&status==='lost')return 'Предмет уже потерян.';
 const next=e.action==='destroy'?'destroyed':e.action==='drop'?'lost':'held';
 items.set(e.item_id,{...old,...e,source,custody_status:next,holder:next==='held'?(e.action==='transfer'?recipient:actor):null});
 return null;
}
export function economyView(projection,{actor='',offset=0,limit=40,complete=true}={}){
 const person=text(actor).toLocaleLowerCase('ru');
 const match=v=>!person||text(v).toLocaleLowerCase('ru')===person;
 const rows=[
  ...(projection.balances||[]).filter(x=>match(x.actor)).map(x=>({kind:'money',...x})),
  ...(projection.items||[]).filter(x=>!person||match(x.holder)||match(x.actor)||match(x.counterparty)).map(x=>({kind:'item',...x})),
  ...(projection.stock||[]).filter(x=>match(x.holder)).map(x=>({kind:'stock',...x}))
 ];
 const start=Math.max(0,Math.floor(Number(offset)||0)),size=Math.max(1,Math.min(100,Math.floor(Number(limit)||40)));
 return {records:rows.slice(start,start+size),total_records:rows.length,next_offset:start+size<rows.length?start+size:null,
  memory_complete:complete,policy:'Only annotated events; unknown cash is not zero, unknown custody is not ownership. No automatic wages, spending or inventory changes.'};
}

/** Branch-local bulk stock. Counts set exact amounts; receipts never invent prior stock.
 * Debits require known sufficient stock. A batch is applied entirely or not at all. */
export function stockLinesError(lines,action){
 if(!Array.isArray(lines)||lines.length<1||lines.length>20)return 'Нужно от 1 до 20 строк запасов.';
 const ids=new Set();let input=false,output=false;
 for(const l of lines){
  if(!l||typeof l.product_id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(l.product_id)||typeof l.unit!=='string'||!l.unit.trim()||l.unit!==l.unit.trim()||l.unit.length>40||!Number.isSafeInteger(l.quantity))return 'Некорректная строка запасов.';
  const k=JSON.stringify([l.product_id,l.unit]);if(ids.has(k))return 'Повтор товара и единицы в одной операции.';ids.add(k);
  if(action==='count'?l.quantity<0:action==='receive'||action==='transfer'?l.quantity<=0:action==='consume'?l.quantity>=0:l.quantity===0)return 'Некорректный знак количества.';
  input||=l.quantity<0;output||=l.quantity>0;
 }
 if(action==='produce'&&(!input||!output))return 'Производство требует расхода сырья и выпуска продукта.';
 return null;
}
export function stockOperationError(e){
 if(!['count','receive','consume','transfer','produce'].includes(e.stock_action)||typeof e.actor!=='string'||!e.actor.trim()||e.actor!==e.actor.trim()||e.actor.length>140)return 'Неверная операция запасов или держатель.';
 if(e.stock_action==='transfer'&&(typeof e.counterparty!=='string'||!e.counterparty.trim()||e.counterparty!==e.counterparty.trim()||e.counterparty.length>140||e.actor===e.counterparty))return 'Передача требует другого держателя.';
 if(e.stock_action!=='transfer'&&e.counterparty!=null)return 'Получатель допустим только для передачи.';
 return stockLinesError(e.stock_lines,e.stock_action);
}
export function applyStock(stock,e,source){
 const error=stockOperationError(e);if(error)return error;
 const staged=new Map();
 const step=(holder,line,delta,count=false)=>{
  const k=JSON.stringify([holder,line.product_id,line.unit]),old=staged.get(k)||stock.get(k)||{holder,product_id:line.product_id,unit:line.unit,known:false,quantity:null,delta:0};
  if(count){staged.set(k,{...old,known:true,quantity:delta,delta:0,source});return null;}
  if(delta<0&&(!old.known||old.quantity< -delta))return 'Недостаточно подтверждённого запаса: '+line.product_id;
  const net=old.delta+delta,qty=old.known?old.quantity+delta:null;
  if(!Number.isSafeInteger(net)||(old.known&&!Number.isSafeInteger(qty)))return 'Переполнение количества.';
  staged.set(k,{...old,quantity:qty,delta:net,source});return null;
 };
 for(const l of e.stock_lines){
  const a=e.stock_action,err=step(e.actor,l,a==='transfer'?-l.quantity:l.quantity,a==='count');if(err)return err;
  if(a==='transfer'){const err=step(e.counterparty,l,l.quantity);if(err)return err;}
 }
 for(const [k,v] of staged)stock.set(k,v);
 return null;
}
