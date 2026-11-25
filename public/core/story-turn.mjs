import {sceneMemoryRecall} from './scene-memory-routing.mjs';
import {communityIndex} from './community-life.mjs';
import {civicIndex} from './civic-life.mjs';
import {operationalIndex} from './operational-life.mjs';
import {civilizationReview,orderTurnCandidates,continuityAnchors} from './civilization-review.mjs';
import {wealthIndex} from './wealth-world.mjs';
import {documentIndex} from './documents-world.mjs';
import {magicIndex} from './magic-world.mjs';
import {advancedIndex} from './advanced-world.mjs';
import {taskAccessible} from './duty-career.mjs';
import {householdAccessible,jobEligibility} from './households-careers.mjs';
import {recordedPlayerActors} from './social-dashboard.mjs';
import {npcInitiativeView,independentSocialOpportunities,recordedHabitContext,recordedMarketOpportunities} from './npc-initiatives.mjs';
import {npcNeedOpportunities,npcContactOpportunities,personalityHistory} from './npc-life.mjs';
import {worldDepthIndex} from './world-depth.mjs';
import {buildLongLifeIndex,backgroundTimeReview} from './npc-long-life.mjs';
import {planTimeAdvance} from './life-calendar.mjs';
import {playerLifeTurnSummary} from './player-life.mjs';
/** A unified turn preparation view. All candidates are read-only. The narrator
 * chooses plausible developments, writes them in the scene and commits evidence.
 * Nothing advances merely because the user opens a context. */
