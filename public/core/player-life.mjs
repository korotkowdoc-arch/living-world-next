import {COMMUNITY_KINDS,communityError,communityTransition} from './community-life.mjs';
import {CIVIC_KINDS,civicError,civicTransition} from './civic-life.mjs';
import {FAMILY_GOAL_KINDS,familyGoalError,familyGoalTransition} from './family-goals.mjs';
import {EXPENSE_CARE_KINDS,expenseCareError,expenseCareTransition} from './expense-care.mjs';
import {DUTY_CAREER_KINDS,dutyCareerError,dutyCareerTransition} from './duty-career.mjs';
import {HOUSEHOLD_KINDS,householdRecordError,householdTransition} from './households-careers.mjs';
import {CURRICULUM_KINDS,curriculumError,curriculumTransition} from './curriculum-supply.mjs';
import {PREPAID_KINDS,prepaidRecordError,prepaidTransition,visitPrepaidError} from './prepaid-travel.mjs';
import {MARKET_HOME_KINDS,marketHomeError,marketHomeTransition} from './market-home.mjs';
import {PROPERTY_KINDS,propertyRecordError,propertyTransition} from './property-lessons.mjs';
import {SOCIAL_LIFE_KINDS,socialLifeError,socialLifeTransition} from './social-dashboard.mjs';
import {HOME_KINDS,homeRecordError,homeTransition} from './home-systems.mjs';
import {WORK_KINDS,workRecordError,workTransition,visitRecipeError} from './work-systems.mjs';
import {TRAVEL_KINDS,travelServiceError,travelServiceTransition} from './travel-services.mjs';
import {parseStoryDate} from './world-time.mjs';
import {needForecast,playerCalendar,TIME_LIFE_GUIDANCE} from './life-calendar.mjs';
/** Branch-local life mechanics. Every state change requires a narrated event.
 * Missing observations are unknown, not invented simulation results. */
