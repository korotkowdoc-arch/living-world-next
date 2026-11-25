/** Branch-local life mechanics. Every state change requires a narrated event.
 * Missing observations are unknown, not invented simulation results. */
const valid=(v,n=140)=>typeof v==='string'&&v.trim()===v&&!!v&&v.length<=n;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
export const NEEDS=Object.freeze({hunger:'Голод',thirst:'Жажда',energy:'Энергия',hygiene:'Гигиена',comfort:'Комфорт',stress:'Напряжение'});
export const NEED_STATES=Object.freeze(['comfortable','noticeable','urgent','critical','unknown']);
export const SLOTS=Object.freeze(['head','face','upper','outer','lower','feet','hands','accessory']);
const LETTER_STATES=['draft','sent','delivered','read','failed'];
const letterTransitions={draft:['draft','sent'],sent:['delivered','failed'],delivered:['read'],read:['read'],failed:[]};
const owns=(items,item,actor)=>items.get(item)?.custody_status==='held'&&items.get(item)?.holder===actor;
export function playerLifeError(e){
 const reserved=typeof e?.key==='string'&&e.key.startsWith('player-life:');
 if(e?.player_life_version===undefined)return reserved?'Ключ жизни требует player_life_version=1.':null;
 if(e.type!=='world'||e.player_life_version!==1||!['need','garment','outfit','letter'].includes(e.life_kind)||!id(e.record_id)||e.key!=='player-life:'+e.life_kind+':'+e.record_id)return 'Invalid player life record identity';
 if(e.life_kind==='need'){
  if(!valid(e.actor)||!Object.hasOwn(NEEDS,e.need)||!NEED_STATES.includes(e.status)||!valid(e.description,600))return 'Invalid observed need';
 }else if(e.life_kind==='garment'){
  if(!valid(e.item_id)||!SLOTS.includes(e.slot)||!valid(e.description,600)||!valid(e.style,140))return 'Invalid garment';
 }else if(e.life_kind==='outfit'){
  if(!valid(e.actor)||!e.slots||typeof e.slots!=='object'||Array.isArray(e.slots)||Object.entries(e.slots).some(([k,v])=>!SLOTS.includes(k)||!valid(v))||new Set(Object.values(e.slots)).size!==Object.keys(e.slots).length)return 'Invalid outfit slots';
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
 const others=[...records.values()].filter(x=>x.player_life_version===1&&x.life_kind===kind&&x.key!==e.key);
 if(kind==='need'){
  if(old&&(old.actor!==e.actor||old.need!==e.need)||others.some(x=>x.actor===e.actor&&x.need===e.need))return 'Duplicate or changed need identity';
 }else if(kind==='garment'){
  if(old&&(old.item_id!==e.item_id||old.slot!==e.slot)||others.some(x=>x.item_id===e.item_id))return 'Duplicate or changed garment identity';
  if(!items.has(e.item_id))return 'Garment requires a recorded item';
 }else if(kind==='outfit'){
  if(old&&old.actor!==e.actor||others.some(x=>x.actor===e.actor))return 'Duplicate or changed outfit identity';
  const garments=new Map([...records.values()].filter(x=>x.player_life_version===1&&x.life_kind==='garment').map(x=>[x.item_id,x]));
  for(const [slot,item] of Object.entries(e.slots))if(garments.get(item)?.slot!==slot||!owns(items,item,e.actor))return 'Outfit requires an owned garment of the correct slot: '+item;
 }else if(!old){
  if(!['draft','sent'].includes(e.status))return 'Letter must be drafted or sent before delivery';
 }else{
  if(old.sender!==e.sender||old.recipient!==e.recipient||old.channel!==e.channel)return 'Changed letter identity';
  if(!letterTransitions[old.status]?.includes(e.status))return 'Invalid letter transition';
  if(old.status!=='draft'&&(old.subject!==e.subject||old.message!==e.message))return 'Sent letter text is immutable';
  if(old.sender_notified===true&&e.sender_notified!==true)return 'Cannot undo sender notification';
 }
 return null;
}
/** Effective outfit is derived from custody history, never silently re-equipped on reacquisition. */
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
export function playerLifeView(projection={},actor){
 const life=(projection.worldFacts||[]).filter(x=>x.player_life_version===1);
 const items=new Map((projection.items||[]).map(x=>[x.item_id,x]));
 const needs=Object.entries(NEEDS).map(([need,label])=>{
  const x=life.find(r=>r.life_kind==='need'&&r.actor===actor&&r.need===need);
  return {need,label,status:x?.status??'unknown',description:x?.description??null,source:x?.source??null};
 });
 const outfit=(projection.effective_outfits||[]).find(x=>x.actor===actor)??null;
 const wardrobe=life.filter(x=>x.life_kind==='garment'&&owns(items,x.item_id,actor)).map(x=>({item_id:x.item_id,name:items.get(x.item_id)?.name??null,slot:x.slot,style:x.style,description:x.description,equipped:outfit?.slots?.[x.slot]===x.item_id,source:x.source}));
 const letters=life.filter(x=>x.life_kind==='letter');
 const incoming=letters.filter(x=>x.recipient===actor&&['delivered','read'].includes(x.status)).map(x=>({id:x.record_id,from:x.sender,subject:x.subject,status:x.status,message:x.status==='read'?x.message:null,source:x.source}));
 const outgoing=letters.filter(x=>x.sender===actor).map(x=>({id:x.record_id,to:x.recipient,subject:x.subject,status:x.status==='draft'?'draft':x.sender_notified?x.status:'sent',message:x.message,source:x.source}));
 const routines=(projection.worldFacts||[]).filter(x=>x.world_record_version===1&&x.record_kind==='routine'&&x.actor===actor&&x.status==='active').map(x=>({id:x.record_id,activity:x.activity,place:x.place,start:x.start,end:x.end,weekdays:x.weekdays,source:x.source}));
 const quick=[['eat','Поесть','hunger'],['drink','Попить','thirst'],['rest','Отдохнуть','energy'],['wash','Привести себя в порядок','hygiene'],['relax','Отвлечься','stress']].map(([action,label,need])=>({action,label,need,status:needs.find(x=>x.need===need)?.status,availability:'requires_scene_check'}));
 quick.sort((a,b)=>['critical','urgent','noticeable','comfortable','unknown'].indexOf(a.status)-['critical','urgent','noticeable','comfortable','unknown'].indexOf(b.status));
 return {needs,wardrobe:page(wardrobe),outfit,letters:{incoming:page(incoming),outgoing:page(outgoing)},routines:page(routines),quick_actions:quick,policy:'Observed needs, not numerical or automatic decay. Clothing is currently held and equipped only if recorded. Incoming unread message content and unconfirmed delivery feedback are hidden. Quick actions are proposals; time, location, resources and outcome require narration.'};
}
export const PLAYER_LIFE_GUIDANCE='ПОВСЕДНЕВНАЯ ЖИЗНЬ: get_game_menu.overview.life или player_life из контекста — наблюдения, не выдуманные проценты. При реальном изменении потребности записывай world event player_life_version=1, life_kind=need, record_id стабильный для пары герой/потребность, key=player-life:need:<ID>, actor, need=hunger/thirst/energy/hygiene/comfort/stress, status=comfortable/noticeable/urgent/critical/unknown, description и точная evidence. Статусы означают степень потребности (для energy — усталость). Отмечай естественные последствия игрового времени только в сыгранной сцене; неизвестные не обнуляй, не заставляй героя автоматически есть/спать. Для одежды: сначала обычный item с подтверждённым владением (или наблюдением), затем world player_life_version=1, life_kind=garment, record_id, key=player-life:garment:<ID>, item_id, slot=head/face/upper/outer/lower/feet/hands/accessory, style, description, evidence. Один предмет — одна запись, обновление стиля возможно после реального изменения. Смена одежды: life_kind=outfit, record_id постоянный для героя, key=player-life:outfit:<ID>, actor, slots объект slot:item_id (полный подтверждённый комплект, пустой объект снимает экипировку), evidence; только подходящие вещи, которые действительно у героя. Передача/потеря/уничтожение автоматически снимает вещь с эффективного комплекта и возврат не надевает её снова. NPC реагируют на видимую одежду, состояние и обстоятельства, не на условный бонус симпатии. Письма: life_kind=letter, record_id, key=player-life:letter:<ID>, sender, recipient, subject, message, channel, status=draft/sent/delivered/read/failed, evidence. Draft или sent — начало; sent->delivered/failed, delivered->read; текст после отправки неизменен. sender_notified=true только когда отправитель действительно узнал о результате. Не выдавай доставку за знание текста: прочтение и отдельные knowledge события подтверждаются сценой. Не раскрывай входящее непрочитанное содержание и неизвестную отправителю доставку. Для своих заданий используй обычные plan start/advance/pause/resume/abandon с устойчивым ID, изменение цели через plan_patch, завершение только с реально совершённым действием. Выбор задачи или быстрых действий — намерение, не результат. Для расписания используй существующий routine. Все изменения проходят обычную проверку выбора, цитаты и запись сцены.';
