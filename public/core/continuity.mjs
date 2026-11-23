import {extractLocks,pairKey} from './directives.mjs';
import {storyDrivers} from './story-drivers.mjs';

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
    if(event.type==='relationship'){
      if(!asText(event.a)||!asText(event.b))errors.push(`${prefix}: нужны оба участника.`);
      const lock=locks.get(pairKey(event.a,event.b));
      if(lock?.forbid_reconciliation&&RECONCILED.has(event.stance))
        errors.push(`${prefix}: противоречит закреплённому запрету на примирение.`);
      if(lock?.forbid_respect&&(event.stance==='respect'||event.stance==='admiration'||event.respect===true))
        errors.push(`${prefix}: противоречит закреплённому запрету на уважение.`);
    }
    if(event.type==='money'){
      if(!asText(event.actor)||!asText(event.currency)||!Number.isSafeInteger(event.delta))
        errors.push(`${prefix}: нужны владелец, валюта и точное целое изменение.`);
    }
    if(event.type==='knowledge'&&(!asText(event.actor)||!asText(event.fact)||!asText(event.channel)))
      errors.push(`${prefix}: нужны знающий, факт и канал знания.`);
    if(event.type==='item'&&(!asText(event.item_id)||!asText(event.action)))errors.push(`${prefix}: нужны ID предмета и действие.`);
    if(event.type==='plan'){
      if(!asText(event.actor)||!asText(event.plan_id)||!PLAN_ACTIONS.has(event.action))errors.push(`${prefix}: для плана нужны герой, ID и действие.`);
      if(event.action==='start'&&!asText(event.goal))errors.push(`${prefix}: начальный план требует собственную цель героя.`);
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
  const evidence=[]; const failures=[];
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
        case 'character': if(asText(event.name))people.set(event.name,value);break;
        case 'relationship': relationships.set(`${event.a}→${event.b}`,value);break;
        case 'knowledge':{
          const key=`${event.actor}::${event.fact}`;
          knowledge.set(key,value); break;
        }
        case 'money': {
          const key=`${event.actor}::${event.currency}`;
          const current=balances.get(key)||{actor:event.actor,currency:event.currency,known:false,delta:0};
          if(event.operation==='reconcile'){
            if(!Number.isSafeInteger(event.balance)||event.balance<0){failures.push({scene_id:scene.id,event_id:event.id,errors:['Некорректная сверка баланса.']});accepted=false;break;}
            balances.set(key,{...current,known:true,balance:event.balance,delta:0,source:from});
          }else{
            const next=current.known?current.balance+event.delta:null;
            if(current.known&&next<0){failures.push({scene_id:scene.id,event_id:event.id,errors:['Недостаточно подтверждённых средств.']});accepted=false;break;}
            balances.set(key,{...current,balance:next,delta:current.delta+event.delta,source:from});
          }
          break;
        }
        case 'item': items.set(event.item_id,value);break;
        case 'commitment': if(asText(event.commitment_id))obligations.set(event.commitment_id,value);break;
        case 'world': if(asText(event.key))worldFacts.set(event.key,value);break;
        case 'offscreen': offscreen.push(value);break;
        case 'plan': {
          const key=`${event.actor}::${event.plan_id}`;
          const old=plans.get(key);
          if(event.action==='start'){
            if(old){failures.push({scene_id:scene.id,event_id:event.id,errors:['Повторное создание одного плана.']});accepted=false;break;}
            plans.set(key,{...value,goal:event.goal,status:'active',actor:event.actor,plan_id:event.plan_id,history:[from]});
          }else{
            const valid=!!old&&old.status!=='completed'&&old.status!=='abandoned'&&
              (event.action==='resume'?old.status==='paused':event.action==='pause'?old.status==='active':true);
            if(!valid){failures.push({scene_id:scene.id,event_id:event.id,errors:['Изменение несуществующего или завершённого плана.']});accepted=false;break;}
            const statuses={advance:'active',pause:'paused',resume:'active',complete:'completed',abandon:'abandoned'};
            plans.set(key,{...old,status:statuses[event.action],source:from,history:[...old.history,from],last_action:event.action,
              performed_event_id:event.performed_event_id||old.performed_event_id});
          }
          break;
        }
      }
      if(accepted)evidence.push(from);
    }
  }
  const list=m=>[...m.values()];
  return {people:list(people),relationships:list(relationships),knowledge:list(knowledge),balances:list(balances),items:list(items),obligations:list(obligations),worldFacts:list(worldFacts),plans:list(plans),offscreen,events_replayed:evidence.length,validation_warnings:failures};
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
    recent_scenes:scenes.slice(-3).map(s=>({id:s.id,world_time:s.world_time,body:s.body})),
    history_available_by_pagination:true,
    memory_warning:(historyComplete?'':'История загружена не полностью. Результаты памяти НЕ полны. ')+'События проецируются только из размеченных фактов. Неразмеченные сцены необходимо читать, а не считать, будто событий в них не было.'};
}
