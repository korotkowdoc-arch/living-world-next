import {isSceneMemory,sceneMemoryError,sceneMemoryDuplicateKey} from './scene-memory-routing.mjs';
import {wealthIndex,isWealth,wealthShapeError} from './wealth-world.mjs';
import {documentIndex,isDocument,documentShapeError} from './documents-world.mjs';
import {isMagicSociety} from './magic-society.mjs';
import {magicIndex,isMagic} from './magic-world.mjs';
import {advancedIndex,isAdvanced} from './advanced-world.mjs';
import {familyGoalSceneError,familyBirthDateError} from './family-goals.mjs';
import {expenseCareSceneError,expenseCareReplayError} from './expense-care.mjs';
import {dutyCrossError} from './duty-career.mjs';
import {employmentGate,householdSceneError,householdReplayError} from './households-careers.mjs';
import {curriculumCrossError,supplySceneError,supplyReplayError} from './curriculum-supply.mjs';
import {prepaidSceneError,prepaidReplayError,applyPrepaid} from './prepaid-travel.mjs';
import {applyMarketAdjustment,invalidateFurnishing} from './market-home.mjs';
import {applyPropertySettlement,propertyPaymentError} from './property-lessons.mjs';
import {addBudgetFlow,budgetFlowRows} from './home-systems.mjs';
import {workSceneError,workReplayError} from './work-systems.mjs';
import {servicePaymentError,journeyArrivalError} from './travel-services.mjs';
import {playerLifeError,playerLifeTransitionError,applyOutfit,removeUnavailableGarment,projectLifeRecord} from './player-life.mjs';
import {isMenuDirective} from './game-menu.mjs';
import {extractLocks,pairKey} from './directives.mjs';
import {storyDrivers} from './story-drivers.mjs';
import {recordedWorldAgenda} from './world-time.mjs';
import {economyShapeError,applyMoney,applyItem,applyStock} from './economy.mjs';
import {characterStateError,applyCharacter} from './character-state.mjs';
import {lifeRecordError,livingWorldView} from './living-world.mjs';
import {socialRecordError,socialTransitionError,socialWorldView} from './social-world.mjs';
import {knowledgeRecordError,knowledgeKey,knowledgeRoutingError,normalizeLegacyKnowledge} from './knowledge.mjs';
import {relationshipError,relationshipKey,applyRelationship,interactionError} from './relationship-memory.mjs';
import {activityError,activityTransitionError,activityView} from './activities.mjs';
import {consequenceError,consequenceTransitionError,consequenceView} from './consequences.mjs';
import {growthRecordError,growthTransitionError,growthView} from './growth.mjs';
import {dynamicsRecordError,dynamicsTransitionError,dynamicsView,playerChoiceView} from './world-dynamics.mjs';
import {prepareStoryTurn} from './story-turn.mjs';

const TYPES=new Set(['character','relationship','knowledge','money','item','commitment','world','offscreen','plan']);
const PLAN_ACTIONS=new Set(['start','advance','pause','resume','complete','abandon']);
const RECONCILED=new Set(['friends','reconciled','peace','close_friends','romantic_partners']);
const asText=(v)=>typeof v==='string'?v.trim():'';

