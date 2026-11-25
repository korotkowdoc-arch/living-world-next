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

/** Bounded read-only historical index. Query hits are retrieval hints, never
 * canonical facts or grants of knowledge. No fuzzy actor identity inference. */
const normalized=v=>String(v??'').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').trim();
export function historicalNoteIndex(rows,scenes,{queries=[],actors=[],complete=false,historyComplete=false,maxNotes=12,maxChars=7000}={}){
 const source=new Map(scenes.map((s,i)=>[s.id,i])),seen=new Set(),valid=[],invalid=[];
 for(const r of rows){
  const id=JSON.stringify([r?.scene_id,r?.note_key]),n=r?.note;
  if(!source.has(r?.scene_id)||!r?.note_key||!n||!types.has(n.kind)||typeof n.summary!=='string'||typeof n.quote!=='string'||!Array.isArray(n.actors)){invalid.push(id);continue;}
  if(seen.has(id))continue;seen.add(id);valid.push(r);
 }
 const q=[...new Set(queries.map(normalized).filter(Boolean))],focus=new Set(actors);
 const sceneIds=new Set(valid.map(r=>r.scene_id)),kinds=Object.create(null),actorNames=new Set();
 for(const r of valid){const n=r.note;kinds[n.kind]=(kinds[n.kind]||0)+1;for(const a of n.actors)actorNames.add(a);}
 const result={canonical:false,scan_complete:complete&&historyComplete&&invalid.length===0,scanned_notes:valid.length,invalid_records:invalid.length,scenes_with_historical_notes:sceneIds.size,scenes_without_notes_in_scan:scenes.filter(s=>!sceneIds.has(s.id)).length,kind_counts:kinds,notes:[],total_matching:0,omitted:0,possible_actor_aliases:[],policy:MEMORY_NOTE_POLICY+' Alias candidates require source verification; missing notes in a partial scan do not establish absence.'};
 for(const actor of focus){const full=normalized(actor),first=full.split(/\s+/)[0];if(full===first||first.length<3)continue;
  const candidates=[...actorNames].filter(a=>normalized(a)===first&&a!==actor);
  for(const alias of candidates)result.possible_actor_aliases.push({actor,alias,verified:false});
 }
 const ranked=valid.map(r=>{const n=r.note,hay=normalized([r.note_key,n.summary,n.quote,...n.actors].join('\n')),matches=q.filter(v=>hay.includes(v)),overlap=n.actors.filter(a=>focus.has(a)).length;return {r,matches,score:matches.length*10+overlap};}).filter(x=>q.length&&x.matches.length);
 ranked.sort((a,b)=>b.score-a.score||source.get(b.r.scene_id)-source.get(a.r.scene_id)||a.r.note_key.localeCompare(b.r.note_key));
 result.total_matching=ranked.length;
 for(const {r,matches} of ranked){if(result.notes.length>=maxNotes)break;const n=r.note;
  result.notes.push({scene_id:r.scene_id,note_key:r.note_key,kind:n.kind,actors:n.actors,summary:n.summary.slice(0,360),quote:n.quote.slice(0,400),quote_truncated:n.quote.length>400,matched_queries:matches});
  if(JSON.stringify(result).length>maxChars)result.notes.pop();
 }
 result.omitted=ranked.length-result.notes.length;return result;
}
