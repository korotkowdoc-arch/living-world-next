/** Read-only causal graph. Only accepted, branch-local records and explicit links.
 * No inferred guilt, knowledge, closure, or causal edges from co-occurrence. */
import {parseStoryDate} from './world-time.mjs';
import {isSceneMemory} from './scene-memory-routing.mjs';
const clip=(v,n=360)=>typeof v==='string'?v.slice(0,n):null;
const actors=r=>[...new Set([r?.actor,r?.responsible,r?.counterparty,r?.sender,r?.recipient,r?.patient,r?.teacher,r?.holder,r?.a,r?.b,...(Array.isArray(r?.actors)?r.actors:[])].filter(x=>typeof x==='string'&&x))];
const terminal=new Set(['resolved','abandoned','completed','cancelled','ended']);
const source=r=>r?.source??null;
function build(projection,scenes){
 const records=projection.worldFacts||[],byKey=new Map(records.filter(r=>r.key).map(r=>[r.key,r]));
 const invalidScenes=new Set(),invalidEvents=new Set(),ancestry=new Set(scenes.map(s=>s.id));
 for(const w of projection.validation_warnings||[]){if(w.event_id)invalidEvents.add(JSON.stringify([w.scene_id,w.event_id]));else invalidScenes.add(w.scene_id);}
 const eventsById=new Map(),origins=new Map(),positions=new Map(scenes.map((s,i)=>[s.id,i]));
 for(const s of scenes){if(invalidScenes.has(s.id))continue;
  for(const e of s.events||[]){if(!e?.id||isSceneMemory(e)||invalidEvents.has(JSON.stringify([s.id,e.id])))continue;
   const ref={scene_id:s.id,event_id:e.id,world_time:s.world_time??null};
   if(e.key&&byKey.has(e.key)&&!origins.has(e.key))origins.set(e.key,ref);
   const list=eventsById.get(e.id)||[];list.push({event:e,source:ref});eventsById.set(e.id,list);
  }
 }
 const recordIds=new Map();for(const r of records){if(!r.record_id)continue;const list=recordIds.get(r.record_id)||[];list.push(r);recordIds.set(r.record_id,list);}
 const node=r=>r?{key:r.key,kind:r.consequence_kind??r.life_kind??r.growth_kind??r.social_kind??r.dynamics_kind??r.record_kind??'world',title:clip(r.title??r.name??r.description??r.evidence),status:r.status??null,actors:actors(r),source:source(r),origin:origins.get(r.key)??null}:null;
 function incident(id){
  if(!id)return {status:'not_recorded'};
  const candidates=new Map();
  for(const r of recordIds.get(id)||[])candidates.set('key:'+r.key,{kind:'record',...node(r)});
  for(const x of eventsById.get(id)||[]){
   if(x.event.key&&byKey.has(x.event.key)&&candidates.has('key:'+x.event.key))continue;
   candidates.set(JSON.stringify([x.source.scene_id,x.source.event_id]),{kind:'event',event_type:x.event.type,source:x.source,actors:actors(x.event),title:clip(x.event.description??x.event.evidence)});
  }
  if(candidates.size!==1)return {status:candidates.size?'ambiguous':'unresolved_reference',reference:id,candidate_count:candidates.size};
  return {status:'linked_source_not_proof_of_cause',reference:id,...candidates.values().next().value};
 }
 const links=records.filter(r=>r.growth_version===1&&r.growth_kind==='cause'&&byKey.has(r.from_key)&&byKey.has(r.to_key));
 const edges=new Map();for(const r of links)for(const k of [r.from_key,r.to_key]){const list=edges.get(k)||[];list.push(r);edges.set(k,list);}
 const responses=new Map();for(const r of records.filter(r=>r.life_kind==='consequence_response'&&r.player_life_version===1)){const list=responses.get(r.consequence_id)||[];list.push(r);responses.set(r.consequence_id,list);}
 const latest=r=>positions.get(r?.source?.scene_id)??-1;
 return {records,byKey,links,edges,responses,node,incident,latest,ancestry};
}
function consequences(index,filter){
 return index.records.filter(r=>r.consequence_version===1&&filter(r)).sort((a,b)=>Number(terminal.has(a.status))-Number(terminal.has(b.status))||index.latest(b)-index.latest(a));
}
function response(r,clock){const due=parseStoryDate(r.due_at);return {id:r.record_id,actor:r.actor,status:r.status,title:clip(r.title),action:clip(r.action_description),due_at:r.due_at??null,timing:r.status!=='planned'?'closed':!clock||!due?'unknown':due.order<clock.order?'past_unresolved':due.order===clock.order?'due_now':'upcoming',result:r.result??null,outcome:clip(r.outcome),source:source(r)};}
function consequenceRow(r,index,clock){
 const rows=(index.responses.get(r.record_id)||[]).slice().sort((a,b)=>Number(b.status==='planned')-Number(a.status==='planned')||index.latest(b)-index.latest(a));
 return {id:r.record_id,key:r.key,actor:r.actor,responsible:r.responsible??null,kind:r.consequence_kind,status:r.status,description:clip(r.description),recorded_cause:clip(r.cause),outcome:clip(r.outcome),source:source(r),origin:index.node(r).origin,incident:index.incident(r.source_incident),responses:rows.slice(0,6).map(x=>response(x,clock)),response_count:rows.length,open_responses:rows.filter(x=>x.status==='planned').length,needs_review:r.status!=='resolved'&&!rows.some(x=>x.status==='planned')};
}
function bounded(rows,limit,maxChars){const records=[];for(const row of rows){if(records.length>=limit)break;records.push(row);if(JSON.stringify(records).length>maxChars)records.pop();}return {records,total:rows.length,omitted:rows.length-records.length};}
export function causalMemory(projection={},scenes=[],{actors:focus=[],keys=[],complete=true,clock=null,limit=16,maxChars=14000}={}){
 const index=build(projection,scenes),selected=new Set(focus),requested=new Set(keys),at=parseStoryDate(clock??scenes.at(-1)?.world_time);
 const matches=r=>actors(r).some(a=>selected.has(a))||requested.has(r.key)||requested.has(r.record_id);
 const global=!selected.size&&!requested.size;
 const relevant=consequences(index,r=>global||matches(r));
 const seeds=new Set([...requested,...relevant.map(r=>r.key),...index.records.filter(matches).map(r=>r.key)].filter(k=>index.byKey.has(k)));
 const edgeRows=[],seen=new Set(),queue=[...seeds],visited=new Set(queue);
 // Traverse only explicit established edges, at most 2 hops. Contested
 // claims are shown but cannot propagate relevance as established facts.
 for(let depth=0;depth<3&&queue.length;depth++){
  const count=queue.length;
  for(let i=0;i<count;i++){const k=queue.shift();for(const e of index.edges.get(k)||[]){
   if(!seen.has(e.key)){seen.add(e.key);edgeRows.push({key:e.key,status:e.status,claimant:e.actor??null,description:clip(e.description),from:index.node(index.byKey.get(e.from_key)),to:index.node(index.byKey.get(e.to_key)),source:source(e),distance:depth});}
   if(e.status==='established'&&depth<2){const other=e.from_key===k?e.to_key:e.from_key;if(!visited.has(other)){visited.add(other);queue.push(other);}}
  }}
 }
 for(const e of index.links)if((global||matches(e))&&!seen.has(e.key)){seen.add(e.key);edgeRows.push({key:e.key,status:e.status,claimant:e.actor??null,description:clip(e.description),from:index.node(index.byKey.get(e.from_key)),to:index.node(index.byKey.get(e.to_key)),source:source(e),distance:0});}
 edgeRows.sort((a,b)=>a.distance-b.distance||Number(b.status==='established')-Number(a.status==='established'));
 const open=relevant.filter(r=>r.status!=='resolved'),closed=relevant.filter(r=>r.status==='resolved');
 const threads=index.records.filter(r=>r.social_record_version===1&&r.social_kind==='thread'&&['open','paused'].includes(r.status)&&(global||matches(r))).sort((a,b)=>index.latest(b)-index.latest(a)).map(r=>({...index.node(r),visibility:r.visibility??'unknown'}));
 return {history_complete:complete,focus:{actors:[...selected],keys:[...requested]},open_consequences:bounded(open.map(r=>consequenceRow(r,index,at)),limit,Math.floor(maxChars*.45)),resolved_consequences:bounded(closed.map(r=>consequenceRow(r,index,at)),Math.min(5,limit),Math.floor(maxChars*.15)),causal_links:bounded(edgeRows,limit,Math.floor(maxChars*.3)),open_threads:bounded(threads,Math.min(8,limit),Math.floor(maxChars*.1)),policy:'Director memory only, not character knowledge. Established links are recorded causes; claimed/disputed links are attributed claims. Source incident is a reference, not guilt. An attempted response does not resolve a consequence. Never change state or close a thread merely on retrieval.'};
}
export function causalSaveReview(before={},events=[],body=''){
 const normalized=String(body).normalize('NFKC').toLocaleLowerCase('ru');
 const touched=new Set(events.filter(e=>e.type==='world'&&e.consequence_version===1).map(e=>e.key));
 const responses=events.filter(e=>e.life_kind==='consequence_response'&&e.player_life_version===1);
 const rows=[],closure=[];
 for(const r of before.worldFacts||[]){
  if(r.consequence_version!==1||r.status==='resolved')continue;
  const matches=[...new Set([r.actor,r.responsible].filter(Boolean))].filter(a=>normalized.includes(a.toLocaleLowerCase('ru')));
  const terms=(String(r.description??'')+' '+String(r.cause??'')).toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{5,}/gu)||[];
  const hits=[...new Set(terms)].filter(t=>normalized.includes(t)&&!['последствие','который','которого','после','теперь','должен','снова'].includes(t));
  if(!touched.has(r.key)&&((matches.length&&hits.length>=1)||hits.length>=2))rows.push({id:r.record_id,actor:r.actor,status:r.status,description:clip(r.description),source:source(r),kind:'possible_consequence_update_not_a_fact'});
 }
 for(const e of events.filter(e=>e.consequence_version===1&&e.status==='resolved')){
  const open=(before.worldFacts||[]).filter(r=>r.life_kind==='consequence_response'&&r.consequence_id===e.record_id&&r.status==='planned');
  for(const r of open)if(!responses.some(x=>x.key===r.key&&['performed','cancelled'].includes(x.status)))closure.push({consequence_id:e.record_id,response_id:r.record_id,actor:r.actor,source:source(r),kind:'response_still_open_after_resolution'});
 }
 return {possible_missing_updates:rows.slice(0,20),omitted_updates:Math.max(0,rows.length-20),open_response_warnings:closure.slice(0,20),omitted_warnings:Math.max(0,closure.length-20),policy:'Review cues only. Preserve actual status unless the written scene establishes a change; no required quota.'};
}
export const CAUSAL_GUIDANCE='ПРИЧИННО-СЛЕДСТВЕННАЯ ПАМЯТЬ: перед сценой прочитай causal_memory: открытые последствия, попытки решения, исходные сцены, записанные причинные связи и незавершённые линии. Учитывай старые последствия при возвращении к персонажу. Событие может создать несколько независимых последствий, каждое с постоянным ID. Используй consequence_version=1, record_id, key=consequence:<ID>, consequence_kind, actor, status, description, evidence; source_incident указывай только по точному ID существующего происшествия, responsible только если подтверждено, cause как записанное описание. При изменении используй тот же ID; resolved требует явно показанный outcome. План ответа — consequence_response; attempted не равен resolved. Если причина связывает две уже записанные world записи, growth_version=1, growth_kind=cause, record_id, key=growth:cause:<ID>, from_key, to_key, status=established/claimed/disputed, description, evidence; claimed требует автора. Не выводи причинность из совпадения времени и не превращай претензию в факт. Не раскрывай режиссёрскую память герою без записанного канала знания. Перед сохранением проверь causal_review; если последствие реально изменилось, обнови его и связанные записи в причинном порядке, не закрывай автоматически чужие ответы.';