/** Validate a proposed scene BEFORE committing it, without pretending this proves literary quality. */
export function validateScene({body,events=[],directives=[],evidencePrevalidated=false,worldTime=undefined,historical=false}) {
  const errors=[];
  if(!evidencePrevalidated&&(typeof body!=='string'||body.trim().length<10))errors.push('Текст сцены слишком короткий.');
  if(typeof body==='string'&&body.length>200000)errors.push('Сцена длиннее 200 000 символов.');
  if(!Array.isArray(events)||events.length>100)errors.push('Слишком много событий или неверный формат.');
  const locks=new Map(extractLocks(directives).map(x=>[pairKey(x.a,x.b),x]));
  const ids=new Set(),paymentTransfers=new Set(),usedStock=new Set(),memoryKeys=new Set();let pendingChoices=0,answeredChoices=0;
  for(const [i,event] of (Array.isArray(events)?events:[]).entries()){
    const prefix=`Событие ${i+1}`;
    if(!event||typeof event!=='object'||Array.isArray(event)){errors.push(`${prefix}: неверный объект.`);continue;}
    if(event.dynamics_kind==='player_choice'&&(event.type!=='world'||event.dynamics_version!==1))errors.push(prefix+': выбор должен быть версионированной записью world.');
    if(!TYPES.has(event.type))errors.push(`${prefix}: неизвестный тип.`);
    if(!asText(event.id)||ids.has(event.id))errors.push(`${prefix}: требуется уникальный ID.`);
    ids.add(event.id);
    if(!asText(event.evidence)||(!evidencePrevalidated&&(typeof body!=='string'||!body.includes(event.evidence))))errors.push(`${prefix}: нужна дословная цитата из сцены.`);
    if(!historical){const routingError=knowledgeRoutingError(event);if(routingError)errors.push(prefix+': '+routingError);}
    if(isSceneMemory(event)){
      const error=sceneMemoryError(event);if(error)errors.push(prefix+': '+error);
      else {const k=sceneMemoryDuplicateKey(event);if(memoryKeys.has(k))errors.push(prefix+': duplicate interpretive memory');memoryKeys.add(k);}
      continue;
    }
    const wealthShape=wealthShapeError(event);if(wealthShape)errors.push(prefix+': '+wealthShape);
    const docShape=documentShapeError(event);if(docShape)errors.push(prefix+': '+docShape);
    const playerLifeShape=playerLifeError(event);if(playerLifeShape)errors.push(prefix+': '+playerLifeShape);
    const familyGoalFailure=familyGoalSceneError(event,events,i,worldTime);if(familyGoalFailure)errors.push(prefix+': '+familyGoalFailure);
    const expenseCareFailure=expenseCareSceneError(event,events,i,paymentTransfers);if(expenseCareFailure)errors.push(prefix+': '+expenseCareFailure);
    const householdError=householdSceneError(event,events,i,paymentTransfers);if(householdError)errors.push(prefix+': '+householdError);
    const supplyError=supplySceneError(event,events,i,paymentTransfers);if(supplyError)errors.push(prefix+': '+supplyError);
    const prepaidError=prepaidSceneError(event,events,i,paymentTransfers);if(prepaidError)errors.push(prefix+': '+prepaidError);
    const propertyError=propertyPaymentError(event,events,i,paymentTransfers);if(propertyError)errors.push(prefix+': '+propertyError);
    const workError=workSceneError(event,events,i,paymentTransfers,usedStock);if(workError)errors.push(prefix+': '+workError);
    const serviceError=servicePaymentError(event,events,i,paymentTransfers);if(serviceError)errors.push(prefix+': '+serviceError);
    if(event.type==='character'){
      const error=characterStateError(event);if(error)errors.push(prefix+': '+error);
    }
    if(event.type==='relationship'){
      if(!asText(event.a)||!asText(event.b))errors.push(`${prefix}: нужны оба участника.`);
      const lock=locks.get(pairKey(event.a,event.b));
      const relationError=relationshipError(event,lock);if(relationError)errors.push(prefix+': '+relationError);
      if(lock?.forbid_reconciliation&&RECONCILED.has(event.stance))
        errors.push(`${prefix}: противоречит закреплённому запрету на примирение.`);
      if(lock?.forbid_respect&&(event.stance==='respect'||event.stance==='admiration'||event.respect===true))
        errors.push(`${prefix}: противоречит закреплённому запрету на уважение.`);
    }
    if(['money','item'].includes(event.type)){
      const error=economyShapeError(event);if(error)errors.push(prefix+': '+error);
    }
    if(event.type==='knowledge'&&(!asText(event.actor)||!asText(event.fact)||!asText(event.channel)))
      errors.push(`${prefix}: нужны знающий, факт и канал знания.`);
    if(event.type==='knowledge'){
      const error=knowledgeRecordError(event);if(error)errors.push(prefix+': '+error);
    }
    if(event.type==='world'){
      const error=lifeRecordError(event)||socialRecordError(event)||interactionError(event)||activityError(event)||consequenceError(event)||growthRecordError(event)||dynamicsRecordError(event);
      const versions=['world_record_version','social_record_version','interaction_version','activity_version','consequence_version','growth_version','dynamics_version','player_life_version','magic_version','magic_society_version','advanced_version','document_version','wealth_version'].filter(k=>event[k]!==undefined);
      if(versions.length>1)errors.push(prefix+': запись не может одновременно принадлежать нескольким системам.');
      if(typeof event.key==='string'&&/^(place|routine):/.test(event.key)&&event.world_record_version!==1)errors.push(prefix+': ключ места или распорядка требует версию.');
      if(typeof event.key==='string'&&event.key.startsWith('social:')&&event.social_record_version!==1)errors.push(prefix+': социальный ключ требует версию.');
      if(typeof event.key==='string'&&event.key.startsWith('consequence:')&&event.consequence_version!==1)errors.push(prefix+': ключ последствия требует версионированной записи.');
      if(event.dynamics_kind==='player_choice'){
        if(event.status==='pending'){
         pendingChoices++;if(i!==events.length-1||!evidencePrevalidated&&!body?.trimEnd().endsWith(event.evidence))errors.push(prefix+': вопрос выбора должен завершать сохранённый эпизод.');
        }else if(event.status==='answered'){answeredChoices++;if(i!==0)errors.push(prefix+': ответ игрока должен быть первым структурированным событием продолжения.');}
        if(pendingChoices>1||answeredChoices>1)errors.push(prefix+': не более одного ответа и одного нового выбора в сцене.');
      }
      if(event.dynamics_version===1&&event.dynamics_kind==='payment_occurrence'&&event.status==='paid'){
        const ref=event.transfer_event_id,transfer=Array.isArray(events)&&events.find(x=>x?.id===ref);
        if(!transfer||transfer.type!=='money'||transfer.operation!=='transfer'||transfer.actor!==event.actor||transfer.counterparty!==event.counterparty||transfer.currency!==event.currency||transfer.delta!==-event.amount||paymentTransfers.has(ref))errors.push(prefix+': оплата требует отдельного совпадающего денежного перевода этой сцены, без повторного использования.');
        paymentTransfers.add(ref);
      }
      if(typeof event.key==='string'&&event.key.startsWith('activity:')&&event.activity_version!==1)errors.push(prefix+': ключ занятия требует версионированной записи.');if(error)errors.push(prefix+': '+error);
    }
    if(event.type==='plan'){
      if(!asText(event.actor)||!asText(event.plan_id)||!PLAN_ACTIONS.has(event.action))errors.push(`${prefix}: для плана нужны герой, ID и действие.`);
      if(event.action==='start'&&!asText(event.goal))errors.push(`${prefix}: начальный план требует собственную цель героя.`);
      if(event.plan_patch!==undefined){
        const patch=event.plan_patch;
        if(!['advance','resume','pause'].includes(event.action)||!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length||
         Object.entries(patch).some(([k,v])=>!['goal','due_at','next_step','obstacle'].includes(k)||
          (v===null?k==='goal':typeof v!=='string'||!v.trim()||v.length>600)))
          errors.push(prefix+': неверное изменение цели, срока, следующего шага или препятствия.');
      }
      if(event.action==='complete'){
        const actual=Array.isArray(events)&&events.find(x=>x?.id===event.performed_event_id&&x!==event&&['world','offscreen'].includes(x.type)&&x.dynamics_kind!=='player_choice'&&!isSceneMemory(x));
        if(!actual)errors.push(`${prefix}: завершённый план требует ID доказанного действия world/offscreen из этой сцены.`);
      }
    }
  }
  return {ok:errors.length===0,errors};
}

