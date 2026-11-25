/** Travel, venue menus and service receipts. All costs are integer ledger units.
 * The catalogue and itinerary describe recorded possibilities, not guaranteed outcomes. */
const valid=(v,n=140)=>typeof v==='string'&&v.trim()===v&&!!v&&v.length<=n;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
const money=v=>Number.isSafeInteger(v)&&v>=0;
const kinds=['journey','venue_service','service_visit','discovery'];
export const TRAVEL_KINDS=Object.freeze(kinds);
const modes=['walk','road','rail','air','water','magic','other'];
const categories=['food','drink','lodging','personal_care','shopping','leisure','sport','education','transport','health','other'];
const transitions={planned:['planned','travelling','cancelled'],travelling:['travelling','paused','arrived','cancelled'],paused:['paused','travelling','cancelled'],arrived:[],cancelled:[]};
const visitTransitions={requested:['requested','accepted','cancelled'],accepted:['accepted','completed','cancelled'],completed:[],cancelled:[]};
export function travelServiceError(e){
 if(!kinds.includes(e.life_kind))return null;
 if(e.life_kind==='journey'){
  if(!valid(e.actor)||!valid(e.title,200)||!Array.isArray(e.stops)||e.stops.length<2||e.stops.length>12||e.stops.some((s,i)=>!s||Object.keys(s).length!==2||!valid(s.place)||!modes.includes(s.mode)||i>0&&s.place===e.stops[i-1].place)||!Number.isInteger(e.reached)||e.reached<0||e.reached>=e.stops.length||!Object.hasOwn(transitions,e.status))return 'Invalid journey';
  if(e.status==='planned'&&e.reached!==0||e.status==='arrived'&&e.reached!==e.stops.length-1||['travelling','paused'].includes(e.status)&&e.reached===e.stops.length-1)return 'Invalid journey progress';
 }else if(e.life_kind==='venue_service'){
  if(!valid(e.actor)||!valid(e.place)||!valid(e.title,200)||!categories.includes(e.category)||!money(e.amount)||!valid(e.currency,40)||!Number.isInteger(e.duration_minutes)||e.duration_minutes<1||e.duration_minutes>10080||!['available','unavailable','retired'].includes(e.status))return 'Invalid venue service';
 }else if(e.life_kind==='service_visit'){
  if(!valid(e.actor)||!id(e.service_id)||!valid(e.provider)||e.actor===e.provider||!valid(e.place)||!valid(e.title,200)||!money(e.amount)||!valid(e.currency,40)||!Object.hasOwn(visitTransitions,e.status))return 'Invalid service visit';
  if(e.status==='completed'){
   if(!valid(e.outcome,600)||e.amount>0&&!valid(e.transfer_event_id,180)||e.amount===0&&e.transfer_event_id!=null)return 'Completed service requires outcome and matching payment';
  }else if(e.transfer_event_id!=null)return 'Only completed service can settle payment';
 }else{
  if(!valid(e.actor)||!id(e.service_id)||!valid(e.title,200)||!valid(e.provider)||!valid(e.place)||!categories.includes(e.category)||!money(e.amount)||!valid(e.currency,40)||!Number.isInteger(e.duration_minutes)||e.duration_minutes<1||e.duration_minutes>10080||!['available','unavailable','retired'].includes(e.status))return 'Invalid discovered service quote';
 }
 return null;
}
const same=(a,b,keys)=>keys.every(k=>a[k]===b[k]);
export function travelServiceTransition(records,e){
 const old=records.get(e.key),kind=e.life_kind;
 if(kind==='journey'){
  if(!old){
   if(e.status!=='planned')return 'Journey must be planned first';
  }else{
   if(old.actor!==e.actor||!transitions[old.status]?.includes(e.status))return 'Invalid journey transition';
   if(old.status!=='planned'&&(old.stops.length!==e.stops.length||old.stops.some((x,i)=>!same(x,e.stops[i],['place','mode']))))return 'Cannot rewrite a departed itinerary';
   if(e.reached<old.reached||e.reached>old.reached+1||e.reached!==old.reached&&(old.status!=='travelling'||!['travelling','arrived'].includes(e.status)))return 'Journey stops must be reached in order';
  }
  if(['travelling','paused'].includes(e.status)&&[...records.values()].some(x=>x.life_kind==='journey'&&x.actor===e.actor&&x.key!==e.key&&['travelling','paused'].includes(x.status)))return 'Another journey already active';
 }else if(kind==='venue_service'){
  if(old&&(!same(old,e,['actor','place','category'])||old.status==='retired'))return 'Changed service identity or retired service';
 }else if(kind==='discovery'){
  if(old&&!same(old,e,['actor','service_id'])||[...records.values()].some(x=>x.life_kind==='discovery'&&x.key!==e.key&&x.actor===e.actor&&x.service_id===e.service_id))return 'Duplicate or changed discovery';
  const service=records.get('player-life:venue_service:'+e.service_id);
  if(!service||service.actor!==e.provider||!same(service,e,['title','place','category','amount','currency','duration_minutes','status']))return 'Discovery must match observed service quote';
 }else if(kind==='service_visit'){
  const service=records.get('player-life:venue_service:'+e.service_id);
  if(!old){
   if(!['requested','accepted'].includes(e.status))return 'Service must be requested before completion';
   if(!service||service.status!=='available'||service.actor!==e.provider||!same(service,e,['place','title','amount','currency']))return 'Service request must match available quote';
  }else{
   if(!same(old,e,['actor','provider','service_id','place','title','amount','currency'])||!visitTransitions[old.status]?.includes(e.status))return 'Invalid service visit transition';
   if(e.status==='accepted'&&old.status==='requested'&&(!service||service.status!=='available'||service.actor!==e.provider||!same(service,e,['place','title','amount','currency'])))return 'Service quote changed; request a new visit';
  }
 }
 return null;
}
/** The successful transfer must precede the service receipt in the same scene.
 * Payment occurrence and service receipts share one reference namespace. */
