/** Individual, branch-local recall. A director may compare perspectives, but
 * no record, interaction, mention or relationship grants knowledge to another actor. */
import {knowledgeKey,normalizeLegacyKnowledge} from './knowledge.mjs';
const text=(v,n=360)=>typeof v==='string'?v.slice(0,n):null;
const norm=v=>String(v??'').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').trim();
const unavailable=new Set(['forgotten','unknown']);
const closed=new Set(['resolved','done','completed','fulfilled','cancelled','canceled','abandoned']);
const state=r=>r.knowledge_version===1?r.status:'legacy_recorded_knowledge';
const src=r=>r?.source??null;
function bounded(rows,limit,maxChars){
 const records=[];for(const row of rows){if(records.length>=limit)break;records.push(row);if(JSON.stringify(records).length>maxChars){records.pop();if(row.history?.records.length){const compact={...row,history:{...row.history,records:[],omitted:row.history.total}};records.push(compact);if(JSON.stringify(records).length>maxChars)records.pop();}}}
 return {records,total:rows.length,omitted:rows.length-records.length};
}
export function individualMemory(projection={},scenes=[],{actors=[],queries=[],complete=true,limit=8,maxChars=16000}={}){
 const names=[...new Set(actors.filter(a=>typeof a==='string'&&a))].slice(0,12),focus=new Set(names),q=queries.map(norm).filter(Boolean);
 const positions=new Map(scenes.map((s,i)=>[s.id,i]));
 const latest=(a,b)=>(positions.get(b.source?.scene_id)??-1)-(positions.get(a.source?.scene_id)??-1);
 const current=new Map(),byActor=new Map(),histories=new Map(),episodes=new Map(),allTopics=new Map();
 const add=(m,k,v)=>{if(!m.has(k))m.set(k,[]);m.get(k).push(v);};
 for(const k of projection.knowledge||[]){
  if(!focus.has(k.actor))continue;
  const id=knowledgeKey(k);current.set(id,k);add(byActor,k.actor,k);
  if(k.knowledge_version===1)add(allTopics,k.topic_id,k);
 }
 const rejectedScenes=new Set(),rejectedEvents=new Set();
 for(const w of projection.validation_warnings||[]){if(w.event_id)rejectedEvents.add(JSON.stringify([w.scene_id,w.event_id]));else rejectedScenes.add(w.scene_id);}
 const acceptedRelations=new Set((projection.relationship_history||[]).map(x=>JSON.stringify([x.source?.scene_id,x.source?.event_id])));
 // Keep only a bounded suffix per stable holder/topic; count all accepted versions.
 for(const s of scenes){
  if(rejectedScenes.has(s.id))continue;
  for(const raw of s.events||[]){
   if(!raw?.id||rejectedEvents.has(JSON.stringify([s.id,raw.id])))continue;
   const e=normalizeLegacyKnowledge(raw),source={scene_id:s.id,event_id:e.id,world_time:s.world_time??null};
   if(e.type==='knowledge'&&focus.has(e.actor)&&current.has(knowledgeKey(e))){
    const id=knowledgeKey(e),h=histories.get(id)||{total:0,records:[]};if(current.get(id)?.source?.scene_id===s.id&&current.get(id)?.source?.event_id===e.id)continue;
    h.total++;
    h.records.push({status:state(e),content:unavailable.has(state(e))?null:text(e.fact),channel:text(e.channel,160),informant:e.informant??null,source});
    if(h.records.length>4)h.records.shift();histories.set(id,h);
   }
   if(e.type==='world'&&e.interaction_version===1&&acceptedRelations.has(JSON.stringify([s.id,e.id])))for(const a of e.actors||[])if(focus.has(a)){
    const list=episodes.get(a)||{total:0,records:[]};list.total++;
    list.records.push({kind:e.interaction_kind,participants:e.actors.filter(x=>x!==a),description:text(e.description),outcome:text(e.outcome),source});
    if(list.records.length>12)list.records.shift();episodes.set(a,list);
   }
  }
 }
 const score=k=>q.reduce((n,t)=>n+(norm(k.topic_id)===t?12:norm(k.fact).includes(t)?4:0),0);
 const share=Math.max(500,Math.floor(maxChars/Math.max(1,names.length)));
 const records=[];
 for(const actor of names){
  const rows=(byActor.get(actor)||[]).slice().sort((a,b)=>score(b)-score(a)||latest(a,b));
  const topics=rows.map(k=>{
   const status=state(k),h=histories.get(knowledgeKey(k)),usable=!unavailable.has(status);
   // Do not put forgotten content back into the actor's actionable perspective.
   return {topic_id:k.topic_id??null,status,content:usable?text(k.fact):null,channel:text(k.channel,160),informant:k.informant??null,source:src(k),
    history:{total:h?.total??0,records:usable?(h?.records||[]).slice().reverse().slice(0,3):[],omitted:Math.max(0,(h?.total??0)-(usable?Math.min(3,(h?.records.length??0)):0)),policy:usable?'Earlier versions are history, not current knowledge.':'Earlier content withheld here; director can inspect sources.'}};
  });
  const relations=(projection.relationships||[]).filter(r=>r.a===actor).sort(latest).map(r=>({other:r.b,stance:r.stance??null,stance_source:r.stance_source??null,fields:(r.relationship_fields||[]).map(f=>({field:f.field,value:f.value,source:f.source})),source:src(r)}));
  const promises=(projection.obligations||[]).filter(r=>r.actor===actor&&!closed.has(r.status)).sort(latest).map(r=>({id:r.commitment_id,status:r.status??'unknown',description:text(r.description??r.evidence),due_at:r.due_at??r.deadline??r.due??null,source:src(r)}));
  const encounters=episodes.get(actor)||{total:0,records:[]},enc=bounded(encounters.records.slice().reverse(),Math.min(4,limit),Math.floor(share*.18));enc.total=encounters.total;enc.omitted=enc.total-enc.records.length;
  records.push({actor,knowledge:bounded(topics,limit,Math.floor(share*.48)),own_attitudes:bounded(relations,Math.min(5,limit),Math.floor(share*.2)),own_open_commitments:bounded(promises,Math.min(5,limit),Math.floor(share*.14)),recorded_encounters:enc});
 }
 const differences=[];
 for(const [topic,rows] of allTopics){
  if(rows.length<2||new Set(rows.map(r=>JSON.stringify([state(r),norm(r.fact)]))).size<2)continue;
  differences.push({topic_id:topic,holders:rows.map(r=>({actor:r.actor,status:state(r),source:src(r)})),kind:'different_recorded_perspectives_not_proof_of_contradiction'});
 }
 return {history_complete:complete,actors:records,director_only_topic_differences:bounded(differences,8,2000),policy:'Use each actor own knowledge/status and attitudes only. Incoming feelings, forgotten content, shared episodes and other holders are not accessible knowledge. Different wording is not proof of contradiction. Missing or omitted data is not evidence of ignorance; retrieve exact source if needed.'};
}
/** Flag potentially mistaken new topic IDs and changes in holder knowledge.
 * These are review cues, not automatic fixes or requirements to invent a witness. */
