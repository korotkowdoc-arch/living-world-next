/** Read exact historical passages for narrator-assisted annotation. Never infer facts
 * from word patterns and never mutate the original scene. Offsets are UTF-16 indices.
 */
export function annotationPassages(scene,{offset=0,limit=6,maxChars=1600}={}){
 if(typeof scene?.body!=='string')throw Error('Нет текста сцены.');
 const body=scene.body;
 if(!Number.isSafeInteger(offset)||offset<0||offset>body.length)throw Error('Неверное смещение текста.');
 if(offset>0&&offset<body.length&&/[\uDC00-\uDFFF]/.test(body[offset]))throw Error('Смещение внутри символа.');
 const count=Math.max(1,Math.min(8,Math.floor(Number(limit)||6)));
 const cap=Math.max(400,Math.min(2000,Math.floor(Number(maxChars)||1600)));
 const events=Array.isArray(scene.events)?scene.events:[];
 const out=[];let cursor=offset;
 while(cursor<body.length&&out.length<count){
  let end=Math.min(body.length,cursor+cap);
  if(end<body.length){
   const paragraph=body.lastIndexOf('\n\n',end-2);
   const newline=body.lastIndexOf('\n',end-1);
   const space=body.lastIndexOf(' ',end-1);
   if(paragraph>=cursor+cap/2)end=paragraph+2;
   else if(newline>=cursor+cap/2)end=newline+1;
   else if(space>=cursor+cap/2)end=space+1;
   if(/[\uDC00-\uDFFF]/.test(body[end]))end--;
  }
  const quote=body.slice(cursor,end);
  const ids=events.filter(e=>typeof e?.evidence==='string'&&e.evidence.trim()&&quote.includes(e.evidence)).map(e=>e.id);
  out.push({start:cursor,end,quote,existing_event_ids:ids,kind:'source_passage_not_extracted_fact'});
  cursor=end;
 }
 return {scene_id:scene.id,world_time:scene.world_time??null,body_chars:body.length,passages:out,
  next_offset:cursor<body.length?cursor:null,existing_event_count:events.length,
  policy:'Read complete source context before proposing facts. Existing event IDs mark literal evidence inside a passage, not proof that all its facts were annotated. Distinguish spoken claims, intentions, dreams, hypotheticals and actual actions. Do not write historical annotations as a new fictional event or silently alter the original scene.'};
}
