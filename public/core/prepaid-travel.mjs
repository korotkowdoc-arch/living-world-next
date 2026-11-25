/** Full ticket prepayment and full refund using the existing money ledger.
 * A paid receipt cannot be reused by a different visit or charged twice.
 * Refund and cancellation of all linked records must be in the same scene. */
const valid=(x,n=140)=>typeof x==='string'&&x.trim()===x&&!!x&&x.length<=n;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const get=(r,k,id)=>r.get('player-life:'+k+':'+id);
const same=(a,b,fields)=>fields.every(k=>a[k]===b[k]);
export const PREPAID_KINDS=['ticket_payment'];
export function prepaidRecordError(e){
 if(!valid(e.actor)||!valid(e.provider)||e.actor===e.provider||!id(e.ticket_id)||!id(e.reservation_id)||!id(e.visit_id)||!Number.isSafeInteger(e.amount)||e.amount<=0||!valid(e.currency,40)||!valid(e.transfer_event_id,180)||!['paid','refunded'].includes(e.status))return 'Invalid ticket payment';
 return null;
}
export function prepaidTransition(records,e){
 const old=records.get(e.key),ticket=get(records,'transport_ticket',e.ticket_id),visit=get(records,'service_visit',e.visit_id),reservation=get(records,'reservation',e.reservation_id);
 if(!ticket||!visit||!reservation||ticket.actor!==e.actor||ticket.visit_id!==e.visit_id||ticket.reservation_id!==e.reservation_id||ticket.status!=='reserved'||reservation.status!=='reserved'||reservation.actor!==e.actor||reservation.visit_id!==e.visit_id||visit.actor!==e.actor||visit.provider!==e.provider||visit.status!=='accepted'||visit.amount!==e.amount||visit.currency!==e.currency)return 'Payment needs the matching accepted and reserved ticket service';
 if(!old){
  if(e.status!=='paid'||[...records.values()].some(x=>x.life_kind==='ticket_payment'&&x.visit_id===e.visit_id))return 'Ticket may be prepaid only once';
 }else if(old.status!=='paid'||e.status!=='refunded'||!same(old,e,['actor','provider','ticket_id','reservation_id','visit_id','amount','currency']))return 'Refund requires the original unconsumed payment';
 return null;
}
export function visitPrepaidError(records,e){
 if(e.player_life_version!==1||e.life_kind!=='service_visit')return null;
 const p=[...records.values()].find(x=>x.life_kind==='ticket_payment'&&x.visit_id===e.record_id);
 if(e.status==='completed'){
  if(p&&p.status!=='paid')return 'Refunded or consumed payment cannot complete service';
  if(p?e.prepayment_id!==p.record_id||e.transfer_event_id!=null:e.prepayment_id!=null)return 'Completion must use its own prepaid receipt, not another charge';
 }else if(e.status==='cancelled'&&p?.status==='paid')return 'Cancel prepaid ticket only after full refund in this scene';
 return null;
}
export function applyPrepaid(records,e,value){
 if(e.player_life_version!==1||e.life_kind!=='service_visit'||e.status!=='completed'||!e.prepayment_id)return;
 const k='player-life:ticket_payment:'+e.prepayment_id,p=records.get(k);
 records.set(k,{...p,status:'consumed',source:value.source,consumed_visit_id:e.record_id});
}
export function prepaidSceneError(e,events,i,usedPayments){
 if(e.player_life_version!==1||e.life_kind!=='ticket_payment')return null;
 const refund=e.status==='refunded',t=events.slice(0,i).find(x=>x?.id===e.transfer_event_id);
 if(!t||t.type!=='money'||t.operation!=='transfer'||t.actor!==(refund?e.provider:e.actor)||t.counterparty!==(refund?e.actor:e.provider)||t.currency!==e.currency||t.delta!==-e.amount||usedPayments.has(e.transfer_event_id))return 'Ticket payment/refund needs its own preceding exact transfer';
 usedPayments.add(e.transfer_event_id);
 if(refund){
  const later=events.slice(i+1);
  const cancellation=(kind,id)=>later.some(x=>x?.type==='world'&&x.player_life_version===1&&x.life_kind===kind&&x.record_id===id&&x.actor===e.actor&&x.status==='cancelled');
  if(!cancellation('service_visit',e.visit_id)||!cancellation('reservation',e.reservation_id)||!cancellation('transport_ticket',e.ticket_id))return 'Refund must cancel the service, reservation and ticket in the same scene';
 }
 return null;
}
export function prepaidReplayError(e,acceptedMoney){
 return e.player_life_version===1&&e.life_kind==='ticket_payment'&&!acceptedMoney.has(e.transfer_event_id)?'Ticket payment transfer was rejected':null;
}
export function ticketPaymentView(projection={},actor){
 const rows=(projection.worldFacts||[]).filter(x=>x.life_kind==='ticket_payment'&&(x.actor===actor||x.provider===actor));
 const records=rows.slice(-40).reverse().map(x=>({id:x.record_id,ticket_id:x.ticket_id,visit_id:x.visit_id,reservation_id:x.reservation_id,actor:x.actor,provider:x.provider,amount:x.amount,currency:x.currency,status:x.status,source:x.source}));
 return {records,total:rows.length,omitted:Math.max(0,rows.length-40)};
}
export const PREPAID_GUIDANCE='ПРЕДОПЛАТА БИЛЕТОВ: ticket_payment (player_life_version=1, record_id,key=player-life:ticket_payment:<ID>, actor=покупатель,provider,ticket_id,reservation_id,visit_id,amount>0,currency,transfer_event_id,status=paid/refunded,evidence). Только собственный оформленный билет, accepted service_visit и reserved reservation, точная полная цена. paid требует отдельного предшествующего перевода клиент→поставщик; refunded требует обратного перевода той же суммы и в той же сцене последующих cancelled service_visit, reservation и transport_ticket. Не создавай повторную оплату. При использовании оплаченного билета service_visit completed с prepayment_id вместо transfer_event_id; он поглощает квитанцию (consumed), затем reservation/transport_ticket used. Без предоплаты расчёт по старой схеме. Частичная оплата/штрафы/невозвратные тарифы пока не моделируются. Отмена и оплата — только по сыгранным событиям.';
