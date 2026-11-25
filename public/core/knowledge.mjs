/** Separate what a character believes from objective facts. Stable topic IDs
 * connect versions for ONE holder, never propagate information to other people.
 */
const text=v=>typeof v==='string'?v.trim():'';
const statuses=new Set(['knows','believes','suspects','misinformed','forgotten','unknown']);
export function knowledgeRecordError(e){
 if(e.type!=='knowledge'||e.knowledge_version===undefined)return null;
 if(e.knowledge_version!==1||typeof e.topic_id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(e.topic_id)||!statuses.has(e.status)||
 !text(e.actor)||e.actor.length>140||!text(e.fact)||e.fact.length>1200||!text(e.channel)||e.channel.length>300)
  return 'Нужны тема, конкретный обладатель информации, содержание, канал и статус знания.';
 if(e.informant!=null&&(!text(e.informant)||e.informant.length>140))return 'Неверный источник информации.';
 return null;
}
/** Historical narrator emitted the complete explicit knowledge schema under
 * type=world, with no state key. Recover only this exact unambiguous legacy
 * shape in the derived projection. Do not infer facts from prose or generic
 * records; the original saved event and its evidence remain unchanged. */
const legacyKnowledgeFields=new Set(['id','type','knowledge_version','topic_id','actor','fact','status','channel','informant','evidence']);
export function normalizeLegacyKnowledge(e){
 if(e?.type!=='world'||e.knowledge_version!==1||Object.keys(e).some(k=>!legacyKnowledgeFields.has(k))||!text(e.id)||!text(e.evidence))return e;
 const corrected={...e,type:'knowledge'};
 return knowledgeRecordError(corrected)?e:corrected;
}
export function knowledgeRoutingError(e){
 if(!e||!Object.hasOwn(e,'knowledge_version'))return null;
 if(e.type!=='knowledge'||Object.keys(e).some(k=>k.endsWith('_version')&&k!=='knowledge_version'))return 'Запись knowledge_version должна иметь type=knowledge и не смешиваться с другими системами.';
 return knowledgeRecordError(e);
}
export function knowledgeKey(e){return JSON.stringify([e.actor,e.knowledge_version===1?'topic':'legacy',e.knowledge_version===1?e.topic_id:e.fact]);}
export function knowledgeView(projection={},opts={}){
 const actor=text(opts.actor),topic=text(opts.topic);
 if(actor.length>140||topic.length>140||(!actor&&!topic))throw Error('Укажи имя героя или ID темы.');
 const rows=(projection.knowledge||[]).filter(x=>(!actor||x.actor===actor)&&(!topic||x.topic_id===topic||x.fact.includes(topic)));
 const positions=new Map((opts.scenes||[]).map((s,i)=>[s.id,i]));
 const offset=Math.max(0,Math.floor(Number(opts.offset)||0)),limit=Math.max(1,Math.min(40,Math.floor(Number(opts.limit)||20)));
 return {actor:actor||null,topic:topic||null,records:rows.slice().reverse().sort((a,b)=>(positions.get(b.source?.scene_id)??-1)-(positions.get(a.source?.scene_id)??-1)).slice(offset,offset+limit).map(x=>({
  actor:x.actor,topic_id:x.topic_id||null,content:x.fact,status:x.knowledge_version===1?x.status:'legacy_recorded_knowledge',
  channel:x.channel,informant:x.informant||null,source:x.source,evidence:x.evidence.slice(0,600)})),
  next_offset:rows.length>offset+limit?offset+limit:null,total:rows.length,memory_complete:opts.complete!==false,
  policy:'Recorded belief or claim is not objective truth. Each holder is independent. A rumor can be false; forgotten and unknown are explicit states, not permissions to erase other people’s knowledge. Never propagate knowledge automatically.'};
}
