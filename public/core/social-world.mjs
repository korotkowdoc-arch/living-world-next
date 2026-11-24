/** Exact recorded social state. Membership never implies affection, allegiance,
 * access to a secret, or participation in an action. Threads are not scripts.
 */
const text=v=>typeof v==='string'?v.trim():'';
const valid=(v,n=140)=>typeof v==='string'&&!!v.trim()&&v.length<=n;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
const states={
 group:new Set(['active','dormant','disbanded','unknown']),
 membership:new Set(['member','candidate','suspended','left','expelled','unknown']),
 thread:new Set(['open','paused','resolved','abandoned'])
};
export function socialRecordError(e){
 if(e.type!=='world'||e.social_record_version===undefined)return null;
 const k=e.social_kind;
 if(e.social_record_version!==1||!Object.hasOwn(states,k)||!id(e.record_id)||e.key!=='social:'+k+':'+e.record_id||!states[k].has(e.status))
  return 'Неверная социальная запись: вид, ID, ключ или состояние.';
 if(k==='group'&&(!valid(e.name)||!valid(e.purpose,600)))return 'У группы нужны название и записанная цель.';
 if(k==='membership'&&(!id(e.group_id)||!valid(e.actor)))return 'Для членства нужны ID группы и имя героя.';
 if(k==='thread'&&(!valid(e.title)||!valid(e.description,600)||!Array.isArray(e.actors)||!e.actors.length||e.actors.length>12||e.actors.some(x=>!valid(x))||new Set(e.actors).size!==e.actors.length))
  return 'Сюжетной линии нужны название, описание и точные имена участников.';
 if(e.role!=null&&!valid(e.role))return 'Неверная роль.';
 if(e.visibility!=null&&!['public','private','unknown'].includes(e.visibility))return 'Неверная видимость записи.';
 return null;
}
export function socialTransitionError(previous,e){
 if(!previous||e.social_record_version!==1)return null;
 if(previous.social_kind!==e.social_kind||previous.record_id!==e.record_id)return 'Нельзя менять личность социальной записи.';
 if(e.social_kind==='membership'&&(previous.actor!==e.actor||previous.group_id!==e.group_id))
  return 'Нельзя переносить ID членства на другого героя или группу.';
 return null;
}
export function socialWorldView(projection={},opts={}){
 const actor=text(opts.actor),group=text(opts.group);
 if(actor.length>140||group.length>140)throw Error('Слишком длинный фильтр.');
 const size=Math.max(1,Math.min(40,Math.floor(Number(opts.limit)||20))),offset=Math.max(0,Math.floor(Number(opts.offset)||0));
 const records=(projection.worldFacts||[]).filter(e=>e.social_record_version===1&&!socialRecordError(e));
 const memberships=records.filter(e=>e.social_kind==='membership'&&(!actor||e.actor===actor));
 const groups=records.filter(e=>e.social_kind==='group'&&(!group||e.record_id===group||e.name===group)&&(!actor||memberships.some(m=>m.group_id===e.record_id)));
 const groupIds=new Set(groups.map(x=>x.record_id));if(group)groupIds.add(group);
 const members=memberships.filter(e=>!group||groupIds.has(e.group_id));
 const threads=records.filter(e=>e.social_kind==='thread'&&(!actor||e.actors.includes(actor))&&(!group||groupIds.has(e.group_id)));
 const page=xs=>xs.slice().reverse().slice(offset,offset+size).map(x=>({id:x.record_id,kind:x.social_kind,name:x.name,title:x.title,actor:x.actor,actors:x.actors,group_id:x.group_id,role:x.role,purpose:x.purpose,description:x.description,status:x.status,visibility:x.visibility||'unknown',source:x.source,evidence:x.evidence.slice(0,600)}));
 return {groups:page(groups),memberships:page(members),threads:page(threads),
  counts:{groups:groups.length,memberships:members.length,threads:threads.length},
  next_offset:[groups,members,threads].some(x=>x.length>offset+size)?offset+size:null,
  memory_complete:opts.complete!==false,policy:'Membership is not loyalty, affection, knowledge or permission. Private threads and groups are narrator memory; do not reveal to characters without evidence. Threads are unresolved narrative situations, not predetermined events.'};
}
