import {extractLocks,pairKey} from './directives.mjs';

const text=value=>typeof value==='string'?value.trim():'';
const negative=new Set(['hostile','hate','hatred','enemies','enemy','rivals','rivalry','open_conflict']);
const resolved=new Set(['done','fulfilled','completed','cancelled','canceled','abandoned','resolved']);
const open=new Set(['active','open','pending','owed','unfulfilled']);

/** Story pressures from existing sources, not simulated actions or coerced plot beats.
 * These candidates are prompts for character choice, NOT new world facts.
 */
export function storyDrivers(projection={},directives=[],{max=16,actors=[]}={}){
 const result=[],locked=new Set();
 const push=entry=>result.push(entry);
 const activeRules=Array.isArray(directives)?directives.filter(d=>d?.active!==false):[];
 const locks=extractLocks(activeRules);
 for(const lock of locks){
  const key=pairKey(lock.a,lock.b);locked.add(key);
  push({kind:'author_relationship_boundary',actors:[lock.a,lock.b],
    forbid_reconciliation:!!lock.forbid_reconciliation,
    forbid_respect:!!lock.forbid_respect,
    certainty:'binding_author_rule',
    guidance:'Не превращать вынужденное сотрудничество или общую опасность в уважение и дружбу.'});
 }
 for(const plan of (Array.isArray(projection.plans)?projection.plans:[])){
  if(!['active','paused'].includes(plan?.status)||!text(plan.actor)||!text(plan.goal))continue;
  push({kind:'npc_intention',actor:plan.actor,goal:plan.goal,status:plan.status,next_step:plan.next_step||null,obstacle:plan.obstacle||null,
    source:plan.source||null,certainty:'recorded_intention_not_performed',
    guidance:plan.status==='paused'
     ?'План отложен: не возобновлять и не завершать без причины и сцены.'
     :'Цель может побудить героя говорить или действовать самостоятельно. Реальный поступок требуется показать и сохранить в сцене.'});
 }
 // Interleave one independent plot thread between plans and obligations where
 // possible; all remaining threads are retrieved by the dedicated MCP.
 for(const thread of (projection.worldFacts||[]).filter(x=>x.social_record_version===1&&x.social_kind==='thread'&&['open','paused'].includes(x.status)).slice(-4).reverse()){
  push({kind:'independent_thread',title:thread.title,actors:thread.actors,description:thread.description,status:thread.status,
   visibility:thread.visibility||'unknown',source:thread.source||null,
   certainty:'recorded_unresolved_situation',
   guidance:'Проверить время, обстоятельства и знания участников. Не завершать автоматически; не раскрывать приватную линию герою без канала знания.'});
 }
 for(const obligation of (Array.isArray(projection.obligations)?projection.obligations:[])){
  const status=text(obligation?.status).toLowerCase();
  if(resolved.has(status))continue;
  if(!text(obligation?.commitment_id))continue;
  push({kind:'recorded_commitment',commitment_id:obligation.commitment_id,
    actor:obligation.actor||null,status:open.has(status)?status:'unknown',
    summary:obligation.description||obligation.evidence||'Обязательство требует проверки первоисточника.',
    source:obligation.source||null,
    certainty:open.has(status)?'recorded_open_obligation':'completion_status_unknown',
    guidance:'Сверить последнюю сцену и актуальное исполнение. Не считать обещание автоматически выполненным.'});
 }
 for(const activity of (projection.worldFacts||[]).filter(x=>x.activity_version===1&&x.activity_kind==='activity'&&['planned','in_progress'].includes(x.status)).slice(-3).reverse()){
  push({kind:'shared_activity',title:activity.name,actors:activity.actors,status:activity.status,source:activity.source,certainty:'recorded_activity_status',guidance:'Участие и итог показывать в сцене; не выводить дружбу из совместной деятельности.'});
 }
 for(const consequence of (projection.worldFacts||[]).filter(x=>x.consequence_version===1&&x.status!=='resolved').slice(-4).reverse()){
  push({kind:'lasting_consequence',actor:consequence.actor,description:consequence.description,status:consequence.status,source:consequence.source,certainty:'recorded_consequence',guidance:'Не отменяй последствие без события. Оспаривание не доказывает вину, разрешение не означает прощения.'});
 }
 for(const project of (projection.worldFacts||[]).filter(x=>x.growth_version===1&&x.growth_kind==='project'&&['planned','active','paused'].includes(x.status)).slice(-5).reverse()){
  push({kind:'personal_project',actor:project.actor,title:project.title,status:project.status,next_step:project.next_step||null,obstacle:project.obstacle||null,source:project.source,certainty:'recorded_project_not_completed',guidance:'Проект развивается через реальные попытки, ошибки и достигнутые результаты, не автоматически.'});
 }
 for(const bond of (projection.worldFacts||[]).filter(x=>x.dynamics_version===1&&x.dynamics_kind==='bond'&&['marriage','parenthood','cohabitation','romantic'].includes(x.bond_type)&&['active','strained','estranged'].includes(x.status)).slice(-4).reverse()){
  push({kind:'personal_life',actors:[bond.actor,bond.counterparty],bond_type:bond.bond_type,status:bond.status,source:bond.source,certainty:'recorded_social_bond',guidance:'Учитывай самостоятельные семейные обязанности и личные цели NPC. Связь не доказывает чувства или согласие.'});
 }
 for(const relationship of (Array.isArray(projection.relationships)?projection.relationships:[])){
  if(!text(relationship?.a)||!text(relationship?.b))continue;
  const remembered=(relationship.relationship_fields||[]).filter(x=>['hatred','resentful','distrusted','disrespected'].includes(x.value));
  if(!negative.has(text(relationship.stance).toLowerCase())&&!remembered.length)continue;
  if(locked.has(pairKey(relationship.a,relationship.b)))continue;
  push({kind:'established_antagonism',actors:[relationship.a,relationship.b],
    stance:relationship.stance||remembered.map(x=>x.value).join(', '),source:relationship.stance_source||relationship.source||null,relationship_fields:remembered.map(x=>({field:x.field,value:x.value,source:x.source})),
    certainty:'last_recorded_directional_relationship',
    guidance:'Вражда может продолжаться. Не навязывать уважение или компромисс; возможны односторонние и разные реакции.'});
 }
 // Binding rules first; round-robin remaining kinds to avoid many plans starving conflicts.
 const cap=Math.max(1,Math.min(50,Math.floor(Number(max)||16)));
 const focus=new Set(Array.isArray(actors)?actors:[]);
 const relevant=x=>focus.has(x.actor)||(x.actors||[]).some(a=>focus.has(a));
 const rules=result.filter(x=>x.kind==='author_relationship_boundary'),out=rules.slice(0,cap),groups=new Map();
 for(const x of result)if(x.kind!=='author_relationship_boundary'){if(!groups.has(x.kind))groups.set(x.kind,[]);groups.get(x.kind).push(x);}
 if(focus.size){for(const group of groups.values())group.sort((a,b)=>Number(relevant(b))-Number(relevant(a)));}
 for(let i=0;out.length<cap;i++){let added=false;for(const group of groups.values()){if(group[i]){out.push(group[i]);added=true;if(out.length===cap)break;}}if(!added)break;}
 return out;
}
export function storyDriverPrompt(drivers=[]){
 if(!drivers.length)return 'Персонажи не обязаны ждать действий главного героя. Из-за отсутствия разметки нельзя заключать, что у них нет целей: показывай инициативу в рамках реально написанных сцен и правил.';
 const lines=drivers.map((d)=>{
  if(d.kind==='author_relationship_boundary')
   return '• Запрет игрока: '+d.actors.join(' ↔ ')+'; без примирения: '+d.forbid_reconciliation+'; без уважения: '+d.forbid_respect+'.';
  if(d.kind==='npc_intention')
   return '• '+d.actor+' намерен: '+d.goal+' ('+d.status+'), источник '+(d.source?.scene_id||'не указан')+'. '+(d.next_step?'Возможный шаг: '+d.next_step+'. ':'')+(d.obstacle?'Препятствие: '+d.obstacle+'. ':'')+'Это ещё НЕ действие.';
  if(d.kind==='independent_thread')return '• Независимая линия: '+d.title+' ('+d.status+'); участники: '+d.actors.join(', ')+'; '+d.visibility+'. Не раскрывай без причины, не завершай автоматически.';
  if(d.kind==='shared_activity')return '• Совместное занятие: '+d.title+' ('+d.status+'); участники: '+d.actors.join(', ')+'. Не считать выполненным заранее.';
  if(d.kind==='lasting_consequence')return '• Последствие для '+d.actor+': '+d.description+' ('+d.status+'). Не стирай без записанного изменения.';
  if(d.kind==='personal_life')return '• Личная жизнь: '+d.actors.join(' ↔ ')+'; '+d.bond_type+' ('+d.status+'). Учитывай самостоятельные цели и обязанности, не выводи чувства автоматически.';
  if(d.kind==='personal_project')return '• Личный проект '+d.actor+': '+d.title+' ('+d.status+'). '+(d.next_step?'Возможный шаг: '+d.next_step+'. ':'')+(d.obstacle?'Препятствие: '+d.obstacle+'. ':'')+'Не считать завершённым заранее.';
  if(d.kind==='recorded_commitment')
   return '• Обязательство '+d.commitment_id+'; состояние '+d.status+'; источник '+(d.source?.scene_id||'не указан')+'. Уточни перед признанием исполненным.';
  return '• Направленный конфликт: '+d.actors.join(' → ')+', '+d.stance+'. Не переосмысливай без событий.';
 });
 return 'ПРОВЕРЕННЫЕ НЕРЕШЁННЫЕ МОТИВЫ И ГРАНИЦЫ (не сценарий с обязательными событиями):\n'+
 lines.join('\n')+'\nГерои могут первыми высказывать желания, отвергать предложения, настаивать и действовать. Не заставляй их спрашивать разрешение на каждую реплику и не форсируй компромисс. Не выводи из намерения совершившийся факт.';
}