const valid=(v,n=140)=>typeof v==='string'&&v.trim()===v&&!!v&&v.length<=n;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
export const NEEDS=Object.freeze({hunger:'Голод',thirst:'Жажда',energy:'Энергия',hygiene:'Гигиена',comfort:'Комфорт',stress:'Напряжение'});
export const NEED_STATES=Object.freeze(['comfortable','noticeable','urgent','critical','unknown']);
export const SLOTS=Object.freeze(['head','face','upper','outer','lower','feet','hands','accessory']);
const LETTER_STATES=['draft','sent','delivered','read','failed'];
const letterTransitions={draft:['draft','sent'],sent:['delivered','failed'],delivered:['delivered','read'],read:['read'],failed:['failed']};
const owns=(items,item,actor)=>items.get(item)?.custody_status==='held'&&items.get(item)?.holder===actor;
export function playerLifeError(e){
 const reserved=typeof e?.key==='string'&&e.key.startsWith('player-life:');
 if(e?.player_life_version===undefined)return reserved?'Ключ жизни требует player_life_version=1.':null;
 if(e.type!=='world'||e.player_life_version!==1||!['need','garment','outfit','letter','preset','appointment','impression',...TRAVEL_KINDS,...WORK_KINDS,...HOME_KINDS,...SOCIAL_LIFE_KINDS,...PROPERTY_KINDS,...MARKET_HOME_KINDS,...PREPAID_KINDS,...CURRICULUM_KINDS,...HOUSEHOLD_KINDS,...DUTY_CAREER_KINDS,...EXPENSE_CARE_KINDS,...FAMILY_GOAL_KINDS,...CIVIC_KINDS,...COMMUNITY_KINDS].includes(e.life_kind)||!id(e.record_id)||e.key!=='player-life:'+e.life_kind+':'+e.record_id)return 'Invalid player life record identity';
 if(COMMUNITY_KINDS.includes(e.life_kind))return communityError(e);
 if(CIVIC_KINDS.includes(e.life_kind))return civicError(e);
 if(FAMILY_GOAL_KINDS.includes(e.life_kind))return familyGoalError(e);
 if(EXPENSE_CARE_KINDS.includes(e.life_kind))return expenseCareError(e);
 if(DUTY_CAREER_KINDS.includes(e.life_kind))return dutyCareerError(e);
 if(HOUSEHOLD_KINDS.includes(e.life_kind))return householdRecordError(e);
 if(CURRICULUM_KINDS.includes(e.life_kind))return curriculumError(e);
 if(PREPAID_KINDS.includes(e.life_kind))return prepaidRecordError(e);
 if(MARKET_HOME_KINDS.includes(e.life_kind))return marketHomeError(e);
 if(PROPERTY_KINDS.includes(e.life_kind))return propertyRecordError(e);
 if(SOCIAL_LIFE_KINDS.includes(e.life_kind))return socialLifeError(e);
 if(HOME_KINDS.includes(e.life_kind))return homeRecordError(e);
 if(WORK_KINDS.includes(e.life_kind))return workRecordError(e);
 if(TRAVEL_KINDS.includes(e.life_kind))return travelServiceError(e);
 if(e.life_kind==='need'){
  if(!valid(e.actor)||!Object.hasOwn(NEEDS,e.need)||!NEED_STATES.includes(e.status)||!valid(e.description,600))return 'Invalid observed need';
 }else if(e.life_kind==='garment'){
  if(!valid(e.item_id)||!SLOTS.includes(e.slot)||!valid(e.description,600)||!valid(e.style,140))return 'Invalid garment';
 }else if(e.life_kind==='outfit'||e.life_kind==='preset'){
  if(e.life_kind==='preset'&&(!valid(e.title,140)||!['active','removed'].includes(e.status)))return 'Invalid outfit preset';
  if(!valid(e.actor)||!e.slots||typeof e.slots!=='object'||Array.isArray(e.slots)||Object.entries(e.slots).some(([k,v])=>!SLOTS.includes(k)||!valid(v))||new Set(Object.values(e.slots)).size!==Object.keys(e.slots).length)return 'Invalid outfit slots';
 }else if(e.life_kind==='appointment'){
  const a=parseStoryDate(e.starts_at),b=parseStoryDate(e.ends_at);
  if(!valid(e.actor)||!valid(e.title,200)||!valid(e.place)||!Array.isArray(e.participants)||e.participants.length<1||e.participants.length>12||e.participants.some(x=>!valid(x))||new Set(e.participants).size!==e.participants.length||!e.participants.includes(e.actor)||a?.precision!=='minute'||b?.precision!=='minute'||b.order<=a.order||!['proposed','confirmed','completed','cancelled','missed'].includes(e.status))return 'Invalid appointment';
 }else if(e.life_kind==='impression'){
  if(!valid(e.observer)||!valid(e.actor)||e.observer===e.actor||!valid(e.description,600)||!valid(e.basis,600)||!['positive','neutral','negative','mixed','unknown'].includes(e.status)||typeof e.known_to_actor!=='boolean')return 'Invalid observed impression';
 }else{
  if(!valid(e.sender)||!valid(e.recipient)||e.sender===e.recipient||!LETTER_STATES.includes(e.status)||!valid(e.subject,200)||!valid(e.message,5000)||!valid(e.channel,140))return 'Invalid letter';
  if(e.sender_notified!==undefined&&(typeof e.sender_notified!=='boolean'||e.sender_notified&&!['delivered','read','failed'].includes(e.status)))return 'Invalid sender notification';
 }
 return null;
}
export function playerLifeTransitionError(records,items,e){
 if(e.player_life_version!==1)return null;
 const err=playerLifeError(e);if(err)return err;
 const old=records.get(e.key),kind=e.life_kind;
 if(old&&(old.player_life_version!==1||old.life_kind!==kind||old.record_id!==e.record_id))return 'Changed player life identity';
 if(COMMUNITY_KINDS.includes(kind))return communityTransition(records,e);
 if(CIVIC_KINDS.includes(kind))return civicTransition(records,e);
 if(FAMILY_GOAL_KINDS.includes(kind))return familyGoalTransition(records,e);
 if(EXPENSE_CARE_KINDS.includes(kind))return expenseCareTransition(records,e);
 if(DUTY_CAREER_KINDS.includes(kind))return dutyCareerTransition(records,e);
 if(HOUSEHOLD_KINDS.includes(kind))return householdTransition(records,e);
 if(CURRICULUM_KINDS.includes(kind))return curriculumTransition(records,e);
 if(PREPAID_KINDS.includes(kind))return prepaidTransition(records,e);
 if(MARKET_HOME_KINDS.includes(kind))return marketHomeTransition(records,items,e);
 if(PROPERTY_KINDS.includes(kind))return propertyTransition(records,e);
 if(SOCIAL_LIFE_KINDS.includes(kind))return socialLifeTransition(records,e);
 if(HOME_KINDS.includes(kind))return homeTransition(records,e);
 if(WORK_KINDS.includes(kind))return workTransition(records,e);
 if(TRAVEL_KINDS.includes(kind))return travelServiceTransition(records,e)||visitRecipeError(records,e)||visitPrepaidError(records,e);
 const others=[...records.values()].filter(x=>x.player_life_version===1&&x.life_kind===kind&&x.key!==e.key);
 if(kind==='need'){
  if(old&&(old.actor!==e.actor||old.need!==e.need)||others.some(x=>x.actor===e.actor&&x.need===e.need))return 'Duplicate or changed need identity';
 }else if(kind==='garment'){
  if(old&&(old.item_id!==e.item_id||old.slot!==e.slot)||others.some(x=>x.item_id===e.item_id))return 'Duplicate or changed garment identity';
  if(!items.has(e.item_id))return 'Garment requires a recorded item';
 }else if(kind==='outfit'||kind==='preset'){
  if(old&&old.actor!==e.actor||kind==='outfit'&&others.some(x=>x.actor===e.actor))return 'Duplicate or changed outfit identity';
  if(kind==='preset'){
   if(e.status==='removed'){if(!old||old.status==='removed')return 'Missing active preset';return null;}
   if(old?.status==='removed')return 'Removed preset cannot be reused';
   if(others.some(x=>x.actor===e.actor&&x.title===e.title&&x.status==='active'))return 'Duplicate preset title';
  }
  const garments=new Map([...records.values()].filter(x=>x.player_life_version===1&&x.life_kind==='garment').map(x=>[x.item_id,x]));
  for(const [slot,item] of Object.entries(e.slots))if(garments.get(item)?.slot!==slot||!owns(items,item,e.actor))return 'Outfit requires an owned garment of the correct slot: '+item;
 }else if(kind==='appointment'){
  if(!old&&!['proposed','confirmed'].includes(e.status))return 'Appointment must first be proposed or confirmed';
  if(old){
   if(old.actor!==e.actor)return 'Changed appointment organizer';
   const transitions={proposed:['proposed','confirmed','cancelled'],confirmed:['confirmed','completed','cancelled','missed'],completed:[],cancelled:[],missed:[]};
   if(!transitions[old.status]?.includes(e.status))return 'Invalid appointment transition';
   if(['completed','missed'].includes(e.status)&&(old.starts_at!==e.starts_at||old.ends_at!==e.ends_at||old.place!==e.place||JSON.stringify(old.participants)!==JSON.stringify(e.participants)))return 'Cannot rewrite meeting while closing it';
  }
 }else if(kind==='impression'){
  if(old&&(old.actor!==e.actor||old.observer!==e.observer))return 'Changed impression identity';
  if(old?.known_to_actor&&!e.known_to_actor)return 'Cannot erase witnessed impression; create a new observation';
 }else if(!old){
  if(!['draft','sent'].includes(e.status))return 'Letter must be drafted or sent before delivery';
 }else{
  if(old.sender!==e.sender||old.recipient!==e.recipient||old.channel!==e.channel)return 'Changed letter identity';
  if(!letterTransitions[old.status]?.includes(e.status))return 'Invalid letter transition';
  if(old.status!=='draft'&&(old.subject!==e.subject||old.message!==e.message))return 'Sent letter text is immutable';
  if(old.status===e.status&&old.sender_notified===true&&e.sender_notified!==true)return 'Cannot undo sender notification';
 }
 return null;
}
/** Effective outfit is derived from custody history, never silently re-equipped on reacquisition. */
export function projectLifeRecord(old,e,value){
 if(e.player_life_version!==1||e.life_kind!=='letter')return value;
 const known=e.status==='draft'||e.status==='sent'||e.sender_notified===true;
 return {...value,sender_visible_status:known?e.status:old?.sender_visible_status??'sent',sender_visible_source:known?value.source:old?.sender_visible_source??null};
}
export function applyOutfit(outfits,e,source){
 if(e.player_life_version===1&&e.life_kind==='outfit')outfits.set(e.actor,{actor:e.actor,slots:{...e.slots},source});
}
export function removeUnavailableGarment(outfits,items,item){
 for(const [actor,outfit] of outfits){
  if(owns(items,item,actor))continue;
  if(Object.values(outfit.slots).includes(item))outfits.set(actor,{...outfit,slots:Object.fromEntries(Object.entries(outfit.slots).filter(([,v])=>v!==item))});
 }
}
const page=rows=>({records:rows.slice(0,30),total:rows.length,omitted:Math.max(0,rows.length-30)});
export function playerLifeView(projection={},actor,{scenes=[],clock=null,complete=true,includeCalendar=true,offset=0,limit=30}={}){
 const life=(projection.worldFacts||[]).filter(x=>x.player_life_version===1);
 const items=new Map((projection.items||[]).map(x=>[x.item_id,x]));
 const needs=Object.entries(NEEDS).map(([need,label])=>{
  const x=life.find(r=>r.life_kind==='need'&&r.actor===actor&&r.need===need);
  const row={need,label,status:x?.status??'unknown',description:x?.description??null,source:x?.source??null};
  return {...row,forecast:needForecast(row,scenes,clock,{complete})};
 });
 const outfit=(projection.effective_outfits||[]).find(x=>x.actor===actor)??null;
 const wardrobe=life.filter(x=>x.life_kind==='garment'&&owns(items,x.item_id,actor)).map(x=>({item_id:x.item_id,name:items.get(x.item_id)?.name??null,slot:x.slot,style:x.style,description:x.description,equipped:outfit?.slots?.[x.slot]===x.item_id,source:x.source}));
 const presets=life.filter(x=>x.life_kind==='preset'&&x.actor===actor&&x.status==='active').map(x=>({id:x.record_id,title:x.title,slots:x.slots,missing:Object.entries(x.slots).filter(([slot,item])=>!wardrobe.some(g=>g.item_id===item&&g.slot===slot)).map(([slot,item_id])=>({slot,item_id})),source:x.source}));
 const impressions=life.filter(x=>x.life_kind==='impression'&&x.actor===actor&&x.known_to_actor).map(x=>({id:x.record_id,observer:x.observer,description:x.description,basis:x.basis,status:x.status,source:x.source}));
 const letters=life.filter(x=>x.life_kind==='letter');
 const letterPage=rows=>({records:rows.slice(offset,offset+limit),total:rows.length,omitted:Math.max(0,rows.length-offset-limit),next_offset:offset+limit<rows.length?offset+limit:null});
 const incoming=letters.filter(x=>x.recipient===actor&&['delivered','read'].includes(x.status)).map(x=>({id:x.record_id,from:x.sender,subject:x.status==='read'?x.subject:null,status:x.status,message:x.status==='read'?x.message:null,source:x.status==='read'?x.source:null}));
 const outgoing=letters.filter(x=>x.sender===actor).map(x=>({id:x.record_id,to:x.recipient,subject:x.subject,status:x.sender_visible_status??(x.status==='draft'?'draft':'sent'),message:x.message,source:x.sender_visible_source??null}));
 const routines=(projection.worldFacts||[]).filter(x=>x.world_record_version===1&&x.record_kind==='routine'&&x.actor===actor&&x.status==='active').map(x=>({id:x.record_id,activity:x.activity,place:x.place,start:x.start,end:x.end,weekdays:x.weekdays,source:x.source}));
 const quick=[['eat','Поесть','hunger'],['drink','Попить','thirst'],['rest','Отдохнуть','energy'],['wash','Привести себя в порядок','hygiene'],['relax','Отвлечься','stress']].map(([action,label,need])=>({action,label,need,status:needs.find(x=>x.need===need)?.forecast?.estimated_status??needs.find(x=>x.need===need)?.status,availability:'requires_scene_check'}));
 quick.sort((a,b)=>['critical','urgent','noticeable','comfortable','unknown'].indexOf(a.status)-['critical','urgent','noticeable','comfortable','unknown'].indexOf(b.status));
 return {needs,wardrobe:page(wardrobe),outfit,presets:page(presets),impressions:page(impressions),calendar:includeCalendar?playerCalendar(projection,actor,clock??scenes.at(-1)?.world_time):null,letters:{incoming:letterPage(incoming),outgoing:letterPage(outgoing)},routines:page(routines),quick_actions:quick,policy:'Observed needs and separately labelled estimates from fictional time. Clothing is currently held and equipped only if recorded. Incoming unread message content and unconfirmed delivery feedback are hidden. Quick actions are proposals; time, location, resources and outcome require narration.'};
}
export function playerLifeTurnSummary(projection,actor,options={}){
 const v=playerLifeView(projection,actor,{...options,includeCalendar:false});
 return {actor,needs:v.needs.map(x=>({need:x.need,status:x.status,description:x.description?.slice(0,150)??null,source:x.source,forecast:x.forecast})),outfit:v.outfit,visible_impressions:v.impressions.records.slice(-4).map(x=>({...x,description:x.description.slice(0,150),basis:x.basis.slice(0,150)})),wardrobe_count:v.wardrobe.total,unread_letters:(projection.worldFacts||[]).filter(x=>x.player_life_version===1&&x.life_kind==='letter'&&x.recipient===actor&&x.status==='delivered').length,routine_count:v.routines.total,policy:'Consult character state for full life details. No automatic actions.'};
}
export const PLAYER_LIFE_GUIDANCE=TIME_LIFE_GUIDANCE+'\n'+'ПОВСЕДНЕВНАЯ ЖИЗНЬ: get_game_menu.overview.life, get_character_state.life или player_life из контекста — наблюдения, не выдуманные проценты. При реальном изменении потребности записывай world event player_life_version=1, life_kind=need, record_id стабильный для пары герой/потребность, key=player-life:need:<ID>, actor, need=hunger/thirst/energy/hygiene/comfort/stress, status=comfortable/noticeable/urgent/critical/unknown, description и точная evidence. Статусы означают степень потребности (для energy — усталость). Отмечай естественные последствия игрового времени только в сыгранной сцене; неизвестные не обнуляй, не заставляй героя автоматически есть/спать. Для одежды: сначала обычный item с подтверждённым владением (или наблюдением), затем world player_life_version=1, life_kind=garment, record_id, key=player-life:garment:<ID>, item_id, slot=head/face/upper/outer/lower/feet/hands/accessory, style, description, evidence. Один предмет — одна запись, обновление стиля возможно после реального изменения. Смена одежды: life_kind=outfit, record_id постоянный для героя, key=player-life:outfit:<ID>, actor, slots объект slot:item_id (полный подтверждённый комплект, пустой объект снимает экипировку), evidence; только подходящие вещи, которые действительно у героя. Передача/потеря/уничтожение автоматически снимает вещь с эффективного комплекта и возврат не надевает её снова. NPC реагируют на видимую одежду, состояние и обстоятельства, не на условный бонус симпатии. Письма: life_kind=letter, record_id, key=player-life:letter:<ID>, sender, recipient, subject, message, channel, status=draft/sent/delivered/read/failed, evidence. Draft или sent — начало; sent->delivered/failed, delivered->read; повтор delivered/read/failed допустим для подтверждения уведомления; текст после отправки неизменен. sender_notified=true только когда отправитель действительно узнал об этой стадии; прежнее знание доставки не раскрывает последующее прочтение. Не выдавай доставку за знание текста: прочтение и отдельные knowledge события подтверждаются сценой. Не раскрывай тему и содержание непрочитанного письма и неизвестную отправителю доставку. Для своих заданий используй обычные plan start/advance/pause/resume/abandon с устойчивым ID, изменение цели через plan_patch, завершение только с реально совершённым действием. Выбор задачи или быстрых действий — намерение, не результат. Для расписания используй существующий routine. Все изменения проходят обычную проверку выбора, цитаты и запись сцены.';

