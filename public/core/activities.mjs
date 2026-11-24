/** Named durable habits and shared activities. Distinct habits do not overwrite each other. */
const valid=(v,n=140)=>typeof v==='string'&&!!v.trim()&&v.length<=n;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
const statuses={habit:['active','paused','abandoned','unknown'],activity:['planned','in_progress','completed','cancelled','unknown']};
export function activityError(e){
 if(e.type!=='world'||e.activity_version===undefined)return null;
 const k=e.activity_kind;
 if(e.activity_version!==1||!Object.hasOwn(statuses,k)||!id(e.record_id)||e.key!=='activity:'+k+':'+e.record_id||!statuses[k].includes(e.status)||
 !valid(e.name)||!valid(e.description,600))return 'Неверная запись привычки или занятия.';
 if(k==='habit'&&!valid(e.actor))return 'У привычки должен быть один герой.';
 if(k==='activity'&&(!Array.isArray(e.actors)||!e.actors.length||e.actors.length>12||e.actors.some(x=>!valid(x))||new Set(e.actors).size!==e.actors.length))return 'Нужны участники занятия.';
 if(e.place!=null&&!valid(e.place))return 'Неверное место занятия.';
 if(e.frequency!=null&&!valid(e.frequency,200))return 'Неверная частота привычки.';
 if(e.outcome!=null&&!valid(e.outcome,600))return 'Неверный итог занятия.';
 return null;
}
export function activityTransitionError(old,e){
 if(!old||e.activity_version!==1)return null;
 if(old.activity_version!==1||old.activity_kind!==e.activity_kind||old.record_id!==e.record_id)return 'Нельзя заменять чужую запись занятием.';
 if(e.activity_kind==='habit'&&old.actor!==e.actor)return 'Нельзя переносить привычку на другого героя.';
 if(e.activity_kind==='activity'&&['completed','cancelled'].includes(old.status)&&!['completed','cancelled'].includes(e.status))return 'Новая попытка занятия требует нового ID.';
 return null;
}
export function activityView(projection={},opts={}){
 const actor=String(opts.actor??'').trim();if(actor.length>140)throw Error('Слишком длинное имя.');
 const rows=(projection.worldFacts||[]).filter(x=>x.activity_version===1&&!activityError(x)&&(!actor||x.actor===actor||x.actors?.includes(actor)));
 const limit=Math.max(1,Math.min(40,Math.floor(Number(opts.limit)||20))),offset=Math.max(0,Math.floor(Number(opts.offset)||0));
 const page=xs=>xs.slice().reverse().slice(offset,offset+limit).map(x=>({id:x.record_id,kind:x.activity_kind,name:x.name,description:x.description,status:x.status,actor:x.actor,actors:x.actors,place:x.place,frequency:x.frequency,outcome:x.outcome,source:x.source,evidence:x.evidence.slice(0,600)}));
 const habits=rows.filter(x=>x.activity_kind==='habit'),activities=rows.filter(x=>x.activity_kind==='activity');
 return {habits:page(habits),activities:page(activities),counts:{habits:habits.length,activities:activities.length},next_offset:Math.max(habits.length,activities.length)>offset+limit?offset+limit:null,memory_complete:opts.complete!==false,
 policy:'Habits are established tendencies, not forced repetitions. Planned activities are not performed actions. Participation does not imply friendship or consent to unrelated acts.'};
}
