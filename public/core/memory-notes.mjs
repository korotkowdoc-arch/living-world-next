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
