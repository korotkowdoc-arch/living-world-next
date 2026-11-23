/** Bound narrator context without discarding source IDs or claiming an exhaustive memory.
 * The authoritative full world projection remains available through MCP;
 * this file only limits what is copied into one story-generation prompt.
 */
const PRIORITY=['plans','obligations','relationships','knowledge','balances','people','worldFacts','items','offscreen'];
const META=new Set(['source','world_time','event_id','scene_id','id','status','actor','a','b','stance','goal','known']);
function compactValue(value,depth=0){
 if(value===null||typeof value==='boolean'||typeof value==='number')return value;
 if(typeof value==='string'){
  if(value.length<=360)return value;
  return value.slice(0,360)+'… [цитата сокращена; смотри source.scene_id]';
 }
 if(depth>=3)return '[вложенные данные сокращены]';
 if(Array.isArray(value)){
  return value.slice(-5).map(item=>compactValue(item,depth+1));
 }
 if(value&&typeof value==='object'){
  const out={};let n=0;
  const ordered=Object.keys(value).sort((a,b)=>Number(META.has(b))-Number(META.has(a)));
  for(const k of ordered){
   if(k==='history'&&Array.isArray(value[k])){
    out.history_events=value[k].length;
    out.latest_history=value[k].slice(-3).map(v=>compactValue(v,depth+1));
    continue;
   }
   if(n++>=14){out.additional_fields_omitted=true;break;}
   out[k]=compactValue(value[k],depth+1);
  }
  return out;
 }
 return String(value).slice(0,360);
}
export function limitedNarratorMemory(projection,{maxChars=18000,maxEntriesPerCategory=12}={}){
 const max=Math.max(2500,Math.min(50000,Number(maxChars)||18000));
 if(!projection||typeof projection!=='object')return {status:'not_loaded',notice:'Не выдумывай факты, запрашивай первоисточники.'};
 if(projection.incomplete)return {status:'explicitly_incomplete',notice:'История загружена частично; нельзя считать отсутствующее неизвестным фактом.'};
 const summary={status:'partial_context_sample',memory_is_not_exhaustive:true,
  source_rule:'Для новых фактов открой конкретную сцену в MCP; сокращённый список не заменяет первоисточник.',
  records:{},omitted:{},counts:{}};
 const limit=Math.max(1,Math.min(40,Number(maxEntriesPerCategory)||12));
 for(const category of PRIORITY){
  const rows=Array.isArray(projection[category])?projection[category]:[];
  summary.records[category]=[];
  summary.counts[category]=rows.length;
  let omitted=0;
  // Last known state for entities is near the end; existing unsolved plans
  // are prioritized over already completed records.
  const candidates=category==='plans'
   ?[...rows.filter(x=>!['completed','abandoned'].includes(x?.status)),
     ...rows.filter(x=>['completed','abandoned'].includes(x?.status))]
   :rows.slice().reverse();
  for(const candidate of candidates){
   if(summary.records[category].length>=limit){omitted++;continue;}
   const compact=compactValue(candidate);
   summary.records[category].push(compact);
   if(JSON.stringify(summary).length>max){
    summary.records[category].pop();omitted++;
   }
  }
  if(omitted)summary.omitted[category]=omitted;
 }
 if(projection.events_replayed!==undefined)summary.events_replayed=projection.events_replayed;
 if(Array.isArray(projection.validation_warnings)&&projection.validation_warnings.length)
  summary.warning_count=projection.validation_warnings.length;
 return summary;
}
export function narratorSceneExcerpt(scene,{maxChars=12000}={}){
 const id=String(scene?.id||'неизвестен');
 const time=String(scene?.world_time||'время не указано');
 const text=String(scene?.body||'');
 const max=Math.max(500,Math.min(30000,Number(maxChars)||12000));
 if(text.length<=max)return '['+id+'; '+time+']\n'+text;
 const beginning=Math.max(0,Math.min(2200,Math.floor(max/5)));
 const end=Math.max(0,max-beginning);
 return '['+id+'; '+time+']\n'+text.slice(0,beginning)+
  '\n[… фрагмент сцены сокращён: '+(text.length-max)+' символов; для полного текста используй get_story_scene('+id+') …]\n'+
  text.slice(-end);
}