export function individualSaveReview(before={},events=[]){
 const byKey=new Map((before.knowledge||[]).map(r=>[knowledgeKey(r),r])),byContent=new Map(),warnings=[],changes=[];
 const index=r=>{if(r.knowledge_version!==1||!r.fact)return;const k=JSON.stringify([r.actor,norm(r.fact)]),list=byContent.get(k)||[];if(!list.some(x=>x.topic_id===r.topic_id))list.push(r);byContent.set(k,list);};
 for(const r of before.knowledge||[])index(r);
 for(const e of events){
  if(e.type!=='knowledge'||e.knowledge_version!==1)continue;
  const key=knowledgeKey(e),old=byKey.get(key);
  for(const other of byContent.get(JSON.stringify([e.actor,norm(e.fact)]))||[])if(other.topic_id!==e.topic_id)warnings.push({kind:'possible_duplicate_topic_for_holder',actor:e.actor,topic_id:e.topic_id,existing_topic_id:other.topic_id,source:src(other),event_id:e.id});
  if(e.informant&&e.informant!==e.actor){
   const speaker=byKey.get(knowledgeKey({...e,actor:e.informant}));
   if(!speaker||unavailable.has(state(speaker)))warnings.push({kind:'informant_knowledge_requires_source_review',actor:e.actor,informant:e.informant,topic_id:e.topic_id,event_id:e.id,source:src(speaker)});
  }
  changes.push({actor:e.actor,topic_id:e.topic_id,previous_status:old?state(old):null,new_status:e.status,content_changed:!!old&&old.fact!==e.fact,source:src(old),event_id:e.id});
  byKey.set(key,e);index(e);
 }
 return {changes:changes.slice(0,40),omitted_changes:Math.max(0,changes.length-40),warnings:warnings.slice(0,30),omitted_warnings:Math.max(0,warnings.length-30),policy:'Verify actual access, communication, belief and exact holder. Lack of speaker record does not prove inability to speak or lie; never grant knowledge to an informant or bystander automatically.'};
}
export const INDIVIDUAL_MEMORY_GUIDANCE='ИНДИВИДУАЛЬНАЯ ПАМЯТЬ: перед диалогом прочитай individual_memory по каждому участнику, а не объединяй сведения всех NPC. Используй собственные знания, убеждения, подозрения, ошибки, обещания, отношения и пережитые встречи конкретного героя. Forgotten/unknown не дают доступ к прежнему содержанию. Не путай чужое отношение к герою с его собственным. Различия взглядов — материал для естественного диалога, не доказательство чьей-либо правоты. Новое знание записывай только для конкретного получателя с реальным каналом, при известном источнике — informant. Изменение убеждения, исправление ошибки, забывание — тот же actor/topic_id, новый статус и дословное evidence. Не меняй другие записи по умолчанию. Перед сохранением проверь individual_review; неполная память требует поиска источника, а не выдумывания.';
