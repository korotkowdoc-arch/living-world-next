/** Branch-local magical civilization. All mutations derive from actual scene
 * annotations. Uses the ordinary accepted stock/item/money ledger, not a second economy.
 * No real chemical recipes, healthcare advice, population ticking or automatic consent. */
const K=['ritual','ritual_session','ritual_member','ritual_step','ingredient','formula','batch','enchantment','species','habitat','population','encounter','clinic','credential','admission','clinical_visit','laboratory','lab_member','patent','license'];
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,70}$/.test(x);
const str=(v,n=140)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
const int=(v,min=0,max=1000000)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const one=(v,vs)=>vs.includes(v);
const key=(...x)=>JSON.stringify(x);
const source=(s,e)=>({scene_id:s.id,event_id:e.id,world_time:s.world_time??null});
const pag=(rows,offset=0,limit=24)=>({records:rows.slice(offset,offset+limit),total:rows.length,omitted:Math.max(0,rows.length-offset-limit),next_offset:offset+limit<rows.length?offset+limit:null});
const unique=(xs,f)=>new Set(xs.map(f)).size===xs.length;
const list=(xs,check,min=1,max=20)=>Array.isArray(xs)&&xs.length>=min&&xs.length<=max&&xs.every(check);
const line=x=>x&&id(x.ingredient_id)&&int(x.quantity,1);
const ingredients=xs=>list(xs,line,0)&&unique(xs,x=>x.ingredient_id);
const terminal=new Set(['completed','failed','cancelled','discharged','withdrawn','revoked','closed','expired','retired','destroyed','rejected']);
export const isMagicSociety=e=>e?.magic_society_version!==undefined||typeof e?.key==='string'&&e.key.startsWith('magic-society:');
export function societyShapeError(e){
 if(!isMagicSociety(e))return null;
 const k=e.magic_society_kind;
 if(e.type!=='world'||e.magic_society_version!==1||!K.includes(k)||(!id(e.record_id)||e.record_id.length>50)||e.key!=='magic-society:'+k+':'+e.record_id||!str(e.actor)||!str(e.evidence,12000))return 'Invalid magical civilization record';
 if(['magic_version','advanced_version','world_record_version','social_record_version','interaction_version','activity_version','consequence_version','growth_version','dynamics_version','player_life_version'].some(v=>e[v]!==undefined))return 'Magic society record must be separate';
 if(k==='ritual'&&(!str(e.title)||!id(e.technique_id)||!list(e.stages,x=>x&&id(x.id)&&str(x.title)&&ingredients(x.ingredients)&&int(x.min_members,1,20))||!unique(e.stages,x=>x.id)||!str(e.requirements,600)||!str(e.risks,600)||!one(e.status,['active','retired'])))return 'Invalid ritual protocol';
 if(k==='ritual_session'&&(!id(e.ritual_id)||!str(e.place)||!str(e.title)||!one(e.status,['planned','active','paused','completed','failed','cancelled'])||['completed','failed'].includes(e.status)&&(!id(e.casting_id)||!str(e.outcome,600))))return 'Invalid ritual session';
 if(k==='ritual_member'&&(!id(e.session_id)||!str(e.participant)||!str(e.role)||!one(e.status,['invited','accepted','declined','withdrawn'])))return 'Invalid ritual participant';
 if(k==='ritual_step'&&(!id(e.session_id)||!id(e.stage_id)||!list(e.participants,x=>str(x),1,20)||!unique(e.participants,x=>x)||!one(e.status,['performed','failed'])||!str(e.outcome,600)||e.stock_event_id!=null&&!str(e.stock_event_id,180)))return 'Invalid ritual stage';
 if(k==='ingredient'&&(!str(e.title)||!id(e.product_id)||!str(e.unit,40)||!str(e.properties,600)||!str(e.origin,300)||!one(e.status,['available','restricted','retired'])))return 'Invalid magical ingredient';
 if(k==='formula'&&(!str(e.title)||!id(e.technique_id)||!ingredients(e.ingredients)||!e.ingredients.length||!id(e.output_id)||!str(e.output_unit,40)||!int(e.output_quantity,1)||!str(e.method,600)||!str(e.limits,600)||!one(e.status,['experimental','established','retired'])))return 'Invalid fictional formula';
 if(k==='batch'&&(!id(e.formula_id)||!int(e.batches,1,1000)||!str(e.stock_event_id,180)||!one(e.status,['produced','failed'])||!str(e.quality,300)||!str(e.outcome,600)))return 'Invalid potion batch';
 if(k==='enchantment'&&(!id(e.artifact_id)||!id(e.casting_id)||!one(e.operation,['create','repair','recharge','inspect'])||!one(e.status,['performed','failed'])||!str(e.outcome,600)||e.stock_event_id!=null&&!str(e.stock_event_id,180)||!ingredients(e.ingredients??[])))return 'Invalid enchantment work';
 if(k==='species'&&(!str(e.title)||!str(e.description,600)||!str(e.behavior,600)||!str(e.ecology,600)||!one(e.status,['recorded','disputed','extinct'])))return 'Invalid fictional species';
 if(k==='habitat'&&(!str(e.title)||!str(e.place)||!str(e.description,600)||!one(e.status,['stable','threatened','recovering','destroyed','unknown'])))return 'Invalid habitat';
 if(k==='population'&&(!id(e.species_id)||!id(e.habitat_id)||!one(e.status,['observed','estimated','unknown'])||e.status==='unknown'&&e.count!=null||e.status!=='unknown'&&!int(e.count)||!str(e.description,600)))return 'Invalid population observation';
 if(k==='encounter'&&(!id(e.species_id)||!id(e.habitat_id)||!one(e.operation,['observe','care','rescue','research','relocate','defend','other'])||!one(e.status,['performed','failed'])||!str(e.outcome,600)))return 'Invalid creature encounter';
 if(k==='clinic'&&(!str(e.title)||!str(e.place)||!str(e.specialty,300)||!int(e.capacity,1,10000)||!one(e.status,['active','suspended','closed'])))return 'Invalid magical clinic';
 if(k==='credential'&&(!str(e.holder)||!str(e.title)||!id(e.clinic_id)||!id(e.qualification_id)||!one(e.status,['active','revoked'])||!str(e.scope,300)))return 'Invalid clinical credential';
 if(k==='admission'&&(!id(e.clinic_id)||!str(e.patient)||!str(e.title)||!one(e.status,['requested','admitted','discharged','cancelled'])||!str(e.description,600)))return 'Invalid clinic admission';
 if(k==='clinical_visit'&&(!id(e.admission_id)||!id(e.credential_id)||!id(e.treatment_id)||!one(e.status,['performed','failed'])||!str(e.outcome,600)))return 'Invalid clinical visit';
 if(k==='laboratory'&&(!str(e.title)||!str(e.place)||!id(e.group_id)||!str(e.specialty,300)||!one(e.status,['active','suspended','closed'])))return 'Invalid research organization';
 if(k==='lab_member'&&(!id(e.lab_id)||!str(e.member)||!str(e.role)||!one(e.status,['invited','accepted','declined','withdrawn'])))return 'Invalid lab membership';
 if(k==='patent'&&(!id(e.research_id)||!id(e.lab_id)||!str(e.title)||!str(e.jurisdiction,200)||!str(e.claim,600)||!one(e.status,['filed','granted','rejected','expired','revoked'])))return 'Invalid research patent';
 if(k==='license'&&(!id(e.patent_id)||!str(e.holder)||!str(e.scope,300)||!one(e.status,['proposed','active','expired','revoked','declined'])||!int(e.amount)||!str(e.currency,40)||e.transfer_event_id!=null&&!str(e.transfer_event_id,180)))return 'Invalid patent license';
 return null;
}
export function createMagicSociety(projection,getMagic,usedCast=new Set()){
 const records=new Map(),world=new Map(),items=new Map(),warnings=[],occupancy=new Map(),steps=new Map(),members=new Map(),labMembers=new Map(),usedTreatment=new Set(),patented=new Map(),populationIDs=new Map();
 let stock=new Map(),money=new Map(),usedStock=new Set(),usedMoney=new Set();
 const get=(k,i)=>records.get('magic-society:'+k+':'+i);
 const fail=(s,e,msg)=>warnings.push({scene_id:s.id,event_id:e.id,errors:[msg]});
 const pair=(map,a,b)=>map.get(key(a,b));
 function begin(s){
  stock=new Map();money=new Map();usedStock=new Set();usedMoney=new Set();
  for(const e of s.events||[])if(!isMagicSociety(e)){
   if(e?.stock_event_id)usedStock.add(e.stock_event_id);
   if(e?.transfer_event_id)usedMoney.add(e.transfer_event_id);
  }
 }
 function observe(s,e){
  if(e.type==='world'&&typeof e.key==='string'&&!isMagicSociety(e))world.set(e.key,e);
  if(e.type==='world'&&e.dynamics_version===1&&e.dynamics_kind==='stock_operation')stock.set(e.id,e);
  if(e.type==='money'&&e.operation==='transfer')money.set(e.id,e);
  if(e.type==='item'&&e.custody_version===1){
   const old=items.get(e.item_id);
   if(e.action==='observe')return;
   items.set(e.item_id,{holder:['drop','destroy'].includes(e.action)?null:e.action==='transfer'?e.counterparty:e.actor,status:e.action==='destroy'?'destroyed':e.action==='drop'?'lost':'held',source:source(s,e),previous:old?.holder??null});
  }
 }
 const exact=(a,b)=>a.length===b.length&&a.every(x=>b.some(y=>x.product_id===y.product_id&&x.unit===y.unit&&x.quantity===y.quantity));
 function requiredLines(spec,n=1){
  const lines=[];
  for(const x of spec){const r=get('ingredient',x.ingredient_id);if(!r||r.status==='retired'||!Number.isSafeInteger(x.quantity*n))return null;lines.push({product_id:r.product_id,unit:r.unit,quantity:-x.quantity*n});}
  return unique(lines,x=>key(x.product_id,x.unit))?lines:null;
 }
 const stockCheck=(e,actor,lines,action)=>{
  const ref=e.stock_event_id;
  if(!lines)return 'Missing or invalid ingredient definition';
  if(!lines.length)return ref==null?null:'Unneeded stock debit';
  const t=stock.get(ref);
  return !t||usedStock.has(ref)||t.actor!==actor||t.stock_action!==action||!exact(lines,t.stock_lines||[])?'Requires distinct accepted exact stock movement':null;
 };
 const moneyCheck=(e,from,to)=>{
  const t=money.get(e.transfer_event_id);
  return !t||usedMoney.has(e.transfer_event_id)||t.actor!==from||t.counterparty!==to||t.currency!==e.currency||t.delta!==-e.amount?'Requires distinct accepted exact payment':null;
 };
 function apply(s,e){
  if(!isMagicSociety(e))return;
  let err=societyShapeError(e);const k=e.magic_society_kind,old=records.get(e.key);
  const same=fields=>!old||fields.every(f=>JSON.stringify(old[f])===JSON.stringify(e[f]));
  if(!err&&old&&terminal.has(old.status))err='Terminal record requires new ID';
  if(!err&&k==='ritual'){
   if(getMagic('technique',e.technique_id)?.form!=='ritual'||!same(['actor','title','technique_id','stages'])||e.stages.some(x=>!requiredLines(x.ingredients)))err='Ritual needs existing technique, ingredients and immutable stages';
  }
  if(!err&&k==='ritual_session'){
   const r=get('ritual',e.ritual_id),done=steps.get(e.record_id)||0,cast=e.casting_id&&getMagic('casting',e.casting_id);
   if(!r||!['completed','failed'].includes(e.status)&&e.casting_id!=null||!same(['actor','ritual_id','place','title'])||!old&&e.status!=='planned'||e.status==='active'&&(!['planned','active','paused'].includes(old?.status)||r.status!=='active')||e.status==='paused'&&old?.status!=='active')err='Invalid ritual session transition';
   else if(['completed','failed'].includes(e.status)&&(!old||old.status!=='active'||!cast||cast.actor!==e.actor||cast.technique_id!==r.technique_id||cast.source.scene_id!==s.id||usedCast.has(e.casting_id)||e.status==='completed'&&(done!==r.stages.length||cast.status!=='success')||e.status==='failed'&&!['failed','backlash','partial'].includes(cast.status)))err='Ritual completion requires ordered stages and matching unused outcome';
   if(!err&&['completed','failed'].includes(e.status))usedCast.add(e.casting_id);
  }
  if(!err&&k==='ritual_member'){
   const session=get('ritual_session',e.session_id),prior=pair(members,e.session_id,e.participant);
   if(!session||terminal.has(session.status)||e.actor!==session.actor||!same(['actor','session_id','participant','role'])||prior&&prior.record_id!==e.record_id||!old&&e.status!=='invited'||e.status==='accepted'&&old?.status!=='invited'||e.status==='declined'&&old?.status!=='invited'||e.status==='withdrawn'&&old?.status!=='accepted')err='Participant requires invitation and recorded consent';
  }
  if(!err&&k==='ritual_step'){
   const session=get('ritual_session',e.session_id),r=session&&get('ritual',session.ritual_id),stage=r?.stages[steps.get(e.session_id)||0];
   if(old||!session||session.status!=='active'||session.actor!==e.actor||!stage||stage.id!==e.stage_id||e.participants.length<stage.min_members||e.participants.some(p=>pair(members,e.session_id,p)?.status!=='accepted'))err='Ritual stage requires correct order and accepted participants';
   else err=stockCheck(e,e.actor,requiredLines(stage.ingredients),'consume');
   if(!err){if(e.stock_event_id)usedStock.add(e.stock_event_id);if(e.status==='performed')steps.set(e.session_id,(steps.get(e.session_id)||0)+1);}
  }
  if(!err&&k==='ingredient'&&!same(['actor','product_id','unit','title']))err='Ingredient identity cannot change';
  if(!err&&k==='formula'){
   const t=getMagic('technique',e.technique_id);
   if(!t||t.form!=='potion'||!same(['actor','title','technique_id','ingredients','output_id','output_unit','output_quantity'])||!requiredLines(e.ingredients)||old?.status==='experimental'&&e.status==='established'&&t.status!=='established')err='Formula requires potion technique and immutable valid ingredients';
  }
  if(!err&&k==='batch'){
   const f=get('formula',e.formula_id),lines=f&&requiredLines(f.ingredients,e.batches);
   if(old||!f||f.status==='retired'||!lines)err='Batch needs available formula';
   else{
    if(e.status==='produced')lines.push({product_id:f.output_id,unit:f.output_unit,quantity:f.output_quantity*e.batches});
    if(!unique(lines,x=>key(x.product_id,x.unit)))err='Input/output keys must be distinct';
    else err=stockCheck(e,e.actor,lines,e.status==='produced'?'produce':'consume');
   }
   if(!err)usedStock.add(e.stock_event_id);
  }
  if(!err&&k==='enchantment'){
   const art=getMagic('artifact',e.artifact_id),cast=getMagic('casting',e.casting_id),held=art&&items.get(art.item_id);
   if(old||!art||!held||held.holder!==e.actor||held.status!=='held'||art.status==='destroyed'||!cast||cast.source.scene_id!==s.id||cast.actor!==e.actor||cast.technique_id!==art.technique_id||usedCast.has(e.casting_id)||e.status==='performed'&&!['success','partial'].includes(cast.status))err='Enchantment needs owned item and matching unused cast';
   else err=stockCheck(e,e.actor,requiredLines(e.ingredients??[]),'consume');
   if(!err){usedCast.add(e.casting_id);if(e.stock_event_id)usedStock.add(e.stock_event_id);}
  }
  if(!err&&k==='species'&&!same(['actor','title']))err='Species identity cannot change';
  if(!err&&k==='habitat'&&!same(['actor','title','place']))err='Habitat identity cannot change';
  if(!err&&k==='population'){
   const p=pair(populationIDs,e.species_id,e.habitat_id);
   if(!get('species',e.species_id)||!get('habitat',e.habitat_id)||!same(['actor','species_id','habitat_id'])||p&&p!==e.record_id)err='Population must reference species/habitat and stable observation ID';
  }
  if(!err&&k==='encounter'&&(old||!get('species',e.species_id)||!get('habitat',e.habitat_id)))err='Encounter requires known species and habitat';
  if(!err&&k==='clinic'){
   if(!same(['actor','title','place'])||(occupancy.get(e.record_id)||0)>e.capacity||e.status==='closed'&&(occupancy.get(e.record_id)||0)>0)err='Clinic identity or occupancy invalid';
  }
  if(!err&&k==='credential'){
   const c=get('clinic',e.clinic_id),q=world.get('player-life:qualification:'+e.qualification_id);
   if(!c||c.actor!==e.actor||!q||q.actor!==e.holder||e.status==='active'&&q.status!=='awarded'||!same(['actor','holder','title','clinic_id','qualification_id','scope'])||!old&&e.status!=='active')err='Credential needs awarded qualification and clinic issuer';
  }
  if(!err&&k==='admission'){
   const c=get('clinic',e.clinic_id),n=occupancy.get(e.clinic_id)||0;
   if(!c||e.actor!==c.actor||!same(['actor','clinic_id','patient','title'])||!old&&e.status!=='requested'||e.status==='admitted'&&(old?.status!=='requested'||c.status!=='active'||n>=c.capacity)||e.status==='discharged'&&old?.status!=='admitted'||e.status==='cancelled'&&old?.status!=='requested')err='Admission requires recorded request and free capacity';
   if(!err&&e.status==='admitted')occupancy.set(e.clinic_id,n+1);
   if(!err&&e.status==='discharged')occupancy.set(e.clinic_id,n-1);
  }
  if(!err&&k==='clinical_visit'){
   const a=get('admission',e.admission_id),c=a&&get('clinic',a.clinic_id),q=get('credential',e.credential_id),t=getMagic('treatment',e.treatment_id);
   const qualification=q&&world.get('player-life:qualification:'+q.qualification_id);
   if(old||!a||a.status!=='admitted'||c?.status!=='active'||!q||q.clinic_id!==a.clinic_id||q.holder!==e.actor||q.status!=='active'||qualification?.status!=='awarded'||!t||t.actor!==e.actor||t.patient!==a.patient||t.source.scene_id!==s.id||usedTreatment.has(e.treatment_id)||e.status==='performed'&&['failed','adverse'].includes(t.status))err='Visit requires admitted patient, valid credential and accepted distinct procedure';
   if(!err)usedTreatment.add(e.treatment_id);
  }
  if(!err&&k==='laboratory'){
   const g=world.get('social:group:'+e.group_id);
   if(!g||g.status!=='active'&&e.status==='active'||!same(['actor','title','place','group_id']))err='Laboratory needs recorded group';
  }
  if(!err&&k==='lab_member'){
   const lab=get('laboratory',e.lab_id),prior=pair(labMembers,e.lab_id,e.member);
   if(!lab||lab.actor!==e.actor||!same(['actor','lab_id','member','role'])||prior&&prior.record_id!==e.record_id||!old&&e.status!=='invited'||e.status==='accepted'&&(old?.status!=='invited'||lab.status!=='active')||e.status==='declined'&&old?.status!=='invited'||e.status==='withdrawn'&&old?.status!=='accepted')err='Lab membership requires invitation and consent';
  }
  if(!err&&k==='patent'){
   const lab=get('laboratory',e.lab_id),research=getMagic('research',e.research_id),prior=patented.get(key(e.research_id,e.jurisdiction));
   if(!lab||!research||research.status!=='validated'||research.actor!==e.actor||!(lab.actor===e.actor||pair(labMembers,e.lab_id,e.actor)?.status==='accepted')||!same(['actor','research_id','lab_id','title','jurisdiction','claim'])||prior&&prior!==e.record_id||!old&&e.status!=='filed'||e.status==='granted'&&old?.status!=='filed'||e.status==='rejected'&&old?.status!=='filed'||['expired','revoked'].includes(e.status)&&old?.status!=='granted')err='Patent needs validated research and recorded affiliation';
  }
  if(!err&&k==='license'){
   const p=get('patent',e.patent_id);
   if(!p||p.actor!==e.actor||e.actor===e.holder||!same(['actor','patent_id','holder','scope','amount','currency'])||!old&&e.status!=='proposed'||e.status==='active'&&(old?.status!=='proposed'||p.status!=='granted')||['expired','revoked'].includes(e.status)&&old?.status!=='active'||e.status==='declined'&&old?.status!=='proposed')err='License requires granted patent and accepted terms';
   else if(e.status==='active'&&e.amount>0)err=moneyCheck(e,e.holder,e.actor);
   else if(e.transfer_event_id!=null)err='Unexpected license payment';
   if(!err&&e.transfer_event_id)usedMoney.add(e.transfer_event_id);
  }
  if(err){fail(s,e,err);return;}
  const r={...e,source:source(s,e)};records.set(e.key,r);
  if(k==='ritual_member')members.set(key(e.session_id,e.participant),r);
  if(k==='lab_member')labMembers.set(key(e.lab_id,e.member),r);
  if(k==='population')populationIDs.set(key(e.species_id,e.habitat_id),e.record_id);
  if(k==='patent')patented.set(key(e.research_id,e.jurisdiction),e.record_id);
 }
 let grouped=null;
 const of=k=>{if(!grouped){grouped=new Map();for(const r of records.values()){const a=grouped.get(r.magic_society_kind)||[];a.push(r);grouped.set(r.magic_society_kind,a);}}return grouped.get(k)||[];};
 const compact=r=>{const {type,id,key,magic_society_version,magic_society_kind,record_id,evidence,...rest}=r;return {id:record_id,kind:magic_society_kind,...rest};};
 function view(actor,{director=false,offset=0,limit=24}={}){
  const own=r=>r.actor===actor,known=new Set((projection.knowledge||[]).filter(r=>r.actor===actor&&r.status==='knows').map(r=>r.topic_id));
  const topic=r=>'ms_'+r.magic_society_kind+'_'+r.record_id;
  const knownRows=new Map((projection.knowledge||[]).filter(r=>r.actor===actor&&r.status==='knows').map(r=>[r.topic_id,r]));
  const visible=r=>director||own(r)||known.has(topic(r));
  const detailed=r=>director||own(r)||r.source.scene_id===knownRows.get(topic(r))?.source?.scene_id;
  const catalogue=r=>detailed(r)?compact(r):{id:r.record_id,kind:r.magic_society_kind,title:r.title,status:'known_reference',description:knownRows.get(topic(r))?.fact??null,source:knownRows.get(topic(r))?.source??null};
  const stockRows=new Map((projection.stock||[]).filter(x=>x.holder===actor).map(x=>[key(x.product_id,x.unit),x]));
  const readiness=spec=>{const lines=requiredLines(spec);if(!lines)return {status:'requirements_unavailable',materials:[]};const materials=lines.map(l=>{const q=stockRows.get(key(l.product_id,l.unit));return {product_id:l.product_id,unit:l.unit,required:-l.quantity,available:q?.known===true?q.quantity:null,status:q?.known!==true?'unknown':q.quantity< -l.quantity?'insufficient':'available'};});return {status:materials.some(m=>m.status==='insufficient')?'insufficient':materials.some(m=>m.status==='unknown')?'unknown':'materials_available',materials};};
  const party=r=>director||own(r)||[r.participant,r.holder,r.patient,r.member].includes(actor);
  const page=(k,filter=visible,fn=catalogue)=>pag(of(k).filter(filter).map(fn),offset,limit);
  const allowedSessions=new Set(of('ritual_member').filter(r=>r.participant===actor).map(r=>r.session_id));
  const canSession=r=>director||own(r)||allowedSessions.has(r.record_id);
  
  
  const myAdmissions=new Set(of('admission').filter(party).map(r=>r.record_id));
  const myLabIDs=new Set(of('lab_member').filter(r=>r.member===actor&&r.status==='accepted').map(r=>r.lab_id));
  return {rituals:{protocols:page('ritual'),sessions:page('ritual_session',canSession,r=>{const n=steps.get(r.record_id)||0,protocol=get('ritual',r.ritual_id),stage=protocol?.stages[n];return {...compact(r),completed_stages:director||own(r)?n:of('ritual_step').filter(x=>x.session_id===r.record_id&&x.participants.includes(actor)&&x.status==='performed').length,...(own(r)||director?{total_stages:protocol?.stages.length??null,next_stage:stage?{title:stage.title,min_members:stage.min_members,materials:readiness(stage.ingredients)}:null}:{})};}),participants:page('ritual_member',party,compact),stages:page('ritual_step',r=>director||own(r)||r.participants.includes(actor),compact)},alchemy:{ingredients:page('ingredient'),formulas:page('formula',visible,r=>({...catalogue(r),...(detailed(r)?{material_readiness:readiness(r.ingredients)}:{})})),batches:page('batch',r=>director||own(r),compact),enchantments:page('enchantment',r=>director||own(r),compact)},ecology:{species:page('species'),habitats:page('habitat'),populations:page('population'),encounters:page('encounter',r=>director||own(r),compact)},clinics:{clinics:page('clinic',visible,r=>({...catalogue(r),occupied:director||own(r)?occupancy.get(r.record_id)||0:null})),credentials:page('credential',party,r=>({...compact(r),qualification_valid:world.get('player-life:qualification:'+r.qualification_id)?.status==='awarded'})),admissions:page('admission',party,compact),visits:page('clinical_visit',r=>director||own(r)||myAdmissions.has(r.admission_id)&&get('admission',r.admission_id)?.patient===actor,compact)},science:{laboratories:page('laboratory',r=>visible(r)||myLabIDs.has(r.record_id)),memberships:page('lab_member',party,compact),patents:page('patent'),licenses:page('license',party,r=>({...compact(r),effective_status:r.status==='active'&&(own(r)||director)&&get('patent',r.patent_id)?.status!=='granted'?'patent_unavailable':r.status}))},policy:'Only observed fictional civilization. Stock and money refer to accepted earlier events. No automatic research, consent, cure, population or income.'};
 }
 function opportunities(){
  const out=[],seen=new Set();
  const add=(kind,r,actor,context)=>{const k=key(kind,actor);if(seen.has(k))return;seen.add(k);out.push({kind,row:{actor,key:r.key,title:r.title||r.record_id,status:r.status,source:r.source,place:r.place},info:{record_key:r.key,timing:'requires_character_choice',magic_context:context,guidance:'Check consent, access, material stock and established outcome; no automatic effect.'}});};
  for(const r of of('ritual_session'))if(['planned','active','paused'].includes(r.status))add('ritual_progress',r,r.actor,{session_id:r.record_id,completed_stages:steps.get(r.record_id)||0});
  for(const r of of('formula'))if(r.status!=='retired')add('alchemy_review',r,r.actor,{formula_id:r.record_id});
  for(const r of of('habitat'))if(['threatened','recovering'].includes(r.status))add('habitat_review',r,r.actor,{habitat_id:r.record_id});
  for(const r of of('admission'))if(['requested','admitted'].includes(r.status))add('clinic_review',r,r.actor,{admission_id:r.record_id,patient:r.patient});
  for(const r of of('laboratory'))if(r.status==='active')add('laboratory_review',r,r.actor,{lab_id:r.record_id});
  for(const r of of('patent'))if(r.status==='filed')add('patent_review',r,r.actor,{patent_id:r.record_id});
  return out;
 }
 return {begin,observe,apply,view,opportunities,warnings};
}
export const SOCIETY_ACTIONS=Object.freeze({plan_ritual:'Подготовить ритуал',invite_ritual_member:'Пригласить участника',respond_ritual_invitation:'Ответить на приглашение в ритуал',perform_ritual_stage:'Выполнить этап ритуала',study_formula:'Изучить формулу',brew_potion:'Сварить зелье',maintain_enchantment:'Создать или обслужить зачарование',study_species:'Исследовать магический вид',visit_habitat:'Исследовать среду обитания',request_clinic:'Обратиться в лечебницу',review_clinical_admission:'Обсудить госпитализацию',seek_healer_credential:'Получить допуск целителя',join_laboratory:'Вступить в лабораторию',conduct_lab_research:'Работать в лаборатории',file_patent:'Подать заявку на патент',negotiate_patent_license:'Обсудить лицензию'});
export const SOCIETY_ACTION_IDS=Object.freeze({plan_ritual:'ritual_id',invite_ritual_member:'ritual_session_id',respond_ritual_invitation:'ritual_member_id',perform_ritual_stage:'ritual_session_id',study_formula:'formula_id',brew_potion:'formula_id',study_species:'species_id',visit_habitat:'habitat_id',request_clinic:'clinic_id',review_clinical_admission:'admission_id',seek_healer_credential:'clinic_id',join_laboratory:'lab_id',conduct_lab_research:'lab_id',negotiate_patent_license:'patent_id'});
export function societyActionRows(input,v){
 const f=SOCIETY_ACTION_IDS[input.action],s=v?.society;if(!s||!f)return [];
 const p={ritual_id:s.rituals.protocols,ritual_session_id:s.rituals.sessions,ritual_member_id:s.rituals.participants,formula_id:s.alchemy.formulas,species_id:s.ecology.species,habitat_id:s.ecology.habitats,clinic_id:s.clinics.clinics,admission_id:s.clinics.admissions,lab_id:s.science.laboratories,patent_id:s.science.patents};
 return p[f]?.records||[];
}
export function validateSocietyAction(input,overview){
 const f=SOCIETY_ACTION_IDS[input.action];if(!f)return;
 const r=societyActionRows(input,overview.magic_system).find(x=>x.id===input[f]);if(!r)throw Error('Magical society record is not visible');
 if(input.action==='respond_ritual_invitation'&&(r.participant!==overview.actor||r.status!=='invited')||['invite_ritual_member','perform_ritual_stage'].includes(input.action)&&r.actor!==overview.actor||input.action==='perform_ritual_stage'&&r.status!=='active'||input.action==='plan_ritual'&&r.status!=='active'||input.action==='brew_potion'&&(!['experimental','established'].includes(r.status)||r.material_readiness?.status==='insufficient')||['request_clinic','seek_healer_credential','join_laboratory'].includes(input.action)&&!['active','known_reference'].includes(r.status)||input.action==='conduct_lab_research'&&r.status!=='active'||input.action==='negotiate_patent_license'&&r.status!=='granted')throw Error('Magical society record status or ownership does not permit action');
}
export const SOCIETY_GUIDANCE='МАГИЧЕСКАЯ ЦИВИЛИЗАЦИЯ: type=world,magic_society_version=1,magic_society_kind,record_id,key=magic-society:<kind>:<ID>,actor,evidence. Для каталога и видимости отдельное knowledge topic_id=ms_<kind>_<ID>,status=knows; позднее знание показывает только записанное содержание, полная актуальная запись доступна при наблюдении той же версии в сцене, без массового раскрытия. ritual:title,technique_id,stages:[{id,title,ingredients:[{ingredient_id,quantity}],min_members}],requirements,risks,status active/retired. ritual_session:ritual_id,title,place,status planned/active/paused/completed/failed/cancelled; completed/failed casting_id,outcome. ritual_member:session_id,participant,role,status invited/accepted/declined/withdrawn; actor организатор, согласие отдельно в сцене. ritual_step:session_id,stage_id,participants,status performed/failed,outcome,stock_event_id при расходе. Только по порядку, принятые участники, завершение с фактическим кастом. ingredient:title,product_id,unit,properties,origin,status available/restricted/retired. formula:title,technique_id,ingredients,output_id,output_unit,output_quantity,method,limits,status experimental/established/retired. batch:formula_id,batches,stock_event_id,quality,outcome,status produced/failed; точный предшествующий dynamics stock_operation produce (расход+выпуск), при неудаче consume. enchantment:artifact_id,casting_id,operation create/repair/recharge/inspect,ingredients[],stock_event_id если расход,outcome,status performed/failed; реальный held item, отдельный каст. species:title,description,behavior,ecology,status recorded/disputed/extinct; habitat:title,place,description,status stable/threatened/recovering/destroyed/unknown; population:species_id,habitat_id,count (null при unknown),description,status observed/estimated/unknown; encounter:species_id,habitat_id,operation observe/care/rescue/research/relocate/defend/other,outcome,status performed/failed. clinic:title,place,specialty,capacity,status active/suspended/closed; credential:holder,title,clinic_id,qualification_id (awarded player-life qualification),scope,status active/revoked; admission:clinic_id,patient,title,description,status requested/admitted/discharged/cancelled,actor владелец клиники; clinical_visit:admission_id,credential_id,treatment_id,outcome,status performed/failed,actor целитель, соответствующая процедура этой сцены. laboratory:title,place,group_id (social group),specialty,status active/suspended/closed; lab_member:lab_id,member,role,status invited/accepted/declined/withdrawn,actor руководитель; patent:research_id (validated),lab_id,title,jurisdiction,claim,status filed/granted/rejected/expired/revoked,actor автор; license:patent_id,holder,scope,amount,currency,status proposed/active/expired/revoked/declined,actor автор, при платной активации transfer_event_id от holder. Все этапы после реально сыгранного факта, без автоматического согласия и доходов. Используй вымышленные реагенты, физиологию и методы, не реальные медицинские или химические рецепты.';
