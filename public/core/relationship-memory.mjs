/** Directed relationship memory. No score, decay, reciprocity, or inferred consent. */
const text=v=>typeof v==='string'?v.trim():'';
const valid=(v,n=140)=>typeof v==='string'&&!!v.trim()&&v.length<=n;
const fields=Object.freeze({
 trust:['trusted','distrusted','conditional','unknown'],
 respect:['respected','disrespected','unknown'],
 affection:['affectionate','indifferent','dislike','hatred','unknown'],
 fear:['fearful','unafraid','unknown'],
 resentment:['resentful','released','unknown'],
 cooperation:['cooperating','refuses','conditional','unknown'],
 boundary:['open','distance','no_contact','unknown']
});
export function relationshipError(e,lock){
 if(e.type!=='relationship')return null;
 if(e.relationship_patch!==undefined){
  const p=e.relationship_patch;
  if(e.relationship_version!==1||!valid(e.a)||!valid(e.b)||e.a===e.b||!p||typeof p!=='object'||Array.isArray(p)||!Object.keys(p).length||
   Object.entries(p).some(([k,v])=>!Object.hasOwn(fields,k)||!fields[k].includes(v)))return 'Неверное поле направленного отношения.';
  if(lock?.forbid_respect&&p.respect==='respected')return 'Запрет на уважение.';
  if(lock?.forbid_reconciliation&&p.affection==='affectionate')return 'Запрет на примирение.';
 }
 if(e.relationship_version!==undefined&&e.relationship_version!==1)return 'Неизвестная версия отношения.';
 if(e.relationship_version===1&&!e.relationship_patch&&!valid(e.stance,80))return 'Нужно состояние или изменение отношения.';
 return null;
}
export const relationshipKey=e=>JSON.stringify([e.a,e.b]);
export function applyRelationship(old,e,source){
 const state=new Map((old?.relationship_fields||[]).map(x=>[x.field,x]));
 for(const [field,value] of Object.entries(e.relationship_patch||{}))state.set(field,{field,value,source,evidence:e.evidence});
 const {relationship_patch,...latest}=e;
 const result={...old,...latest,source,relationship_fields:[...state.values()],history_count:(old?.history_count||0)+1};
 if(!Object.hasOwn(e,'stance')&&old?.stance!==undefined)result.stance=old.stance;
 if(Object.hasOwn(e,'stance'))result.stance_source=source;
 return result;
}
/** Separate episodes record what happened, not what the participants must feel. */
const episodeKinds=new Set(['meeting','conversation','cooperation','conflict','betrayal','support','competition','shared_activity']);
export function interactionError(e){
 if(e.type!=='world'||e.interaction_version===undefined)return null;
 if(e.interaction_version!==1||!episodeKinds.has(e.interaction_kind)||
  !Array.isArray(e.actors)||e.actors.length<2||e.actors.length>12||e.actors.some(x=>!valid(x))||new Set(e.actors).size!==e.actors.length||
  !valid(e.description,600))return 'Эпизод взаимодействия требует участников, вида и описания.';
 if(e.place!=null&&!valid(e.place))return 'Некорректное место встречи.';
 if(e.outcome!=null&&!valid(e.outcome,600))return 'Некорректный итог встречи.';
 return null;
}
export function relationshipHistory(scenes,projection,{actor='',other='',offset=0,limit=20,complete=true}={}){
 actor=text(actor);other=text(other);
 if(!actor||actor.length>140||other.length>140||actor===other)throw Error('Укажи одного героя или двух разных героев.');
 const matchPair=e=>(e.a===actor&&(!other||e.b===other))||(e.b===actor&&(!other||e.a===other));
 const matchEpisode=e=>e.actors?.includes(actor)&&(!other||e.actors.includes(other));
 const accepted=new Set((projection.relationship_history||[]).map(e=>JSON.stringify([e.source.scene_id,e.source.event_id])));
 const entries=[];
 for(const s of scenes){
  for(const e of s.events||[]){
   if(!accepted.has(JSON.stringify([s.id,e.id])))continue;
   if((e.type==='relationship'&&matchPair(e))||(e.type==='world'&&e.interaction_version===1&&matchEpisode(e))){
    const {relationship_patch}=e;
    entries.push({type:e.type==='relationship'?'relationship_change':'interaction',a:e.a,b:e.b,actors:e.actors,stance:e.stance,
      fields:relationship_patch,kind:e.interaction_kind,description:e.description,outcome:e.outcome,place:e.place,
      evidence:String(e.evidence||'').slice(0,1200),source:{scene_id:s.id,event_id:e.id,world_time:s.world_time??null}});
   }
  }
 }
 const start=Math.max(0,Math.floor(Number(offset)||0)),size=Math.max(1,Math.min(40,Math.floor(Number(limit)||20)));
 const ties=(projection.relationships||[]).filter(matchPair);
 return {actor,other:other||null,current:ties.slice(start,start+size).map(x=>({a:x.a,b:x.b,stance:x.stance,stance_source:x.stance_source,
  relationship_fields:x.relationship_fields||[],source:x.source,history_count:x.history_count})),
  history:entries.reverse().slice(start,start+size),total_history:entries.length,total_relationships:ties.length,
  next_offset:Math.max(entries.length,ties.length)>start+size?start+size:null,memory_complete:complete,
  policy:'Directions and fields are independent. A recorded meeting or cooperation is not affection, trust, reconciliation, consent, or a promise of future behavior. Absence of a record is not absence of a feeling.'};
}
