/** Narrator-only, branch-local life context. No state writes or guessed emotions. */
import {parseStoryDate} from './world-time.mjs';
import {NEED_INTERVALS} from './life-calendar.mjs';
const levels=['comfortable','noticeable','urgent','critical'];
const clip=(v,n=180)=>typeof v==='string'?v.slice(0,n):null;
const pair=(a,b)=>JSON.stringify([a,b]);
const source=(s,e)=>({scene_id:s.id,event_id:e.id,world_time:s.world_time??null});
/** O(scenes + needs), independent of the number of NPCs. Unknown chronology
 * anywhere after a need observation invalidates a time-based estimate. */
export function npcNeedOpportunities(records=[],scenes=[],targetTime=null,{complete=true}={}){
 if(!complete)return [];
 const dates=scenes.map(s=>parseStoryDate(s.world_time));
 const positions=new Map(scenes.map((s,i)=>[s.id,i]));
 const target=parseStoryDate(targetTime??scenes.at(-1)?.world_time);
 const last=dates.at(-1);
 let lastBroken=-1;
 for(let i=0;i<dates.length;i++){
  const d=dates[i],prev=dates[i-1];
  if(d?.precision!=='minute'||i>0&&(prev?.precision!=='minute'||d.order<prev.order))lastBroken=i;
 }
 const result=[];
 for(const r of records){
  if(r.player_life_version!==1||r.life_kind!=='need'||!r.actor||!levels.includes(r.status))continue;
  const i=positions.get(r.source?.scene_id);
  if(i===undefined)continue;
  const start=dates[i],recorded=parseStoryDate(r.source?.world_time);
  const step=NEED_INTERVALS[r.need],rank=levels.indexOf(r.status);
  // A discontinuity just before this observation is irrelevant: its timestamp
  // establishes the new baseline. A discontinuity afterwards invalidates it.
  const comparable=!!step&&start?.precision==='minute'&&recorded?.precision==='minute'&&start.order===recorded.order&&target?.precision==='minute'&&last?.precision==='minute'&&target.order>=last.order&&i>=lastBroken;
  const elapsed=comparable?target.order-start.order:null;
  const estimate=comparable?levels[Math.min(3,rank+Math.floor(elapsed/step))]:null;
  if(rank<2&&levels.indexOf(estimate)<2)continue;
  result.push({kind:'need_review',row:{...r,title:'Need: '+r.need},info:{
   record_key:r.key,timing:'requires_character_choice',need_review:{need:r.need,observed_status:r.status,estimated_status:estimate,elapsed_minutes:elapsed,as_of:target?.literal??null,certainty:comparable?'estimate_if_no_relief':'observed_only'},
   guidance:'Review the actual condition, place, resources and obligations; elapsed time is a game estimate, not proof of symptoms, relief or a completed action. Do not choose for the player.'
  }});
 }
 return result;
}
function acceptedEpisodeIndex(scenes,projection){
 const accepted=new Set((projection.relationship_history||[]).map(e=>pair(e.source?.scene_id,e.source?.event_id)));
 const recent=new Map();
 for(const s of scenes)for(const e of s.events||[]){
  if(e.type!=='world'||e.interaction_version!==1||!accepted.has(pair(s.id,e.id)))continue;
  const actors=[...new Set(e.actors||[])].slice(0,12);
  for(const a of actors)for(const b of actors)if(a!==b)recent.set(pair(a,b),{kind:e.interaction_kind,description:clip(e.description),place:e.place??null,source:source(s,e)});
 }
 return recent;
}
/** Contact candidates only for recorded contacts or actual shared episodes.
 * An incoming attitude is not reciprocal. Respect both recorded boundaries
 * internally; never expose a hidden attitude in a player-facing menu. */
