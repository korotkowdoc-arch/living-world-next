/** Branch-local social structures, institutional processes, competing claims
 * and scheduled changes. No automatic side effects, no real-time ticking. */
import {parseStoryDate} from './world-time.mjs';
const valid=(v,n=140)=>typeof v==='string'&&!!v.trim()&&v.length<=n;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
const text=v=>typeof v==='string'?v.trim():'';
const list=(v,min=1,max=12)=>Array.isArray(v)&&v.length>=min&&v.length<=max&&v.every(x=>valid(x))&&new Set(v).size===v.length;
const kinds={
 bond:['active','strained','estranged','ended','unknown'],
 institution:['operating','restricted','suspended','closed','unknown'],
 contest:['open','negotiating','decided','abandoned','unknown'],
 development:['scheduled','ongoing','completed','cancelled','unknown']
};
const terminal={bond:new Set(['ended']),contest:new Set(['decided','abandoned']),development:new Set(['completed','cancelled'])};
const bondTypes=['family','friendship','professional','mentorship','rivalry','community','romantic','other'];
export function dynamicsRecordError(e){
 if(e?.type!=='world')return null;
 if(e.dynamics_version===undefined)return text(e.key).startsWith('dynamics:')?'Ключ динамики требует версию записи.':null;
 const k=e.dynamics_kind;
 if(e.dynamics_version!==1||!Object.hasOwn(kinds,k)||!id(e.record_id)||e.key!=='dynamics:'+k+':'+e.record_id||!kinds[k].includes(e.status)||!valid(e.description,600))return 'Неверная запись динамики мира.';
 if(k==='bond'&&(!valid(e.actor)||!valid(e.counterparty)||e.actor===e.counterparty||!bondTypes.includes(e.bond_type)))return 'Связи нужны два разных участника и тип.';
 if(k==='institution'&&(!valid(e.name)||!valid(e.function,300)||!valid(e.place)||!id(e.group_id)))return 'Учреждению нужны название, назначение, место и ID группы.';
 if(k==='contest'&&(!valid(e.resource,300)||!list(e.actors,2)||!valid(e.title)))return 'Конкуренции нужны ресурс, название и минимум два участника.';
 if(k==='development'&&(!valid(e.title)||!valid(e.place)||!list(e.actors,0)))return 'Изменению мира нужны название, место и список участников (может быть пустым).';
 if(e.due_at!=null&&!parseStoryDate(e.due_at))return 'Срок изменения должен быть точной игровой датой.';
 for(const field of ['outcome','obstacle','next_step','terms'])if(e[field]!=null&&!valid(e[field],600))return 'Неверное поле: '+field;
 if((k==='contest'&&e.status==='decided'||k==='development'&&e.status==='completed')&&!valid(e.outcome,600))return 'Завершённой записи требуется результат.';
 return null;
}
export function dynamicsTransitionError(records,e){
 if(e.dynamics_version!==1)return null;
 const old=records.get(e.key),k=e.dynamics_kind;
 if(old){
  if(old.dynamics_version!==1||old.dynamics_kind!==k||old.record_id!==e.record_id)return 'Нельзя менять идентичность записи динамики.';
  if(k==='bond'&&(old.actor!==e.actor||old.counterparty!==e.counterparty||old.bond_type!==e.bond_type))return 'Нельзя переносить связь на других участников.';
  if(k==='institution'&&old.group_id!==e.group_id)return 'Нельзя переносить учреждение на другую группу.';
  if(k==='contest'&&old.resource!==e.resource)return 'Новый ресурс требует новой записи конкуренции.';
  if(terminal[k]?.has(old.status)&&old.status!==e.status)return 'Новая попытка требует нового ID.';
 }
 if(k==='institution'&&!records.has('social:group:'+e.group_id))return 'Сначала нужна запись организации.';
 return null;
}
export function dynamicsView(projection={},opts={}){
 const actor=text(opts.actor),place=text(opts.place);
 if(actor.length>140||place.length>140)throw Error('Слишком длинный фильтр.');
 const limit=Math.max(1,Math.min(40,Math.floor(Number(opts.limit)||20))),offset=Math.max(0,Math.floor(Number(opts.offset)||0));
 const rows=(projection.worldFacts||[]).filter(r=>r.dynamics_version===1&&!dynamicsRecordError(r)&&(!actor||r.actor===actor||r.counterparty===actor||r.actors?.includes(actor))&&(!place||r.place===place));
 const byKind=Object.fromEntries(Object.keys(kinds).map(k=>[k,rows.filter(x=>x.dynamics_kind===k)]));
 const compact=r=>({id:r.record_id,key:r.key,kind:r.dynamics_kind,status:r.status,actor:r.actor,counterparty:r.counterparty,bond_type:r.bond_type,actors:r.actors,name:r.name,title:r.title,resource:r.resource,group_id:r.group_id,place:r.place,function:r.function,description:r.description,due_at:r.due_at,terms:r.terms,obstacle:r.obstacle,next_step:r.next_step,outcome:r.outcome,source:r.source,evidence:String(r.evidence||'').slice(0,600)});
 const page=k=>byKind[k].slice().reverse().slice(offset,offset+limit).map(compact);
 return {bonds:page('bond'),institutions:page('institution'),contests:page('contest'),developments:page('development'),
 counts:Object.fromEntries(Object.entries(byKind).map(([k,v])=>[k,v.length])),next_offset:Math.max(...Object.values(byKind).map(x=>x.length))>offset+limit?offset+limit:null,memory_complete:opts.complete!==false,
 policy:'A social bond is not an emotion, consent or knowledge. Institutions are not individual characters. Contests do not transfer resources automatically. Scheduled developments are not completed events.'};
}