export const ADVANCED_LIFE_GUIDANCE='КОМПЛЕКТЫ И ВСТРЕЧИ: сохранение комплекта — player_life_version=1, life_kind=preset, record_id, key=player-life:preset:<ID>, actor, title, status=active/removed, slots (как outfit), evidence. Применение комплекта требует наличия всех вещей и отдельного события outfit; не возвращай потерянные вещи автоматически. Встреча — life_kind=appointment, record_id, key=player-life:appointment:<ID>, actor (организатор), participants (участники, включая организатора), title, place, starts_at/ends_at точные игровые даты и часы, status=proposed/confirmed/completed/cancelled/missed, evidence. Не подтверждай согласие NPC за него, не считай встречу завершённой по календарю. Реакция на внешность и репутацию — life_kind=impression, record_id отдельный для наблюдения, key=player-life:impression:<ID>, actor (кого оценивают), observer, description, basis (что реально заметил и почему), status=positive/neutral/negative/mixed/unknown, known_to_actor (была ли реакция доступна герою), evidence. Это восприятие конкретного NPC, не глобальный рейтинг и не автоматическое изменение отношений. Частные реакции не показывай в меню героя. Включай видимые комплекты и физическое состояние в соответствующие сцены, не делай каждого прохожего заинтересованным в герое.';
