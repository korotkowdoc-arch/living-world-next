/** Estate settlements and explicitly shared cash accounts.
 * These records never mint cash or ownership; they reference accepted ledger events.
 * A legal estate sale for zero price can be used to convey real property. */
const kinds=['estate_case','beneficiary','bequest','treasury','treasury_member','treasury_payment'];
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,60}$/.test(x);
const text=(x,n=140)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const one=(v,a)=>a.includes(v);
const key=(...x)=>JSON.stringify(x);
const page=(a,offset=0,limit=24)=>({records:a.slice(offset,offset+limit),total:a.length,omitted:Math.max(0,a.length-offset-limit),next_offset:offset+limit<a.length?offset+limit:null});
const src=(s,e)=>({scene_id:s.id,event_id:e.id,world_time:s.world_time??null});
export const isWealth=e=>e?.wealth_version!==undefined||typeof e?.key==='string'&&e.key.startsWith('wealth:');
export function wealthShapeError(e){
 if(!isWealth(e))return null;const k=e.wealth_kind;
 if(e.type!=='world'||e.wealth_version!==1||!kinds.includes(k)||!id(e.record_id)||e.key!=='wealth:'+k+':'+e.record_id||!text(e.actor)||!text(e.evidence,12000))return 'Invalid wealth record envelope';
 if(['magic_version','magic_society_version','advanced_version','document_version','world_record_version','social_record_version','interaction_version','activity_version','consequence_version','growth_version','dynamics_version','player_life_version'].some(v=>e[v]!==undefined))return 'Wealth record must be separate';
 if(k==='estate_case'&&(!text(e.decedent)||e.actor===e.decedent||!text(e.title,200)||!text(e.authority,600)||!one(e.status,['opened','administering','settled','disputed','closed'])))return 'Invalid estate case';
 if(k==='beneficiary'&&(!id(e.case_id)||!text(e.recipient)||!text(e.basis,600)||!one(e.status,['named','accepted','declined','disputed'])))return 'Invalid beneficiary';
 if(k==='bequest'&&(!id(e.case_id)||!id(e.beneficiary_id)||!one(e.asset_kind,['cash','item','estate','investment'])||!text(e.asset_ref,180)||!text(e.title,200)||!one(e.status,['proposed','distributed','cancelled','disputed'])||e.asset_kind==='cash'&&(!positive(e.amount)||!text(e.currency,40))||e.status==='distributed'&&!text(e.event_ref,180)))return 'Invalid bequest';
 if(k==='treasury'&&(!id(e.household_id)||!text(e.title,200)||!text(e.account)||e.account!=='treasury:'+e.record_id||!text(e.currency,40)||!one(e.status,['active','closed'])))return 'Invalid shared treasury';
 if(k==='treasury_member'&&(!id(e.treasury_id)||!text(e.member)||!one(e.role,['manager','contributor'])||!one(e.status,['invited','accepted','declined','withdrawn'])))return 'Invalid treasury membership';
 if(k==='treasury_payment'&&(!id(e.treasury_id)||!text(e.counterparty)||!positive(e.amount)||!text(e.currency,40)||!text(e.title,200)||!one(e.direction,['deposit','expense','withdrawal'])||!one(e.status,['proposed','approved','settled','cancelled'])||e.status==='settled'&&!text(e.transfer_event_id,180)))return 'Invalid treasury payment';
 return null;
}
export function wealthIndex(scenes=[],projection={}, {complete=true}={}){
 const records=new Map(),warnings=[],world=new Map(),membership=new Map(),beneficiaries=new Map(),caseByDecedent=new Map(),bequestsByAsset=new Map(),accounts=new Map();
 const badScenes=new Set(),badEvents=new Set();
 for(const w of projection.validation_warnings||[]){if(w.event_id==null)badScenes.add(w.scene_id);else badEvents.add(key(w.scene_id,w.event_id));}
 const get=(k,i)=>records.get('wealth:'+k+':'+i);
 const of=k=>[...records.values()].filter(r=>r.wealth_kind===k);
 const member=(t,a)=>membership.get(key(t,a));
 const householdMember=(h,a)=>world.get('player-life:household:'+h)?.status==='active'&&(world.get('player-life:household:'+h)?.actor===a||[...world.values()].some(r=>r.life_kind==='household_member'&&r.household_id===h&&r.actor===a&&r.status==='joined'));
 const manage=(t,a)=>t?.actor===a||member(t?.record_id,a)?.status==='accepted'&&member(t?.record_id,a)?.role==='manager';
 const participate=(t,a)=>t?.actor===a||member(t?.record_id,a)?.status==='accepted';
 if(complete)for(const s of scenes){
  if(badScenes.has(s.id))continue;
  const events=new Map(),used=new Set(),treasuryTransfers=new Set(),createdAccounts=new Set();
  for(const e of s.events||[])if(!isWealth(e)&&e?.transfer_event_id)used.add(e.transfer_event_id);
  for(const e of s.events||[]){
   if(badEvents.has(key(s.id,e.id)))continue;
   if(!isWealth(e)){events.set(e.id,e);if(e.type==='world'&&typeof e.key==='string')world.set(e.key,e);continue;}
   let err=wealthShapeError(e);const k=e.wealth_kind,old=records.get(e.key);
   const same=fields=>!old||fields.every(f=>JSON.stringify(old[f])===JSON.stringify(e[f]));
   const transfer=(ref,from,to,amount,currency)=>{
    const t=events.get(ref);return !t||used.has(ref)||t.type!=='money'||t.operation!=='transfer'||t.actor!==from||t.counterparty!==to||t.currency!==currency||t.delta!==-amount?'Missing distinct accepted exact transfer':null;
   };
   if(!err&&k==='estate_case'){
    const prior=caseByDecedent.get(e.decedent);
    if(!same(['actor','decedent','title','authority'])||prior&&prior!==e.record_id||!old&&e.status!=='opened'||old&&!({opened:['administering','disputed'],administering:['disputed','settled'],disputed:['administering'],settled:['closed']}[old.status]||[]).includes(e.status))err='Estate case requires stable authority and lawful progression';
    if(!err&&['settled','closed'].includes(e.status)&&of('bequest').some(x=>x.case_id===e.record_id&&!['distributed','cancelled'].includes(x.status)))err='Outstanding bequests remain';
   }
   if(!err&&k==='beneficiary'){
    const c=get('estate_case',e.case_id),p=beneficiaries.get(key(e.case_id,e.recipient));
    if(!c||c.actor!==e.actor||!['opened','administering','disputed'].includes(c.status)||!same(['actor','case_id','recipient','basis'])||p&&p.record_id!==e.record_id||!old&&e.status!=='named'||old&&!({named:['accepted','declined','disputed'],accepted:['disputed'],disputed:['accepted','declined']}[old.status]||[]).includes(e.status))err='Beneficiary needs recorded designation and consent';
   }
   if(!err&&k==='bequest'){
    const c=get('estate_case',e.case_id),ben=get('beneficiary',e.beneficiary_id),a=key(e.case_id,e.asset_kind,e.asset_ref),prior=bequestsByAsset.get(a);
    if(!c||c.actor!==e.actor||!['administering','disputed'].includes(c.status)||e.status==='distributed'&&c.status!=='administering'||!ben||ben.case_id!==e.case_id||!same(['actor','case_id','beneficiary_id','asset_kind','asset_ref','amount','currency','title'])||prior&&prior!==e.record_id||!old&&e.status!=='proposed'||old&&!({proposed:['distributed','cancelled','disputed'],disputed:['proposed','cancelled']}[old.status]||[]).includes(e.status))err='Bequest needs active case, unique asset allocation and valid transition';
    else if(e.status==='distributed'){
     const t=events.get(e.event_ref);
     if(ben.status!=='accepted'||!t||used.has(e.event_ref))err='Distribution requires accepted beneficiary and distinct event';
     else if(e.asset_kind==='cash')err=transfer(e.event_ref,c.decedent,ben.recipient,e.amount,e.currency);
     else if(e.asset_kind==='item'&&(t.type!=='item'||t.custody_version!==1||t.action!=='transfer'||t.actor!==c.decedent||t.counterparty!==ben.recipient||t.item_id!==e.asset_ref))err='Bequest needs actual accepted item transfer';
     else if(e.asset_kind==='estate'&&(t.player_life_version!==1||t.life_kind!=='estate_sale'||t.status!=='settled'||t.amount!==0||t.actor!==c.decedent||t.buyer!==ben.recipient||t.estate_id!==e.asset_ref))err='Bequest needs settled zero-price estate conveyance';
     else if(e.asset_kind==='investment'&&(t.advanced_version!==1||t.advanced_kind!=='lot_transfer'||t.transfer_kind!=='inheritance'||t.actor!==c.decedent||t.counterparty!==ben.recipient||t.lot_id!==e.asset_ref))err='Bequest needs recorded investment inheritance';
     if(!err)used.add(e.event_ref);
    }
    if(!err)bequestsByAsset.set(a,e.record_id);
   }
   if(!err&&k==='treasury'){
    const h=world.get('player-life:household:'+e.household_id),p=accounts.get(e.account);
    if(!h||h.actor!==e.actor||h.status!=='active'&&e.status==='active'||p&&p!==e.record_id||!same(['actor','household_id','account','currency','title'])||!old&&e.status!=='active'||old&&(old.status!=='active'||e.status!=='closed'))err='Treasury requires active household and unique account';
   }
   if(!err&&k==='treasury_member'){
    const t=get('treasury',e.treasury_id),p=member(e.treasury_id,e.member);
    if(!t||t.status!=='active'||t.actor!==e.actor||e.member===e.actor||!householdMember(t.household_id,e.member)||!same(['actor','treasury_id','member','role'])||p&&p.record_id!==e.record_id||!old&&e.status!=='invited'||old&&!({invited:['accepted','declined'],accepted:['withdrawn']}[old.status]||[]).includes(e.status))err='Treasury member needs household membership and consent';
   }
   if(!err&&k==='treasury_payment'){
    const t=get('treasury',e.treasury_id);
    if(!t||t.status!=='active'||t.currency!==e.currency||!participate(t,e.actor)||!householdMember(t.household_id,e.actor)||e.direction!=='deposit'&&!manage(t,e.actor)||!same(['actor','treasury_id','counterparty','amount','currency','title','direction'])||!old&&e.status!=='proposed'||old&&!({proposed:['approved','cancelled'],approved:['settled','cancelled']}[old.status]||[]).includes(e.status)||e.counterparty===t.account||e.direction==='deposit'&&e.counterparty!==e.actor)err='Treasury payment requires membership, authorization and separate approval';
    else if(e.status==='settled')err=e.direction==='deposit'?transfer(e.transfer_event_id,e.counterparty,t.account,e.amount,e.currency):transfer(e.transfer_event_id,t.account,e.counterparty,e.amount,e.currency);
    if(!err&&e.status==='settled'){used.add(e.transfer_event_id);treasuryTransfers.add(e.transfer_event_id);}
   }
   if(err){warnings.push({scene_id:s.id,event_id:e.id,errors:[err]});continue;}
   const v={...e,source:src(s,e)};records.set(e.key,v);
   if(k==='estate_case')caseByDecedent.set(e.decedent,e.record_id);
   if(k==='beneficiary')beneficiaries.set(key(e.case_id,e.recipient),v);
   if(k==='treasury'){accounts.set(e.account,e.record_id);if(!old)createdAccounts.add(e.account);}
   if(k==='treasury_member')membership.set(key(e.treasury_id,e.member),v);
  }
  for(const e of events.values())if(e.type==='money'&&[e.actor,e.counterparty].some(a=>typeof a==='string'&&a.startsWith('treasury:'))){
   const a=accounts.get(e.actor),t=a&&get('treasury',a);
   const opening=e.operation==='reconcile'&&createdAccounts.has(e.actor)&&t?.currency===e.currency&&e.balance===0&&e.delta===0;
   if(!opening&&!treasuryTransfers.has(e.id))warnings.push({scene_id:s.id,event_id:e.id,errors:['Reserved treasury account requires authorized recorded treasury payment']});
  }
 }
 const compact=r=>{const {type,id,key,wealth_version,wealth_kind,record_id,evidence,...rest}=r;return {id:record_id,kind:wealth_kind,...rest};};
 function view(actor,{offset=0,limit=24}={}){
  if(!complete)return {memory_complete:false};
  const mine=of('beneficiary').filter(r=>r.recipient===actor),cases=of('estate_case').filter(r=>r.actor===actor||mine.some(x=>x.case_id===r.record_id));
  const caseIDs=new Set(cases.map(r=>r.record_id)),benIDs=new Set(mine.map(r=>r.record_id));
  const treasuries=of('treasury').filter(t=>participate(t,actor)&&householdMember(t.household_id,actor)),tIDs=new Set(treasuries.map(t=>t.record_id));
  const list=(k,f)=>page(of(k).filter(f).map(compact),offset,limit);
  return {memory_complete:true,inheritance:{cases:page(cases.map(r=>r.actor===actor?compact(r):{id:r.record_id,title:r.title,decedent:r.decedent,status:r.status,actor:r.actor,source:r.source}),offset,limit),beneficiaries:list('beneficiary',r=>caseIDs.has(r.case_id)&&(r.actor===actor||r.recipient===actor)),bequests:list('bequest',r=>r.actor===actor||benIDs.has(r.beneficiary_id))},treasury:{accounts:page(treasuries.map(t=>{const b=(projection.balances||[]).find(x=>x.actor===t.account&&x.currency===t.currency);return {...compact(t),role:manage(t,actor)?'manager':'contributor',balance:b?.known===true?b.balance:null,known:b?.known===true,recorded_delta:b?.delta??null};}),offset,limit),members:list('treasury_member',r=>tIDs.has(r.treasury_id)||r.member===actor),payments:list('treasury_payment',r=>tIDs.has(r.treasury_id))},policy:'Only recorded legal authority, consent and actual accepted transfer. No assumed death, entitlement, funds or automatic settlement.'};
 }
 function opportunities(){
  const out=[],seen=new Set();
  const add=(kind,r,actor,info)=>{const k=key(kind,actor);if(seen.has(k))return;seen.add(k);out.push({kind,row:{actor,key:r.key,title:r.title||r.record_id,status:r.status,source:r.source},info:{record_key:r.key,timing:'requires_character_choice',wealth_context:info,guidance:'Review the recorded legal/financial matter; never execute or create a transfer automatically.'}});};
  for(const r of of('estate_case'))if(['opened','administering','disputed'].includes(r.status))add('estate_case_review',r,r.actor,{case_id:r.record_id});
  for(const r of of('beneficiary'))if(r.status==='named')add('inheritance_review',r,r.recipient,{case_id:r.case_id,beneficiary_id:r.record_id});
  for(const r of of('treasury_payment'))if(['proposed','approved'].includes(r.status))add('treasury_review',r,r.actor,{treasury_id:r.treasury_id,payment_id:r.record_id});
  return out;
 }
 return {view,opportunities,warnings};
}
export const WEALTH_ACTIONS=Object.freeze({open_estate_case:'Открыть наследственное дело',review_estate_case:'Изучить наследственное дело',respond_inheritance:'Обсудить принятие наследства',settle_bequest:'Исполнить наследственное распоряжение',open_treasury:'Создать семейное казначейство',invite_treasury_member:'Пригласить участника казначейства',respond_treasury_invitation:'Ответить на приглашение',propose_treasury_payment:'Предложить взнос или расход',settle_treasury_payment:'Обсудить или исполнить платёж'});
export const WEALTH_IDS=Object.freeze({review_estate_case:'case_id',respond_inheritance:'beneficiary_id',settle_bequest:'bequest_id',invite_treasury_member:'treasury_id',respond_treasury_invitation:'treasury_member_id',propose_treasury_payment:'treasury_id',settle_treasury_payment:'treasury_payment_id'});
export function wealthActionRows(input,overview){
 const w=overview.wealth;if(!w?.memory_complete)return [];
 const f=WEALTH_IDS[input.action];const table={case_id:w.inheritance.cases,beneficiary_id:w.inheritance.beneficiaries,bequest_id:w.inheritance.bequests,treasury_id:w.treasury.accounts,treasury_member_id:w.treasury.members,treasury_payment_id:w.treasury.payments};
 return table[f]?.records||[];
}
export function validateWealthAction(input,overview){
 const f=WEALTH_IDS[input.action];if(!f)return;
 const r=wealthActionRows(input,overview).find(x=>x.id===input[f]);if(!r)throw Error('Legal or treasury record not visible');
 const a=overview.actor;
 if(input.action==='respond_inheritance'&&(r.recipient!==a||r.status!=='named')||input.action==='settle_bequest'&&(r.actor!==a||r.status!=='proposed')||input.action==='invite_treasury_member'&&(r.actor!==a||r.status!=='active')||input.action==='respond_treasury_invitation'&&(r.member!==a||r.status!=='invited')||input.action==='propose_treasury_payment'&&r.status!=='active'||input.action==='settle_treasury_payment'&&(r.actor!==a||!['proposed','approved'].includes(r.status)))throw Error('Status or authority does not permit action');
}
export const WEALTH_GUIDANCE='НАСЛЕДСТВО И КАЗНАЧЕЙСТВО: отдельный type=world,wealth_version=1,wealth_kind,record_id,key=wealth:<kind>:<ID>,actor,evidence. estate_case: actor уполномоченный исполнитель,decedent,title,authority (основание, не выдумывать смерть),status opened/administering/disputed/settled/closed. beneficiary: actor исполнитель,case_id,recipient,basis,status named/accepted/declined/disputed. bequest: actor исполнитель,case_id,beneficiary_id,asset_kind cash/item/estate/investment,asset_ref уникальный идентификатор части наследства,title,amount/currency для cash,status proposed/distributed/cancelled/disputed. distributed event_ref — отдельное более раннее событие этой сцены: cash точный money transfer от наследодателя получателю; item custody transfer; estate player-life estate_sale settled amount=0; investment advanced lot_transfer inheritance. Не раздавай автоматически, закрывай дело только после завершения распределений. treasury: actor хозяин household,household_id,title,account=treasury:<record_id>,currency,status active/closed. treasury_member: actor хозяин,treasury_id,member,role manager/contributor,status invited/accepted/declined/withdrawn; нужен действующий участник хозяйства. treasury_payment: actor участник,treasury_id,counterparty,amount,currency,title,direction deposit/expense/withdrawal,status proposed/approved/settled/cancelled. Расход/вывод только менеджер, взнос со своего счёта; при settled transfer_event_id точного перевода в/из казначейства, никаких фиктивных денег. Зарезервированный префикс treasury: используется только в этих платежах и начальной сверке с нулём при создании счёта. Согласие и правовое основание должны быть в сцене. Не создавай счета, суммы или полномочия из предположения; реальные деньги и имущество — обычные события.';
