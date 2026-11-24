import {extractLocks,pairKey} from './directives.mjs';

const text=value=>typeof value==='string'?value.trim():'';
const negative=new Set(['hostile','hate','hatred','enemies','enemy','rivals','rivalry','open_conflict']);
const resolved=new Set(['done','fulfilled','completed','cancelled','canceled','abandoned','resolved']);
const open=new Set(['active','open','pending','owed','unfulfilled']);

/** Story pressures from existing sources, not simulated actions or coerced plot beats.
 * These candidates are prompts for character choice, NOT new world facts.
 */
export function storyDrivers(projection={},directives=[],{max=16}={}){
 const result=[],locked=new Set();
 const push=entry=>{if(result.length<Math.max(1,Math.min(50,max)))result.push(entry);};
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
 for(const relationship of (Array.isArray(projection.relationships)?projection.relationships:[])){
  if(!text(relationship?.a)||!text(relationship?.b))continue;
  if(!negative.has(text(relationship.stance).toLowerCase()))continue;
  if(locked.has(pairKey(relationship.a,relationship.b)))continue;
  push({kind:'established_antagonism',actors:[relationship.a,relationship.b],
    stance:relationship.stance,source:relationship.source||null,
    certainty:'last_recorded_directional_relationship',
    guidance:'Вражда может продолжаться. Не навязывать уважение или компромисс; возможны односторонние и разные реакции.'});
 }
 return result;
}
export function storyDriverPrompt(drivers=[]){
 if(!drivers.length)return 'Персонажи не обязаны ждать действий главного героя. Из-за отсутствия разметки нельзя заключать, что у них нет целей: показывай инициативу в рамках реально написанных сцен и правил.';
 const lines=drivers.map((d)=>{
  if(d.kind==='author_relationship_boundary')
   return '• Запрет игрока: '+d.actors.join(' ↔ ')+'; без примирения: '+d.forbid_reconciliation+'; без уважения: '+d.forbid_respect+'.';
  if(d.kind==='npc_intention')
   return '• '+d.actor+' намерен: '+d.goal+' ('+d.status+'), источник '+(d.source?.scene_id||'не указан')+'. '+(d.next_step?'Возможный шаг: '+d.next_step+'. ':'')+(d.obstacle?'Препятствие: '+d.obstacle+'. ':'')+'Это ещё НЕ действие.';
  if(d.kind==='independent_thread')return '• Независимая линия: '+d.title+' ('+d.status+'); участники: '+d.actors.join(', ')+'; '+d.visibility+'. Не раскрывай без причины, не завершай автоматически.';
  if(d.kind==='recorded_commitment')
   return '• Обязательство '+d.commitment_id+'; состояние '+d.status+'; источник '+(d.source?.scene_id||'не указан')+'. Уточни перед признанием исполненным.';
  return '• Направленный конфликт: '+d.actors.join(' → ')+', '+d.stance+'. Не переосмысливай без событий.';
 });
 return 'ПРОВЕРЕННЫЕ НЕРЕШЁННЫЕ МОТИВЫ И ГРАНИЦЫ (не сценарий с обязательными событиями):\n'+
 lines.join('\n')+'\nГерои могут первыми высказывать желания, отвергать предложения, настаивать и действовать. Не заставляй их спрашивать разрешение на каждую реплику и не форсируй компромисс. Не выводи из намерения совершившийся факт.';
}