export function journeyArrivalError(e,old,acceptedLocations){
 if(e.player_life_version!==1||e.life_kind!=='journey'||!['travelling','arrived'].includes(e.status))return null;
 if(old&&old.status!=='planned'&&old.reached===e.reached)return null;
 if(acceptedLocations.get(e.actor)!==e.stops[e.reached].place)return 'Departure or arrival needs a preceding location observation in this scene';
 return null;
}
export function servicePaymentError(e,events,i,used){
 if(e.player_life_version!==1||e.life_kind!=='service_visit'||e.status!=='completed'||e.amount===0)return null;
 const ref=e.transfer_event_id,transfer=events.slice(0,i).find(x=>x?.id===ref);
 if(!transfer||transfer.type!=='money'||transfer.operation!=='transfer'||transfer.actor!==e.actor||transfer.counterparty!==e.provider||transfer.currency!==e.currency||transfer.delta!==-e.amount||used.has(ref))return 'Service settlement requires its own preceding exact transfer';
 used.add(ref);return null;
}
const page=rows=>({records:rows.slice(0,40),total:rows.length,omitted:Math.max(0,rows.length-40)});
export function travelServiceView(projection={},actor){
 const rows=(projection.worldFacts||[]).filter(x=>x.player_life_version===1);
 const journeys=rows.filter(x=>x.life_kind==='journey'&&x.actor===actor).map(x=>({id:x.record_id,title:x.title,status:x.status,stops:x.stops,reached:x.reached,next_stop:['arrived','cancelled'].includes(x.status)?null:x.stops[x.reached+1]??null,source:x.source}));
 const balances=new Map((projection.balances||[]).filter(x=>x.actor===actor).map(x=>[x.currency,x]));
 const catalogue=rows.filter(x=>x.life_kind==='discovery'&&x.actor===actor).map(x=>({id:x.service_id,title:x.title,provider:x.provider,place:x.place,category:x.category,amount:x.amount,currency:x.currency,duration_minutes:x.duration_minutes,status:x.status,affordability:!balances.get(x.currency)?.known?'unknown':balances.get(x.currency).balance>=x.amount?'recorded_funds_cover_quote':'insufficient_recorded_funds',source:x.source}));
 const visits=rows.filter(x=>x.life_kind==='service_visit'&&x.actor===actor).map(x=>({id:x.record_id,service_id:x.service_id,title:x.title,provider:x.provider,place:x.place,amount:x.amount,currency:x.currency,status:x.status,outcome:x.outcome??null,source:x.source}));
 const work=(projection.worldFacts||[]).filter(x=>x.dynamics_version===1&&x.dynamics_kind==='employment'&&(x.actor===actor||x.counterparty===actor)).map(x=>({id:x.record_id,title:x.title,actor:x.actor,counterparty:x.counterparty,status:x.status,place:x.place??null,amount:x.amount??null,currency:x.currency??null,pay_period:x.pay_period??null,source:x.source}));
 const businesses=(projection.worldFacts||[]).filter(x=>x.dynamics_version===1&&x.dynamics_kind==='enterprise'&&x.actor===actor).map(x=>({id:x.record_id,title:x.title,place:x.place,status:x.status,business_kind:x.business_kind,source:x.source}));
 return {journeys:page(journeys),catalogue:page(catalogue),visits:page(visits),work:page(work),businesses:page(businesses),policy:'Quotes are last observed, not current availability. Journey progress and completed visits require committed scene evidence; no automatic travel, spending or fulfilment.'};
}
export const TRAVEL_GUIDANCE='ПУТЕШЕСТВИЯ И ЗАВЕДЕНИЯ: life_kind=journey (player_life_version=1, record_id, key=player-life:journey:<ID>, actor,title,stops:[{place,mode}],reached — индекс последней достигнутой точки,status=planned/travelling/paused/arrived/cancelled,evidence). Сначала planned, затем travelling; перед началом и каждой достигнутой точкой в той же сцене сначала фиксируй character.state_patch.location с точным названием остановки. Возобновление без достижения следующей точки не требует нового местоположения. Не пропускай пункты, не переписывай маршрут после отъезда. Сервис заведения life_kind=venue_service, actor — получатель оплаты, place,title,category=food/drink/lodging/personal_care/shopping/leisure/sport/education/transport/health/other, amount в целых единицах текущего денежного реестра, currency,duration_minutes,status=available/unavailable/retired. Для каждого героя, реально узнавшего предложение, life_kind=discovery, actor=герой, service_id, provider,place,title,category,amount,currency,duration_minutes,status — копия увиденной цены и условий; не раскрывай изменения до нового наблюдения. Услуга life_kind=service_visit, actor=клиент,provider,service_id,place,title,amount,currency,status=requested/accepted/completed/cancelled; сначала запрос/принятие, затем реальное обслуживание. Для completed outcome и при положительной цене transfer_event_id на отдельный предшествующий money transfer (тот же клиент, получатель, валюта, точная сумма); для бесплатной услуги перевода нет. Успешная оплата и обслуживание сохраняются в одной сцене, не заменяют потребности/навыки/изменение места: записывай их отдельно. Меню показывает только узнанные предложения и собственные поездки, не подтверждает наличие услуги, денег или согласия NPC. Используй обычные employment, enterprise, routine, activity, stock_operation для профессий, заведений, работы и запасов; не дублируй экономику.';
