/** Practical magic: preparations, documented material consumption, cooperative
 * rituals, magical craftsmanship, field observations and professional institutions.
 * No independent clock, automatic ecological changes or invented resources. */
import {magicIndex} from './magic-world.mjs';
import {stockLinesError} from './economy.mjs';
const kinds=['formula','batch','ritual_design','ritual_run','ritual_step','workshop','enchantment','species','habitat','creature','field_observation','clinic','license','clinical_visit','discovery','patent','institute','study'];
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,65}$/.test(x);
const str=(x,n=140)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
const one=(x,a)=>a.includes(x);
const list=(a,max=12)=>Array.isArray(a)&&a.length>0&&a.length<=max&&a.every(x=>str(x))&&new Set(a).size===a.length;
const pos=x=>Number.isSafeInteger(x)&&x>0&&x<=1000000;
const key=(...x)=>JSON.stringify(x);
const src=(s,e)=>({scene_id:s.id,event_id:e.id,world_time:s.world_time??null});
const page=(rows,offset=0,limit=24)=>({records:rows.slice(offset,offset+limit),total:rows.length,next_offset:offset+limit<rows.length?offset+limit:null,omitted:Math.max(0,rows.length-offset-limit)});
const material=rows=>Array.isArray(rows)&&rows.length<=20&&(rows.length===0||!stockLinesError(rows,'consume'));
const exact=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every(x=>b.some(y=>x.product_id===y.product_id&&x.unit===y.unit&&x.quantity===y.quantity));
const done=['completed','failed','cancelled','aborted','retired','closed','revoked','deceased','destroyed','withdrawn','rejected','expired'];
export const isCraft=e=>e?.craft_version!==undefined||typeof e?.key==='string'&&e.key.startsWith('craft:');
export function craftShapeError(e){
 if(!isCraft(e))return null;
 const k=e.craft_kind;
 if(e.type!=='world'||e.craft_version!==1||!kinds.includes(k)||!id(e.record_id)||e.key!=='craft:'+k+':'+e.record_id||!str(e.evidence,12000)||!str(e.actor))return 'Invalid practical magic envelope';
 if(['magic_version','advanced_version','world_record_version','social_record_version','interaction_version','activity_version','consequence_version','growth_version','dynamics_version','player_life_version'].some(v=>e[v]!==undefined))return 'Separate practical magic record required';
 if(k==='formula'&&(!str(e.title)||!id(e.technique_id)||!material(e.ingredients)||!e.ingredients.length||!id(e.output_id)||!str(e.output_unit,40)||!pos(e.output_quantity)||e.ingredients.some(l=>l.product_id===e.output_id&&l.unit===e.output_unit)||!list(e.stages,12)||!str(e.effect,600)||!str(e.limits,600)||!one(e.status,['experimental','established','restricted','retired'])))return 'Invalid fictional potion formula';
 if(k==='batch'&&(!id(e.formula_id)||!pos(e.stage)||!one(e.status,['prepared','brewing','completed','failed','cancelled'])||e.stock_event_id!=null&&!id(e.stock_event_id)||!str(e.outcome,600)))return 'Invalid brewing batch';
 if(k==='ritual_design'&&(!id(e.technique_id)||!str(e.title)||!list(e.roles)||!list(e.stages)||!material(e.materials)||!str(e.limits,600)||!one(e.status,['experimental','established','restricted','retired'])))return 'Invalid ritual design';
 if(k==='ritual_run'&&(!id(e.design_id)||!str(e.place)||!Array.isArray(e.members)||e.members.length<1||e.members.length>12||e.members.some(m=>!str(m?.actor)||!str(m?.role))||new Set(e.members.map(m=>m.actor)).size!==e.members.length||new Set(e.members.map(m=>m.role)).size!==e.members.length||!one(e.status,['proposed','assembling','active','completed','failed','aborted'])||!str(e.outcome,600)||e.stock_event_id!=null&&!id(e.stock_event_id)))return 'Invalid ritual run';
 if(k==='ritual_step'&&(!id(e.run_id)||!pos(e.stage)||!str(e.role)||!str(e.outcome,600)||!one(e.status,['performed','failed'])||e.casting_id!=null&&!id(e.casting_id)))return 'Invalid ritual stage';
 if(k==='workshop'&&(!str(e.title)||!str(e.place)||!str(e.specialty,300)||!one(e.status,['active','suspended','closed'])))return 'Invalid workshop';
 if(k==='enchantment'&&(!id(e.technique_id)||!id(e.workshop_id)||!str(e.item_id,180)||!str(e.outcome,600)||!material(e.materials)||!one(e.status,['planned','active','completed','failed','cancelled'])||e.stock_event_id!=null&&!id(e.stock_event_id)||e.casting_id!=null&&!id(e.casting_id)||e.artifact_id!=null&&!id(e.artifact_id)))return 'Invalid enchantment commission';
 if(k==='species'&&(!str(e.title)||!str(e.description,600)||!str(e.ecology,600)||!str(e.hazards,600)||!one(e.status,['hypothesis','documented','disputed'])))return 'Invalid magical species';
 if(k==='habitat'&&(!str(e.title)||!str(e.place)||!str(e.description,600)||!one(e.status,['stable','disturbed','recovering','lost','unknown'])))return 'Invalid habitat';
 if(k==='creature'&&(!id(e.species_id)||!str(e.title)||!str(e.place)||!str(e.condition,600)||!one(e.status,['observed','resident','rescued','released','missing','deceased'])))return 'Invalid creature record';
 if(k==='field_observation'&&(!id(e.habitat_id)||!id(e.species_id)||!str(e.description,600)||!one(e.status,['observed','uncertain','refuted'])||e.count!=null&&(!Number.isSafeInteger(e.count)||e.count<0)))return 'Invalid field observation';
 if(k==='clinic'&&(!str(e.title)||!str(e.place)||!list(e.specialties)||!pos(e.capacity)||!one(e.status,['open','restricted','closed'])))return 'Invalid fictional clinic';
 if(k==='license'&&(!str(e.issuer)||!str(e.specialty)||!one(e.status,['training','qualified','suspended','revoked'])||!str(e.description,600)))return 'Invalid professional qualification';
 if(k==='clinical_visit'&&(!str(e.patient)||!id(e.clinic_id)||!id(e.license_id)||!str(e.specialty)||!one(e.status,['requested','accepted','active','completed','cancelled'])||!str(e.outcome,600)||e.course_id!=null&&!id(e.course_id)))return 'Invalid clinical visit';
 if(k==='discovery'&&(!id(e.research_id)||!str(e.title)||!str(e.description,600)||!one(e.status,['documented','submitted','published','disputed','withdrawn'])))return 'Invalid discovery';
 if(k==='patent'&&(!id(e.discovery_id)||!str(e.authority)||!str(e.jurisdiction)||!str(e.scope,600)||!one(e.status,['filed','granted','rejected','expired','withdrawn'])))return 'Invalid patent';
 if(k==='institute'&&(!str(e.title)||!str(e.place)||!str(e.focus,600)||!one(e.status,['active','suspended','closed'])))return 'Invalid research institute';
 if(k==='study'&&(!id(e.institute_id)||!id(e.research_id)||!str(e.title)||!list(e.members)||!str(e.next_step,600)||!one(e.status,['proposed','active','paused','completed','cancelled'])))return 'Invalid institutional study';
 return null;
}
export function craftIndex(scenes=[],projection={}, {complete=true,magic=null}={}){
 const records=new Map(),warnings=[],usedStock=new Set(),usedCast=new Set(),steps=new Map(),usedArtifact=new Set();
 const magical=magic??magicIndex(scenes,projection,{complete});
 const badScenes=new Set(),badEvents=new Set();
 for(const w of [...(projection.validation_warnings||[]),...(magical.warnings||[])]){if(w.event_id==null)badScenes.add(w.scene_id);else badEvents.add(key(w.scene_id,w.event_id));}
 const get=(k,i)=>records.get('craft:'+k+':'+i);
 const magicRecords=new Map(),owned=new Map();
 const activeVisits=new Map();
 const addVisit=(c,delta)=>activeVisits.set(c,(activeVisits.get(c)||0)+delta);
 const active=(s)=>['accepted','active'].includes(s);
 const historicMagic=(k,i)=>magicRecords.get('magic:'+k+':'+i);
 if(complete)for(const s of scenes){
  if(badScenes.has(s.id))continue;
  const stock=new Map(),casts=new Map(),claimed=new Set();
  for(const e of s.events||[])if(!isCraft(e)&&e?.stock_event_id)claimed.add(e.stock_event_id);
  for(const e of s.events||[]){
   if(badEvents.has(key(s.id,e.id)))continue;
   if(e.magic_version===1){magicRecords.set(e.key,{...e,source:src(s,e)});if(e.magic_kind==='casting')casts.set(e.record_id,e);}
   if(e.type==='item'&&e.custody_version===1){
    if(['acquire','recover','take'].includes(e.action))owned.set(e.item_id,e.actor);
    else if(e.action==='transfer')owned.set(e.item_id,e.counterparty);
    else if(['drop','destroy'].includes(e.action))owned.delete(e.item_id);
   }
   if(e.dynamics_kind==='stock_operation'&&e.dynamics_version===1)stock.set(e.id,e);
   if(!isCraft(e))continue;
   const k=e.craft_kind,old=records.get(e.key),same=fields=>!old||fields.every(f=>JSON.stringify(e[f]??null)===JSON.stringify(old[f]??null));
   let err=craftShapeError(e);
   const consume=(lines,output=null)=>{
    if(!lines.length&&!output)return e.stock_event_id==null?null:'Unexpected stock operation';
    const op=stock.get(e.stock_event_id),ref=key(s.id,e.stock_event_id);
    const expected=output?[...lines,output]:lines;
    if(!op||claimed.has(e.stock_event_id)||usedStock.has(ref)||op.actor!==e.actor||op.stock_action!==(output?'produce':'consume')||!exact(expected,op.stock_lines))return 'Requires distinct accepted earlier matching stock operation';
    return null;
   };
   const claimStock=()=>{if(e.stock_event_id)usedStock.add(key(s.id,e.stock_event_id));};
   const cast=(tech,target=null)=>{
    const c=casts.get(e.casting_id);if(!c||usedCast.has(e.casting_id)||c.actor!==e.actor||c.technique_id!==tech||target!==null&&c.target!==target||!['success','partial'].includes(c.status))return 'Requires matching unused successful casting in same scene';
    return null;
   };
   if(!err&&old&&!same(['actor']))err='Record actor cannot change';
   if(!err&&old&&done.includes(old.status)&&old.status!==e.status)err='Terminal record cannot reopen';
   if(!err&&k==='formula'){
    const t=historicMagic('technique',e.technique_id);
    if(!t||t.form!=='potion'||!same(['technique_id','title','ingredients','output_id','output_unit','output_quantity','stages']))err='Formula requires potion technique and stable recipe';
   }
   if(!err&&k==='batch'){
    const f=get('formula',e.formula_id);
    if(!f||!same(['formula_id'])||e.stage>f.stages.length||!old&&(e.status!=='prepared'||e.stage!==1)||old&&done.includes(old.status))err='Batch requires established sequence and unique run';
    else if(!old&&['retired','restricted'].includes(f.status))err='Formula unavailable';
    else if(old&&e.stage!==old.stage&&e.stage!==old.stage+1)err='No skipped or repeated backwards stages';
    else if(e.status==='completed'&&(old?.status!=='brewing'||old.stage!==f.stages.length||e.stage!==f.stages.length))err='Finish all brewing stages first';
    else if(e.status==='brewing'&&old?.status!=='prepared'&&old?.status!=='brewing')err='Prepare batch first';
    else if(e.status==='prepared'&&old)err='Batch already prepared';
    else if(e.status==='completed')err=consume(f.ingredients,{product_id:f.output_id,unit:f.output_unit,quantity:f.output_quantity});
    else if(e.status==='failed'&&e.stock_event_id)err=consume(f.ingredients);
    else if(e.stock_event_id)err='Only terminal outcome consumes or produces ingredients';
    if(!err)claimStock();
   }
   if(!err&&k==='ritual_design'){
    if(historicMagic('technique',e.technique_id)?.form!=='ritual'||!same(['technique_id','title','roles','stages','materials']))err='Design requires ritual technique and stable roles/stages';
   }
   if(!err&&k==='ritual_run'){
    const d=get('ritual_design',e.design_id),progress=steps.get(e.record_id)||[];
    if(!d||!same(['design_id','place','members'])||e.members.length!==d.roles.length||d.roles.some(r=>!e.members.some(m=>m.role===r))||!e.members.some(m=>m.actor===e.actor))err='Run needs exactly assigned ritual roles';
    else if(!old&&e.status!=='proposed'||old&&done.includes(old.status)||e.status==='assembling'&&old?.status!=='proposed'||e.status==='active'&&old?.status!=='assembling')err='Run must be proposed, assembled and activated';
    else if(e.status==='active'&&['retired','restricted'].includes(d.status))err='Ritual unavailable';
    else if(e.status==='completed'&&(old?.status!=='active'||progress.length!==d.stages.length||progress.some(r=>r.status!=='performed')))err='Every ritual stage must be performed in order';
    else if(e.status==='failed'&&old?.status!=='active')err='Only active ritual can fail';
    else if(e.status==='completed'||e.status==='failed'&&e.stock_event_id)err=consume(d.materials);
    else if(e.stock_event_id)err='Unexpected ritual resource operation';
    if(!err)claimStock();
   }
   if(!err&&k==='ritual_step'){
    const r=get('ritual_run',e.run_id),d=r&&get('ritual_design',r.design_id),progress=steps.get(e.run_id)||[];
    if(old||!r||r.status!=='active'||!r.members.some(m=>m.actor===e.actor&&m.role===e.role)||e.stage!==progress.length+1||e.stage>d.stages.length||progress.some(x=>x.status==='failed'))err='Stage requires active ritual, assigned participant and sequential progress';
    else if(e.casting_id)err=cast(d.technique_id);
    if(!err){if(e.casting_id)usedCast.add(e.casting_id);steps.set(e.run_id,[...progress,e]);}
   }
   if(!err&&k==='workshop'&&!same(['title','place']))err='Workshop identity cannot change';
   if(!err&&k==='enchantment'){
    const w=get('workshop',e.workshop_id),t=historicMagic('technique',e.technique_id),a=e.artifact_id&&historicMagic('artifact',e.artifact_id);
    if(!w||!t||t.form!=='enchantment'||!same(['workshop_id','technique_id','item_id','materials'])||!old&&e.status!=='planned'||old&&done.includes(old.status)||e.status==='active'&&old?.status!=='planned')err='Enchantment requires workshop, technique and sequence';
    else if(['active','completed','failed'].includes(e.status)&&(w.status!=='active'||owned.get(e.item_id)!==e.actor))err='Active workshop and held item required';
    else if(e.status==='completed'){
     if(old?.status!=='active'||!a||a.actor!==e.actor||a.item_id!==e.item_id||a.technique_id!==e.technique_id||a.source.scene_id!==s.id||usedArtifact.has(e.artifact_id))err='Complete with matching newly recorded artifact';
     else err=cast(e.technique_id,e.item_id)||consume(e.materials);
    }else if(e.stock_event_id||e.casting_id||e.artifact_id)err='Only completion claims casting, stock and artifact';
    if(!err&&e.status==='completed'){usedArtifact.add(e.artifact_id);usedCast.add(e.casting_id);claimStock();}
   }
   if(!err&&k==='species'&&!same(['title']))err='Species identity cannot change';
   if(!err&&k==='habitat'&&!same(['title','place']))err='Habitat identity cannot change';
   if(!err&&k==='creature'&&(!get('species',e.species_id)||!same(['title','species_id'])))err='Creature requires known species and stable identity';
   if(!err&&k==='field_observation'&&(old||!get('habitat',e.habitat_id)||!get('species',e.species_id)))err='Observation requires known habitat/species and unique episode';
   if(!err&&k==='clinic'&&!same(['title','place']))err='Clinic identity cannot change';
   if(!err&&k==='license'&&!same(['issuer','specialty']))err='Qualification identity cannot change';
   if(!err&&k==='clinical_visit'){
    const clinic=get('clinic',e.clinic_id),lic=get('license',e.license_id),c=e.course_id&&historicMagic('course',e.course_id);
    if(!clinic||!lic||lic.actor!==e.actor||lic.specialty!==e.specialty||!clinic.specialties.includes(e.specialty)||!same(['clinic_id','license_id','patient','specialty'])||!old&&e.status!=='requested'||old&&done.includes(old.status)||e.status==='accepted'&&old?.status!=='requested'||e.status==='active'&&old?.status!=='accepted'||e.status==='completed'&&old?.status!=='active')err='Visit requires matching specialty, request and valid transitions';
    else if(active(e.status)&&(clinic.status!=='open'||lic.status!=='qualified'))err='Clinic and clinician must be available';
    else if(active(e.status)&&!active(old?.status)&&(activeVisits.get(e.clinic_id)||0)>=clinic.capacity)err='Recorded clinic capacity exhausted';
    else if(e.course_id&&(!c||c.patient!==e.patient||c.actor!==e.actor))err='Course must belong to this patient and healer';
    if(!err&&active(e.status)!==active(old?.status))addVisit(e.clinic_id,active(e.status)?1:-1);
   }
   if(!err&&k==='discovery'){
    const r=historicMagic('research',e.research_id);
    if(!r||r.actor!==e.actor||r.status!=='validated'||!same(['research_id','title'])||!old&&e.status!=='documented'||e.status==='published'&&!['submitted','published'].includes(old?.status))err='Discovery needs validated research and documented publication sequence';
   }
   if(!err&&k==='patent'){
    const d=get('discovery',e.discovery_id);
    if(!d||d.actor!==e.actor||!same(['discovery_id','authority','jurisdiction','scope'])||!old&&e.status!=='filed'||e.status==='granted'&&old?.status!=='filed'||e.status==='expired'&&old?.status!=='granted')err='Patent requires filed application for owned discovery';
   }
   if(!err&&k==='institute'&&!same(['title','place']))err='Institute identity cannot change';
   if(!err&&k==='study'){
    const i=get('institute',e.institute_id),r=historicMagic('research',e.research_id);
    if(!i||!r||r.actor!==e.actor||!e.members.includes(e.actor)||!same(['institute_id','research_id','title','members'])||!old&&e.status!=='proposed'||e.status==='active'&&i.status!=='active'||e.status==='completed'&&!['validated','rejected'].includes(r.status))err='Institutional study requires affiliated research and recorded outcome';
   }
   if(err){warnings.push({scene_id:s.id,event_id:e.id,errors:[err]});continue;}
   records.set(e.key,{...e,source:src(s,e)});
  }
 }
 const rows=[...records.values()],of=k=>rows.filter(r=>r.craft_kind===k);
 const compact=r=>{const {type,id,key,craft_version,craft_kind,record_id,evidence,...rest}=r;return {id:record_id,kind:craft_kind,...rest};};
 function view(actor,{director=false,offset=0,limit=24}={}){
  if(!complete)return {memory_complete:false};
  const own=r=>r.actor===actor,knowledge=new Set((projection.knowledge||[]).filter(r=>r.actor===actor&&r.status==='knows').map(r=>r.topic_id));
  const visible=r=>director||own(r)||knowledge.has('craft_'+r.record_id);
  const show=(k,filter=visible)=>page(of(k).filter(filter).map(compact),offset,limit);
  const runs=of('ritual_run').filter(r=>own(r)||r.members.some(m=>m.actor===actor)),runIds=new Set(runs.map(r=>r.record_id));
  const visits=of('clinical_visit').filter(r=>own(r)||r.patient===actor);
  const stocks=(projection.stock||[]).filter(r=>r.holder===actor).map(r=>({product_id:r.product_id,unit:r.unit,quantity:r.known?r.quantity:null,known:r.known,source:r.source}));
  return {memory_complete:true,potions:{formulas:show('formula'),batches:show('batch',own),stock:page(stocks,offset,limit)},rituals:{designs:show('ritual_design'),runs:page(runs.map(r=>({...compact(r),stages_performed:(steps.get(r.record_id)||[]).length})),offset,limit),steps:show('ritual_step',r=>runIds.has(r.run_id))},crafting:{workshops:show('workshop'),enchantments:show('enchantment',own)},ecology:{species:show('species'),habitats:show('habitat'),creatures:show('creature'),observations:show('field_observation',own)},clinics:{clinics:show('clinic'),licenses:show('license',own),visits:page(visits.map(compact),offset,limit)},science:{institutes:show('institute'),studies:show('study',r=>own(r)||r.members.includes(actor)),discoveries:show('discovery'),patents:show('patent')},policy:'Only observed or actor-owned knowledge. No automatic consumption, creation, wildlife movement, treatment, licensing or publication.'};
 }
 function opportunities(){
  if(!complete)return [];
  const out=[],seen=new Set();
  const add=(kind,r,actor,extra)=>{const k=key(kind,actor);if(seen.has(k))return;seen.add(k);out.push({kind,row:{actor,key:r.key,title:r.title||r.record_id,status:r.status,source:r.source,place:r.place},info:{record_key:r.key,timing:'requires_character_choice',craft_context:extra,guidance:'Check actual resources, consent, location, qualifications and previous stages; never execute automatically.'}});};
  for(const r of of('batch'))if(['prepared','brewing'].includes(r.status))add('brew_progress',r,r.actor,{batch_id:r.record_id,stage:r.stage,formula_id:r.formula_id});
  for(const r of of('ritual_run'))if(['proposed','assembling','active'].includes(r.status))for(const m of r.members)add('ritual_progress',r,m.actor,{run_id:r.record_id,role:m.role,next_stage:(steps.get(r.record_id)||[]).length+1});
  for(const r of of('enchantment'))if(['planned','active'].includes(r.status))add('enchantment_progress',r,r.actor,{enchantment_id:r.record_id,item_id:r.item_id});
  for(const r of of('habitat'))if(['disturbed','recovering','unknown'].includes(r.status))add('ecology_review',r,r.actor,{habitat_id:r.record_id});
  for(const r of of('clinical_visit'))if(['requested','accepted','active'].includes(r.status))add('clinic_review',r,r.actor,{visit_id:r.record_id,patient:r.patient});
  for(const r of of('study'))if(['proposed','active','paused'].includes(r.status))for(const actor of r.members)add('institute_research',r,actor,{study_id:r.record_id,next_step:r.next_step});
  for(const r of of('discovery'))if(['documented','submitted'].includes(r.status))add('discovery_review',r,r.actor,{discovery_id:r.record_id});
  return out;
 }
 return {view,opportunities,warnings};
}
export const CRAFT_GUIDANCE='ПРАКТИЧЕСКАЯ МАГИЯ: отдельный world/craft_version=1/craft_kind/record_id/key=craft:<kind>:<ID>/actor/evidence. formula: title,technique_id (potion),ingredients (отрицательные stock_lines),output_id,output_unit,output_quantity,stages (список),effect,limits,status experimental/established/restricted/retired. batch: formula_id,stage (с 1),outcome,status prepared/brewing/completed/failed/cancelled; завершение после всех стадий с stock_event_id принятой операции produce (точный расход/выпуск), failed может consume. ritual_design: title,technique_id (ritual),roles,stages,materials (отрицательные строки),limits,status как formula. ritual_run: design_id,place,members [{actor,role}],outcome,status proposed/assembling/active/completed/failed/aborted; завершение после этапов с consume при материалах. ritual_step: run_id,stage,role,outcome,status performed/failed,casting_id если был каст; отдельный участник. workshop: title,place,specialty,status active/suspended/closed. enchantment: workshop_id,technique_id (enchantment),item_id,materials,outcome,status planned/active/completed/failed/cancelled; completed требует владение, casting_id (target=item_id), artifact_id той же сцены, stock_event_id если расход. species: title,description,ecology,hazards,status hypothesis/documented/disputed. habitat: title,place,description,status stable/disturbed/recovering/lost/unknown. creature: species_id,title,place,condition,status observed/resident/rescued/released/missing/deceased. field_observation: habitat_id,species_id,description,status observed/uncertain/refuted,count опционально. clinic: title,place,specialties,capacity,status open/restricted/closed. license: issuer,specialty,description,status training/qualified/suspended/revoked. clinical_visit: patient,clinic_id,license_id,specialty,outcome,status requested/accepted/active/completed/cancelled,course_id опционально. discovery: research_id,title,description,status documented/submitted/published/disputed/withdrawn; исследование validated. patent: discovery_id,authority,jurisdiction,scope,status filed/granted/rejected/expired/withdrawn. institute: title,place,focus,status active/suspended/closed. study: institute_id,research_id,title,members,next_step,status proposed/active/paused/completed/cancelled; итог после исследования validated/rejected. Для известных определений отдельное knowledge topic_id=craft_<ID>. Не назначай согласие, квалификацию, патент, присутствие, расход или результат без сцены. Составы только вымышленные; не используй рецепты реальных веществ.';
export const CRAFT_ACTIONS=Object.freeze({review_formula:'Изучить рецепт зелья',start_brew:'Начать варку зелья',continue_brew:'Продолжить зельеварение',design_ritual:'Разработать ритуал',plan_ritual:'Подготовить ритуал',continue_ritual:'Продолжить ритуал',plan_enchantment:'Подготовить зачарование',continue_enchantment:'Продолжить зачарование',study_species:'Изучить магическое существо',explore_habitat:'Исследовать среду',observe_creature:'Наблюдать за существом',seek_clinic:'Найти целительскую клинику',request_clinical_visit:'Записаться в клинику',continue_clinical_visit:'Продолжить визит',seek_magic_license:'Получить квалификацию',start_institute_study:'Начать работу в институте',continue_institute_study:'Продолжить научный проект',document_discovery:'Оформить открытие',publish_discovery:'Опубликовать исследование',file_magic_patent:'Подать заявку на патент'});
export const CRAFT_ACTION_IDS=Object.freeze({review_formula:'formula_id',start_brew:'formula_id',continue_brew:'batch_id',plan_ritual:'design_id',continue_ritual:'run_id',continue_enchantment:'enchantment_id',study_species:'species_id',explore_habitat:'habitat_id',observe_creature:'creature_id',request_clinical_visit:'clinic_id',continue_clinical_visit:'clinical_visit_id',start_institute_study:'institute_id',continue_institute_study:'study_id',publish_discovery:'discovery_id',file_magic_patent:'discovery_id'});
export function craftActionRows(input,v){
 const f=CRAFT_ACTION_IDS[input.action];if(!v?.memory_complete)return [];
 return ({formula_id:v.potions.formulas,batch_id:v.potions.batches,design_id:v.rituals.designs,run_id:v.rituals.runs,enchantment_id:v.crafting.enchantments,species_id:v.ecology.species,habitat_id:v.ecology.habitats,creature_id:v.ecology.creatures,clinic_id:v.clinics.clinics,clinical_visit_id:v.clinics.visits,institute_id:v.science.institutes,study_id:v.science.studies,discovery_id:v.science.discoveries}[f])?.records||[];
}
export function validateCraftAction(input,overview){
 const f=CRAFT_ACTION_IDS[input.action];if(!f)return;
 const r=craftActionRows(input,overview.craft_system).find(r=>r.id===input[f]);if(!r)throw Error('Practical magic record not visible');
 const a=input.action;
 if(a==='start_brew'&&['restricted','retired'].includes(r.status)||a==='continue_brew'&&!['prepared','brewing'].includes(r.status)||a==='plan_ritual'&&['restricted','retired'].includes(r.status)||a==='continue_ritual'&&!['proposed','assembling','active'].includes(r.status)||a==='continue_enchantment'&&!['planned','active'].includes(r.status)||a==='request_clinical_visit'&&r.status!=='open'||a==='continue_clinical_visit'&&!['requested','accepted','active'].includes(r.status)||a==='start_institute_study'&&r.status!=='active'||a==='continue_institute_study'&&!['proposed','active','paused'].includes(r.status)||['publish_discovery','file_magic_patent'].includes(a)&&r.actor!==overview.actor)throw Error('Practical magic status or ownership prevents action');
}
