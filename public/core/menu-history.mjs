/** Read-only recovery of source-backed entries for menus. It never adds
 * canonical events, marks an intention complete, grants knowledge or moves money.
 * Source IDs are retained; repeated receipts are NOT consolidated into shifts.
 */
import {sceneMemoryError,isSceneMemory} from './scene-memory-routing.mjs';
const page=records=>({records:records.slice(0,40),total:records.length,omitted:Math.max(0,records.length-40)});
const own=(x,a)=>x===a;
const cut=(x,n=600)=>typeof x==='string'?x.slice(0,n):'';
const paymentCue=/работ|смен[ауые]|заработ|поручени|уборк|разгруз|\b(?:work(?:ed|ing)?|shift|wage|earned|salary)\b/iu;
export function menuHistory(projection={},actor,scenes=[],{complete=true}={}){
 const rejectedScenes=new Set(),rejectedEvents=new Set();
 for(const w of projection.validation_warnings||[]){if(!w.scene_id)continue;if(w.event_id)rejectedEvents.add(JSON.stringify([w.scene_id,w.event_id]));else rejectedScenes.add(w.scene_id);}
 const intentions=[],learning=[],work=[],seen=new Set();
 const accepted=(s,e)=>!rejectedScenes.has(s.id)&&!rejectedEvents.has(JSON.stringify([s.id,e.id]));
 if(complete)for(let i=scenes.length-1;i>=0;i--){
  const s=scenes[i];if(!s?.id||rejectedScenes.has(s.id))continue;
  for(const e of [...(s.events||[])].reverse()){
   if(!accepted(s,e)||typeof e.id!=='string')continue;
   const source={scene_id:s.id,event_id:e.id,world_time:s.world_time??null};
   if(isSceneMemory(e)&&!sceneMemoryError(e)&&e.actor===actor&&e.memory_kind==='intention'&&['goals','education','work','calendar','property'].includes(e.domain)){
    const k=JSON.stringify([e.domain,e.summary]);if(seen.has(k))continue;seen.add(k);
    const row={title:cut(e.summary),domain:e.domain,status:'historical_intention',source};
    intentions.push(row);if(e.domain==='education')learning.push(row);
   }
   if(e.type==='money'&&e.operation==='transfer'&&typeof e.delta==='number'&&Number.isSafeInteger(e.delta)&&e.delta!==0&&typeof e.evidence==='string'&&paymentCue.test(e.evidence)){
    const delta=own(e.actor,actor)?e.delta:own(e.counterparty,actor)?-e.delta:0;
    if(delta<=0)continue;
    const other=own(e.actor,actor)?e.counterparty:e.actor;
    if(typeof other!=='string'||other===actor)continue;
    // Display the actual receipt and its literal source, not an invented shift.
    work.push({title:'Полученный платёж: '+other,amount:delta,currency:e.currency,description:cut(e.evidence),status:'historical_payment',source});
   }
  }
 }
 return {memory_complete:complete,intentions:page(intentions),learning:page(learning),work_payments:page(work),policy:'Historical source hints only. A work-related payment is not a new wage or proof of a completed formal shift; an earlier intention may have changed. Review exact source. No new canonical facts.'};
}
export function explicitGoalTasks(personalLife,actor){
 return (personalLife?.goals?.records||[]).filter(x=>['personal_goal','career_goal','family_goal'].includes(x.field)&&x.title&&x.source?.scene_id).map(x=>({id:'goal:'+actor+':'+x.field,title:x.title,status:'recorded_goal',source:x.source}));
}
export const EMPTY_SECTION_HINTS=Object.freeze({
 goals:'Жизненные цели появляются, когда герой их сформулировал. Старые намерения показаны отдельно: их актуальность требует проверки.',
 tasks:'Здесь появятся подтверждённые задачи, обязательства и жизненные цели. Намерение из прошлой сцены не означает открытое дело.',
 work:'Оформленных смен пока нет. История рабочих платежей доступна отдельно; она не создаёт новых выплат или договоров.',
 education:'Записанные занятия и квалификации появятся после обучения. Известные намерения учиться показаны отдельно.',
 contacts:'Знакомые появляются после подтверждённой встречи, разговора или связи.',
 relationships:'Отношение героя не установлено автоматически по совместным действиям.',
 interests:'Предпочтения и увлечения должны быть явно подтверждены в истории.',
 magic:'Подтверждённых магических знаний и техник пока нет.',
 letters:'Письма появятся после их отправки или получения в истории.',
 library:'Здесь появятся доступные герою книги с сохранённым содержанием.',
 property:'Официальные сведения о жилье и имуществе появятся после подтверждённых записей.',
 default:'Подтверждённых записей пока нет. Раздел будет заполняться по мере развития истории.'
});
export function hasMenuRecords(v){
 if(v==null)return false;
 if(Array.isArray(v))return v.length>0;
 if(typeof v!=='object')return false;
 if(Array.isArray(v.records))return v.total>0||v.records.length>0;
 return Object.entries(v).some(([k,x])=>!['source','policy','memory_complete','history_complete','read'].includes(k)&&typeof x==='object'&&hasMenuRecords(x));
}

/** Manually reviewed historical annotations: the reserved key is a display
 * classification, not authority to create state. Single explicit holder only.
 * Rows returned by the owner-pinned historical notes RPC; ancestry is checked.
 */
const reviewKinds={work:'action',education:'action',interests:'other',goals:'intention'};
export function reviewedMenuHistory(rows,scenes,actor,{complete=false}={}){
 const ids=new Map(scenes.map((s,i)=>[s.id,i])),groups={work:[],education:[],interests:[],goals:[]},seen=new Set();
 for(const r of rows||[]){
  const n=r?.note,match=/^menu-(work|education|interests|goals)-[a-z0-9_-]+$/.exec(r?.note_key??'');
  if(!match||!ids.has(r.scene_id)||!n||n.kind!==reviewKinds[match[1]]||!Array.isArray(n.actors)||n.actors.length!==1||n.actors[0]!==actor||typeof n.summary!=='string'||!n.summary.trim()||n.summary.length>600||typeof n.quote!=='string'||!n.quote.trim()||n.quote.length>1200)continue;
  const key=JSON.stringify([r.scene_id,r.note_key]);if(seen.has(key))continue;seen.add(key);
  groups[match[1]].push({title:n.summary,status:'historical_review',source:{scene_id:r.scene_id},order:ids.get(r.scene_id)});
 }
 return {canonical:false,scan_complete:complete,...Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,page(v.sort((a,b)=>b.order-a.order).map(({order,...x})=>x))])),policy:'Reviewed source annotations, not current tasks, qualifications, formal shifts or ledger events.'};
}