/** Replay only the actual ancestry of one branch, oldest first. No other branch can leak in. */
export function replay(scenes=[],directives=[],{evidencePrevalidated=false}={}) {
 return runReplay(scenes,{evidencePrevalidated}).projection;
}
/** A checkpoint is private derived state, created only by replay of an already
 * authenticated immutable ancestry. It is NOT a client-supplied save or DB
 * validation authority. The prefix boundary must match the verified chain. */
export function replayWithCheckpoint(scenes=[],{evidencePrevalidated=false,checkpoint=null}={}){
 const n=checkpoint?.scene_count;
 const reusable=checkpoint?.version===1&&checkpoint.evidence_prevalidated===evidencePrevalidated&&Number.isSafeInteger(n)&&n>0&&n<=scenes.length&&scenes[n-1]?.id===checkpoint.head_scene_id&&!!checkpoint.state;
 return runReplay(scenes,{evidencePrevalidated,checkpoint:reusable?checkpoint:null,capture:true});
}
function runReplay(scenes,{evidencePrevalidated=false,checkpoint=null,capture=false}={}){
  const seed=checkpoint?structuredClone(checkpoint.state):null;
  const map=k=>new Map(seed?.[k]||[]);
  const people=map('people'),relationships=map('relationships'),knowledge=map('knowledge'),balances=map('balances'),items=map('items'),stock=map('stock'),obligations=map('obligations'),worldFacts=map('worldFacts'),plans=map('plans'),offscreen=seed?.offscreen||[];
  const outfits=map('outfits'),budgetFlows=new Map((seed?.budgetFlows||[]).map(([k,v])=>[k,{...v,income:BigInt(v.income),expense:BigInt(v.expense)}]));
  let eventCount=seed?.eventCount??0;const failures=seed?.failures||[];const relationshipHistory=seed?.relationshipHistory||[];let awaiting=seed?.awaiting??null;
  const offset=checkpoint?.scene_count??0;
  for(let sceneIndex=offset;sceneIndex<scenes.length;sceneIndex++){
    const scene=scenes[sceneIndex];
    const originalEvents=Array.isArray(scene.events)?scene.events:[];
    const events=originalEvents.map(normalizeLegacyKnowledge);
    const recovered=new Set(events.filter((e,i)=>e!==originalEvents[i]).map(e=>e.id));
    // Replay checks the whole saved package once; current user rules NEVER rewrite past facts.
    const result=validateScene({body:scene.body,events,directives:[],evidencePrevalidated,worldTime:scene.world_time??null,historical:true});
    if(!result.ok){failures.push({scene_id:scene.id,errors:result.errors});continue;}
    if(awaiting&&!(events[0]?.dynamics_kind==='player_choice'&&events[0].status==='answered'&&events[0].key===awaiting.key&&!dynamicsTransitionError(worldFacts,events[0]))){failures.push({scene_id:scene.id,errors:['Продолжение требует ответа на текущий выбор героя.']});continue;}
    const acceptedMoney=new Set(),acceptedLocations=new Map(),acceptedStock=new Map();
    for(const event of events){
      let accepted=true;
      const from={scene_id:scene.id,event_id:event.id,world_time:scene.world_time??null};
      const value={...event,source:from,...(recovered.has(event.id)?{legacy_route_recovered:true}:{})};
      switch(event.type){
        case 'character': if(asText(event.name)){const err=familyBirthDateError(worldFacts,event);if(err){failures.push({scene_id:scene.id,event_id:event.id,errors:[err]});accepted=false;break;}const name=asText(event.name);people.set(name,applyCharacter(people.get(name),event,from));if(typeof event.state_patch?.location==='string')acceptedLocations.set(name,event.state_patch.location);else if(Object.hasOwn(event.state_patch||{},'location'))acceptedLocations.delete(name);}break;
        case 'relationship': {const key=relationshipKey(event);relationships.set(key,applyRelationship(relationships.get(key),event,from));break;}
        case 'knowledge':{
          const key=knowledgeKey(event);
          knowledge.set(key,value); break;
        }
        case 'money':
        case 'item': {
          const error=event.type==='money'?applyMoney(balances,event,from):applyItem(items,event,from);
          if(error){failures.push({scene_id:scene.id,event_id:event.id,errors:[error]});accepted=false;}
          else if(event.type==='item'){removeUnavailableGarment(outfits,items,event.item_id);invalidateFurnishing(worldFacts,items,event,from);}
          break;
        }
        case 'commitment': if(asText(event.commitment_id))obligations.set(event.commitment_id,value);break;
        case 'world': if(Object.hasOwn(event,'knowledge_version')){failures.push({scene_id:scene.id,event_id:event.id,errors:['Неверно маршрутизированная старая запись знания требует проверки источника.']});accepted=false;break;} if(asText(event.key)){
          const err=dutyCrossError(worldFacts,event,events,events.indexOf(event))||employmentGate(worldFacts,event)||curriculumCrossError(worldFacts,event,events,events.indexOf(event))||socialTransitionError(worldFacts.get(event.key),event)||activityTransitionError(worldFacts.get(event.key),event)||consequenceTransitionError(worldFacts.get(event.key),event)||growthTransitionError(worldFacts,event)||dynamicsTransitionError(worldFacts,event)||playerLifeTransitionError(worldFacts,items,event)||journeyArrivalError(event,worldFacts.get(event.key),acceptedLocations)||workReplayError(worldFacts,event,acceptedStock,acceptedMoney)||prepaidReplayError(event,acceptedMoney)||supplyReplayError(event,acceptedMoney,acceptedStock)||householdReplayError(event,acceptedMoney)||expenseCareReplayError(event,acceptedMoney)||(event.life_kind==='estate_sale'&&event.status==='settled'&&event.amount>0&&!acceptedMoney.has(event.transfer_event_id)?'Estate payment was not accepted':null)||(event.life_kind==='service_visit'&&event.status==='completed'&&event.amount>0&&event.prepayment_id==null&&!acceptedMoney.has(event.transfer_event_id)?'Service transfer was not accepted':null)||(event.dynamics_kind==='stock_operation'?applyStock(stock,event,from):null);
          if(err){failures.push({scene_id:scene.id,event_id:event.id,errors:[err]});accepted=false;}
          else {worldFacts.set(event.key,projectLifeRecord(worldFacts.get(event.key),event,value));applyOutfit(outfits,event,from);applyPropertySettlement(worldFacts,event,value);applyMarketAdjustment(worldFacts,event,value);applyPrepaid(worldFacts,event,value);invalidateFurnishing(worldFacts,items,event,from);if(event.dynamics_kind==='player_choice')awaiting=event.status==='pending'?value:null;}
        }break;
        case 'offscreen': offscreen.push(value);break;
        case 'plan': {
          const key=`${event.actor}::${event.plan_id}`;
          const old=plans.get(key);
          if(event.action==='start'){
            if(old){failures.push({scene_id:scene.id,event_id:event.id,errors:['Повторное создание одного плана.']});accepted=false;break;}
            plans.set(key,{...value,goal:event.goal,goal_source:from,status:'active',actor:event.actor,plan_id:event.plan_id,history:[from],field_sources:Object.fromEntries(['goal','due_at','next_step','obstacle'].filter(k=>Object.hasOwn(event,k)).map(k=>[k,from]))});
          }else{
            const valid=!!old&&old.status!=='completed'&&old.status!=='abandoned'&&
              (event.action==='resume'?old.status==='paused':event.action==='pause'?old.status==='active':true);
            if(!valid){failures.push({scene_id:scene.id,event_id:event.id,errors:['Изменение несуществующего или завершённого плана.']});accepted=false;break;}
            const statuses={advance:'active',pause:'paused',resume:'active',complete:'completed',abandon:'abandoned'};
            const updated={...old,field_sources:{...old.field_sources}};
            for(const [field,value] of Object.entries(event.plan_patch||{})){
              if(field==='due_at'){delete updated.due;delete updated.deadline;}
              updated[field]=value;
              updated.field_sources[field]=from;
              if(field==='goal')updated.goal_source=from;
            }
            // Replay owns this history array; no previous projection is retained.
            // Append in place rather than copying an ever-growing chain on every update.
            old.history.push(from);
            plans.set(key,{...updated,status:statuses[event.action],source:from,history:old.history,last_action:event.action,
              evidence:event.evidence,performed_event_id:event.performed_event_id||old.performed_event_id});
          }
          break;
        }
      }
      if(accepted){if(event.dynamics_kind==='stock_operation'&&event.dynamics_version===1)acceptedStock.set(event.id,event);if(event.type==='money'){acceptedMoney.add(event.id);addBudgetFlow(budgetFlows,event,from);}eventCount++;if(event.type==='relationship'||(event.type==='world'&&event.interaction_version===1))relationshipHistory.push({source:from});}
    }
  }
  const list=m=>[...m.values()];
  const projection={budget_flows:budgetFlowRows(budgetFlows),effective_outfits:list(outfits),people:list(people),relationships:list(relationships),knowledge:list(knowledge),balances:list(balances),items:list(items),stock:list(stock),obligations:list(obligations),worldFacts:list(worldFacts),plans:list(plans),offscreen,relationship_history:relationshipHistory,events_replayed:eventCount,validation_warnings:failures};
  let next=null;
  if(capture&&scenes.length){
   const entries=m=>[...m.entries()];
   next={version:1,evidence_prevalidated:evidencePrevalidated,scene_count:scenes.length,head_scene_id:scenes.at(-1).id,state:structuredClone({
    people:entries(people),relationships:entries(relationships),knowledge:entries(knowledge),balances:entries(balances),items:entries(items),stock:entries(stock),obligations:entries(obligations),worldFacts:entries(worldFacts),plans:entries(plans),outfits:entries(outfits),
    budgetFlows:entries(budgetFlows).map(([k,v])=>[k,{...v,income:String(v.income),expense:String(v.expense)}]),
    offscreen,relationshipHistory,failures,awaiting,eventCount
   })};
  }
  return {projection,checkpoint:next,replayed_scenes:scenes.length-offset,reused_scenes:offset};
}

