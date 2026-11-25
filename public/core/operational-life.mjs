/** Evidence-based operational work queues. No new events, implicit grading,
 * automatic payroll, repairs, or forecasts of demand. All views use accepted
 * current-branch projection records and separate narrator/player access. */
import {shiftWage} from './work-systems.mjs';
const key=(...v)=>JSON.stringify(v);
const page=(rows,limit=20)=>({records:rows.slice(0,limit),total:rows.length,omitted:Math.max(0,rows.length-limit)});
const get=(m,k,id)=>m.get('player-life:'+k+':'+id);
const push=(m,k,v)=>{if(!m.has(k))m.set(k,[]);m.get(k).push(v);};
const clean=v=>typeof v==='string'?v.slice(0,200):null;
const safeSum=(a,b)=>a!==null&&Number.isSafeInteger(b)&&Number.isSafeInteger(a+b)?a+b:null;
export function operationalIndex(projection={}, {complete=true}={}){
 const rows=(projection.worldFacts||[]).filter(r=>r.source?.scene_id),records=new Map(rows.map(r=>[r.key,r]));
 const education=new Map(),homes=new Map(),payroll=new Map(),materials=new Map(),programs=new Map();
 const balances=new Map((projection.balances||[]).map(b=>[key(b.actor,b.currency),b]));
 const stocks=new Map((projection.stock||[]).map(b=>[key(b.holder,b.product_id,b.unit),b]));
 const wages=new Set(rows.filter(r=>r.life_kind==='wage'&&r.status==='paid').map(r=>r.shift_id));
 const academicResults=new Map(),assessments=new Map(),qualifications=new Set();
 for(const r of rows){
  if(r.life_kind==='module_result')push(academicResults,r.program_enrollment_id,r);
  if(r.life_kind==='assessment')push(assessments,r.enrollment_id,r);
  if(r.life_kind==='qualification')qualifications.add(r.program_enrollment_id);
 }
 const addPayroll=r=>{
  const amount=shiftWage(r);
  if(amount===null||wages.has(r.record_id)||!r.employer||!r.currency)return;
  const id=key(r.employer,r.currency),g=payroll.get(id)||{actor:r.employer,currency:r.currency,total:0,count:0,entries:[],source:r.source};
  g.total=safeSum(g.total,amount);g.count++;
  if(g.entries.length<8)g.entries.push({shift_id:r.record_id,employee:r.actor,title:clean(r.title),amount,source:r.source});
  payroll.set(id,g);
 };
 const addMaterials=(r,actor,lines,kind)=>{
  if(!actor)return;
  for(const l of lines||[]){
   if(!Number.isSafeInteger(l.quantity)||l.quantity>=0)continue;
   const id=key(actor,l.product_id,l.unit),g=materials.get(id)||{actor,product_id:l.product_id,unit:l.unit,total:0,count:0,entries:[],source:r.source};
   g.total=safeSum(g.total,-l.quantity);g.count++;
   if(g.entries.length<6)g.entries.push({record_key:r.key,kind,required:-l.quantity,source:r.source});
   materials.set(id,g);
  }
 };
 if(complete)for(const r of rows){
  if(r.player_life_version===1&&r.life_kind==='assignment'&&r.status==='submitted'){
   const lesson=get(records,'lesson',r.lesson_id);
   if(lesson?.status==='attended'&&lesson.actor===r.actor&&lesson.teacher&&lesson.teacher!==r.actor){
    push(education,lesson.teacher,{kind:'grading_review',id:r.record_id,actor:lesson.teacher,student:r.actor,title:clean(r.title),lesson_id:lesson.record_id,due_at:r.due_at,source:r.source,lesson_source:lesson.source});
   }
  }
  if(r.player_life_version===1&&r.life_kind==='program_enrollment'&&['active','completed'].includes(r.status)){
   const program=get(records,'study_program',r.program_id),enrollment=get(records,'enrollment',r.enrollment_id);
   if(!program||!enrollment||enrollment.actor!==r.actor||enrollment.institution_id!==program.institution_id||!Array.isArray(program.modules))continue;
   const results=academicResults.get(r.record_id)||[],exams=(assessments.get(r.enrollment_id)||[]).filter(x=>x.actor===r.actor);
   const linked=new Set(results.map(x=>x.assessment_id)),titleCounts=new Map();for(const m of program.modules)titleCounts.set(m.title,(titleCounts.get(m.title)||0)+1);
   const modules=program.modules.map(m=>{
    const passed=results.find(x=>x.module_id===m.id&&x.status==='passed');
    const ambiguous=titleCounts.get(m.title)>1;
    const completed=!ambiguous&&exams.find(x=>x.title===m.title&&['passed','failed'].includes(x.status)&&!linked.has(x.record_id));
    const scheduled=!ambiguous&&exams.find(x=>x.title===m.title&&x.status==='scheduled');
    return {id:m.id,title:m.title,status:passed?'passed':ambiguous?'module_link_requires_review':completed?'result_pending':scheduled?'scheduled':'not_recorded',assessment_id:passed?.assessment_id??completed?.record_id??scheduled?.record_id??null,source:passed?.source??completed?.source??scheduled?.source??null};
   });
   const view={id:r.record_id,program_id:program.record_id,title:clean(program.title),actor:r.actor,organizer:program.actor,status:r.status,modules,passed:modules.filter(m=>m.status==='passed').length,total_modules:modules.length,source:r.source};
   push(programs,r.actor,view);
   // The organizer reviews administrative steps, never grants a grade or credential automatically.
   if(program.actor&&program.actor!==r.actor&&program.status==='active'){
    const pending=modules.filter(m=>m.status==='result_pending');
    const stage=r.status==='completed'&&!qualifications.has(r.record_id)?'qualification_review':r.status==='active'&&pending.length?'module_record_review':r.status==='active'&&view.passed===view.total_modules?'program_completion_review':null;
    if(stage)push(education,program.actor,{kind:stage,id:r.record_id,actor:program.actor,student:r.actor,title:clean(program.title),program_id:program.record_id,modules:pending.slice(0,5),source:r.source,program_source:program.source});
   }
  }
  if(r.player_life_version===1&&r.life_kind==='estate_condition'&&['worn','damaged','unsafe'].includes(r.status)){
   const estate=get(records,'estate',r.estate_id);
   // A previous owner's observation remains about the building, but the
   // former owner is not assigned its repair. A transfer may require inspection.
   if(estate?.status==='owned')push(homes,estate.actor,{id:r.record_id,estate_id:estate.record_id,title:clean(estate.title),area:clean(r.area),status:r.status,description:clean(r.description),place:estate.place,source:r.source,estate_source:estate.source,inspection_needed:r.actor!==estate.actor});
  }
  if(r.player_life_version===1&&r.life_kind==='work_shift'&&r.status==='worked')addPayroll(r);
  if(r.player_life_version===1&&r.life_kind==='service_visit'&&r.status==='accepted'&&r.recipe_id){
   const recipe=get(records,'service_recipe',r.recipe_id);
   if(recipe?.actor===r.provider&&recipe.service_id===r.service_id)addMaterials(r,r.provider,recipe.stock_lines,'accepted_service');
  }
  if(r.dynamics_version===1&&r.dynamics_kind==='production_order'&&['planned','ongoing'].includes(r.status)){
   const enterprise=records.get('dynamics:enterprise:'+r.enterprise_id);
   if(enterprise?.status==='operating'&&enterprise.actor===r.actor)addMaterials(r,r.actor,r.stock_lines,'production_order');
  }
 }
 const pay=[...payroll.values()].map(g=>{
  const b=balances.get(key(g.actor,g.currency)),amount=b?.known===true&&Number.isSafeInteger(b.balance)?b.balance:null;
  return {...g,balance:amount,shortfall:amount!==null&&g.total!==null&&Number.isSafeInteger(g.total-amount)?Math.max(0,g.total-amount):null,omitted_entries:g.count-g.entries.length};
 });
 const stock=[...materials.values()].map(g=>{
  const s=stocks.get(key(g.actor,g.product_id,g.unit)),available=s?.known===true&&Number.isSafeInteger(s.quantity)?s.quantity:null;
  return {...g,available,shortfall:available!==null&&g.total!==null&&Number.isSafeInteger(g.total-available)?Math.max(0,g.total-available):null,omitted_entries:g.count-g.entries.length};
 });
 const view=actor=>{
  if(!complete)return {memory_complete:false};
  return {memory_complete:true,education:page(education.get(actor)||[]),program_progress:page(programs.get(actor)||[]),property:page(homes.get(actor)||[]),
   payroll:page(pay.filter(g=>g.actor===actor)),materials:page(stock.filter(g=>g.actor===actor)),
   policy:'Only own property, operational responsibilities and recorded educational links. Totals are review exposure, not automatic settlement or reserved resources.'};
 };
 const opportunities=()=>{
  if(!complete)return [];
  const out=[],add=(kind,actor,id,title,r,context,guidance,extra={})=>out.push({kind,row:{actor,key:key(kind,id,actor),title,status:'review_required',source:r.source,...extra},info:{record_key:id,timing:'requires_character_choice',operational:context,guidance}});
  for(const [actor,entries] of education)for(const r of entries.slice(0,12))add(r.kind,actor,r.id,r.title,r,r,'Review the actual submitted work or accepted assessment. Do not invent a grade, enrollment, credential, or player agreement.');
  for(const [actor,entries] of homes)for(const r of entries.slice(0,12))add('property_maintenance_review',actor,r.estate_id+':'+r.id,r.title,r,r,'Inspect existing condition and obtain evidence for any repair, materials, cost and access. No automatic repair or residence.',{place:r.place});
  for(const g of pay)add('payroll_review',g.actor,g.currency,'Расчёт за выполненные смены',g,g,'Review each recorded completed shift and distinct wage receipt. No duplicate payment, automatic debit or invented salary.');
  for(const g of stock)if(g.shortfall!==0)add('operational_stock_review',g.actor,key(g.product_id,g.unit),'Обеспечение запасами',g,g,'Review simultaneous recorded orders and accepted recipes. Unknown stock is not zero; no assumed procurement or stock reservation.');
  return out;
 };
 return {view,opportunities};
}
