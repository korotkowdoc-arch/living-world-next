import {normalizeLegacyKnowledge} from './knowledge.mjs';
/** Evidence-only memory packaging. A text hit is NOT a confirmed event or relationship. */
export function actorMemoryEvidence({actor,confirmedEvents=[],textMentions=[],headSceneId=null}){
 const name=String(actor??'').trim();
 if(!name||name.length>140)throw Error('Некорректное имя персонажа.');
 if(!Array.isArray(confirmedEvents)||!Array.isArray(textMentions))
  throw Error('Не удалось проверить источники воспоминаний.');
 return {
  actor:name,
  active_head_scene_id:headSceneId,
  confirmed_events:confirmedEvents.map(r=>({scene_id:r.scene_id,world_time:r.world_time,
   created_at:r.created_at,event:r.event,confidence:'structured_confirmed'})),
  literal_mentions:textMentions.map(r=>({scene_id:r.scene_id,world_time:r.world_time,
   created_at:r.created_at,quote:r.snippet,confidence:'literal_text_only'})),
  reliability:'Text mentions are quotations from played active-branch scenes, not proof of what happened or who knew. To assert a fact, open source scene and verify context.',
  next_action:'If a detail matters, retrieve the full scene with get_story_scene before using it in narration.'
 };
}

/** A stored annotation returned by SQL is not necessarily accepted by replay.
 * Match exact actor identity and active ancestry before presenting it as confirmed. */
export function verifiedActorHistory(rows,scenes,projection,actor){
 const rejectedScenes=new Set(),rejectedEvents=new Set(),byScene=new Map(scenes.map(s=>[s.id,s]));
 for(const w of projection.validation_warnings||[]){if(w.event_id)rejectedEvents.add(JSON.stringify([w.scene_id,w.event_id]));else rejectedScenes.add(w.scene_id);}
 const confirmed=[],unverified=[];let supplemental=0;
 for(const row of rows){
  if(Object.hasOwn(row.event||{},'scene_memory_version')){supplemental++;continue;}
  const raw=byScene.get(row.scene_id)?.events?.find(e=>e.id&&e.id===row.event?.id);
  const exact=raw&&[raw.actor,raw.type==='character'?raw.name:null,raw.a,raw.b,raw.sender,raw.recipient,raw.counterparty,raw.responsible,...(Array.isArray(raw.actors)?raw.actors:[])].includes(actor);
  const reason=!raw?'source_not_in_loaded_ancestry':!exact?'actor_identity_requires_review':rejectedScenes.has(row.scene_id)||rejectedEvents.has(JSON.stringify([row.scene_id,raw.id]))?'rejected_by_replay':null;
  if(reason){unverified.push({scene_id:row.scene_id,event_id:row.event?.id??null,reason});continue;}
  confirmed.push({...row,event:normalizeLegacyKnowledge(raw)});
 }
 return {confirmed,unverified,supplemental};
}
