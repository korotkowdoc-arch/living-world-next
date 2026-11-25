/** Additional typed interpretations of ordinary world records.
 * Core replay and storage stay compatible. Invalid extension records are ignored
 * by this reducer and rejected by state preflight for new authored scenes.
 * No money is created here: each investment movement must match a distinct,
 * accepted earlier money transfer in the same scene. */
const key=(...x)=>JSON.stringify(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const txt=(x,n=140)=>typeof x==='string'&&x===x.trim()&&x.length>0&&x.length<=n;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const point=x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1e7;
const one=(v,arr)=>arr.includes(v);
const kinds=['instrument','lot','distribution','motive','channel','edition','subscription','map_point','lot_transfer','loan','loan_payment'];
const page=(xs,offset=0,limit=24)=>({records:xs.slice(offset,offset+limit),total:xs.length,omitted:Math.max(0,xs.length-offset-limit),next_offset:offset+limit<xs.length?offset+limit:null});
const source=(s,e)=>({scene_id:s.id,event_id:e.id,world_time:s.world_time??null});
export const isAdvanced=e=>e?.advanced_version!==undefined||typeof e?.key==='string'&&e.key.startsWith('advanced:');
export function advancedShapeError(e){
 if(!isAdvanced(e))return null;
 const k=e.advanced_kind;
 if(e.type!=='world'||e.advanced_version!==1||!kinds.includes(k)||!id(e.record_id)||e.key!=='advanced:'+k+':'+e.record_id||!txt(e.evidence,12000))return 'Invalid advanced record key, type or evidence';
 if(['magic_version','world_record_version','social_record_version','interaction_version','activity_version','consequence_version','growth_version','dynamics_version','player_life_version'].some(v=>e[v]!==undefined))return 'Advanced record must be separate';
 if(k==='instrument'&&(!txt(e.actor)||!txt(e.title)||!txt(e.currency,20)||e.record_id.length>69||!positive(e.total_units)||!positive(e.unit_price)||!one(e.instrument_kind,['share','bond','fund','deposit','other'])||!one(e.status,['open','suspended','closed'])))return 'Invalid instrument';
 if(k==='lot'&&(!txt(e.actor)||!id(e.instrument_id)||!positive(e.units)||!positive(e.amount)||!txt(e.currency,20)||!id(e.transfer_event_id)||!one(e.status,['held','sold'])))return 'Invalid investment lot';
 if(k==='lot_transfer'&&(!txt(e.actor)||!txt(e.counterparty)||e.actor===e.counterparty||!id(e.lot_id)||!id(e.new_lot_id)||e.lot_id===e.new_lot_id||!one(e.transfer_kind,['sale','gift','inheritance'])||e.status!=='settled'||e.transfer_kind==='sale'&&(!positive(e.amount)||!txt(e.currency,20)||!id(e.transfer_event_id))||e.transfer_kind!=='sale'&&(e.amount!=null||e.transfer_event_id!=null)||e.transfer_kind==='inheritance'&&!txt(e.authorization,600)))return 'Invalid secondary ownership transfer';
 if(k==='loan'&&(!txt(e.actor)||!txt(e.counterparty)||e.actor===e.counterparty||!txt(e.title)||!txt(e.currency,20)||!positive(e.principal)||!positive(e.total_due)||e.total_due<e.principal||!one(e.status,['proposed','active','disputed','settled','cancelled'])||e.status==='active'&&e.transfer_event_id!=null&&!id(e.transfer_event_id)||e.due_at!=null&&!txt(e.due_at,40)))return 'Invalid loan terms';
 if(k==='loan_payment'&&(!txt(e.actor)||!id(e.loan_id)||!txt(e.currency,20)||!positive(e.amount)||!id(e.transfer_event_id)||e.status!=='paid'))return 'Invalid loan repayment';
 if(k==='distribution'&&(!txt(e.actor)||!id(e.lot_id)||!positive(e.amount)||!txt(e.currency,20)||!id(e.transfer_event_id)||e.status!=='paid'))return 'Invalid distribution';
 if(k==='motive'&&(!txt(e.actor)||!txt(e.title)||!txt(e.description,600)||!one(e.motive_kind,['interest','fear','value','ambition','attachment','conflict','principle'])||!one(e.status,['active','changed','resolved','abandoned'])||!one(e.intensity,['low','medium','high','unknown'])))return 'Invalid motive';
 if(k==='channel'&&(!txt(e.actor)||!txt(e.title)||e.record_id.length>72||!one(e.channel_kind,['newspaper','radio','network','noticeboard','newsletter','other'])||!one(e.status,['active','closed'])))return 'Invalid news channel';
 if(k==='edition'&&(!id(e.channel_id)||!id(e.topic_id)||!txt(e.title)||!txt(e.description,600)||e.status!=='published'))return 'Invalid edition';
 if(k==='subscription'&&(!txt(e.actor)||!id(e.channel_id)||!one(e.status,['active','cancelled'])))return 'Invalid subscription';
 if(k==='map_point'&&(!txt(e.title)||!id(e.map_id)||!point(e.x)||!point(e.y)||!txt(e.actor)||!one(e.status,['recorded','withdrawn'])))return 'Invalid map observation';
 return null;
}
export function advancedIndex(scenes=[],projection={}, {complete=true}={}){
 const records=new Map(),warnings=[],usedByInstrument=new Map(),editionTopics=new Set(),loanPaid=new Map();
 const badScenes=new Set(),badEvents=new Set();
 for(const w of projection.validation_warnings||[]){if(w.event_id==null)badScenes.add(w.scene_id);else badEvents.add(key(w.scene_id,w.event_id));}
 const error=(s,e,message)=>warnings.push({scene_id:s.id,event_id:e.id,errors:[message]});
 const get=(kind,id)=>records.get('advanced:'+kind+':'+id);
 if(complete)for(const s of scenes){
  if(badScenes.has(s.id))continue;
  const money=new Map(),used=new Set();
  // Do not reuse a payment belonging to an existing gameplay system, even
  // when that record appears after the advanced record in the scene.
  for(const e of s.events||[])if(!isAdvanced(e)&&e?.transfer_event_id)used.add(e.transfer_event_id);
  for(const e of s.events||[]){
   if(badEvents.has(key(s.id,e.id)))continue;
   if(e.type==='money'&&e.operation==='transfer')money.set(e.id,e);
   if(!isAdvanced(e))continue;
   let err=advancedShapeError(e);const old=records.get(e.key),k=e.advanced_kind;
   const same=(fields)=>!old||fields.every(f=>old[f]===e[f]);
   const transfer=(from,to,amount=e.amount)=>{
    const t=money.get(e.transfer_event_id);
    if(!t||used.has(e.transfer_event_id)||t.actor!==from||t.counterparty!==to||t.currency!==e.currency||t.delta!==-amount)return 'Missing distinct accepted matching transfer';
    return null;
   };
   if(!err&&k==='instrument'){
    if(!same(['actor','currency','instrument_kind','total_units','title'])||old?.status==='closed'&&e.status!=='closed')err='Instrument identity or closed status cannot change';
   }
   if(!err&&k==='lot'){
    const i=get('instrument',e.instrument_id),allocated=usedByInstrument.get(e.instrument_id)||0;
    if(!i||i.actor===e.actor||i.currency!==e.currency||!same(['actor','instrument_id','units','currency']))err='Unknown instrument or mismatched lot identity';
    else if(e.status==='held'){
     if(old||i.status!=='open'||allocated>i.total_units-e.units||BigInt(e.amount)!==BigInt(i.unit_price)*BigInt(e.units))err='Purchase needs available units and exact recorded quote';
     else err=transfer(e.actor,i.actor);
    }else if(!old||old.status!=='held'||i.status==='suspended'||BigInt(e.amount)!==BigInt(i.unit_price)*BigInt(e.units))err='Sale needs held lot and recorded redemption quote';
    else err=transfer(i.actor,e.actor);
    if(!err){used.add(e.transfer_event_id);usedByInstrument.set(e.instrument_id,allocated+(e.status==='held'?e.units:-e.units));}
   }
   if(!err&&k==='lot_transfer'){
    const l=get('lot',e.lot_id),i=l&&get('instrument',l.instrument_id);
    if(old||!l||l.actor!==e.actor||l.status!=='held'||get('lot',e.new_lot_id)||!i||i.actor===e.counterparty)err='Transfer requires held lot and new unique lot ID';
    else if(e.transfer_kind==='sale'&&(i.status!=='open'||e.currency!==i.currency))err='Secondary sale requires open instrument and same currency';
    else if(e.transfer_kind==='sale')err=transfer(e.counterparty,e.actor);
    if(!err){
     if(e.transfer_kind==='sale')used.add(e.transfer_event_id);
     records.set(l.key,{...l,status:e.transfer_kind==='sale'?'sold':'transferred',amount:e.transfer_kind==='sale'?e.amount:null,transfer_kind:e.transfer_kind,source:source(s,e)});
     const k2='advanced:lot:'+e.new_lot_id;
     records.set(k2,{...l,key:k2,record_id:e.new_lot_id,actor:e.counterparty,status:'held',purchase_amount:e.transfer_kind==='sale'?e.amount:null,amount:e.transfer_kind==='sale'?e.amount:null,source:source(s,e),acquisition_kind:e.transfer_kind});
    }
   }
   if(!err&&k==='loan'){
    const paid=loanPaid.get(e.record_id)||0;
    if(!same(['actor','counterparty','title','currency','principal','total_due','due_at'])||!old&&e.status!=='proposed'||old&&['settled','cancelled'].includes(old.status)&&old.status!==e.status||e.status==='active'&&!['proposed','active','disputed'].includes(old?.status)||e.status==='disputed'&&!['active','disputed'].includes(old?.status)||e.status==='settled'&&(!['active','disputed','settled'].includes(old?.status)||paid!==e.total_due)||e.status==='cancelled'&&old?.status!=='proposed')err='Invalid loan transition or unsettled balance';
    else if(e.status==='active'&&old?.status==='proposed'){err=transfer(e.actor,e.counterparty,e.principal);if(!err)used.add(e.transfer_event_id);}
    else if(e.transfer_event_id!=null)err='Loan disbursement may occur only on activation';
   }
   if(!err&&k==='loan_payment'){
    const l=get('loan',e.loan_id),paid=loanPaid.get(e.loan_id)||0;
    if(old||!l||!['active','disputed'].includes(l.status)||l.counterparty!==e.actor||l.currency!==e.currency||e.amount>l.total_due-paid)err='Repayment exceeds balance or loan is unavailable';
    else err=transfer(e.actor,l.actor);
    if(!err){used.add(e.transfer_event_id);loanPaid.set(e.loan_id,paid+e.amount);}
   }
   if(!err&&k==='distribution'){
    const l=get('lot',e.lot_id),i=l&&get('instrument',l.instrument_id);
    if(old||!l||l.status!=='held'||l.actor!==e.actor||i?.currency!==e.currency)err='Distribution requires an existing held lot and unique payment';
    else err=transfer(i.actor,e.actor);
    if(!err)used.add(e.transfer_event_id);
   }
   if(!err&&k==='motive'&&(!same(['actor','motive_kind','title'])||old&&['resolved','abandoned'].includes(old.status)&&old.status!==e.status))err='New motive requires new identity';
   if(!err&&k==='channel'&&(!same(['actor','channel_kind','title'])||old?.status==='closed'&&e.status!=='closed'))err='Channel identity cannot change';
   if(!err&&k==='edition'&&(old||editionTopics.has(e.topic_id)||get('channel',e.channel_id)?.status!=='active'))err='Edition requires active channel and unique ID';
   if(!err&&k==='subscription'&&(!same(['actor','channel_id'])||!get('channel',e.channel_id)||e.status==='active'&&get('channel',e.channel_id).status!=='active'))err='Unknown channel or changed subscriber';
   if(!err&&k==='map_point'&&!same(['actor','map_id','title']))err='Map observation identity cannot change';
   if(err){error(s,e,err);continue;}
   const r={...e,source:source(s,e)};
   if(k==='lot')r.purchase_amount=old?old.purchase_amount:e.amount;
   records.set(e.key,r);if(k==='edition')editionTopics.add(e.topic_id);
  }
 }
 const rows=[...records.values()];
 const byKind=k=>rows.filter(r=>r.advanced_kind===k);
 const compact=r=>({id:r.record_id,title:r.title,status:r.status,description:r.description,source:r.source});
 function view(actor,{director=false,offset=0,limit=24}={}){
  if(!complete)return {memory_complete:false};
  const own=r=>r.actor===actor,knowledge=(projection.knowledge||[]).filter(r=>own(r)&&!['forgotten','unknown'].includes(r.status));
  const topics=new Set(knowledge.map(r=>r.topic_id));
  const lots=byKind('lot').filter(own);
  const subscriptions=byKind('subscription').filter(own);
  const channels=new Set(subscriptions.map(r=>r.channel_id));
  const editionKnowledge=r=>knowledge.find(k=>k.topic_id===r.topic_id&&k.status==='knows'&&[get('channel',r.channel_id)?.title,r.channel_id].includes(k.channel));
  const editions=byKind('edition').filter(r=>director||!!editionKnowledge(r));
  for(const e of editions)channels.add(e.channel_id);
  const knownInstruments=new Set(lots.map(r=>r.instrument_id));
  const instruments=byKind('instrument').filter(r=>own(r)||knownInstruments.has(r.record_id)||topics.has('instrument_'+r.record_id));
  // Quotes and instrument changes are narrator-only unless observed in the
  // current instrument record's scene or explicitly known by the owner.
  const knownQuote=r=>director||own(r)||knowledge.some(k=>k.topic_id==='instrument_'+r.record_id&&k.status==='knows'&&k.source?.scene_id===r.source.scene_id);
  const investments=lots.map(l=>{
   const i=get('instrument',l.instrument_id),quote=i&&knownQuote(i)?i.unit_price:null;
   const payouts=byKind('distribution').filter(r=>r.lot_id===l.record_id&&own(r)).reduce((a,r)=>a+BigInt(r.amount),0n);
   return {...compact(l),title:i?.title||l.instrument_id,instrument_id:l.instrument_id,units:l.units,currency:l.currency,purchase_amount:l.purchase_amount,sale_amount:l.status==='sold'?l.amount:null,known_unit_price:quote,known_value:l.status==='held'&&quote!==null?String(BigInt(quote)*BigInt(l.units)):null,distributions:String(payouts),realized_result:l.status==='sold'&&l.purchase_amount!=null?String(BigInt(l.amount)-BigInt(l.purchase_amount)+payouts):null,acquisition_kind:l.acquisition_kind??'purchase',transfer_kind:l.transfer_kind??null};
  });
  return {memory_complete:true,loans:page(byKind('loan').filter(r=>own(r)||r.counterparty===actor).map(r=>({...compact(r),role:own(r)?'lender':'borrower',counterparty:own(r)?r.counterparty:r.actor,principal:r.principal,total_due:r.total_due,paid:loanPaid.get(r.record_id)||0,outstanding:['active','disputed','settled'].includes(r.status)?r.total_due-(loanPaid.get(r.record_id)||0):null,currency:r.currency,due_at:r.due_at??null})),offset,limit),investments:{lots:page(investments,offset,limit),issued_lots:page(byKind('lot').filter(l=>get('instrument',l.instrument_id)?.actor===actor).map(l=>({id:l.record_id,holder:l.actor,instrument_id:l.instrument_id,units:l.units,status:l.status,currency:l.currency,source:l.source})),offset,limit),instruments:page(instruments.map(r=>({id:r.record_id,title:r.title,source:knownQuote(r)?r.source:null,instrument_kind:r.instrument_kind,currency:r.currency,unit_price:knownQuote(r)?r.unit_price:null,total_units:own(r)?r.total_units:null,issued_units:own(r)?usedByInstrument.get(r.record_id)||0:null,status:knownQuote(r)?r.status:'unknown'})),offset,limit)},motives:page(byKind('motive').filter(own).map(r=>({...compact(r),kind:r.motive_kind,intensity:r.intensity})),offset,limit),channels:{subscriptions:page(subscriptions.map(r=>({...compact(r),channel_id:r.channel_id,title:get('channel',r.channel_id)?.title||r.channel_id})),offset,limit),channels:page(byKind('channel').filter(r=>director||own(r)||channels.has(r.record_id)||topics.has('channel_'+r.record_id)).map(r=>({id:r.record_id,title:r.title,kind:r.channel_kind,source:director||own(r)?r.source:null,status:director||own(r)?r.status:'unknown'})),offset,limit),editions:page(editions.map(r=>({id:r.record_id,title:director?r.title:editionKnowledge(r)?.fact,channel_id:r.channel_id,topic_id:r.topic_id,description:director?r.description:null,status:'published',source:director?r.source:editionKnowledge(r)?.source})),offset,limit)},map_points:page(byKind('map_point').filter(r=>(director||own(r))&&r.status==='recorded').map(r=>({...compact(r),map_id:r.map_id,x:r.x,y:r.y})),offset,limit),policy:'Explicit fictional records only. No automatic payments, valuations, knowledge, motives or route distances.'};
 }
 function opportunities(){
  if(!complete)return [];
  const out=[],seen=new Set();
  for(const r of byKind('motive'))if(['active','changed'].includes(r.status)&&!seen.has(r.actor)){
   seen.add(r.actor);out.push({kind:'motive_review',row:{actor:r.actor,key:r.key,title:r.title,status:r.status,source:r.source},info:{record_key:r.key,timing:'requires_character_choice',motive:{kind:r.motive_kind,intensity:r.intensity,description:r.description},guidance:'Use the motive as an individual influence, not a command or inevitable behavior.'}});
  }
  seen.clear();
  for(const r of byKind('lot'))if(r.status==='held'&&!seen.has(r.actor)){
   seen.add(r.actor);out.push({kind:'capital_review',row:{actor:r.actor,key:r.key,title:get('instrument',r.instrument_id)?.title,status:r.status,source:r.source},info:{record_key:r.key,timing:'requires_character_choice',capital:{instrument_id:r.instrument_id,units:r.units,currency:r.currency,purchase_amount:r.purchase_amount},guidance:'Review the original investment and available observed quote; no automatic yield, redemption or new payment.'}});
  }
  seen.clear();
  for(const r of byKind('channel'))if(r.status==='active'&&!seen.has(r.actor)){
   seen.add(r.actor);out.push({kind:'publication_opportunity',row:{actor:r.actor,key:r.key,title:r.title,status:r.status,source:r.source},info:{record_key:r.key,timing:'requires_character_choice',publication:{channel_id:r.record_id,channel_kind:r.channel_kind},guidance:'Publisher may prepare a new edition based on facts and sources actually available to them. A published edition does not automatically give anyone knowledge.'}});
  }
  return out;
 }
 return {view,opportunities,warnings};
}
export const ADVANCED_GUIDANCE='ADVANCED: отдельный world с advanced_version=1, advanced_kind, record_id, key=advanced:<kind>:<ID>, evidence. motive: actor,title,description,motive_kind=interest/fear/value/ambition/attachment/conflict/principle,intensity=low/medium/high/unknown,status=active/changed/resolved/abandoned. instrument: actor=эмитент,title,currency,total_units,unit_price,instrument_kind=share/bond/fund/deposit/other,status=open/suspended/closed. lot: actor,instrument_id,units,amount,currency,transfer_event_id,status=held/sold; покупка/выкуп целого лота, ранее в той же сцене точный money transfer по текущей цене. distribution: actor,lot_id,amount,currency,transfer_event_id,status=paid; отдельный перевод эмитента. channel: actor,title,channel_kind=newspaper/radio/network/noticeboard/newsletter/other,status=active/closed. edition: channel_id,topic_id,title,description,status=published; уникальный topic_id; читателю отдельное knowledge status=knows с тем же topic_id и channel=название/ID канала, не выдавай неизвестное. subscription: actor,channel_id,status=active/cancelled. map_point: actor,title,map_id,x,y,status=recorded/withdrawn; координаты только по установленной карте, без выдуманной географии. Для изменения используй тот же ID, для новых объектов новый. Инструмент/канал становится известен через knowledge topic_id=instrument_<ID>/channel_<ID>. Все записи только после сыгранного события.';

export const CAPITAL_GUIDANCE='Дополнительный капитал (advanced): lot_transfer: actor=держатель,counterparty=получатель,lot_id,new_lot_id,transfer_kind sale/gift/inheritance,status settled; sale требует amount,currency,transfer_event_id (покупатель→продавец); gift/inheritance без денег; inheritance требует authorization (установленное основание наследования). Переносится целый лот без нового выпуска. loan: actor=кредитор,counterparty=заёмщик,title,currency,principal,total_due,due_at,status proposed/active/disputed/settled/cancelled; активация требует transfer_event_id (кредитор→заёмщик, principal). loan_payment: actor=заёмщик,loan_id,currency,amount,transfer_event_id,status paid; закрытие после всей согласованной суммы. Не начисляй деньги, проценты или наследство автоматически; реальные сделки и согласие только по сценам.';
export const ADVANCED_ACTIONS=Object.freeze({transfer_investment:'Передать инвестиционный лот',offer_loan:'Предложить кредит или заём',respond_loan:'Обсудить условия займа',repay_loan:'Погасить заём',review_loan:'Проверить задолженность',review_investment:'Изучить инвестиции',buy_investment:'Купить инвестиционный лот',sell_investment:'Выкупить или продать лот эмитенту',issue_instrument:'Выпустить финансовый инструмент',pay_distribution:'Выплатить доход держателю',create_motive:'Добавить личный мотив или интерес',edit_motive:'Уточнить личный мотив',resolve_motive:'Завершить личный мотив',seek_news:'Найти выпуск или канал новостей',subscribe_news:'Подписаться на новости',cancel_subscription:'Отменить подписку',publish_news:'Опубликовать выпуск',record_map_point:'Записать установленную точку карты'});
export const ADVANCED_ACTION_IDS=Object.freeze({transfer_investment:'lot_id',respond_loan:'loan_id',repay_loan:'loan_id',buy_investment:'instrument_id',sell_investment:'lot_id',pay_distribution:'instrument_id',edit_motive:'motive_id',resolve_motive:'motive_id',subscribe_news:'channel_id',cancel_subscription:'subscription_id',publish_news:'channel_id'});
export function validateAdvancedAction(input,overview){
 const field=ADVANCED_ACTION_IDS[input.action];if(!field)return;
 const a=overview.advanced;
 if(!a?.memory_complete)throw Error('Complete advanced history required');
 const rows=field==='loan_id'?a.loans.records:field==='instrument_id'?a.investments.instruments.records:field==='lot_id'?a.investments.lots.records:field==='motive_id'?a.motives.records:field==='channel_id'?a.channels.channels.records:a.channels.subscriptions.records;
 const r=rows.find(r=>r.id===input[field]);if(!r)throw Error('Advanced record is not visible');
 if(input.action==='buy_investment'&&(r.status!=='open'||r.unit_price==null||r.total_units!=null)||['sell_investment','transfer_investment'].includes(input.action)&&r.status!=='held'||input.action==='respond_loan'&&r.status!=='proposed'||input.action==='repay_loan'&&(r.role!=='borrower'||!['active','disputed'].includes(r.status)||r.outstanding<=0)||['edit_motive','resolve_motive'].includes(input.action)&&!['active','changed'].includes(r.status)||input.action==='cancel_subscription'&&r.status!=='active')throw Error('Record status does not allow action');
 if(input.action==='pay_distribution'&&r.total_units==null||input.action==='publish_news'&&r.status!=='active')throw Error('Issuer or channel owner required');
}
