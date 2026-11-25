/** Market changes update the actual service catalogue, never a second ledger.
 * Furnishing is a placement of an existing held item, not newly created property. */
const valid=(x,n=140)=>typeof x==='string'&&x.trim()===x&&!!x&&x.length<=n;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const money=x=>Number.isSafeInteger(x)&&x>=0;
const levels=['low','normal','high','unknown'];
const causes=['demand','supply','cost','competition','season','policy','other'];
export const MARKET_HOME_KINDS=['market_adjustment','market_observation','furnishing','room'];
export function marketHomeError(e){
 if(!valid(e.actor))return 'Invalid market or furnishing actor';
 if(e.life_kind==='market_adjustment'){
  if(!id(e.service_id)||!money(e.previous_amount)||!money(e.amount)||e.previous_amount===e.amount||!valid(e.currency,40)||!causes.includes(e.cause)||!valid(e.description,600)||e.status!=='recorded')return 'Invalid price adjustment';
 }else if(e.life_kind==='market_observation'){
  if(!id(e.service_id)||!id(e.discovery_id)||!valid(e.provider)||!valid(e.title,200)||!valid(e.place)||!money(e.amount)||!valid(e.currency,40)||!levels.includes(e.supply)||!levels.includes(e.demand)||!valid(e.description,600)||e.status!=='recorded')return 'Invalid observed market price';
 }else if(e.life_kind==='room'){
  if(!['estate','lease'].includes(e.home_kind)||!id(e.home_id)||e.title_revision!=null&&(e.home_kind!=='estate'||!id(e.title_revision))||!valid(e.area)||!valid(e.label,140)||!valid(e.purpose,140)||!valid(e.description,600)||!['active','retired'].includes(e.status)||['walls','flooring','lighting'].some(k=>e[k]!=null&&!valid(e[k],200)))return 'Invalid recorded room';
 }else if(e.life_kind==='furnishing'){
  if(!valid(e.item_id)||!['estate','lease'].includes(e.home_kind)||!id(e.home_id)||!valid(e.area)||!valid(e.description,600)||!['placed','removed'].includes(e.status))return 'Invalid furnishing placement';
 }
 return null;
}
const get=(records,kind,id)=>records.get('player-life:'+kind+':'+id);
function hasAccess(records,row){
 const home=get(records,row.home_kind,row.home_id);
 return home?.actor===row.actor&&(row.home_kind==='estate'?home.status==='owned':home.status==='active');
}
// A title epoch is required for room observations; a sale does not grant
// knowledge of the previous owner's interior or silently restore old layouts.
const roomAccess=(records,row)=>hasAccess(records,row)&&(row.home_kind!=='estate'||(get(records,'estate',row.home_id)?.last_sale_id??null)===(row.title_revision??null));
const areaKey=x=>x.normalize('NFKC').toLocaleLowerCase('ru');
const holds=(items,row)=>items.get(row.item_id)?.custody_status==='held'&&items.get(row.item_id)?.holder===row.actor;
export const effectiveFurnishing=(records,items,row)=>row.status==='placed'&&hasAccess(records,row)&&holds(items,row);
export function marketHomeTransition(records,items,e){
 const old=records.get(e.key);
 if(e.life_kind==='market_adjustment'){
  const service=get(records,'venue_service',e.service_id);
  if(old||!service||service.actor!==e.actor||service.status==='retired'||service.amount!==e.previous_amount||service.currency!==e.currency)return 'Adjustment must match current service price and provider';
 }else if(e.life_kind==='market_observation'){
  const quote=get(records,'discovery',e.discovery_id);
  if(old||!quote||quote.actor!==e.actor||!['service_id','provider','title','place','amount','currency'].every(k=>quote[k]===e[k]))return 'Observation must match own discovered quote';
 }else if(e.life_kind==='room'){
  if(!roomAccess(records,e))return 'Room observation needs current home access and title revision';
  if(old&&(!['home_kind','home_id','area'].every(k=>old[k]===e[k])||old.status==='retired'))return 'Room identity is fixed; a retired room cannot be rewritten';
  if(!old&&e.status!=='active'||old&&e.status==='retired'&&(old.actor!==e.actor||(old.title_revision??null)!==(e.title_revision??null)))return 'Record current room before retirement';
  if(e.status==='active'&&[...records.values()].some(x=>x.life_kind==='room'&&x.key!==e.key&&x.home_kind===e.home_kind&&x.home_id===e.home_id&&x.status==='active'&&areaKey(x.area)===areaKey(e.area)))return 'Duplicate room area; confirm existing room identity';
 }else if(e.life_kind==='furnishing'){
  if(old&&old.item_id!==e.item_id||[...records.values()].some(x=>x.life_kind==='furnishing'&&x.key!==e.key&&x.item_id===e.item_id))return 'One stable furnishing record per item';
  if(e.status==='placed'){
   if(!hasAccess(records,e)||!holds(items,e))return 'Placement needs own accessible home and held item';
   if(old&&effectiveFurnishing(records,items,old)&&old.actor!==e.actor)return 'Furnishing already placed by another holder';
  }else if(!old||old.status!=='placed'||!['actor','home_kind','home_id','area'].every(k=>old[k]===e[k]))return 'Removal must match existing placement';
 }
 return null;
}
/** Invalidate confirmation when an item or access is lost. Reacquisition does not restore a placement. */
export function invalidateFurnishing(records,items,e,source){
 if(e.type!=='item'&&!['estate_sale','lease'].includes(e.life_kind))return;
 for(const [key,row] of records)if(row.life_kind==='furnishing'&&row.status==='placed'&&(e.type!=='item'||e.item_id===row.item_id)&&!effectiveFurnishing(records,items,row))records.set(key,{...row,status:'unconfirmed',source});
}
export function applyMarketAdjustment(records,e,value){
 if(e.player_life_version!==1||e.life_kind!=='market_adjustment')return;
 const key='player-life:venue_service:'+e.service_id,service=records.get(key);
 records.set(key,{...service,amount:e.amount,evidence:e.evidence,source:value.source,last_adjustment_id:e.record_id});
}
export function marketHomeView(projection={},actor){
 const records=new Map((projection.worldFacts||[]).map(x=>[x.key,x])),items=new Map((projection.items||[]).map(x=>[x.item_id,x]));
 const rows=[...records.values()],page=records=>({records:records.slice(0,40),total:records.length,omitted:Math.max(0,records.length-40)});
 const services=rows.filter(x=>x.life_kind==='venue_service'&&x.actor===actor&&x.status!=='retired').map(x=>({id:x.record_id,title:x.title,place:x.place,amount:x.amount,currency:x.currency,status:x.status,source:x.source}));
 const adjustments=rows.filter(x=>x.life_kind==='market_adjustment'&&x.actor===actor).map(x=>({id:x.record_id,service_id:x.service_id,previous_amount:x.previous_amount,amount:x.amount,currency:x.currency,cause:x.cause,description:x.description,source:x.source}));
 const observations=rows.filter(x=>x.life_kind==='market_observation'&&x.actor===actor).map(x=>({id:x.record_id,service_id:x.service_id,title:x.title,provider:x.provider,place:x.place,amount:x.amount,currency:x.currency,supply:x.supply,demand:x.demand,description:x.description,source:x.source}));
 const furnishing=rows.filter(x=>x.life_kind==='furnishing'&&x.actor===actor&&effectiveFurnishing(records,items,x)).map(x=>({id:x.record_id,item_id:x.item_id,name:items.get(x.item_id)?.name??null,home_kind:x.home_kind,home_id:x.home_id,area:x.area,description:x.description,source:x.source}));
 const roomFurnishings=new Map();for(const f of furnishing){const k=JSON.stringify([f.home_kind,f.home_id,f.area]);if(!roomFurnishings.has(k))roomFurnishings.set(k,[]);roomFurnishings.get(k).push(f);}
 const rooms=rows.filter(r=>r.life_kind==='room'&&r.actor===actor&&r.status==='active'&&roomAccess(records,r)).map(r=>{
  const condition=rows.find(c=>c.area===r.area&&c.actor===actor&&(r.home_kind==='estate'?c.life_kind==='estate_condition'&&c.estate_id===r.home_id:c.life_kind==='home_condition'&&c.lease_id===r.home_id));
  const objects=roomFurnishings.get(JSON.stringify([r.home_kind,r.home_id,r.area]))||[];
  return {id:r.record_id,home_kind:r.home_kind,home_id:r.home_id,title:get(records,r.home_kind,r.home_id)?.title??null,area:r.area,label:r.label,purpose:r.purpose,description:r.description,walls:r.walls??null,flooring:r.flooring??null,lighting:r.lighting??null,condition:condition?{status:condition.status,description:condition.description,source:condition.source}:null,furnishings:page(objects),source:r.source};
 });
 return {rooms:page(rooms),services:page(services),adjustments:page(adjustments.reverse()),observations:page(observations.reverse()),furnishing:page(furnishing),policy:'Prices change only through recorded provider action; customers retain their last discovered price. Placement does not transfer ownership or grant access. Missing data is unknown.'};
}
export const MARKET_HOME_GUIDANCE='РЫНОК И ОБУСТРОЙСТВО: player_life_version=1, key=player-life:<life_kind>:<ID>, record_id,evidence. market_adjustment: actor=поставщик услуги,service_id,previous_amount (текущая цена),amount (новая целая цена),currency,cause=demand/supply/cost/competition/season/policy/other,description,status=recorded. Меняет сам venue_service; не дублируй изменение цены другим событием, не меняй ранее принятые заказы и узнанные предложения. Причина из сыгранных событий, не случайный коэффициент. market_observation: actor=узнавший герой,discovery_id,service_id,provider,title,place,amount,currency из собственной discovery,supply/demand=low/normal/high/unknown,description,status=recorded; история только реально увиденных цен. furnishing: actor,item_id (подтверждённый held),home_kind=estate/lease,home_id,area,description,status=placed/removed. Один стабильный ID на предмет; размещение требует собственного жилья или действующей аренды, не меняет собственность. При потере владения/доступа размещение больше не считается действующим. Покупки через money/item, фактическое размещение отдельным событием. room: actor=текущий владелец/арендатор,home_kind=estate/lease,home_id,title_revision (для estate текущий last_sale_id или null),area=стабильная зона,label,purpose,description,опционально walls/flooring/lighting,status=active/retired. Один активный room на зону; после продажи новый владелец должен подтвердить тот же ID с текущим титулом. Не считай наблюдение ремонтом: изменения состояния через estate_condition/home_condition, затраты через money/stock, предметы через furnishing. Не выдумывай неизвестные комнаты, обстановку и площадь. Изменение назначения или отделки требует сыгранного события.';
