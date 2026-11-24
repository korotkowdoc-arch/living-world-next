/** Durable, explicitly recorded consequences. Never manufacture guilt or resolution. */
const valid=(v,n=140)=>typeof v==='string'&&!!v.trim()&&v.length<=n;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
const status=new Set(['active','contested','suspended','resolved','unknown']);
const kind=new Set(['social','institutional','physical','material','access','reputation','other']);
export function consequenceError(e){
 if(e.type!=='world'||e.consequence_version===undefined)return null;
 if(e.consequence_version!==1||!id(e.record_id)||e.key!=='consequence:'+e.record_id||
 !kind.has(e.consequence_kind)||!status.has(e.status)||!valid(e.actor)||!valid(e.description,600))
 return 'Последствие требует ID, участника, состояния, вида и описания.';
 if(e.responsible!=null&&!valid(e.responsible))return 'Некорректный ответственный участник.';
 if(e.cause!=null&&!valid(e.cause,600))return 'Некорректное описание причины.';
 if(e.source_incident!=null&&!id(e.source_incident))return 'Некорректный идентификатор происшествия.';
 if(e.status==='resolved'&&!valid(e.outcome,600))return 'Нужен явно записанный результат разрешения последствия.';
 return null;
}
export function consequenceTransitionError(old,e){
 if(e.consequence_version!==1)return null;
 if(!old)return null;
 if(old.consequence_version!==1||old.actor!==e.actor||old.consequence_kind!==e.consequence_kind||old.source_incident!==e.source_incident)
 return 'Нельзя переносить ID последствия на другого участника, причину или вид.';
 if(old.status==='resolved'&&e.status!=='resolved')return 'Новое последствие требует нового ID.';
 return null;
}
export function consequenceView(projection={},opts={}){
 const actor=String(opts.actor??'').trim(),kindFilter=String(opts.kind??'').trim();
 if(actor.length>140||(kindFilter&&!kind.has(kindFilter)))throw Error('Некорректный фильтр последствий.');
 const offset=Math.max(0,Math.floor(Number(opts.offset)||0)),limit=Math.max(1,Math.min(40,Math.floor(Number(opts.limit)||20)));
 const rows=(projection.worldFacts||[]).filter(x=>x.consequence_version===1&&!consequenceError(x)&&(!actor||x.actor===actor||x.responsible===actor)&&(!kindFilter||x.consequence_kind===kindFilter));
 const current=rows.filter(x=>x.status!=='resolved'),resolved=rows.filter(x=>x.status==='resolved');
 const page=a=>a.slice().reverse().slice(offset,offset+limit).map(x=>({id:x.record_id,kind:x.consequence_kind,status:x.status,actor:x.actor,responsible:x.responsible,description:x.description,cause:x.cause,outcome:x.outcome,source_incident:x.source_incident,source:x.source,evidence:x.evidence.slice(0,600)}));
 return {current:page(current),resolved:page(resolved),counts:{current:current.length,resolved:resolved.length},
 next_offset:Math.max(current.length,resolved.length)>offset+limit?offset+limit:null,memory_complete:opts.complete!==false,
 policy:'Recorded consequences remain until a scene records their change. Allegations and disputed consequences are not proof of guilt. Resolution is not forgiveness, restored trust, healed injuries or restitution unless separately evidenced.'};
}
