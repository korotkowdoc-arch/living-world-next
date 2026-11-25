/** Long-lived personality continuity, derived from accepted observations.
 * A life event offers context for a decision, not a computed psychological effect. */
import {PERSONALITY_FIELDS} from './npc-life.mjs';
import {advancedIndex} from './advanced-world.mjs';
const clip=(v,n=300)=>typeof v==='string'?v.slice(0,n):null;
const norm=v=>String(v??'').normalize('NFKC').trim().toLocaleLowerCase('ru');
const pair=(...a)=>JSON.stringify(a);
const persistent=new Set(PERSONALITY_FIELDS);
const active=s=>['active','changed','learning','practicing','competent','advanced','planned','paused'].includes(s);
const source=(s,e)=>({scene_id:s.id,event_id:e.id,world_time:s.world_time??null});
const page=(rows,limit,maxChars=Infinity)=>{const records=[];for(const r of rows){if(records.length>=limit)break;records.push(r);if(JSON.stringify(records).length>maxChars)records.pop();}return {records,total:rows.length,omitted:rows.length-records.length};};
const eventKind=e=>e.interaction_version===1?e.interaction_kind:e.growth_version===1?e.growth_kind:e.consequence_version===1?'consequence':e.dynamics_kind??e.life_kind??e.activity_kind??e.type;
const importantEpisodes=new Set(['conflict','betrayal','support','separation','romantic_milestone','competition','cooperation']);
export function personalityEvolution(projection={},scenes=[],{actors=[],complete=true,limit=8,maxChars=13000,advanced=null}={}){
 const selected=[...new Set(actors)].filter(a=>typeof a==='string'&&a).slice(0,12),focus=new Set(selected),positions=new Map(scenes.map((s,i)=>[s.id,i]));
 const badScenes=new Set(),badEvents=new Set();
 const advancedWarnings=complete?(advanced??advancedIndex(scenes,projection,{complete})).warnings:[];
 for(const w of [...(projection.validation_warnings||[]),...advancedWarnings]){if(w.event_id)badEvents.add(pair(w.scene_id,w.event_id));else badScenes.add(w.scene_id);}
 const people=new Map((projection.people||[]).filter(p=>focus.has(p.name)).map(p=>[p.name,p]));
 const histories=new Map(),episodes=new Map(),motives=new Map(),worldHist=new Map(),episodeCounts=new Map();
 const acceptedRelations=new Set((projection.relationship_history||[]).map(r=>pair(r.source?.scene_id,r.source?.event_id)));
 const saveHistory=(map,key,value,src)=>{
  const h=map.get(key)||{last:null,first:null,observations:0,total_changes:0,changes:[]};h.observations++;
  if(!h.first)h.first={value,source:src};
  if(h.last&&JSON.stringify(h.last.value)!==JSON.stringify(value)){h.total_changes++;h.changes.push({before:h.last.value,after:value,before_source:h.last.source,source:src});if(h.changes.length>6)h.changes.shift();}
  h.last={value,source:src};map.set(key,h);
 };
 const addEpisode=(actor,row)=>{if(!focus.has(actor))return;const list=episodes.get(actor)||[];list.push(row);if(list.length>12)list.shift();episodes.set(actor,list);episodeCounts.set(actor,(episodeCounts.get(actor)||0)+1);};
 if(complete)for(const s of scenes){
  if(badScenes.has(s.id))continue;
  for(const e of s.events||[]){
   if(!e?.id||badEvents.has(pair(s.id,e.id)))continue;
   const src=source(s,e);
   if(e.type==='character'&&focus.has(e.name?.trim()))for(const [field,value] of Object.entries(e.state_patch||{}))if(persistent.has(field))saveHistory(histories,pair(e.name.trim(),field),value===null?null:value.trim(),src);
   if(e.type==='world'&&e.advanced_version===1&&e.advanced_kind==='motive'&&focus.has(e.actor)){
    saveHistory(worldHist,pair(e.actor,e.key),{status:e.status,intensity:e.intensity,description:clip(e.description)},src);
    motives.set(pair(e.actor,e.key),{id:e.record_id,key:e.key,actor:e.actor,title:e.title,kind:e.motive_kind,status:e.status,intensity:e.intensity,description:clip(e.description),source:src});
   }
   if(e.type==='world'&&e.interaction_version===1&&importantEpisodes.has(e.interaction_kind)&&acceptedRelations.has(pair(s.id,e.id))){
    for(const a of e.actors||[])addEpisode(a,{kind:e.interaction_kind,description:clip(e.description),outcome:clip(e.outcome),source:src});continue;
   }
   if(!focus.has(e.actor))continue;
   const tracked=e.type==='world'&&(e.growth_version===1&&['skill','project'].includes(e.growth_kind)||e.activity_version===1&&e.activity_kind==='habit');
   if(tracked&&e.key)saveHistory(worldHist,pair(e.actor,e.key),{status:e.status,description:clip(e.description),milestone:clip(e.milestone),frequency:clip(e.frequency)},src);
   if(e.type==='world'&&(e.consequence_version===1||e.growth_version===1&&e.growth_kind==='project'&&['completed','abandoned'].includes(e.status)||e.dynamics_version===1&&['life_transition','development','family_event'].includes(e.dynamics_kind)&&e.status==='completed'||e.player_life_version===1&&['career_change','health_episode','assessment'].includes(e.life_kind))){
    addEpisode(e.actor,{kind:eventKind(e),status:e.status??null,description:clip(e.description??e.title??e.name??e.evidence),outcome:clip(e.outcome),source:src});
   }
  }
 }
 const timeline=(h,valid=true)=>({history_verified:!!h&&valid,first:valid?h?.first??null:null,observations:valid?h?.observations??0:0,changes:page(valid?(h?.changes||[]).slice().reverse():[],4),total_changes:valid?h?.total_changes??0:0});
 const sameSource=(a,b)=>a?.scene_id===b?.scene_id&&a?.event_id===b?.event_id;
 const recent=(a,b)=>(positions.get(b.source?.scene_id)??-1)-(positions.get(a.source?.scene_id)??-1);
 const share=Math.max(600,Math.floor(maxChars/Math.max(1,selected.length)));
 const result=[];
 for(const actor of selected){
  const person=people.get(actor);
  const traits=(person?.state_fields||[]).filter(r=>persistent.has(r.field)).sort(recent).map(r=>{
   const h=histories.get(pair(actor,r.field)),verified=!!h&&sameSource(h.last?.source,r.source)&&h.last.value===r.value;
   return {field:r.field,value:r.value,source:r.source,history:timeline(h,verified)};
  });
  const ownMotives=[...motives.values()].filter(r=>r.actor===actor).sort((a,b)=>Number(active(b.status))-Number(active(a.status))||recent(a,b)).map(r=>({...r,history:timeline(worldHist.get(pair(actor,r.key)))}));
  const routines=(projection.worldFacts||[]).filter(r=>r.actor===actor&&(r.growth_version===1&&['skill','project'].includes(r.growth_kind)||r.activity_version===1&&r.activity_kind==='habit')).sort((a,b)=>Number(active(b.status))-Number(active(a.status))||recent(a,b)).map(r=>{
   const h=worldHist.get(pair(actor,r.key)),verified=!!h&&sameSource(h.last?.source,r.source);
   return {id:r.record_id,key:r.key,kind:eventKind(r),title:r.name??r.title??null,status:r.status,description:clip(r.description),next_step:clip(r.next_step),source:r.source,history:timeline(h,verified)};
  });
  const currentEpisodes=page((episodes.get(actor)||[]).slice().reverse(),limit,Math.floor(share*.2));currentEpisodes.total=episodeCounts.get(actor)||0;currentEpisodes.omitted=currentEpisodes.total-currentEpisodes.records.length;
  const compact=(rows,part)=>{const max=Math.floor(share*part),out=[];for(const r of rows){if(out.length>=limit)break;out.push(r);if(JSON.stringify(out).length>max){out.pop();const c={...r,history:{history_verified:r.history.history_verified,total_changes:r.history.total_changes,observations:r.history.observations,details_omitted:true}};out.push(c);if(JSON.stringify(out).length>max)out.pop();}}return {records:out,total:rows.length,omitted:rows.length-out.length};};
  result.push({actor,traits:compact(traits,.30),motives:compact(ownMotives,.25),habits_skills_projects:compact(routines,.25),life_experience:currentEpisodes});
 }
 return {actors:result,history_complete:complete,policy:'Stable traits are distinct from temporary moods. Changes require actual narrated evidence, not numerical personality drift. Prior experiences are possible context, not proved causes. Resolved motives and abandoned habits are history, not current drives. Never infer trauma, desire, attachment, forgiveness or knowledge.'};
}
/** Distinguish an observed transient mood from an explicit persistent change. */
export function personalitySaveReview(before={},events=[]){
 const persons=new Map((before.people||[]).map(p=>[p.name,new Map((p.state_fields||[]).map(f=>[f.field,f]))]));
 const changes=[],warnings=[],moods=[];
 for(const e of events){
  if(e.type!=='character'||!e.state_patch)continue;
  const name=e.name?.trim();if(!persons.has(name))persons.set(name,new Map());const state=persons.get(name);
  for(const [field,value] of Object.entries(e.state_patch)){
   const previous=state.get(field);state.set(field,{value,source:null});
   if(field==='mood'){moods.push({actor:name,value,event_id:e.id});continue;}
   if(!persistent.has(field)||previous?.value===value)continue;
   changes.push({actor:name,field,before:previous?.value??null,first_observation:!previous,after:value,source:previous?.source??null,event_id:e.id});
   if(previous&&value!==null&&Object.hasOwn(e.state_patch,'mood')&&norm(value)===norm(e.state_patch.mood))warnings.push({actor:name,field,event_id:e.id,kind:'persistent_trait_matches_transient_mood_review'});
  }
 }
 return {persistent_changes:changes.slice(0,40),temporary_moods:moods.slice(0,20),warnings:warnings.slice(0,20),omitted_changes:Math.max(0,changes.length-40),policy:'Review cues only; a single mood or experience is not proof of lasting change. Do not invent evidence or automatic causal effects.'};
}
export const PERSONALITY_GUIDANCE='РАЗВИТИЕ ЛИЧНОСТИ: перед сценой изучи personality_evolution каждого участника. Устойчивые черты (temperament, values, speech_style, register, coping_style, humor, preference, aversion, habit, personal_goal, career_goal, family_goal) не меняются от одного настроения. Временное настроение — mood; устойчивое изменение — только подтверждённый state_patch того же героя и дословная evidence. Сохраняй мотивы через advanced_version=1, advanced_kind=motive и постоянный ID; интенсивность low/medium/high/unknown только при наличии опоры в сцене. Действующие и изменившиеся мотивы влияют на выбор, завершённые и оставленные — исторический опыт. Навыки, привычки и проекты обновляй по тому же ID. Пережитые события могут повлиять на решение, но не доказывают конкретные эмоции, травму или причинность. Показывай самостоятельный выбор NPC, учитывай противоречивые мотивы и предыдущие взгляды; не придумывай автоматическое развитие. Проверь personality_review перед сохранением.';