export function branchAncestry(allScenes,headId) {
  const index=new Map(allScenes.map(s=>[s.id,s]));
  const out=[];const visited=new Set();let id=headId;
  while(id){
    if(visited.has(id))throw new Error('В истории обнаружен цикл.');
    visited.add(id);
    const s=index.get(id);if(!s)throw new Error('В истории отсутствует сцена '+id);
    out.push(s);id=s.parent_scene_id;
    if(out.length>10000)throw new Error('Слишком длинная цепочка без снимка.');
  }
  return out.reverse();
}

export function buildNextContext({world,directives=[],scenes=[],evidencePrevalidated=false,historyComplete=true,turnOptions={},trustedProjection=null}){
  const projection=trustedProjection??replay(scenes,directives,{evidencePrevalidated});
  return {world_id:world.id,world_title:world.title,world_seed:world.seed,start_marker:world.start_marker,
    active_branch_id:world.active_branch_id,head_scene_id:scenes.at(-1)?.id??null,directive_version:world.directive_version,auto_save:world.auto_save,
    confirmed_scene_count:scenes.length,memory_complete:historyComplete,
    directives:directives.filter(d=>d.active!==false&&!isMenuDirective(d.text)).map(({text,category,metadata})=>({text,category,metadata})),
    memory:projection,
    player_choice:playerChoiceView(scenes,projection,{worldId:world.id,branchId:world.active_branch_id,rulesVersion:world.directive_version,complete:historyComplete}),
    active_story_drivers:storyDrivers(projection,directives),
    recorded_agenda:recordedWorldAgenda(scenes,projection),
    living_world:livingWorldView(scenes,projection,{complete:historyComplete,limit:8}),
    social_world:socialWorldView(projection,{complete:historyComplete,limit:8}),
    recorded_activities:activityView(projection,{complete:historyComplete,limit:8}),
    recorded_consequences:consequenceView(projection,{complete:historyComplete,limit:8}),
    recorded_growth:growthView(projection,{complete:historyComplete,limit:6}),
    world_dynamics:dynamicsView(projection,{complete:historyComplete,limit:6}),
    next_turn:prepareStoryTurn(scenes,projection,directives,{limit:12,...turnOptions,branchId:world.active_branch_id,complete:historyComplete}),
    recent_scenes:scenes.slice(-3).map(s=>({id:s.id,world_time:s.world_time,body:s.body})),
    history_available_by_pagination:true,
    memory_warning:(historyComplete?'':'История загружена не полностью. Результаты памяти НЕ полны. ')+'События проецируются только из размеченных фактов. Неразмеченные сцены необходимо читать, а не считать, будто событий в них не было.'};
}