export function npcContactOpportunities(scenes=[],projection={},clock=null,{complete=true,shared=[]}={}){
 if(!complete)return [];
 const positions=new Map(scenes.map((s,i)=>[s.id,i]));
 const relationships=new Map(),episodes=acceptedEpisodeIndex(scenes,projection),pending=new Set();
 for(const r of projection.relationships||[])if(r.a&&r.b&&positions.has(r.source?.scene_id))relationships.set(pair(r.a,r.b),r);
 for(const r of projection.worldFacts||[]){
  if(r.player_life_version===1&&r.life_kind==='invitation'&&['sent','accepted'].includes(r.status)){
   pending.add(pair(r.actor,r.recipient));pending.add(pair(r.recipient,r.actor));
  }
  if(r.player_life_version===1&&r.life_kind==='appointment'&&['proposed','confirmed'].includes(r.status)){
   const actors=(r.participants||[]).slice(0,12);
   for(const a of actors)for(const b of actors)if(a!==b)pending.add(pair(a,b));
  }
 }
 const keys=new Set([...relationships.keys(),...episodes.keys()]),out=[];
 const boundary=r=>r?.relationship_fields?.find(x=>x.field==='boundary')?.value;
 const anchor=parseStoryDate(clock);
 for(const k of keys){
  const [actor,other]=JSON.parse(k);
  const own=relationships.get(k),incoming=relationships.get(pair(other,actor)),episode=episodes.get(k);
  if(actor===other||pending.has(k)||[boundary(own),boundary(incoming)].some(x=>x==='no_contact'||x==='distance'))continue;
  const src=episode?.source??own?.source;if(!src)continue;
  const last=parseStoryDate(episode?.source?.world_time);
  const sameDay=!!last&&!!anchor&&last.day===anchor.day;
  out.push({kind:'contact_opportunity',row:{actor,counterparty:other,key:pair('contact',k),title:'Contact: '+other,status:'opportunity',source:src},info:{
   record_key:own?.key??k,timing:'requires_character_choice',contact:{other,own_stance:clip(own?.stance,80),own_fields:(own?.relationship_fields||[]).map(x=>({field:x.field,value:x.value,source:x.source})),last_episode:episode??null,same_day:sameDay},
   guidance:'Optional contact, discussion, practical cooperation or keeping distance according to own motives. No assumed friendship, affection, forgiveness, acceptance or knowledge of another person’s private feelings.'
  }});
 }
 // Use only already-established shared circumstances. Bounded samples in
 // story-turn prevent expanding a large organization into every possible pair.
 const introduced=new Set();
 for(const g of shared){
  if(!['shared_schedule','group_opportunity'].includes(g.kind))continue;
  const members=(g.basis||[]).slice(0,12).filter(x=>positions.has(x.source?.scene_id));
  for(const m of members){
   const a=m.actor;if(!a||introduced.has(a))continue;
   const other=members.find(n=>n.actor!==a&&!keys.has(pair(a,n.actor))&&!keys.has(pair(n.actor,a))&&!pending.has(pair(a,n.actor)));
   if(!other)continue;
   introduced.add(a);
   out.push({kind:'social_encounter',row:{actor:a,counterparty:other.actor,key:pair('encounter',pair(a,other.actor)),title:'Possible encounter: '+other.actor,status:'opportunity',source:m.source,place:g.place??null},info:{
    record_key:g.key,timing:'requires_character_choice',contact:{other:other.actor,context:g.kind,context_title:clip(g.title),other_source:other.source},
    guidance:'Only a possible encounter from a shared schedule or group. Neither character necessarily knows the other, is present, has access or wants contact. Establish actual circumstances in the scene.'
   }});
  }
 }
 return out;
}
export const PERSONALITY_FIELDS=Object.freeze(['temperament','values','speech_style','register','coping_style','humor','preference','aversion','habit','personal_goal','career_goal','family_goal']);
/** Reconstruct explicit before/after observations from replay-accepted history.
 * Replay failure markers exclude invalid scenes and individually rejected events.
 * No interpretation of cause, emotion, or inferred personality trend. */
export function personalityHistory(scenes=[],projection={},actors=[],{complete=true,limit=6}={}){
 const selected=new Set(actors),fields=new Set(PERSONALITY_FIELDS),out=new Map();
 if(!complete||!selected.size)return out;
 const rejectedScenes=new Set(),rejectedEvents=new Set();
 for(const w of projection.validation_warnings||[]){
  if(w.event_id==null)rejectedScenes.add(w.scene_id);else rejectedEvents.add(pair(w.scene_id,w.event_id));
 }
 const previous=new Map(),current=new Map((projection.people||[]).filter(p=>selected.has(p.name)).map(p=>[p.name,new Map((p.state_fields||[]).map(f=>[f.field,f]))]));
 // Only fields with an authoritative projected value are included.
 for(const s of scenes){
  if(rejectedScenes.has(s.id))continue;
  for(const e of s.events||[]){
   const actor=typeof e.name==='string'?e.name.trim():null;
   if(e.type!=='character'||!selected.has(actor)||rejectedEvents.has(pair(s.id,e.id))||!e.state_patch)continue;
   for(const [field,value] of Object.entries(e.state_patch)){
    if(!fields.has(field)||!current.get(actor)?.has(field)||value!==null&&typeof value!=='string')continue;
    const key=pair(actor,field),before=previous.get(key),after={value:value===null?null:value.trim(),source:source(s,e)};
    previous.set(key,after);
    if(!before||before.value===after.value)continue;
    if(!out.has(actor))out.set(actor,{records:[],total:0});
    const bucket=out.get(actor);bucket.total++;
    bucket.records.push({field,before:clip(before.value),after:clip(after.value),before_source:before.source,source:after.source});
    if(bucket.records.length>limit)bucket.records.shift();
   }
  }
 }
 for(const [actor,bucket] of out){
  // Ensure the newest observed field agrees with the canonical projection,
  // otherwise the input isn't sufficient for a trustworthy timeline.
  const validFields=new Set();
  for(const [field,f] of current.get(actor)||[]){
   const observed=previous.get(pair(actor,field));
   if(observed&&observed.value===f.value&&observed.source.scene_id===f.source?.scene_id&&observed.source.event_id===f.source?.event_id)validFields.add(field);
  }
  if([...previous.keys()].some(k=>{const [a,f]=JSON.parse(k);return a===actor&&!validFields.has(f);}))out.delete(actor);
  else bucket.records.reverse();
 }
 return out;
}
