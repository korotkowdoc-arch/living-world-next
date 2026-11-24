import {extractLocks,pairKey} from './directives.mjs';
import {storyDrivers} from './story-drivers.mjs';
import {recordedWorldAgenda} from './world-time.mjs';
import {economyShapeError,applyMoney,applyItem} from './economy.mjs';
import {characterStateError,applyCharacter} from './character-state.mjs';
import {lifeRecordError,livingWorldView} from './living-world.mjs';
import {socialRecordError,socialTransitionError,socialWorldView} from './social-world.mjs';
import {knowledgeRecordError,knowledgeKey} from './knowledge.mjs';
import {relationshipError,relationshipKey,applyRelationship,interactionError} from './relationship-memory.mjs';
import {activityError,activityTransitionError,activityView} from './activities.mjs';

const TYPES=new Set(['character','relationship','knowledge','money','item','commitment','world','offscreen','plan']);
const PLAN_ACTIONS=new Set(['start','advance','pause','resume','complete','abandon']);
const RECONCILED=new Set(['friends','reconciled','peace','close_friends','romantic_partners']);
const asText=(v)=>typeof v==='string'?v.trim():'';

/** Validate a proposed scene BEFORE committing it, without pretending this proves literary quality. */
export function validateScene({body,events=[],directives=[],evidencePrevalidated=false}) {
  const errors=[];
  if(!evidencePrevalidated&&(typeof body!=='string'||body.trim().length<10))errors.push('Текст сцены слишком короткий.');
  if(typeof body==='string'&&body.length>200000)errors.push('Сцена длиннее 200 000 символов.');
  if(!Array.isArray(events)||events.length>100)errors.push('Слишком много событий или неверный формат.');
  const locks=new Map(extractLocks(directives).map(x=>[pairKey(x.a,x.b),x]));
  const ids=new Set();
  for(const [i,event] of (Array.isArray(events)?events:[]).entries()){
    const prefix=`Событие ${i+1}`;
    if(!event||typeof event!=='object'||Array.isArray(event)){errors.push(`${prefix}: неверный объект.`);continue;}
    if(!TYPES.has(event.type))errors.push(`${prefix}: неизвестный тип.`);
    if(!asText(event.id)||ids.has(event.id))errors.push(`${prefix}: требуется уникальный ID.`);
    ids.add(event.id);
    if(!asText(event.evidence)||(!evidencePrevalidated&&(typeof body!=='string'||!body.includes(event.evidence))))errors.push(`${prefix}: нужна дословная цитата из сцены.`);
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
      const error=lifeRecordError(event)||socialRecordError(event)||interactionError(event)||activityError(event);if(error)errors.push(prefix+': '+error);
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
        const actual=Array.isArray(events)&&events.find(x=>x?.id===event.performed_event_id&&x!==event&&['world','offscreen'].includes(x.type));
        if(!actual)errors.push(`${prefix}: завершённый план требует ID доказанного действия world/offscreen из этой сцены.`);
      }
    }
  }
  return {ok:errors.length===0,errors};
}

/** Replay only the actual ancestry of one branch, oldest first. No other branch can leak in. */
export function replay(scenes=[],directives=[],{evidencePrevalidated=false}={}) {
  const people=new Map(), relationships=new Map(), knowledge=new Map(), balances=new Map(), items=new Map(), obligations=new Map(), worldFacts=new Map(), plans=new Map(), offscreen=[];
  const evidence=[]; const failures=[]; const relationshipHistory=[];
  for(const scene of scenes){
    const events=Array.isArray(scene.events)?scene.events:[];
    // Replay checks the whole saved package once; current user rules NEVER rewrite past facts.
    const result=validateScene({body:scene.body,events,directives:[],evidencePrevalidated});
    if(!result.ok){failures.push({scene_id:scene.id,errors:result.errors});continue;}
    for(const event of events){
      let accepted=true;
      const from={scene_id:scene.id,event_id:event.id,world_time:scene.world_time??null};
      const value={...event,source:from};
      switch(event.type){
        case 'character': if(asText(event.name)){const name=asText(event.name);people.set(name,applyCharacter(people.get(name),event,from));}break;
        case 'relationship': {const key=relationshipKey(event);relationships.set(key,applyRelationship(relationships.get(key),event,from));break;}
        case 'knowledge':{
          const key=knowledgeKey(event);
          knowledge.set(key,value); break;
        }
        case 'money':
        case 'item': {
          const error=event.type==='money'?applyMoney(balances,event,from):applyItem(items,event,from);
          if(error){failures.push({scene_id:scene.id,event_id:event.id,errors:[error]});accepted=false;}
          break;
        }
        case 'commitment': if(asText(event.commitment_id))obligations.set(event.commitment_id,value);break;
        case 'world': if(asText(event.key)){
          const err=socialTransitionError(worldFacts.get(event.key),event)||activityTransitionError(worldFacts.get(event.key),event);
          if(err){failures.push({scene_id:scene.id,event_id:event.id,errors:[err]});accepted=false;}
          else worldFacts.set(event.key,value);
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
            plans.set(key,{...updated,status:statuses[event.action],source:from,history:[...old.history,from],last_action:event.action,
              evidence:event.evidence,performed_event_id:event.performed_event_id||old.performed_event_id});
          }
          break;
        }
      }
      if(accepted){evidence.push(from);if(event.type==='relationship'||(event.type==='world'&&event.interaction_version===1))relationshipHistory.push({source:from});}
    }
  }
  const list=m=>[...m.values()];
  return {people:list(people),relationships:list(relationships),knowledge:list(knowledge),balances:list(balances),items:list(items),obligations:list(obligations),worldFacts:list(worldFacts),plans:list(plans),offscreen,relationship_history:relationshipHistory,events_replayed:evidence.length,validation_warnings:failures};
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

export function buildNextContext({world,directives=[],scenes=[],evidencePrevalidated=false,historyComplete=true}){
  const projection=replay(scenes,directives,{evidencePrevalidated});
  return {world_id:world.id,world_title:world.title,world_seed:world.seed,start_marker:world.start_marker,
    active_branch_id:world.active_branch_id,head_scene_id:scenes.at(-1)?.id??null,directive_version:world.directive_version,auto_save:world.auto_save,
    confirmed_scene_count:scenes.length,memory_complete:historyComplete,
    directives:directives.filter(d=>d.active!==false).map(({text,category,metadata})=>({text,category,metadata})),
    memory:projection,
    active_story_drivers:storyDrivers(projection,directives),
    recorded_agenda:recordedWorldAgenda(scenes,projection),
    living_world:livingWorldView(scenes,projection,{complete:historyComplete,limit:8}),
    social_world:socialWorldView(projection,{complete:historyComplete,limit:8}),
    recorded_activities:activityView(projection,{complete:historyComplete,limit:8}),
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