import {parseStoryDate} from './world-time.mjs';
import {routineWindow} from './living-world.mjs';
import {characterAge} from './character-state.mjs';
import {familyDutyWindow,paymentScheduleWindow} from './world-dynamics.mjs';
import {storyDrivers} from './story-drivers.mjs';
import {menuPreferences} from './game-menu.mjs';
const text=v=>typeof v==='string'?v.trim():'';
const closed=new Set(['completed','complete','abandoned','resolved','ended','cancelled','canceled','decided','closed','fulfilled','done']);
const clip=v=>typeof v==='string'?v.slice(0,300):null;
const source=x=>x?.source||null;
export function prepareStoryTurn(scenes=[],projection={},directives=[],opts={}){
 const actors=Array.isArray(opts.actors)?opts.actors:[];
 if(actors.length>8||actors.some(a=>!text(a)||a.length>140))throw Error('Укажи до восьми имён персонажей.');
 const focus=new Set(actors.map(text)),place=text(opts.place);
 if(place.length>140)throw Error('Слишком длинное название места.');
 const limit=Math.max(1,Math.min(30,Math.floor(Number(opts.limit)||16)));
 const offset=opts.offset??0;if(!Number.isSafeInteger(offset)||offset<0||offset>50000)throw Error('Неверная страница кандидатов.');
 const scope=opts.scope??'all';if(!['all','focus','background'].includes(scope))throw Error('Неверная область кандидатов.');
 const last=scenes.at(-1),clock=parseStoryDate(last?.world_time);
 const proposed=opts.target_time==null?null:parseStoryDate(opts.target_time);
 if(opts.target_time!=null&&!proposed)throw Error('Нужна точная игровая дата, не реальное время.');
 const comparable=clock&&proposed&&(clock.precision===proposed.precision||clock.day!==proposed.day);
 if(comparable&&proposed.order<clock.order)throw Error('Для возврата в прошлое используй альтернативную ветку, а не продвижение времени.');
 const anchor=proposed||clock;
 const interval=comparable?proposed.order-clock.order:null;
 const preferences=menuPreferences(directives,opts.branchId);
 const records=projection.worldFacts||[],dutyOccurrences=new Map(),paymentOccurrences=new Map();
 const pendingActor=records.find(x=>x.dynamics_kind==='player_choice'&&x.status==='pending')?.actor??null;
 const recordedPlayers=recordedPlayerActors(projection);
 const protectedActors=[...new Set([pendingActor,...recordedPlayers].filter(Boolean))];
 if(!protectedActors.length)protectedActors.push(...focus);
 const timeAdvance=proposed?.precision==='minute'&&clock?.precision==='minute'&&proposed.order>clock.order&&focus.size===1?planTimeAdvance(scenes,projection,[...focus][0],proposed.literal,{complete:opts.complete!==false,pace:preferences.settings.pace,pending:!!pendingActor}):null;
 const segmentLimit=backgroundTimeReview([],{clock:clock?.literal,target:proposed?.literal,segmentUntil:timeAdvance?.proposed_until,protectedActors,complete:opts.complete!==false,pace:preferences.settings.pace,pending:!!pendingActor});
 const segmentAnchor=parseStoryDate(segmentLimit?.segment_until)||clock;
 const wealth=wealthIndex(scenes,projection,{complete:opts.complete!==false});
 const documents=documentIndex(scenes,projection,{complete:opts.complete!==false});
 const magic=magicIndex(scenes,projection,{complete:opts.complete!==false});
 const advanced=advancedIndex(scenes,projection,{complete:opts.complete!==false});
 const depth=worldDepthIndex(scenes,projection,{complete:opts.complete!==false});
 const longLife=buildLongLifeIndex(scenes,projection,{complete:opts.complete!==false});
 const householdRecords=new Map(records.map(x=>[x.key,x]));
 for(const r of records)if(r.dynamics_kind==='payment_occurrence'&&r.schedule_id){if(!paymentOccurrences.has(r.schedule_id))paymentOccurrences.set(r.schedule_id,[]);paymentOccurrences.get(r.schedule_id).push(r);}
 for(const r of records)if(r.dynamics_kind==='family_event'&&r.duty_id){if(!dutyOccurrences.has(r.duty_id))dutyOccurrences.set(r.duty_id,[]);dutyOccurrences.get(r.duty_id).push(r);}
 const positions=new Map(scenes.map((s,i)=>[s.id,i]));
 const placeRecords=new Map(records.filter(x=>x.world_record_version===1&&x.record_kind==='place').map(x=>[x.name,x]));
 const location=new Map((projection.people||[]).map(x=>[x.name,x.state_fields?.find(y=>y.field==='location')]));
 const byKind=new Map(),all=[];
 // Multiple records may use the same place name. Do not select access arbitrarily.
 const namedPlaces=new Map();
 for(const r of records)if(r.world_record_version===1&&r.record_kind==='place'){
  if(!namedPlaces.has(r.name))namedPlaces.set(r.name,[]);namedPlaces.get(r.name).push(r);
 }
 const stockByKey=new Map((projection.stock||[]).map(s=>[JSON.stringify([s.holder,s.product_id,s.unit]),s]));
 const recipeById=new Map(records.filter(r=>r.life_kind==='service_recipe').map(r=>[r.record_id,r]));
 const activeRecipeByService=new Map(records.filter(r=>r.life_kind==='service_recipe'&&r.status==='active').map(r=>[r.service_id,r]));
 const enterpriseById=new Map(records.filter(r=>r.dynamics_kind==='enterprise').map(r=>[r.record_id,r]));
 const balancesByActor=new Map((projection.balances||[]).map(b=>[JSON.stringify([b.actor,b.currency]),b]));
 const itemsById=new Map((projection.items||[]).map(i=>[i.item_id,i]));
 const currentRoutines=new Map();
 for(const r of records)if(r.world_record_version===1&&r.record_kind==='routine'&&routineWindow(r,anchor)==='scheduled_window_not_actual_presence'){
  if(!currentRoutines.has(r.actor))currentRoutines.set(r.actor,[]);currentRoutines.get(r.actor).push(r);
 }
 function candidateChecks(row,participants,kind){
  const checks=[];
  if(kind==='employer_response'&&row.status==='offered')checks.push({kind:'candidate_qualification_requires_review',policy:'Check the recorded applicant and job requirements before any decision.'});
  if(kind==='consequence_opportunity')checks.push({kind:'consequence_awareness_requires_review',policy:'Verify the participant’s own knowledge before narrating a response; do not infer guilt or awareness.'});
  if(kind==='agreement_party')checks.push({kind:'agreement_terms_require_review',policy:'Retrieve the original agreement and each party’s resources before a settlement.'});
  if(row.status==='paused')checks.push({kind:'paused_intention',source:source(row),policy:'Need a narrated reason to resume.'});
  if(row.obstacle)checks.push({kind:'recorded_obstacle',description:clip(row.obstacle),source:source(row)});
  if(row.place){
   const places=namedPlaces.get(row.place)||[];
   if(places.length>1)checks.push({kind:'ambiguous_place',place:row.place,records:places.slice(0,3).map(x=>({key:x.key,status:x.status,source:source(x)}))});
   else if(!places.length)checks.push({kind:'place_access_unknown',place:row.place});
   else if(['closed','restricted','damaged','destroyed'].includes(places[0].status))checks.push({kind:'recorded_place_constraint',place:row.place,status:places[0].status,access:clip(places[0].access),source:source(places[0])});
   for(const actor of participants){
    const known=location.get(actor);
    if(known?.value&&known.value!==row.place)checks.push({kind:'travel_requires_story',actor,from:known.value,to:row.place,source:source(known)});
    const overlaps=(currentRoutines.get(actor)||[]).filter(r=>r.key!==row.key&&r.place!==row.place);
    if(overlaps.length)checks.push({kind:'competing_schedule',actor,other_places:[...new Set(overlaps.map(r=>r.place))].slice(0,3),sources:overlaps.slice(0,3).map(source),policy:'Possible scheduling conflict, not proof of actual presence.'});
   }
  }
  if(kind==='expense_share'&&row.status==='accepted'){const b=balancesByActor.get(JSON.stringify([row.actor,row.currency]));checks.push({kind:b?.known?(b.balance<row.amount?'insufficient_recorded_funds':'recorded_funds_cover_price'):'funds_unknown',actor:row.actor,amount:row.amount,currency:row.currency,balance:b?.known?b.balance:null,source:source(b)});}
  if(kind==='employment'&&row.status==='offered'){const eligibility=jobEligibility(new Map(records.map(x=>[x.key,x])),row);if(eligibility.status==='not_confirmed')checks.push({kind:'qualification_unconfirmed',missing:eligibility.missing,source:eligibility.source});}
  if(['supply_buyer','supply_supplier'].includes(kind)){
   const supplier=kind==='supply_supplier'?row.actor:row.counterparty,buyer=kind==='supply_buyer'?row.actor:row.counterparty;
   const b=balancesByActor.get(JSON.stringify([buyer,row.currency]));checks.push({kind:b?.known?(b.balance<row.amount?'insufficient_recorded_funds':'recorded_funds_cover_price'):'funds_unknown',actor:buyer,amount:row.amount,currency:row.currency,balance:b?.known?b.balance:null,source:source(b)});
   for(const l of row.stock_lines){const s=stockByKey.get(JSON.stringify([supplier,l.product_id,l.unit]));checks.push({kind:!s?.known?'stock_unknown':s.quantity<l.quantity?'stock_insufficient':'stock_available',product_id:l.product_id,unit:l.unit,required:l.quantity,quantity:s?.known?s.quantity:null,source:source(s)});}
  }
  if(kind==='service_provider'||kind==='market_review'){
   const recipe=kind==='market_review'?activeRecipeByService.get(row.record_id):recipeById.get(row.recipe_id);
   for(const l of recipe?.stock_lines||[]){const s=stockByKey.get(JSON.stringify([row.actor,l.product_id,l.unit]));checks.push({kind:!s?.known?'stock_unknown':s.quantity< -l.quantity?'stock_insufficient':'stock_available',product_id:l.product_id,unit:l.unit,required:-l.quantity,quantity:s?.known?s.quantity:null,source:source(s)});}
  }
  if(row.dynamics_kind==='production_order'){
   const enterprise=enterpriseById.get(row.enterprise_id);if(enterprise?.status!=='operating')checks.push({kind:'enterprise_not_operating',status:enterprise?.status||'unknown',source:source(enterprise)});
   for(const l of row.stock_lines||[])if(l.quantity<0){const s=stockByKey.get(JSON.stringify([row.actor,l.product_id,l.unit]));checks.push({kind:!s?.known?'stock_unknown':s.quantity< -l.quantity?'stock_insufficient':'stock_available',product_id:l.product_id,unit:l.unit,required:-l.quantity,quantity:s?.known?s.quantity:null,source:source(s)});}
  }
  if(row.dynamics_kind==='market_offer'||row.dynamics_kind==='economic_agreement'||row.dynamics_kind==='payment_schedule'){
   const payer=row.dynamics_kind==='market_offer'?row.counterparty:row.actor;
   if(payer&&row.amount!=null){const b=balancesByActor.get(JSON.stringify([payer,row.currency]));checks.push({kind:b?.known?(b.balance<row.amount?'insufficient_recorded_funds':'recorded_funds_cover_price'):'funds_unknown',actor:payer,amount:row.amount,currency:row.currency,balance:b?.known?b.balance:null,source:source(b)});}
   if(row.dynamics_kind==='market_offer'&&row.item_id){const item=itemsById.get(row.item_id);if(item?.custody_status!=='held'||item.holder!==row.actor)checks.push({kind:'offer_custody_unconfirmed',actor:row.actor,item_id:row.item_id,holder:item?.holder||null,status:item?.custody_status||'unknown',source:source(item)});}
  }
  if(!anchor&&['routine','family_duty','activity','life_transition'].includes(kind))checks.push({kind:'clock_unknown'});
  return {checks:checks.slice(0,8),checks_omitted:Math.max(0,checks.length-8)};
 }
 function add(kind,row,info={}){
  const participants=[...new Set([row.actor,row.counterparty,...(Array.isArray(row.actors)?row.actors:[])].filter(Boolean))];
  const relevant=participants.some(x=>focus.has(x))||!!place&&row.place===place;
  const where=row.place&&namedPlaces.get(row.place)?.length===1?placeRecords.get(row.place):null;
  const candidate={kind,key:row.key||row.plan_id||row.commitment_id||row.id||null,actors:participants,title:clip(row.title||row.name||row.goal||row.activity||row.description||row.evidence),
   status:row.status||'unknown',source:source(row),place:row.place||null,
   location_status:where?.status||null,location_source:source(where),focus_match:relevant,
   next_step:clip(row.next_step),obstacle:clip(row.obstacle),...info,
   review_at:info.first_due_on??info.starts_at??row.starts_at??row.due_at??row.deadline??row.due??row.scheduled_on??null,...candidateChecks(row,participants,kind),certainty:'candidate_only_not_performed'};
  all.push(candidate);if(!byKind.has(kind))byKind.set(kind,[]);byKind.get(kind).push(candidate);
 }
 const timing=row=>{
  const due=parseStoryDate(row.due_at||row.deadline||row.due||row.scheduled_on);
  if(!due||!anchor)return 'unknown';
  if(due.precision!==anchor.precision&&due.day===anchor.day)return 'same_day_uncertain';
  return due.order<=anchor.order?'reached_requires_story':'future';
 };
 for(const p of projection.plans||[])if(['active','paused'].includes(p.status))add('intention',p,{timing:timing(p)});
 for(const p of projection.obligations||[])if(!closed.has(text(p.status)))add('obligation',p,{timing:timing(p)});
 for(const r of records){
  if(r.world_record_version===1&&r.record_kind==='routine'&&r.status==='active'&&anchor?.precision==='minute'){
   const atTarget=routineWindow(r,anchor);
   const atStart=clock?.precision==='minute'?routineWindow(r,clock):'clock_unknown';
   // A routine may begin and end during a time jump. Evaluate actual weekly
   // windows without iterating once per minute. Bound examination to one week.
   let intersects=atTarget==='scheduled_window_not_actual_presence'||atStart==='scheduled_window_not_actual_presence';
   if(!intersects&&comparable&&interval>0&&clock.precision==='minute'&&anchor.precision==='minute'){
    const startDay=Math.floor(clock.order/1440),endDay=Math.floor(anchor.order/1440);
    const start=Number(r.start.slice(0,2))*60+Number(r.start.slice(3)),end=Number(r.end.slice(0,2))*60+Number(r.end.slice(3));
    for(let d=startDay-1;d<=Math.min(endDay,startDay+7);d++){
     const weekday=new Date(d*86400000).getUTCDay()||7;
     if(r.weekdays.includes(weekday)&&d*1440+start<=anchor.order&&d*1440+end+(end<start?1440:0)>clock.order){intersects=true;break;}
    }
   }
   if(intersects)add('routine',r,{timing:'scheduled_window_not_presence',last_known_location:location.get(r.actor)?.value||null});
  }
  if(r.social_record_version===1&&r.social_kind==='thread'&&['open','paused'].includes(r.status))add('thread',r);
  if(r.activity_version===1&&r.activity_kind==='activity'&&['planned','in_progress'].includes(r.status))add('activity',r,{timing:timing(r)});
  if(r.consequence_version===1&&r.status!=='resolved')add('consequence',r);
  if(r.growth_version===1&&r.growth_kind==='project'&&['planned','active','paused'].includes(r.status))add('project',r,{timing:timing(r)});
  if(r.dynamics_version===1){
   if(r.dynamics_kind==='family_duty'){const window=familyDutyWindow(r,clock,anchor,dutyOccurrences.get(r.record_id)||[]);if(window&&!(window.pending_occurrences===1&&records.some(x=>x.life_kind==='household_task'&&x.duty_id===r.record_id&&x.scheduled_on===window.first_due_on&&['proposed','accepted'].includes(x.status)&&taskAccessible(householdRecords,x))))add('family_duty',r,{family_kind:r.family_kind,timing:'scheduled_window_not_presence',...window});}
   if(r.dynamics_kind==='production_order'&&['planned','ongoing'].includes(r.status))add('production_order',r,{enterprise_id:r.enterprise_id,stock_lines:r.stock_lines,timing:timing(r)});
   if(r.dynamics_kind==='enterprise'&&['planned','operating','suspended'].includes(r.status))add('enterprise',r,{business_kind:r.business_kind,timing:timing(r)});
   if(r.dynamics_kind==='payment_schedule'){const window=paymentScheduleWindow(r,anchor,paymentOccurrences.get(r.record_id)||[]);if(window)add('payment_schedule',r,{...window,amount:r.amount,currency:r.currency,payment_kind:r.payment_kind,timing:'reached_requires_story'});}
   if(r.dynamics_kind==='employment'&&['offered','active','suspended'].includes(r.status))add('employment',r,{amount:r.amount,currency:r.currency,pay_period:r.pay_period,timing:timing(r)});
   if(r.dynamics_kind==='market_offer'&&['available','reserved'].includes(r.status))add('market_offer',r,{offer_kind:r.offer_kind,amount:r.amount,currency:r.currency,item_id:r.item_id,timing:timing(r)});
   if(r.dynamics_kind==='economic_agreement'&&['proposed','active','disputed'].includes(r.status))add('economic_agreement',r,{agreement_kind:r.agreement_kind,amount:r.amount,currency:r.currency,timing:timing(r)});
   if(r.dynamics_kind==='life_transition'&&!closed.has(r.status))add('life_transition',r,{transition_kind:r.transition_kind,timing:timing(r)});
   if(r.dynamics_kind==='family_event'&&!closed.has(r.status))add('family_event',r,{family_kind:r.family_kind,timing:timing(r)});
   if(r.dynamics_kind==='contest'&&!closed.has(r.status))add('contest',r,{resource:clip(r.resource),timing:timing(r)});
   if(r.dynamics_kind==='institution'&&!closed.has(r.status))add('institution',r,{group_id:r.group_id});
   if(r.dynamics_kind==='development'&&!closed.has(r.status))add('development',r,{timing:timing(r)});
   if(r.dynamics_kind==='bond'&&r.status==='strained')add('strained_bond',r,{bond_type:r.bond_type});
   else if(r.dynamics_kind==='bond'&&['active','estranged'].includes(r.status)&&['family','romantic','marriage','parenthood','cohabitation'].includes(r.bond_type)&&(focus.has(r.actor)||focus.has(r.counterparty)))add('personal_bond',r,{bond_type:r.bond_type});
  }
 }
 const openPlanGoals=new Map();
 for(const p of projection.plans||[])if(['active','paused'].includes(p.status)){
  if(!openPlanGoals.has(p.actor))openPlanGoals.set(p.actor,new Set());openPlanGoals.get(p.actor).add(text(p.goal));
 }
 const habitContext=recordedHabitContext(records,scenes,clock?.literal);
 const goalFields=new Set(['personal_goal','family_goal','career_goal']);
 const structuredHabitActors=new Set(records.filter(r=>r.activity_version===1&&r.activity_kind==='habit').map(r=>r.actor));
 for(const person of projection.people||[]){
  for(const field of person.state_fields||[]){
   if(field.field==='habit'&&text(field.value)&&field.source?.scene_id&&!structuredHabitActors.has(person.name)&&!habitContext(person.name,field.value)?.matching_active){
    add('habit_opportunity',{actor:person.name,key:JSON.stringify([person.name,'character_habit']),title:field.value,status:'recorded_habit',source:field.source},{timing:'frequency_not_a_schedule',habit_history:habitContext(person.name,field.value),guidance:'Observed personal habit, not a schedule or a performed event.'});
   }
   if(!goalFields.has(field.field)||!text(field.value)||openPlanGoals.get(person.name)?.has(text(field.value)))continue;
   add('goal_opportunity',{actor:person.name,key:JSON.stringify([person.name,field.field]),title:field.value,status:'recorded_goal',source:field.source},{goal_field:field.field,timing:'requires_character_choice',guidance:'Consider whether the recorded goal warrants a new concrete plan or independent action; do not assume progress or invent a goal.'});
  }
 }
 // A recorded active habit can motivate leisure without assuming that it is due today.
 for(const r of records)if(r.player_life_version===1&&r.life_kind==='invitation'&&r.status==='sent')add('invitation',{...r,actor:r.recipient,counterparty:r.actor},{timing:'requires_character_choice',invitation_id:r.record_id,starts_at:r.starts_at,ends_at:r.ends_at});
 for(const r of records)if(r.player_life_version===1&&r.life_kind==='health_episode'&&r.status!=='resolved')add('health_episode',r,{timing:'requires_character_choice',severity:r.severity});
 for(const r of records)if(r.player_life_version===1&&r.life_kind==='lesson'&&r.status==='scheduled'){const t=parseStoryDate(r.starts_at);add('lesson',{...r,counterparty:r.teacher},{starts_at:r.starts_at,ends_at:r.ends_at,timing:t&&anchor&&t.order<=anchor.order?'reached_requires_story':'future'});}
 for(const r of records)if(r.player_life_version===1&&r.life_kind==='assignment'&&r.status==='assigned')add('assignment',r,{timing:timing(r)});
 for(const r of records)if(r.player_life_version===1&&r.life_kind==='estate_sale'&&['offered','accepted'].includes(r.status)&&records.some(x=>x.life_kind==='estate'&&x.record_id===r.estate_id&&x.actor===r.actor&&(x.last_sale_id??null)===(r.title_revision??null)))add('estate_sale',{...r,counterparty:r.buyer},{amount:r.amount,currency:r.currency,timing:'requires_character_choice'});
 for(const r of records)if(r.player_life_version===1){
  if(r.life_kind==='shared_goal_member'&&r.status==='invited'){const g=householdRecords.get('player-life:shared_goal:'+r.goal_id);if(g&&['proposed','active'].includes(g.status))add('shared_goal_invitation',{...r,title:g.title,counterparty:g.actor},{timing:'requires_character_choice',goal_id:g.record_id,membership_id:r.record_id});}
  if(r.life_kind==='shared_goal'&&r.status==='active'){
   const members=records.filter(m=>m.life_kind==='shared_goal_member'&&m.goal_id===r.record_id&&m.status==='accepted');
   const pending=r.steps.filter(s=>!records.some(m=>m.life_kind==='shared_goal_step'&&m.goal_id===r.record_id&&m.step_id===s.id));
   if(members.length)for(const participant of [r.actor,...members.map(m=>m.actor)])add('shared_goal',{...r,actor:participant,counterparty:participant===r.actor?members[0].actor:r.actor},{timing:timing(r),goal_id:r.record_id,pending_steps:pending.slice(0,4),organizer:r.actor});
  }
  if(r.life_kind==='expense_share'&&['proposed','accepted'].includes(r.status))add('expense_share',{...r,counterparty:r.host},{timing:timing(r),share_id:r.record_id,amount:r.amount,currency:r.currency});
  if(r.life_kind==='care_plan'&&['proposed','accepted'].includes(r.status)){
   add('care_plan',{...r,counterparty:r.supporter},{timing:timing(r),care_plan_id:r.record_id});
   if(r.supporter)add('care_support',{...r,actor:r.supporter,counterparty:r.actor},{timing:timing(r),care_plan_id:r.record_id,supporter_action_only:true});
  }
  if(r.life_kind==='household_task'&&['proposed','accepted'].includes(r.status)&&taskAccessible(householdRecords,r))add('household_task',{...r,counterparty:r.host},{timing:timing({...r,due_at:r.scheduled_on}),household_task_id:r.record_id});
  if(r.life_kind==='career_change'&&r.status==='proposed')add('career_change',r,{timing:'requires_character_choice',career_change_id:r.record_id});
  if(r.life_kind==='consequence_response'&&r.status==='planned')add('consequence_response',r,{timing:timing(r),response_id:r.record_id,next_step:clip(r.action_description)});
 }
 for(const r of records)if(r.player_life_version===1&&r.life_kind==='household_member'&&r.status==='invited'&&householdAccessible(householdRecords,householdRecords.get('player-life:household:'+r.household_id)))add('household_invitation',{...r,counterparty:r.host,title:'Household invitation'},{timing:'requires_character_choice',household_id:r.household_id,member_id:r.record_id});
 for(const r of records)if(r.player_life_version===1&&r.life_kind==='supply_contract'&&['proposed','active','disputed'].includes(r.status)){
  add('supply_buyer',{...r,counterparty:r.supplier},{timing:timing(r),contract_id:r.record_id,stock_lines:r.stock_lines,amount:r.amount,currency:r.currency});
  add('supply_supplier',{...r,actor:r.supplier,counterparty:r.actor},{timing:timing(r),contract_id:r.record_id,stock_lines:r.stock_lines,amount:r.amount,currency:r.currency});
 }
 for(const r of records)if(r.player_life_version===1&&r.life_kind==='assessment'&&r.status==='scheduled'){const t=parseStoryDate(r.starts_at);add('assessment',r,{starts_at:r.starts_at,ends_at:r.ends_at,timing:t&&anchor&&t.order<=anchor.order?'reached_requires_story':'future'});}
 for(const r of records)if(r.player_life_version===1&&r.life_kind==='home_condition'&&['damaged','unsafe'].includes(r.status))add('home_condition',{...r,title:r.area},{timing:'requires_character_choice'});
 for(const r of records)if(r.player_life_version===1&&r.life_kind==='work_shift'&&['scheduled','working'].includes(r.status)){const start=parseStoryDate(r.starts_at);add('work_shift',{...r,counterparty:r.employer},{starts_at:r.starts_at,ends_at:r.ends_at,timing:r.status==='working'||start&&anchor&&start.order<=anchor.order?'reached_requires_story':'future'});}
 for(const r of records)if(r.player_life_version===1&&r.life_kind==='journey'&&['travelling','planned','paused'].includes(r.status))add('journey',r,{next_stop:r.stops[r.reached+1]??null,reached:r.reached,timing:'requires_character_choice'});
 for(const r of records)if(r.player_life_version===1&&r.life_kind==='service_visit'&&['requested','accepted'].includes(r.status)){
  add('service_visit',{...r,counterparty:r.provider},{amount:r.amount,currency:r.currency,timing:'requires_character_choice'});
  add('service_provider',{...r,actor:r.provider,counterparty:r.actor},{amount:r.amount,currency:r.currency,timing:'requires_character_choice',service_visit_id:r.record_id,provider_action_only:true});
 }
 for(const r of records)if(r.player_life_version===1&&r.life_kind==='appointment'&&r.status==='confirmed'){
  const at=parseStoryDate(r.starts_at);
  const due=!!at&&!!anchor&&(anchor.precision==='minute'?at.order<=anchor.order:at.day<anchor.day);
  add('appointment',{...r,actors:r.participants},{timing:due?'reached_requires_story':'future',starts_at:r.starts_at,ends_at:r.ends_at,policy:'Confirmed meeting requires scene evidence for attendance or outcome.'});
 }
 for(const r of records)if(r.activity_version===1&&r.activity_kind==='habit'&&r.status==='active'){
  const history=habitContext(r.actor,r.name);
  if(!history?.matching_active)add('habit_opportunity',r,{timing:'frequency_not_a_schedule',frequency:clip(r.frequency),habit_history:history,guidance:'Optional established tendency, not a scheduled or completed action.'});
 }
 // Shared circumstances offer interaction without asserting a meeting or shared knowledge.
 // Aggregate by place/group instead of generating quadratic pairs.
 const byPlace=new Map(),groups=new Map(),members=new Map();
 for(const [actor,routines] of currentRoutines)for(const r of routines){
  if(!byPlace.has(r.place))byPlace.set(r.place,new Map());
  const at=byPlace.get(r.place);if(!at.has(actor))at.set(actor,r);
 }
 for(const [name,at] of byPlace)if(at.size>=2){
  const rows=[...at.values()].sort((a,b)=>Number(focus.has(b.actor))-Number(focus.has(a.actor)));
  add('shared_schedule',{key:JSON.stringify(['shared_schedule',name]),title:'Совпадение распорядка: '+name,place:name,actors:rows.slice(0,12).map(r=>r.actor),status:'opportunity',source:rows[0].source},{timing:'scheduled_window_not_presence',participants_omitted:rows.length-12>0?rows.length-12:0,basis:rows.slice(0,12).map(r=>({actor:r.actor,key:r.key,source:source(r)})),guidance:'Participants may meet or miss each other. No established presence, conversation or knowledge.'});
 }
 for(const r of records){
  if(r.social_record_version===1&&r.social_kind==='group'&&r.status==='active')groups.set(r.record_id,r);
  if(r.social_record_version===1&&r.social_kind==='membership'&&r.status==='member'){
   if(!members.has(r.group_id))members.set(r.group_id,new Map());
   members.get(r.group_id).set(r.actor,r);
  }
 }
 for(const [id,group] of groups){
  const rows=[...(members.get(id)?.values()||[])].sort((a,b)=>Number(focus.has(b.actor))-Number(focus.has(a.actor)));
  if(rows.length<2)continue;
  add('group_opportunity',{key:JSON.stringify(['group_opportunity',id]),title:group.name,actors:rows.slice(0,12).map(r=>r.actor),status:'opportunity',source:group.source},{visibility:group.visibility||'unknown',purpose:clip(group.purpose),participants_omitted:Math.max(0,rows.length-12),basis:rows.slice(0,12).map(r=>({actor:r.actor,role:clip(r.role),source:source(r)})),guidance:'An active organization with members can create independent activity or disagreement. Membership is not loyalty, access or shared knowledge.'});
 }
 for(const r of records)if(r.growth_version===1&&r.growth_kind==='skill'&&['learning','practicing'].includes(r.status)&&text(r.teacher)&&r.teacher!==r.actor){
  add('mentorship_opportunity',{key:JSON.stringify(['mentorship_opportunity',r.key]),title:r.name,actor:r.actor,counterparty:r.teacher,status:'opportunity',source:r.source},{skill_status:r.status,guidance:'Recorded learner and teacher may practice, disagree or reschedule. Do not grant progress or assume a lesson happened.'});
 }
 // Distinct owners for group, market and contest activity. Do not treat the first
 // participant of a shared record as its only autonomous decision-maker.
 for(const {kind,row,info} of independentSocialOpportunities(records,projection.people||[])){
  // A counterparty is not the original payer/employee; do not apply the original
  // record's actor-specific financial checks to the newly derived role.
  add(kind,kind==='agreement_party'?{...row,dynamics_kind:null}:row,info);
 }
 // Review real order states, not an invented demand multiplier.
 if(opts.complete!==false)for(const {kind,row,info} of recordedMarketOpportunities(records,scenes,clock?.literal))add(kind,row,info);
 if(opts.complete!==false){
  for(const {kind,row,info} of npcNeedOpportunities(records,scenes,(segmentLimit?segmentAnchor:anchor)?.literal))add(kind,row,info);
  for(const {kind,row,info} of npcContactOpportunities(scenes,projection,clock?.literal,{shared:all.slice()}))add(kind,row,info);
 }
 for(const {kind,row,info} of wealth.opportunities())add(kind,row,info);
 for(const {kind,row,info} of documents.opportunities())add(kind,row,info);
 for(const {kind,row,info} of magic.opportunities())add(kind,row,info);
 for(const {kind,row,info} of advanced.opportunities())add(kind,row,info);
 for(const {kind,row,info} of operationalIndex(projection,{complete:opts.complete!==false}).opportunities())add(kind,row,info);
 for(const {kind,row,info} of civicIndex(projection,{complete:opts.complete!==false}).opportunities())add(kind,row,info);
 for(const {kind,row,info} of communityIndex(projection,{complete:opts.complete!==false}).opportunities())add(kind,row,info);
 for(const {kind,row,info} of depth.opportunities())add(kind,row,info);
 for(const {kind,row,info} of longLife.opportunities())add(kind,row,info);
 const life_context=[];
 for(const person of projection.people||[]){
  const before=characterAge(person,clock?.literal),after=characterAge(person,anchor?.literal);
  if(focus.has(person.name)&&after)life_context.push({actor:person.name,current_age:before,target_age:after});
  if(before?.status==='calendar_derived'&&after?.status==='calendar_derived'&&after.years>before.years)
   add('age_milestone',{actor:person.name,title:'День рождения: '+person.name,source:after.source,status:'calendar_derived'},{timing:'reached_requires_story',previous_age:before.years,age_years:after.years,birthdays_crossed:after.years-before.years});
 }
 const priorityIndex=x=>x.focus_match?preferences.priorities.findIndex(p=>p===x.title||p===({intention:'plan:',obligation:'commitment:',project:'project:'}[x.kind]||'__none__:')+String(x.kind==='project'?String(x.key).replace(/^growth:project:/,''):x.key)):-1;
 for(const x of all){const i=priorityIndex(x);if(i>=0)x.player_priority=i+1;}
 // Due events remain first; exact player focus elevates matching opportunities, never executes them.
 const rank=x=>x.timing==='reached_requires_story'?0:x.player_priority?0.5+x.player_priority/10:x.focus_match?1:x.timing==='future'?3:2;
 for(const xs of byKind.values())xs.sort((a,b)=>rank(a)-rank(b)||(positions.get(b.source?.scene_id)??-1)-(positions.get(a.source?.scene_id)??-1));
 const matches=x=>scope==='all'||(scope==='focus'?x.focus_match:!x.focus_match);
 const categories=[...byKind.values()].map(xs=>xs.filter(matches)).filter(xs=>xs.length).sort((a,b)=>rank(a[0])-rank(b[0]));
 const candidates=orderTurnCandidates(categories,rank,{offset,limit}),total_candidates=all.filter(matches).length;
 const candidate_counts={all:all.length,focus:all.filter(x=>x.focus_match).length,background:all.filter(x=>!x.focus_match).length};
 // Attach a bounded actor context to the actual turn, instead of forcing the narrator
 // to retrieve every subsystem independently. Focused actors precede background actors.
 const background=backgroundTimeReview(all,{clock:clock?.literal,target:proposed?.literal,segmentUntil:timeAdvance?.proposed_until,protectedActors,complete:opts.complete!==false,pace:preferences.settings.pace,pending:!!pendingActor});
 const segmentCandidates=background?.status==='player_choice_pending'?[]:background?all.flatMap(c=>{
  const at=parseStoryDate(c.review_at);
  if(at&&at.order>segmentAnchor.order)return [];
  const row=householdRecords.get(c.key);
  if(c.kind==='payment_schedule'||c.kind==='family_duty'){
   const window=c.kind==='payment_schedule'?paymentScheduleWindow(row,segmentAnchor,paymentOccurrences.get(row?.record_id)||[]):familyDutyWindow(row,clock,segmentAnchor,dutyOccurrences.get(row?.record_id)||[]);
   return window?[{...c,...window,review_at:window.first_due_on}]:[];
  }
  if(c.kind==='routine'){
   if(!row)return [];
   let intersects=routineWindow(row,clock)==='scheduled_window_not_actual_presence'||routineWindow(row,segmentAnchor)==='scheduled_window_not_actual_presence';
   const first=Math.floor(clock.order/1440),last=Math.floor(segmentAnchor.order/1440);
   const start=Number(row.start.slice(0,2))*60+Number(row.start.slice(3)),end=Number(row.end.slice(0,2))*60+Number(row.end.slice(3));
   for(let d=first-1;!intersects&&d<=Math.min(last,first+7);d++){
    const weekday=new Date(d*86400000).getUTCDay()||7;
    if(row.weekdays.includes(weekday)&&d*1440+start<=segmentAnchor.order&&d*1440+end+(end<start?1440:0)>clock.order)intersects=true;
   }
   if(!intersects)return [];
  }
  // A future appointment or work shift is a forecast, not a task to perform now.
  return [c];
 }):all;
 const npcInitiatives=npcInitiativeView(segmentCandidates,{focus:[...focus],player:pendingActor,players:recordedPlayers,settings:preferences.settings,scenes,offscreen:projection.offscreen||[],complete:opts.complete!==false,elapsed:background&&segmentAnchor&&clock?segmentAnchor.order-clock.order:interval});
 const coordination=civilizationReview(projection,segmentCandidates,{clock:clock?.literal,until:background?.segment_until??clock?.literal,complete:opts.complete!==false,pending:!!pendingActor});
 const selectedActors=scope==='background'?[]:[...focus],omittedActors=new Set();
 const addActor=name=>{if(!text(name)||selectedActors.includes(name))return;if(selectedActors.length<12)selectedActors.push(name);else omittedActors.add(name);};
 for(const candidate of candidates)for(const actor of candidate.actors)addActor(actor);
 for(const initiative of npcInitiatives.initiatives)addActor(initiative.actor);
 if(scope==='background')for(const actor of focus)addActor(actor);
 const actorIndex=new Map(selectedActors.map(actor=>[actor,{actor,state_fields:[],intentions:[],knowledge:[],relationships:[],recent_offscreen:[],resources:[],experience:[],responsibilities:[],personality_history:[],life_interests:[],life_goals:[],life_threads:[],life_circles:[],life_experience:[],life_causes:[],psychology:[],beliefs:[],motives:[],magic_training:[],magic_research:[],magic_reserves:[],magical_health:[],magical_projects:[],omitted:{}}]));
 const actorRows=(actor,kind,row,cap)=>{const ctx=actorIndex.get(actor);if(!ctx)return;
  if(ctx[kind].length<cap)ctx[kind].push(row);else ctx.omitted[kind]=(ctx.omitted[kind]||0)+1;
 };
 // Latest source in canonical ancestry first; updates of old keys are not insert order.
 const recent=rows=>rows.slice().reverse().sort((a,b)=>(positions.get(b.source?.scene_id)??-1)-(positions.get(a.source?.scene_id)??-1));
 const personality=personalityHistory(scenes,projection,selectedActors,{complete:opts.complete!==false,limit:4});
 for(const [actor,history] of personality){
  for(const r of history.records)actorRows(actor,'personality_history',r,4);
  actorIndex.get(actor).omitted.personality_history=history.total-history.records.length;
 }
 for(const actor of selectedActors){
  const magical=magic.view(actor,{director:false,limit:3});for(const [k,rows] of [['magic_training',magical.magic?.training],['magic_research',magical.magic?.research],['magic_reserves',magical.magic?.reserves],['magical_health',magic.view(actor,{director:true,limit:3}).medicine?.diagnoses]]){for(const r of rows?.records||[])actorRows(actor,k,r,3);actorIndex.get(actor).omitted[k]=Math.max(0,(rows?.total??0)-3);}
  const societies=magical.society;const projects=[...(societies?.rituals?.sessions?.records||[]).filter(r=>r.actor===actor),...(societies?.science?.memberships?.records||[]).filter(r=>r.member===actor),...(societies?.science?.patents?.records||[]).filter(r=>r.actor===actor),...(societies?.clinics?.credentials?.records||[]).filter(r=>r.holder===actor),...(societies?.clinics?.admissions?.records||[]).filter(r=>r.patient===actor)];for(const r of projects.slice(0,3))actorRows(actor,'magical_projects',r,3);actorIndex.get(actor).omitted.magical_projects=Math.max(0,projects.length-3);
  const extra=advanced.view(actor);for(const row of extra.motives?.records.slice(0,3)||[])actorRows(actor,'motives',row,3);actorIndex.get(actor).omitted.motives=Math.max(0,(extra.motives?.total??0)-3);
  const deeper=depth.view(actor);
  for(const category of ['fields','beliefs']){const rows=deeper.psychology?.[category];if(!rows)continue;const k=category==='fields'?'psychology':'beliefs';for(const row of rows.records.slice(0,3))actorRows(actor,k,row,3);actorIndex.get(actor).omitted[k]=Math.max(0,rows.total-3);}
  const view=longLife.view(actor,{clock:clock?.literal,limit:3});
  for(const category of ['interests','goals','threads','circles','experience','causes']){
   const rows=view[category];if(!rows)continue;
   const kind='life_'+category;
   for(const row of rows.records)actorRows(actor,kind,row,3);
   actorIndex.get(actor).omitted[kind]=rows.omitted;
  }
 }
 const stateFields=new Set(['location','residence','availability','occupation','condition','injury','appearance','mood','temperament','speech_style','values','personal_goal','family_goal','pregnancy','preference','aversion','habit','coping_style','humor','register','life_stage','education','career_goal']);
 for(const p of projection.people||[]){
  if(!actorIndex.has(p.name))continue;
  const ctx=actorIndex.get(p.name);ctx.age=characterAge(p,anchor?.literal);
  for(const field of (p.state_fields||[]).filter(x=>stateFields.has(x.field)))actorRows(p.name,'state_fields',{field:field.field,value:clip(field.value),source:source(field)},12);
 }
 for(const p of recent(projection.plans||[]))if(['active','paused'].includes(p.status))actorRows(p.actor,'intentions',{plan_id:p.plan_id,goal:clip(p.goal),status:p.status,next_step:clip(p.next_step),obstacle:clip(p.obstacle),source:source(p)},3);
 for(const k of recent(projection.knowledge||[]))actorRows(k.actor,'knowledge',{holder:k.actor,topic_id:k.topic_id||null,fact:clip(k.fact),status:k.status||'legacy_recorded_knowledge',channel:clip(k.channel),source:source(k)},4);
 for(const r of recent(projection.relationships||[])){
  const row={a:r.a,b:r.b,stance:clip(r.stance),fields:(r.relationship_fields||[]).map(x=>({field:x.field,value:x.value,source:source(x)})),source:source(r)};
  actorRows(r.a,'relationships',row,3);if(r.a!==r.b)actorRows(r.b,'relationships',row,3);
 }
 for(const e of recent(projection.offscreen||[])){
  for(const actor of new Set([e.actor,...(Array.isArray(e.actors)?e.actors:[])].filter(Boolean)))actorRows(actor,'recent_offscreen',{description:clip(e.description||e.evidence),place:clip(e.place),source:source(e)},2);
 }
 // Actor context includes material means and social constraints, not just motives.
 for(const b of recent(projection.balances||[]))actorRows(b.actor,'resources',{kind:'balance',currency:b.currency,known:b.known===true,balance:b.known===true?b.balance:null,recorded_delta:b.delta,source:source(b)},4);
 for(const s of recent(projection.stock||[]))actorRows(s.holder,'resources',{kind:'stock',product_id:s.product_id,unit:s.unit,known:s.known,quantity:s.quantity,recorded_delta:s.delta,source:source(s)},4);
 for(const item of recent(projection.items||[]))if(item.custody_status==='held'&&item.holder)actorRows(item.holder,'resources',{kind:'held_item',item_id:item.item_id,name:clip(item.name),custody_status:'held',source:source(item)},4);
 for(const r of recent(records)){
  if(r.growth_version===1&&r.growth_kind==='skill')actorRows(r.actor,'experience',{kind:'skill',name:clip(r.name),status:r.status,description:clip(r.description),source:source(r)},5);
  if(r.activity_version===1&&r.activity_kind==='habit')actorRows(r.actor,'experience',{kind:'habit',name:clip(r.name),status:r.status,frequency:clip(r.frequency),description:clip(r.description),source:source(r)},5);
  if(r.social_record_version===1&&r.social_kind==='membership')actorRows(r.actor,'responsibilities',{kind:'membership',group_id:r.group_id,status:r.status,role:clip(r.role),source:source(r)},6);
  if(r.consequence_version===1&&r.status!=='resolved')actorRows(r.actor,'responsibilities',{kind:'consequence',category:r.consequence_kind,status:r.status,description:clip(r.description),source:source(r)},6);
  if(r.dynamics_version===1&&['employment','economic_agreement','payment_schedule'].includes(r.dynamics_kind)&&!['ended','declined','settled','cancelled','unknown'].includes(r.status))for(const actor of new Set([r.actor,r.counterparty]))actorRows(actor,'responsibilities',{kind:r.dynamics_kind,title:clip(r.title),actor:r.actor,counterparty:r.counterparty,status:r.status,amount:r.amount,currency:r.currency,pay_period:r.pay_period,source:source(r)},6);
  if(r.dynamics_version===1&&r.dynamics_kind==='bond'&&!closed.has(r.status)){
   for(const actor of new Set([r.actor,r.counterparty]))actorRows(actor,'responsibilities',{kind:'bond',bond_type:r.bond_type,actor:r.actor,counterparty:r.counterparty,status:r.status,source:source(r)},6);
  }
  if(r.dynamics_version===1&&r.dynamics_kind==='family_duty'&&r.status==='active')for(const actor of r.actors||[])actorRows(actor,'responsibilities',{kind:'family_duty',title:clip(r.title),every_days:r.every_days,starts_on:r.starts_on,ends_on:r.ends_on,source:source(r)},6);
 }
 for(const o of recent(projection.obligations||[]))if(!closed.has(text(o.status)))actorRows(o.actor,'responsibilities',{kind:'commitment',title:clip(o.description||o.evidence),status:o.status,deadline:o.due_at||o.deadline||o.due||null,source:source(o)},6);
 // Round-robin across actors AND categories, reserving counts up front.
 // Bound extra turn payload even if all participants have lengthy records.
 const actorQueues=[...actorIndex.values()],kinds=['state_fields','intentions','knowledge','relationships','recent_offscreen','resources','experience','responsibilities','personality_history','life_interests','life_goals','life_threads','life_circles','life_experience','life_causes','psychology','beliefs','motives','magic_training','magic_research','magic_reserves','magical_health','magical_projects'];
 const actor_context=actorQueues.map(({actor,age,omitted,...rows})=>({actor,age,omitted:Object.fromEntries(kinds.map(k=>[k,(omitted[k]||0)+rows[k].length])),...Object.fromEntries(kinds.map(k=>[k,[]]))}));
 const actorBudget=18000;
 for(let i=0;i<12;i++)for(const kind of kinds)for(let j=0;j<actor_context.length;j++){
  const value=actorQueues[j][kind][i];if(!value)continue;
  const ctx=actor_context[j];ctx[kind].push(value);ctx.omitted[kind]--;
  if(JSON.stringify(actor_context).length>actorBudget){ctx[kind].pop();ctx.omitted[kind]++;}
 }
 for(const ctx of actor_context)for(const k of kinds)if(ctx.omitted[k]===0)delete ctx.omitted[k];
 const relationship_context=[];
 let relationship_context_omitted=0;
 if(focus.size){
  const accepted=new Set((projection.relationship_history||[]).map(e=>JSON.stringify([e.source.scene_id,e.source.event_id])));
  // Reverse canonical scene and event order, not an inferred emotional score.
  for(let i=scenes.length-1;i>=0;i--){
   const s=scenes[i],events=s.events||[];
   for(let j=events.length-1;j>=0;j--){
    const e=events[j],relation=e.type==='relationship',episode=e.type==='world'&&e.interaction_version===1;
    if(!(relation&&(focus.has(e.a)||focus.has(e.b))||episode&&e.actors?.some(a=>focus.has(a))))continue;
    if(!accepted.has(JSON.stringify([s.id,e.id])))continue;
    if(relationship_context.length>=12){relationship_context_omitted++;continue;}
    relationship_context.push({type:relation?'relationship_change':'interaction',kind:e.interaction_kind,a:e.a,b:e.b,actors:e.actors,stance:e.stance,fields:e.relationship_patch,description:clip(e.description),outcome:clip(e.outcome),source:{scene_id:s.id,event_id:e.id,world_time:s.world_time??null}});
   }
  }
 }
 const continuity_anchors=continuityAnchors(scenes,projection,{focus:[...focus],place:place||null,candidates,complete:opts.complete!==false});
 const warnings=[];
 if(!clock)warnings.push('Последняя сцена не задаёт точное время; длительность перехода неизвестна.');
 if(clock&&proposed&&!comparable)warnings.push('Точность дат различается: длительность перехода неизвестна.');
 if(opts.complete===false)warnings.push('История неполна; кандидаты не охватывают все события.');
 return {head_scene_id:last?.id??null,clock:clock?.literal??null,target_time:proposed?.literal??null,elapsed_story_minutes:interval,
  memory_complete:opts.complete!==false,player_priorities:preferences.priorities,simulation_settings:preferences.settings,npc_initiatives:npcInitiatives,time_advance:timeAdvance,background_time_review:background,civilization_review:coordination,continuity_anchors,scene_memory_recall:sceneMemoryRecall(scenes,projection,{actors:[...focus],place:place||null,complete:opts.complete!==false}),world_chronicle:depth.chronicle(),player_life:[...focus].map(actor=>playerLifeTurnSummary(projection,actor,{scenes,clock:anchor?.literal,complete:opts.complete!==false})),focus:{actors:[...focus],place:place||null},candidates,scope,offset,total_candidates,candidate_counts,next_offset:offset+candidates.length<total_candidates?offset+candidates.length:null,omitted_candidates:total_candidates-candidates.length,
  relationship_context,relationship_context_omitted,life_context,actor_context,actor_context_omitted:omittedActors.size,
  drivers:storyDrivers(projection,directives,{max:8,actors:[...focus]}),warnings,
  workflow:['Read the pinned head and rules.','Read actor_context for each participant; consult full sources for omitted fields. A recorded incoming relationship is not the participant’s own feeling or knowledge.','Consider each candidate checks array and each actor’s resources, experience, responsibilities, and separate knowledge. Do not treat unknown money as zero or a schedule as proof of presence. Use the life_* categories for individual interests, open goals, circles and actual past experiences; explicit cause claims are not automatic truth. Consider recorded experience and beliefs, mediated introductions, financial obligations and voluntary news transmission; never spread information automatically. Choose only plausible developments, including independent NPC initiatives; keep player decisions theirs. Use continuity_anchors and scene_memory_recall as source links before revisiting earlier events. Interpretive notes and lexical matches are not knowledge; verify the source and speaker. Check civilization_review for cross-system overlapping commitments and aggregate scheduled-payment exposure; these are review-only constraints. On long jumps, background_time_review is the next segment only; later candidates are forecasts, never completed outcomes.','Record exact evidenced state changes and save one scene against the expected head.','On uncertain save, check the receipt before generating another continuation.'],
  policy:'This is a read-only turn proposal, not simulation results. No candidate changes world state, completes a deadline, transfers a resource, reveals a secret or proves presence. The player controls their own character.'};
}
