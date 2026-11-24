/** Historical semantic notes are retrieval aids, not committed events. */
const types=new Set(['action','claim','intention','belief','relationship','place','other']);
export function validateMemoryNotes(scene,notes){
 if(typeof scene?.body!=='string'||!Array.isArray(notes)||notes.length<1||notes.length>20)throw Error('Нужно от 1 до 20 предложений памяти.');
 const keys=new Set();
 return notes.map(n=>{
  if(!n||typeof n!=='object'||Array.isArray(n)||typeof n.key!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(n.key)||keys.has(n.key)||
   !types.has(n.kind)||typeof n.summary!=='string'||!n.summary.trim()||n.summary.length>600||
   typeof n.quote!=='string'||!n.quote.trim()||n.quote.length>1200||!scene.body.includes(n.quote)||
   !Array.isArray(n.actors)||n.actors.length>8||n.actors.some(x=>typeof x!=='string'||!x.trim()||x.length>140)||new Set(n.actors).size!==n.actors.length)
   throw Error('Неверное предложение памяти или отсутствует точная цитата.');
  keys.add(n.key);
  return {key:n.key,kind:n.kind,summary:n.summary,quote:n.quote,actors:n.actors};
 });
}
export const MEMORY_NOTE_POLICY='Narrator-derived historical notes are interpretations, NOT confirmed events. Verify the complete source scene, speaker and context before use. Never inject notes into the canonical event replay, economy or character knowledge.';

/** Historical hints are not a projection. Fairly select by exact queried holder, deduplicate,
 * preserve the source scene and never silently mark a failed request as empty. */
export function focusedMemoryNotes(groups,{maxChars=7000,maxNotes=12}={}){
 const selected=[],seen=new Set(),available=groups.filter(x=>x.status==='available');
 const result={canonical:false,status:groups.length===0?'not_requested':available.length===groups.length?'available':available.length?'partial':'unavailable',notes:selected,omitted:0,
  actors:groups.map(x=>({actor:x.actor,status:x.status,returned:Array.isArray(x.rows)?x.rows.length:0,more_may_exist:!!x.more})),policy:MEMORY_NOTE_POLICY};
 const keys=new Set();
 for(const group of available)for(const row of group.rows||[])if(row?.scene_id&&row?.note_key&&row.note)keys.add(JSON.stringify([row.scene_id,row.note_key]));
 result.omitted=keys.size;
 for(let i=0;i<40;i++)for(const group of available){
  const r=group.rows[i];if(!r?.scene_id||!r.note_key||!r.note)continue;
  const id=JSON.stringify([r.scene_id,r.note_key]);if(seen.has(id))continue;seen.add(id);
  if(selected.length>=maxNotes)continue;
  const n=r.note;
  selected.push({scene_id:r.scene_id,note_key:r.note_key,kind:n.kind,actors:n.actors,summary:String(n.summary||'').slice(0,360),quote:String(n.quote||'').slice(0,400),quote_truncated:String(n.quote||'').length>400});
  result.omitted--;
  if(JSON.stringify(result).length>maxChars){selected.pop();result.omitted++;}
 }
 return result;
}
