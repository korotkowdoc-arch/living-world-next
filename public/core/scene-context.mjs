import {limitedNarratorMemory} from './narration-budget.mjs';
const text=v=>typeof v==='string'?v.trim():'';
const norm=v=>text(v).toLocaleLowerCase('ru');
function checkedList(values,max,min,limit,name){
 if(values===undefined)return [];
 if(!Array.isArray(values)||values.length>max)throw Error('Invalid '+name+' list');
 const out=[];
 for(const value of values){
  const v=text(value);if(v.length<min||v.length>limit)throw Error('Invalid '+name+' value');
  if(!out.includes(v))out.push(v);
 }
 return out;
}
export function sceneFocusInput({actors,queries}={}){
 const a=checkedList(actors,8,1,140,'actor'),q=checkedList(queries,4,2,140,'query');
 if(!a.length&&!q.length)throw Error('Provide at least one actor or search query');
 return {actors:a,queries:q};
}
function includesText(value,queries){
 return typeof value==='string'&&queries.some(q=>norm(value).includes(norm(q)));
}
const groups=['people','relationships','knowledge','plans','obligations','balances','items','worldFacts','offscreen'];
export function focusedSceneContext(projection,focus,{complete=true,maxChars=18000}={}){
 const input=sceneFocusInput(focus);
 const actorSet=new Set(input.actors);
 // Case-sensitive recorded identities: exact actor keys do not merge distinct characters.
 const match=v=>actorSet.has(text(v));
 const selected={};
 const queries=input.queries;
 for(const key of groups){
  const entries=Array.isArray(projection[key])?projection[key]:[];
  selected[key]=entries.filter(entry=>{
   if(!entry)return false;
   // Never include all knowledge merely because another selected actor knows a related phrase.
   // A query may find a fact, but its actual holder and source remain explicit.
   if(key==='people')return match(entry.name)||includesText(entry.name,queries)||includesText(entry.description,queries)||
    (entry.state_fields||[]).some(v=>includesText(v.value,queries));
   if(key==='relationships')return match(entry.a)||match(entry.b)||includesText(entry.evidence,queries)||(entry.relationship_fields||[]).some(x=>includesText(x.value,queries)||includesText(x.evidence,queries));
   if(key==='items')return match(entry.holder)||match(entry.actor)||match(entry.counterparty)||
    includesText(entry.item_id,queries)||includesText(entry.name,queries)||includesText(entry.evidence,queries);
   return match(entry.actor)||match(entry.a)||match(entry.b)||(Array.isArray(entry.actors)&&entry.actors.some(match))||
    includesText(entry.fact,queries)||includesText(entry.topic_id,queries)||includesText(entry.title,queries)||includesText(entry.purpose,queries)||includesText(entry.group_id,queries)||includesText(entry.goal,queries)||includesText(entry.key,queries)||
    includesText(entry.description,queries)||includesText(entry.name,queries)||includesText(entry.place,queries)||includesText(entry.activity,queries)||includesText(entry.evidence,queries);
  });
 }
 selected.events_replayed=projection.events_replayed;
 selected.validation_warnings=projection.validation_warnings||[];
 return {focus:input,memory_complete:complete,memory:limitedNarratorMemory(selected,{maxChars,maxEntriesPerCategory:20}),
  matched_actor_names:input.actors.filter(name=>(projection.people||[]).some(p=>p.name===name)),
  identity_policy:'Names are exact recorded labels. Unmatched names and missing fields do not prove that a character or fact is absent. Search the source text for variants.',
  knowledge_policy:'A retrieved fact remains known only to its recorded holder via its recorded channel. The narrator must not give it to other characters automatically.',
  continuity_policy:'This is a focused sample of the active branch, not a full account. No facts from alternate branches, no automatic completion of intentions, no forced reconciliation.'};
}
export function literalFocusHits(query,rows,{maxChars=320}={}){
 const max=Math.max(100,Math.min(600,Number(maxChars)||320));
 return {query,kind:'literal_text_only',hits:(Array.isArray(rows)?rows:[]).slice(0,8).map(r=>({
  scene_id:r.scene_id,world_time:r.world_time??null,
  excerpt:String(r.snippet||'').slice(0,max),
  excerpt_truncated:String(r.snippet||'').length>max
 })),more_may_exist:(rows||[]).length>=8,
 policy:'Literal text hit, not a confirmed event. Read get_story_scene before interpreting.'};
}
