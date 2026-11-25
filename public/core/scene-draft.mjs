import {replay,validateScene,needsStatePreflight} from './continuity.mjs';
import {draftEvidenceCoverage} from './annotation-passages.mjs';
import {parseStoryDate} from './world-time.mjs';
export function reviewSceneDraft(memory,{body,events=[],directives=[],world_time=null}={}){
 const checked=validateScene({body,events,directives});
 const result={ok:checked.ok,errors:[...checked.errors],warnings:[],changes:[],omitted_changes:0,saved:false,canonical:false};
 if(!checked.ok)return result;
 result.evidence_coverage=draftEvidenceCoverage(body,events);
 if(!memory?.complete&&needsStatePreflight(events)){result.ok=false;result.errors.push('Для проверки переходов нужна полная память.');return result;}
 const scenes=memory?.scenes||[],id='__draft_preview__';
 const before=replay(scenes,[],{evidencePrevalidated:true});
 const after=replay([...scenes,{id,body,events,world_time}],[],{evidencePrevalidated:true});
 const rejected=after.validation_warnings.filter(x=>x.scene_id===id);
 if(rejected.length){result.ok=false;result.errors.push(...rejected.flatMap(x=>x.errors));return result;}
 const clock=parseStoryDate(scenes.at(-1)?.world_time),next=parseStoryDate(world_time);
 if(world_time&&!next)result.warnings.push('Время не имеет точного формата; длительность не установлена.');
 if(clock&&next&&next.order<clock.order&&(clock.precision===next.precision||clock.day!==next.day))result.warnings.push('Дата раньше последней сцены: проверь флешбэк или выбери альтернативную ветку.');
 if(!memory?.complete)result.warnings.push('Неполная история: показана только проверка доступной памяти.');
 const changes=[];
 for(const kind of ['people','relationships','knowledge','balances','items','stock','obligations','worldFacts','plans','offscreen','effective_outfits']){
  for(const record of after[kind]||[]){
   if(record.source?.scene_id!==id)continue;
   changes.push({category:kind,key:record.key||record.record_id||record.product_id||record.item_id||record.plan_id||record.commitment_id||record.topic_id||record.name||record.actor||record.id||null,
    actor:record.actor||record.name||record.a||null,status:record.status||record.stance||null,source_event_id:record.source.event_id,certainty:'draft_only_not_committed'});
  }
 }
 // Keyless interactions are intentionally absent from worldFacts but still
 // accepted history. Preview them separately without changing canon.
 const acceptedInteractions=new Set(after.relationship_history.filter(x=>x.source.scene_id===id).map(x=>x.source.event_id));
 for(const e of events){
  if(e.type!=='world'||e.interaction_version!==1||!acceptedInteractions.has(e.id))continue;
  if(changes.some(x=>x.source_event_id===e.id))continue;
  changes.push({category:'interaction',key:e.id,actors:e.actors,kind:e.interaction_kind,source_event_id:e.id,certainty:'draft_only_not_committed'});
 }
 result.changes=changes.slice(0,40);result.omitted_changes=Math.max(0,changes.length-40);result.events_accepted=after.events_replayed-before.events_replayed;return result;
}
