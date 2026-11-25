import {sceneSaveAudit,isSceneMemory} from './scene-memory-routing.mjs';
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

/** Bounded review of a pinned newest-first page; counts annotations, not semantic completeness.
 * For nonzero offsets the SQL request includes the preceding row as an overlap. */
export function memoryReviewPage(rows,{head,offset=0,limit=20}={}){
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>40||!Array.isArray(rows)||rows.length>limit+1+Number(offset>0))throw Error('Invalid memory review page');
 const seen=new Set();let expected=offset===0?head:rows[0]?.id;
 for(const r of rows){
  if(!r?.id||r.id!==expected||seen.has(r.id)||!Object.hasOwn(r,'parent_scene_id'))throw Error('Invalid or mixed memory ancestry');
  seen.add(r.id);expected=r.parent_scene_id;
 }
 if(offset===0&&head!=null&&!rows.length)throw Error('Missing history head');
 if(rows.length&&expected!==null&&rows.length<limit+1+Number(offset>0))throw Error('Incomplete history page');
 const page=rows.slice(Number(offset>0),limit+Number(offset>0));
 const items=page.map(s=>({scene_id:s.id,world_time:s.world_time??null,event_count:Array.isArray(s.events)?s.events.length:0,
  annotation_state:s.events?.some(e=>!isSceneMemory(e))?'has_structured_events':'no_structured_events',interpretive_memory_count:(s.events||[]).filter(isSceneMemory).length,unclassified_event_count:sceneSaveAudit('',s.events||[]).unclassified_count,domain_routing:sceneSaveAudit('',s.events||[]).routes.map(r=>({domain:r.domain,count:r.count}))}));
 return {items,next_offset:rows.length>limit+Number(offset>0)?offset+limit:null,policy:'Review candidates only. Event count does not prove semantic coverage; notes may already exist. Read exact source, distinguish claims and facts, and save derived notes separately if enabled.'};
}
/** Literal coverage is a diagnostic, not a semantic classifier or required quota. */
export function draftEvidenceCoverage(body,events=[]){
 if(typeof body!=='string')return null;
 const passages=[];let offset=0,total=0,uncovered=0;
 // Use exact offsets; only a handful of excerpts are returned, never all prose.
 do{
  const batch=annotationPassages({body,events},{offset,limit:8,maxChars:1600});
  for(const p of batch.passages){total++;if(!p.existing_event_ids.length){uncovered++;if(passages.length<5)passages.push({start:p.start,end:p.end,excerpt:p.quote.slice(0,320)});}}
  offset=batch.next_offset;
 }while(offset!==null);
 return {passage_count:total,passages_without_local_evidence:uncovered,uncovered_examples:passages,omitted_examples:Math.max(0,uncovered-passages.length),policy:'A passage without a local literal event quote may contain only dialogue or description, or a quote spanning passages. Review for significant changes; do not invent events or annotate every sentence.'};
}
