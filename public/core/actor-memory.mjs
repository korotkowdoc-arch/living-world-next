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
