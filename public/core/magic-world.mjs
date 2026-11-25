/** Fictional magic and medicine. A branch-local evidence ledger, not a spell
 * list tied to any franchise. No real medical advice or automatic outcomes. */
const K=['tradition','technique','training','research','reserve','casting','artifact','condition','diagnosis','therapy','course','treatment','law'];
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,70}$/.test(x);
const str=(x,n=140)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
const one=(v,vs)=>vs.includes(v);
const integer=(x,min=0,max=1000000)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const key=(...xs)=>JSON.stringify(xs);
const page=(rows,offset=0,limit=24)=>({records:rows.slice(offset,offset+limit),total:rows.length,omitted:Math.max(0,rows.length-offset-limit),next_offset:offset+limit<rows.length?offset+limit:null});
const src=(s,e)=>({scene_id:s.id,event_id:e.id,world_time:s.world_time??null});
export const isMagic=e=>e?.magic_version!==undefined||typeof e?.key==='string'&&e.key.startsWith('magic:');
export const MAGIC_DOMAINS=Object.freeze([
 ['charms','Чары и управление свойствами'],['transfiguration','Трансфигурация и устойчивость формы'],['wards','Защита, печати и контрмагия'],['ritual','Ритуалистика и коллективная магия'],['runes','Руны, зачарование и артефакты'],['alchemy','Алхимия и зельеварение'],['mind','Ментальная магия и защита сознания'],['space','Пространство и перемещение'],['divination','Диагностическое восприятие и прорицание'],['nature','Магическая экология и существа'],['healing','Целительство и магическая физиология'],['elemental','Стихийная и энергетическая магия'],['curse','Проклятия, их механика и снятие'],['soul','Душа, память и магическая идентичность'],['other','Другие традиции мира']
]);
const domains=MAGIC_DOMAINS.map(x=>x[0]);
const levels=['unfamiliar','theory','learning','practicing','competent','advanced','master'];
const activeCase=['suspected','confirmed','recovering','chronic','relapsed'];
const researchStages=['hypothesis','testing','validated','rejected','paused'];
export function magicShapeError(e){
 if(!isMagic(e))return null;
 const k=e.magic_kind;
 if(e.type!=='world'||e.magic_version!==1||!K.includes(k)||!id(e.record_id)||e.key!=='magic:'+k+':'+e.record_id||!str(e.evidence,12000))return 'Invalid magical record envelope';
 if(['advanced_version','world_record_version','social_record_version','interaction_version','activity_version','consequence_version','growth_version','dynamics_version','player_life_version'].some(v=>e[v]!==undefined))return 'Magic record must be separate';
 if(k==='tradition'&&(!str(e.actor)||!str(e.title)||!one(e.domain,domains)||!str(e.description,600)||!str(e.limits,600)||!one(e.status,['active','restricted','lost'])))return 'Invalid magical tradition';
 if(k==='technique'&&(!str(e.actor)||!str(e.title)||!id(e.tradition_id)||!one(e.form,['spell','ritual','potion','enchantment','counterspell','diagnostic','healing','innate','other'])||!str(e.effect,600)||!str(e.requirements,600)||!str(e.limits,600)||!str(e.risks,600)||!one(e.status,['experimental','established','restricted','retired'])||e.cost!=null&&!integer(e.cost)))return 'Invalid magical technique';
 if(k==='training'&&(!str(e.actor)||!id(e.technique_id)||!one(e.status,levels)||!str(e.description,600)))return 'Invalid technique training';
 if(k==='research'&&(!str(e.actor)||!str(e.title)||!id(e.tradition_id)||!str(e.hypothesis,600)||!str(e.method,600)||!one(e.status,researchStages)||['validated','rejected'].includes(e.status)&&!str(e.result,600)||e.technique_id!=null&&!id(e.technique_id)))return 'Invalid magical research';
 if(k==='reserve'&&(!str(e.actor)||!str(e.pool,80)||!integer(e.capacity,1)||!integer(e.remaining,0,e.capacity)||!one(e.status,['observed','restored','depleted'])||!str(e.description,600)))return 'Invalid observed magical reserve';
 if(k==='casting'&&(!str(e.actor)||!id(e.technique_id)||!one(e.method,['trained','assisted','experimental','accidental','innate'])||!str(e.target,200)||!str(e.outcome,600)||!one(e.status,['success','partial','failed','backlash'])||!integer(e.spent)||e.reserve_id!=null&&!id(e.reserve_id)||e.support!=null&&!str(e.support,300)))return 'Invalid casting episode';
 if(k==='artifact'&&(!str(e.actor)||!str(e.title)||!id(e.technique_id)||!str(e.item_id,180)||!str(e.effect,600)||!str(e.limits,600)||!one(e.status,['active','dormant','broken','destroyed'])))return 'Invalid enchanted object';
 if(k==='condition'&&(!str(e.actor)||!str(e.title)||!one(e.origin,['curse','magical_injury','potion','creature','congenital','infection','exposure','imbalance','unknown','other'])||!str(e.description,600)||!str(e.signs,600)||!one(e.status,['hypothesis','established','disputed'])))return 'Invalid fictional condition';
 if(k==='diagnosis'&&(!str(e.actor)||!str(e.patient)||!str(e.title)||!id(e.condition_id)||!str(e.findings,600)||!one(e.status,[...activeCase,'resolved','ruled_out'])||!one(e.severity,['mild','moderate','severe','critical','unknown'])||e.patient_informed!=null&&typeof e.patient_informed!=='boolean'))return 'Invalid fictional diagnosis';
 if(k==='therapy'&&(!str(e.actor)||!str(e.title)||!id(e.condition_id)||!str(e.method,600)||!str(e.limits,600)||!str(e.risks,600)||!one(e.status,['experimental','established','restricted','retired'])||e.technique_id!=null&&!id(e.technique_id)))return 'Invalid fictional therapy';
 if(k==='course'&&(!str(e.actor)||!str(e.patient)||!id(e.diagnosis_id)||!id(e.therapy_id)||!str(e.description,600)||!one(e.status,['proposed','accepted','active','paused','completed','cancelled'])))return 'Invalid treatment course';
 if(k==='treatment'&&(!str(e.actor)||!str(e.patient)||!id(e.course_id)||!str(e.outcome,600)||!one(e.status,['performed','partial','failed','adverse'])||e.casting_id!=null&&!id(e.casting_id)))return 'Invalid fictional treatment episode';
 if(k==='law'&&(!str(e.actor)||!str(e.title)||!str(e.description,600)||!str(e.jurisdiction,200)||!one(e.status,['proposed','active','repealed'])))return 'Invalid magical law';
 return null;
}
export function magicIndex(scenes=[],projection={}, {complete=true}={}){
 const records=new Map(),warnings=[],casesByPatient=new Map(),coursesWithTreatment=new Set(),castUse=new Set(),researchByTechnique=new Map(),reserveUsed=new Map();
 const badScenes=new Set(),badEvents=new Set();
 for(const w of projection.validation_warnings||[]){if(w.event_id==null)badScenes.add(w.scene_id);else badEvents.add(key(w.scene_id,w.event_id));}
 const get=(k,i)=>records.get('magic:'+k+':'+i);
 const fail=(s,e,error)=>warnings.push({scene_id:s.id,event_id:e.id,errors:[error]});
 const training=new Map();
 if(complete)for(const s of scenes){
  if(badScenes.has(s.id))continue;
  for(const e of s.events||[]){
   if(!isMagic(e)||badEvents.has(key(s.id,e.id)))continue;
   let err=magicShapeError(e);const k=e.magic_kind,old=records.get(e.key);
   const same=fields=>!old||fields.every(f=>old[f]===e[f]);
   if(!err&&k==='tradition'&&!same(['actor','domain','title']))err='Tradition identity cannot change';
   if(!err&&k==='technique'){
    if(!get('tradition',e.tradition_id)||!same(['actor','tradition_id','form','title'])||old?.status==='retired'&&e.status!=='retired')err='Technique identity or tradition invalid';
    if(!err&&old?.status==='experimental'&&e.status==='established'&&!researchByTechnique.has(e.record_id))err='Experimental technique requires validated research before establishment';
   }
   if(!err&&k==='training'){
    const previous=training.get(key(e.actor,e.technique_id));
    if(!get('technique',e.technique_id)||!same(['actor','technique_id'])||previous&&previous.record_id!==e.record_id)err='Training requires known technique and one stable actor/technique ID';
    else if(old&&levels.indexOf(e.status)>levels.indexOf(old.status)+1)err='Training advances one level per evidenced progression';
   }
   if(!err&&k==='research'){
    if(!get('tradition',e.tradition_id)||!same(['actor','tradition_id','title'])||old&&['validated','rejected'].includes(old.status)||e.technique_id!=null&&get('technique',e.technique_id)?.tradition_id!==e.tradition_id)err='Research identity or technique invalid';
    else if(e.status==='validated'&&old?.status!=='testing')err='Validation requires previously recorded testing';
   }
   if(!err&&k==='reserve'&&(!same(['actor','pool'])||old&&e.status==='restored'&&e.remaining<old.remaining))err='Reserve identity or restoration invalid';
   if(!err&&k==='casting'){
    const t=get('technique',e.technique_id),r=e.reserve_id?get('reserve',e.reserve_id):null,learned=training.get(key(e.actor,e.technique_id));
    if(old||!t||t.status==='retired')err='Casting requires unique episode and usable technique';
    else if(e.method==='trained'&&(!learned||!['practicing','competent','advanced','master'].includes(learned.status)))err='Trained casting requires recorded practice';
    else if(e.method==='assisted'&&!str(e.support,300))err='Assisted casting requires recorded support';
    else if(e.method==='innate'&&t.form!=='innate')err='Innate casting requires innate technique';
    else if(t.cost!=null&&e.spent<t.cost&&['success','partial'].includes(e.status))err='Successful cast must meet established cost';
    else if(e.reserve_id&&(!r||r.actor!==e.actor||e.spent>r.remaining))err='Insufficient or wrong magical reserve';
    else if(e.spent>0&&!r)err='Positive cost requires a recorded reserve';
    if(!err&&r){const updated={...r,remaining:r.remaining-e.spent,status:r.remaining===e.spent?'depleted':r.status,source:src(s,e)};records.set(r.key,updated);}
   }
   if(!err&&k==='artifact'&&(!get('technique',e.technique_id)||!same(['item_id','technique_id','title'])||old?.status==='destroyed'&&e.status!=='destroyed'))err='Artifact identity or technique invalid';
   if(!err&&k==='condition'&&!same(['actor','origin','title']))err='Condition identity cannot change';
   if(!err&&k==='diagnosis'){
    if(!get('condition',e.condition_id)||!same(['actor','patient','condition_id','title'])||old&&['resolved','ruled_out'].includes(old.status)&&!['resolved','relapsed'].includes(e.status)||!old&&['resolved','recovering','relapsed'].includes(e.status))err='Diagnosis requires condition and valid clinical continuity';
    else if(e.status==='resolved'&&old?.status!=='resolved'&&!str(e.findings,600))err='Recovery requires recorded findings';
   }
   if(!err&&k==='therapy'&&(!get('condition',e.condition_id)||e.technique_id!=null&&!get('technique',e.technique_id)||!same(['actor','condition_id','title'])||old?.status==='retired'&&e.status!=='retired'))err='Therapy references unknown condition/technique';
   if(!err&&k==='course'){
    const d=get('diagnosis',e.diagnosis_id),t=get('therapy',e.therapy_id);
    if(!d||!t||d.patient!==e.patient||d.condition_id!==t.condition_id||!same(['actor','patient','diagnosis_id','therapy_id']))err='Course must match diagnosis, patient and therapy';
    else if(!old&&e.status!=='proposed'||old&&['completed','cancelled'].includes(old.status)&&e.status!==old.status||e.status==='active'&&!['accepted','active','paused'].includes(old?.status)||e.status==='accepted'&&old?.status!=='proposed'||e.status==='completed'&&(old?.status!=='active'||!coursesWithTreatment.has(e.record_id)))err='Course must be proposed, accepted, performed then completed';
    else if(['accepted','active'].includes(e.status)&&(!activeCase.includes(d.status)||t.status==='retired'))err='Course requires active diagnosis and available therapy';
   }
   if(!err&&k==='treatment'){
    const c=get('course',e.course_id),t=c&&get('therapy',c.therapy_id),cast=e.casting_id&&get('casting',e.casting_id);
    if(old||!c||c.status!=='active'||c.actor!==e.actor||c.patient!==e.patient)err='Treatment requires unique episode and active accepted course';
    else if(t?.technique_id&&(!cast||cast.actor!==e.actor||cast.technique_id!==t.technique_id||cast.target!==e.patient||cast.source.scene_id!==s.id||castUse.has(e.casting_id)))err='Magical treatment requires matching unused casting episode in the same scene';
    else if(cast&&(['failed','backlash'].includes(cast.status)&&e.status==='performed'))err='Failed casting cannot establish performed treatment';
    if(!err){coursesWithTreatment.add(e.course_id);if(e.casting_id)castUse.add(e.casting_id);}
   }
   if(!err&&k==='law'&&(!same(['actor','title','jurisdiction'])||old?.status==='repealed'&&e.status!=='repealed'))err='Law identity cannot change';
   if(err){fail(s,e,err);continue;}
   const r={...e,source:src(s,e)};records.set(e.key,r);
   if(k==='training')training.set(key(e.actor,e.technique_id),r);
   if(k==='research'&&e.status==='validated'&&e.technique_id)researchByTechnique.set(e.technique_id,r);
  }
 }
 const rows=[...records.values()],of=k=>rows.filter(r=>r.magic_kind===k);
 const compact=r=>{const {type,id,key,magic_version,magic_kind,record_id,evidence,...rest}=r;return {id:record_id,kind:magic_kind,...rest};};
 function view(actor,{director=false,offset=0,limit=24}={}){
  if(!complete)return {memory_complete:false};
  const own=r=>r.actor===actor,known=new Set((projection.knowledge||[]).filter(x=>x.actor===actor&&x.status==='knows').map(x=>x.topic_id));
  const trainings=of('training').filter(own),casts=of('casting').filter(own),research=of('research').filter(own);
  const knownTech=new Set([...trainings,...casts].map(r=>r.technique_id));
  const diagnoses=of('diagnosis').filter(r=>own(r)||r.patient===actor&&(director||r.patient_informed===true)),courses=of('course').filter(r=>r.patient===actor||own(r)),treatments=of('treatment').filter(r=>r.patient===actor||own(r));
  const visible=(r,prefix)=>director||own(r)||known.has(prefix+'_'+r.record_id);
  const techniques=of('technique').filter(r=>visible(r,'technique')||knownTech.has(r.record_id));
  const traditionIds=new Set([...techniques,...research].map(r=>r.tradition_id));
  const conditionIds=new Set(diagnoses.map(r=>r.condition_id)),therapyIds=new Set(courses.map(r=>r.therapy_id));
  const catalogue=(k,knownIds,prefix)=>of(k).filter(r=>visible(r,prefix)||knownIds.has(r.record_id)).map(r=>visible(r,prefix)?compact(r):{id:r.record_id,title:r.title,kind:k,status:'known_reference'});
  const held=new Set((projection.items||[]).filter(x=>x.holder===actor&&x.custody_status==='held').map(x=>x.item_id));
  return {memory_complete:true,magic:{traditions:page(catalogue('tradition',traditionIds,'tradition'),offset,limit),techniques:page(techniques.map(r=>visible(r,'technique')?compact(r):{id:r.record_id,title:r.title,kind:'technique',status:'known_reference'}),offset,limit),training:page(trainings.map(compact),offset,limit),research:page(research.map(compact),offset,limit),reserves:page(of('reserve').filter(own).map(compact),offset,limit),casts:page(casts.slice().reverse().map(compact),offset,limit),artifacts:page(of('artifact').filter(r=>director||held.has(r.item_id)).map(r=>director||own(r)?compact(r):{id:r.record_id,title:r.title,item_id:r.item_id,status:'known_reference'}),offset,limit),laws:page(of('law').filter(r=>visible(r,'magic_law')).map(compact),offset,limit)},medicine:{conditions:page(catalogue('condition',conditionIds,'condition'),offset,limit),diagnoses:page(diagnoses.map(r=>own(r)||director?compact(r):{id:r.record_id,title:r.title,patient:r.patient,condition_id:r.condition_id,status:r.status,severity:r.severity,source:r.source}),offset,limit),therapies:page(catalogue('therapy',therapyIds,'therapy'),offset,limit),courses:page(courses.map(compact),offset,limit),treatments:page(treatments.slice().reverse().map(compact),offset,limit)},policy:'Fictional magic and medicine only. No automatic casting, skill gain, diagnosis, cure or reserve restoration.'};
 }
 function opportunities(){
  if(!complete)return [];
  const out=[],seen=new Set();
  const add=(kind,r,actor,extra)=>{const k=key(kind,actor);if(seen.has(k))return;seen.add(k);out.push({kind,row:{actor,key:r.key,title:r.title||r.description||r.record_id,status:r.status,source:r.source},info:{record_key:r.key,timing:'requires_character_choice',magic_context:extra,guidance:'Use recorded fictional constraints and actual scene outcome. No automatic cure, casting or research success.'}});};
  for(const r of of('research'))if(['hypothesis','testing','paused'].includes(r.status))add('magic_research',r,r.actor,{research_id:r.record_id,stage:r.status,hypothesis:r.hypothesis});
  for(const r of of('training'))if(['learning','theory','practicing','competent','advanced'].includes(r.status))add('magic_practice',r,r.actor,{technique_id:r.technique_id,level:r.status});
  for(const r of of('diagnosis'))if(activeCase.includes(r.status))add('magic_care',r,r.patient,{diagnosis_id:r.record_id,severity:r.severity});
  for(const r of of('course'))if(['proposed','accepted','active'].includes(r.status))add('magic_treatment',r,r.actor,{course_id:r.record_id,patient:r.patient,stage:r.status});
  for(const r of of('reserve'))if(r.remaining<r.capacity)add('magic_rest',r,r.actor,{reserve_id:r.record_id,remaining:r.remaining,capacity:r.capacity});
  return out;
 }
 return {view,opportunities,warnings};
}
export const MAGIC_GUIDANCE=`МАГИЯ: только в мире, где она предусмотрена. Не ограничивайся каноном известных заклинаний. Развивай собственные школы, правила, исследование, ритуалы, алхимию, артефакты, диагностику, магическую физиологию и болезни, с согласованными ограничениями, ценой и последствиями. Магическая медицина не обязана копировать реальную. Ни один новый элемент не становится каноном без сцены. Запись type=world,magic_version=1,magic_kind,record_id,key=magic:<kind>:<ID>,evidence. tradition: actor,title,domain (charms/transfiguration/wards/ritual/runes/alchemy/mind/space/divination/nature/healing/elemental/curse/soul/other),description,limits,status active/restricted/lost. technique: actor,title,tradition_id,form spell/ritual/potion/enchantment/counterspell/diagnostic/healing/innate/other,effect,requirements,limits,risks,status experimental/established/restricted/retired,cost необязательное целое. training: actor,technique_id,status unfamiliar/theory/learning/practicing/competent/advanced/master,description; один ID, последовательный рост. research: actor,title,tradition_id,hypothesis,method,status hypothesis/testing/validated/rejected/paused,result при завершении,technique_id; новая техника experimental→validated research→established. reserve: actor,pool,capacity,remaining,status observed/restored/depleted,description; только подтверждённый ресурс, не обязательная мана. casting: actor,technique_id,method trained/assisted/experimental/accidental/innate,target,outcome,status success/partial/failed/backlash,spent (0 если нет учёта),reserve_id при расходе,support при помощи. artifact: actor,title,technique_id,item_id,effect,limits,status active/dormant/broken/destroyed; владение отдельно item. condition: actor,title,origin curse/magical_injury/potion/creature/congenital/infection/exposure/imbalance/unknown/other,description,signs,status hypothesis/established/disputed. diagnosis: actor=целитель,patient,title,condition_id,findings,patient_informed=true только после сообщения пациенту,severity mild/moderate/severe/critical/unknown,status suspected/confirmed/recovering/chronic/relapsed/resolved/ruled_out. therapy: actor,title,condition_id,method,limits,risks,status experimental/established/restricted/retired,technique_id если требуется. course: actor=целитель,patient,diagnosis_id,therapy_id,description,status proposed/accepted/active/paused/completed/cancelled; согласие пациента в сцене, не решай за игрока. treatment: actor,patient,course_id,outcome,status performed/partial/failed/adverse,casting_id при технике (тот же эпизод, target=patient); результат не равен выздоровлению. law: actor,title,description,jurisdiction,status proposed/active/repealed. Для изученных героем определений отдельное knowledge topic_id=technique_<ID>/tradition_<ID>/condition_<ID>/therapy_<ID>/magic_law_<ID>. Не раскрывай неизвестную магию. Проверяй требования, навыки, реальные ресурсы и результат; нельзя лечить/расходовать/изучать автоматически.`;
export const MAGIC_ACTIONS=Object.freeze({study_magic:'Изучить магическое направление',learn_technique:'Учить технику',practice_magic:'Практиковаться',cast_magic:'Применить магию',start_magic_research:'Начать магическое исследование',continue_magic_research:'Продолжить исследование',create_artifact:'Создать артефакт',investigate_magic:'Исследовать магический феномен',seek_magical_healer:'Обратиться к целителю',request_magical_diagnosis:'Пройти магическую диагностику',consider_therapy:'Обсудить лечение',respond_magic_course:'Ответить на предложение лечения',continue_magic_course:'Продолжить курс лечения',rest_magic:'Восстановить магические силы',review_magic_law:'Изучить магические правила'});
export const MAGIC_ACTION_IDS=Object.freeze({learn_technique:'technique_id',practice_magic:'training_id',cast_magic:'technique_id',continue_magic_research:'research_id',consider_therapy:'diagnosis_id',respond_magic_course:'course_id',continue_magic_course:'course_id'});
export function magicActionRows(input,v){
 const f=MAGIC_ACTION_IDS[input.action],m=v?.magic,h=v?.medicine;if(!m||!h)return [];
 return (f==='technique_id'?m.techniques:f==='training_id'?m.training:f==='research_id'?m.research:f==='diagnosis_id'?h.diagnoses:h.courses)?.records||[];
}
export function validateMagicAction(input,overview){
 const f=MAGIC_ACTION_IDS[input.action];if(!f)return;
 const r=magicActionRows(input,overview.magic_system).find(r=>r.id===input[f]);if(!r)throw Error('Magical record is not visible');
 if(input.action==='continue_magic_research'&&!['hypothesis','testing','paused'].includes(r.status)||input.action==='respond_magic_course'&&r.status!=='proposed'||input.action==='continue_magic_course'&&!['accepted','active','paused'].includes(r.status)||input.action==='consider_therapy'&&!activeCase.includes(r.status)||input.action==='cast_magic'&&r.status==='retired')throw Error('Magical record status does not permit action');
}
