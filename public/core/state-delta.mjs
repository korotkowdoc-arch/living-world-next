/** Compare the authoritative projection, not a second state store. */
import {eventRoute} from './scene-memory-routing.mjs';
const ids={people:r=>[r.name],relationships:r=>[r.a,r.b],knowledge:r=>[r.actor,r.knowledge_version===1?'topic':'legacy',r.knowledge_version===1?r.topic_id:r.fact],balances:r=>[r.actor,r.currency],items:r=>[r.item_id],stock:r=>[r.holder,r.product_id,r.unit],obligations:r=>[r.commitment_id],worldFacts:r=>[r.key],plans:r=>[r.actor,r.plan_id],effective_outfits:r=>[r.actor]};
const domains={people:'character',relationships:'relationships',knowledge:'knowledge',balances:'finance',items:'inventory',stock:'finance',obligations:'calendar',plans:'goals',effective_outfits:'inventory'};
const ignore=new Set('id type source evidence history history_count field_sources goal_source stance_source state_fields relationship_fields last_action legacy_route_recovered sender_visible_source last_observation action performed_event_id plan_patch key record_id plan_id commitment_id item_id product_id actor a b currency unit topic_id'.split(' '));
const preferred='status known balance delta quantity custody_status holder condition description goal title name fact stance next_step obstacle due_at milestone outcome location need slots sender_visible_status'.split(' ');
const has=(o,k)=>Object.hasOwn(o||{},k),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const domain=(k,r)=>domains[k]??eventRoute(r).domain;
function fields(k,r){
 if(!r)return {};
 if(k==='people')return Object.fromEntries([...(has(r,'description')?[['description',r.description]]:[]),...(r.state_fields||[]).map(x=>[x.field,x.value])]);
 if(k==='relationships')return Object.fromEntries([...(has(r,'stance')?[['stance',r.stance]]:[]),...(r.relationship_fields||[]).map(x=>[x.field,x.value])]);
 return Object.fromEntries(Object.entries(r).filter(([k,v])=>!ignore.has(k)&&!k.endsWith('_version')&&v!==undefined));
}
const sourceFor=(k,r,f)=>k==='people'?r?.state_fields?.find(x=>x.field===f)?.source??r?.source:k==='relationships'?(f==='stance'?r?.stance_source:r?.relationship_fields?.find(x=>x.field===f)?.source)??r?.source:r?.field_sources?.[f]??r?.source;
function clip(v,d=0){if(typeof v==='string')return v.length>360?v.slice(0,360)+'…':v;if(v===null||typeof v==='number'||typeof v==='boolean')return v;if(d>=2)return '[подробности в источнике]';if(Array.isArray(v))return v.slice(0,8).map(x=>clip(x,d+1));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).slice(0,12).map(([k,x])=>[k,clip(x,d+1)]));return null;}
function index(p,k){const m=new Map();for(const r of p?.[k]||[]){const identity=ids[k](r);if(identity.every(x=>typeof x==='string'&&x))m.set(JSON.stringify(identity),{r,identity});}return m;}
function keys(a,b){return [...new Set([...Object.keys(a),...Object.keys(b)])].sort((a,b)=>Number(preferred.includes(b))-Number(preferred.includes(a)));}
function people(r){return [r.actor,r.name,r.holder,r.a,r.b,r.counterparty,r.sender,r.recipient,r.teacher,r.student,r.patient,r.employer,r.applicant,r.provider,r.parent,r.supporter,...(Array.isArray(r.actors)?r.actors:[])].filter(x=>typeof x==='string');}
function bounded(rows,limit,maxChars){const groups=new Map(),records=[];for(const r of rows){if(!groups.has(r.domain))groups.set(r.domain,[]);groups.get(r.domain).push(r);}for(let i=0;i<limit&&records.length<limit;i++)for(const g of groups.values()){if(!g[i]||records.length>=limit)continue;records.push(g[i]);if(JSON.stringify(records).length>maxChars)records.pop();}return {records,total:rows.length,omitted:rows.length-records.length,domain_counts:Object.fromEntries([...groups].map(([k,v])=>[k,v.length]))};}
export function compareRegistryState(before,after,{sceneId=null,limit=40,maxChars=12000}={}){
 const rows=[];
 for(const registry of Object.keys(ids)){
  const old=index(before,registry),next=index(after,registry);
  for(const key of new Set([...old.keys(),...next.keys()])){
   const a=old.get(key)?.r,b=next.get(key)?.r,identity=(next.get(key)??old.get(key)).identity,af=fields(registry,a),bf=fields(registry,b),changed=[];
   for(const field of keys(af,bf)){if(has(af,field)===has(bf,field)&&equal(af[field],bf[field]))continue;changed.push({field,before_present:has(af,field),after_present:has(bf,field),before:clip(af[field]),after:clip(bf[field]),source:sourceFor(registry,b,field)??null});}
   const refreshed=!!b&&(!equal(a?.source,b.source)||!equal(a?.last_observation,b.last_observation)||!equal(a?.history?.length,b.history?.length));
   if(!changed.length&&a&&b&&!refreshed)continue;
   rows.push({registry,identity,domain:domain(registry,b??a),operation:!a?'created':!b?'removed':changed.length?'updated':'observation_refreshed',fields:changed.slice(0,12),omitted_fields:Math.max(0,changed.length-12),source:b?.source??null,observation_source:b?.last_observation?.source??null,derived_change:!!sceneId&&!!b&&b.source?.scene_id!==sceneId&&b.last_observation?.source?.scene_id!==sceneId});
  }
 }
 return {...bounded(rows,limit,maxChars),policy:'Actual projection comparison, not prose inference. Missing and explicitly unknown values are distinct. Original sources preserved.'};
}
export function recentRegistryState(projection,scenes=[],{actors=[],window=4,limit=24,maxChars=9500,complete=true}={}){
 const selected=new Set(actors),positions=new Map(scenes.slice(-window).map((s,i)=>[s.id,i])),rows=[];
 for(const registry of Object.keys(ids))for(const {r,identity} of index(projection,registry).values()){
  if(!people(r).some(a=>selected.has(a)))continue;
  const values=fields(registry,r),changed=[];
  for(const field of keys({},values)){const source=sourceFor(registry,r,field);if(positions.has(source?.scene_id))changed.push({field,value:clip(values[field]),source});}
  const observed=positions.has(r.last_observation?.source?.scene_id);
  if(!changed.length&&!positions.has(r.source?.scene_id)&&!observed)continue;
  rows.push({registry,identity,domain:domain(registry,r),fields:changed.slice(0,10),omitted_fields:Math.max(0,changed.length-10),source:r.source??null,observation_source:observed?r.last_observation.source:null,rank:Math.max(positions.get(r.source?.scene_id)??-1,positions.get(r.last_observation?.source?.scene_id)??-1,...changed.map(x=>positions.get(x.source?.scene_id)??-1))});
 }
 rows.sort((a,b)=>b.rank-a.rank);
 return {...bounded(rows.map(({rank,...r})=>r),limit,maxChars),history_complete:complete,scene_window:scenes.slice(-window).map(s=>s.id),policy:'Latest retained state, not obsolete historical versions. Observation is not ownership; sources do not guarantee current presence.'};
}
export function remapDeltaScene(delta,from,to){const source=s=>s?.scene_id===from?{...s,scene_id:to}:s;return {...delta,records:delta.records.map(r=>({...r,source:source(r.source),observation_source:source(r.observation_source),fields:r.fields.map(f=>({...f,source:source(f.source)}))}))};}
