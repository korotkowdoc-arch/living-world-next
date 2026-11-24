/** Evidence-backed growth, personal projects, information transmission and causal links.
 * Every change is a recorded event. No XP farming, scheduled progress, omniscient rumor
 * dissemination or inferred causation. Stable world keys survive archive remapping.
 */
const text=v=>typeof v==='string'?v.trim():'';
const valid=(v,n=140)=>typeof v==='string'&&!!v.trim()&&v.length<=n;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
const kinds=['skill','project','rumor','cause'];
const skillStates=['learning','practicing','competent','advanced','limited','unknown'];
const projectStates=['planned','active','paused','completed','abandoned','unknown'];
const terminal=new Set(['completed','abandoned']);
const keyRef=v=>typeof v==='string'&&v.length<=180&&!!v.trim()&&!v.startsWith('growth:cause:');
export function growthRecordError(e){
 if(e?.type!=='world')return null;
 if(e.growth_version===undefined)return typeof e.key==='string'&&e.key.startsWith('growth:')?'Ключ развития требует growth_version=1.':null;
 const k=e.growth_kind;
 if(e.growth_version!==1||!kinds.includes(k)||!id(e.record_id)||e.key!=='growth:'+k+':'+e.record_id)
  return 'Неверная версия, вид или ключ записи развития.';
 if(k==='skill'){
  if(!valid(e.actor)||!valid(e.name)||!skillStates.includes(e.status)||!valid(e.description,600))return 'Навыку нужны герой, название, состояние и описание.';
  if(e.teacher!=null&&!valid(e.teacher))return 'Неверный наставник.';
 }else if(k==='project'){
  if(!valid(e.actor)||!valid(e.title)||!projectStates.includes(e.status)||!valid(e.description,600))return 'Проекту нужны герой, название, состояние и описание.';
  for(const key of ['milestone','obstacle','next_step','outcome'])if(e[key]!=null&&!valid(e[key],600))return 'Неверное поле проекта: '+key;
  if(e.status==='completed'&&!valid(e.outcome,600))return 'Завершение проекта требует записанного результата.';
 }else if(k==='rumor'){
  if(!id(e.topic_id)||!valid(e.sender)||!valid(e.recipient)||e.sender===e.recipient||!valid(e.claim,1200)||!valid(e.channel,300))return 'Передача слуха требует темы, отправителя, получателя, содержания и канала.';
  if(e.parent_rumor_id!=null&&!id(e.parent_rumor_id))return 'Неверный предыдущий эпизод передачи.';
 }else{
  if(!keyRef(e.from_key)||!keyRef(e.to_key)||e.from_key===e.to_key||!valid(e.description,600)||!['established','claimed','disputed'].includes(e.status))return 'Причинная связь требует двух разных записей, описания и статуса.';
  if(e.actor!=null&&!valid(e.actor))return 'Неверный носитель утверждения.';
  if(e.status==='claimed'&&!valid(e.actor))return 'У причинного утверждения нужен автор.';
 }
 return null;
}
export function growthTransitionError(records,e){
 if(e.growth_version!==1)return null;
 const old=records.get(e.key),k=e.growth_kind;
 if(old){
  if(old.growth_version!==1||old.growth_kind!==k||old.record_id!==e.record_id)return 'Нельзя менять идентичность записи развития.';
  if(k==='rumor')return 'Передача слуха — отдельный эпизод; повтор требует нового ID.';
  if((k==='skill'||k==='project')&&(old.actor!==e.actor||(k==='skill'?old.name!==e.name:old.title!==e.title)))return 'Нельзя переносить ID навыка или проекта на другого героя или предмет.';
  if(k==='project'&&terminal.has(old.status)&&old.status!==e.status)return 'Новая попытка проекта требует нового ID.';
  if(k==='cause'&&(old.from_key!==e.from_key||old.to_key!==e.to_key))return 'Нельзя изменять концы причинной связи.';
 }
 if(k==='rumor'&&e.parent_rumor_id!=null){
  const parent=records.get('growth:rumor:'+e.parent_rumor_id);
  if(!parent||parent.topic_id!==e.topic_id||parent.recipient!==e.sender)return 'Предыдущая передача должна существовать и вести к этому отправителю по той же теме.';
 }
 if(k==='cause'){
  if(!records.has(e.from_key)||!records.has(e.to_key))return 'Причинная связь требует ранее записанных событий мира в этой ветке.';
  // Established links must not form directed cycles. Claims may contradict each other.
  if(e.status==='established'){
   const edges=new Map();
   for(const x of records.values())if(x.growth_version===1&&x.growth_kind==='cause'&&x.key!==e.key&&x.status==='established'){
    const list=edges.get(x.from_key)||[];list.push(x.to_key);edges.set(x.from_key,list);
   }
   const queue=[e.to_key],seen=new Set();
   while(queue.length){const at=queue.pop();if(at===e.from_key)return 'Цикл установленных причинных связей.';
    if(seen.has(at))continue;seen.add(at);for(const next of edges.get(at)||[])queue.push(next);}
  }
 }
 return null;
}
export function growthView(projection={},opts={}){
 const actor=text(opts.actor),topic=text(opts.topic);
 if(actor.length>140||topic.length>140)throw Error('Слишком длинный фильтр.');
 const limit=Math.max(1,Math.min(40,Math.floor(Number(opts.limit)||20))),offset=Math.max(0,Math.floor(Number(opts.offset)||0));
 const rows=(projection.worldFacts||[]).filter(x=>x.growth_version===1&&!growthRecordError(x));
 const byKey=new Map((projection.worldFacts||[]).map(x=>[x.key,x]));
 const matches=(x)=>!actor||x.actor===actor||x.sender===actor||x.recipient===actor||x.teacher===actor||x.actors?.includes(actor);
 const skills=rows.filter(x=>x.growth_kind==='skill'&&matches(x)&&(!topic||x.name===topic||x.record_id===topic));
 const projects=rows.filter(x=>x.growth_kind==='project'&&matches(x)&&(!topic||x.title===topic||x.record_id===topic));
 const rumors=rows.filter(x=>x.growth_kind==='rumor'&&matches(x)&&(!topic||x.topic_id===topic));
 const causes=rows.filter(x=>x.growth_kind==='cause'&&(matches(x)||matches(byKey.get(x.from_key)||{})||matches(byKey.get(x.to_key)||{}))&&(!topic||x.from_key===topic||x.to_key===topic||x.record_id===topic));
 const compact=x=>({id:x.record_id,kind:x.growth_kind,actor:x.actor,name:x.name,title:x.title,status:x.status,description:x.description,teacher:x.teacher,milestone:x.milestone,obstacle:x.obstacle,next_step:x.next_step,outcome:x.outcome,
  sender:x.sender,recipient:x.recipient,topic_id:x.topic_id,claim:x.claim,channel:x.channel,parent_rumor_id:x.parent_rumor_id,from_key:x.from_key,to_key:x.to_key,
  source:x.source,evidence:String(x.evidence||'').slice(0,600)});
 const page=a=>a.slice().reverse().slice(offset,offset+limit).map(compact);
 return {skills:page(skills),projects:page(projects),rumors:page(rumors),causes:page(causes),counts:{skills:skills.length,projects:projects.length,rumors:rumors.length,causes:causes.length},
 next_offset:Math.max(skills.length,projects.length,rumors.length,causes.length)>offset+limit?offset+limit:null,memory_complete:opts.complete!==false,
 policy:'Recorded training and projects do not progress automatically. Transmitting a claim does not establish belief, truth or receipt by anyone else. A claimed cause is not established causality. Read source scenes.'};
}