/** Preflight only NEW economy events against the recorded active branch. SQL still
 * owns the expected-head transaction; direct SQL/revision parity is a separate step.
 */
export function validateEconomyAppend(scenes,events,body){
 const relevant=events.filter(e=>e?.type==='money'||e?.type==='item');
 if(!relevant.length)return {ok:true,errors:[]};
 const draftId='__pending_economy_scene__';
 const projection=replay([...scenes,{id:draftId,body,events}],[],{evidencePrevalidated:true});
 const warnings=projection.validation_warnings.filter(w=>w.scene_id===draftId);
 return {ok:warnings.length===0,errors:warnings.flatMap(w=>w.errors)};
}

/** Validate new state transitions before an MCP append, not merely after replay.
 * SQL still protects expected head; direct RPC and revision integration are separate.
 */
export function needsStatePreflight(events=[]){
 return events.some(e=>isWealth(e)||isDocument(e)||isMagicSociety(e)||isMagic(e)||isAdvanced(e)||(e?.type==='character'&&Object.hasOwn(e.state_patch||{},'birth_date'))||e?.type==='money'||e?.type==='item'||e?.type==='plan'||(e?.type==='world'&&(e.world_record_version===1||e.social_record_version===1||e.activity_version===1||e.consequence_version===1||e.growth_version===1||e.dynamics_version===1||e.player_life_version===1)));
}
export function validateStateAppend(scenes,events,body,{checkpoint=null,worldTime=null}={}){
 const routingErrors=events.map(knowledgeRoutingError).filter(Boolean);if(routingErrors.length)return {ok:false,errors:routingErrors};
 const draftId='__pending_state_scene__',history=[...scenes,{id:draftId,body,events,world_time:worldTime}];
 const p=checkpoint?replayWithCheckpoint(history,{evidencePrevalidated:true,checkpoint}).projection:replay(history,[],{evidencePrevalidated:true});
 return validateProjectedAppend(history,p,draftId,events);
}
/** Shared draft/save validation: no second replay, same domain-specific checks. */
export function validateProjectedAppend(history,p,draftId,events){
 const errors=p.validation_warnings.filter(w=>w.scene_id===draftId).flatMap(w=>w.errors);
 if(events.some(e=>isWealth(e)||e.type==='money'&&[e.actor,e.counterparty].some(a=>typeof a==='string'&&a.startsWith('treasury:'))))errors.push(...wealthIndex(history,p).warnings.filter(w=>w.scene_id===draftId).flatMap(w=>w.errors));
 if(events.some(isDocument))errors.push(...documentIndex(history,p).warnings.filter(w=>w.scene_id===draftId).flatMap(w=>w.errors));
 if(events.some(e=>isMagic(e)||isMagicSociety(e)))errors.push(...magicIndex(history,p).warnings.filter(w=>w.scene_id===draftId).flatMap(w=>w.errors));
 if(events.some(isAdvanced))errors.push(...advancedIndex(history,p).warnings.filter(w=>w.scene_id===draftId).flatMap(w=>w.errors));
 return {ok:errors.length===0,errors};
}
