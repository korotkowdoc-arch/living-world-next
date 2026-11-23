/** Mobile reading preferences and stable long-history pagination.
 * Preferences are local-only and never contain world text or tokens.
 */
export const DEFAULT_READER=Object.freeze({fontSize:18,lineHeight:1.7});
export function normalizeReaderPrefs(value){
 const data=value&&typeof value==='object'?value:{};
 const font=Number(data.fontSize);
 const height=Number(data.lineHeight);
 return {
  fontSize:Number.isFinite(font)?Math.max(15,Math.min(30,Math.round(font))):DEFAULT_READER.fontSize,
  lineHeight:Number.isFinite(height)?Math.max(1.35,Math.min(2.3,Math.round(height*10)/10)):DEFAULT_READER.lineHeight
 };
}
export function readReaderPrefs(storage){
 try{return normalizeReaderPrefs(JSON.parse(storage?.getItem('lw_next_reader_preferences')||'null'));}
 catch{return {...DEFAULT_READER};}
}
export function saveReaderPrefs(storage,value){
 const next=normalizeReaderPrefs(value);
 try{storage?.setItem('lw_next_reader_preferences',JSON.stringify(next));}catch{}
 return next;
}
/** existing = chronological loaded suffix; page = next older page newest first.
 * Never merge a page from another branch/head or silently duplicate a scene.
 */
export function prependHistoryPage(existing,page,{expectedHead}={}){
 if(!Array.isArray(existing)||!Array.isArray(page))throw Error('Некорректная страница истории.');
 if(expectedHead!==undefined && (existing.at(-1)?.id||null)!==expectedHead)
  throw Error('История изменилась. Обнови ветку.');
 const known=new Set(existing.map(s=>s.id));
 if(known.size!==existing.length)throw Error('Повтор сцены в загруженной истории.');
 const seen=new Set();
 for(const scene of page){
  if(!scene?.id||seen.has(scene.id)||known.has(scene.id))
   throw Error('История изменилась или содержит повтор сцены.');
  seen.add(scene.id);
 }
 const first=existing[0];
 if(first&&page.length&&first.parent_scene_id!==page[0].id)
  throw Error('В истории обнаружен разрыв. Обнови ветку.');
 for(let i=1;i<page.length;i++)
  if(page[i-1].parent_scene_id!==page[i].id)
   throw Error('Нарушена последовательность загруженной истории.');
 return [...page].reverse().concat(existing);
}
