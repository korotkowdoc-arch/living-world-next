/** Academic progression and procurement use existing enrollment, assessments,
 * agreements, inventory and money. No automatic qualification or settlement. */
import {stockLinesError} from './economy.mjs';
import {parseStoryDate} from './world-time.mjs';
const valid=(x,n=140)=>typeof x==='string'&&x.trim()===x&&!!x&&x.length<=n;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const same=(a,b,fields)=>fields.every(k=>a[k]===b[k]);
const get=(r,k,id)=>r.get('player-life:'+k+':'+id);
const linesEqual=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>same(x,b[i],['product_id','unit','quantity']));
const modulesEqual=(a,b)=>a.length===b.length&&a.every((x,i)=>same(x,b[i],['id','title']));
export const CURRICULUM_KINDS=['study_program','program_enrollment','module_result','qualification','supply_contract'];
export function curriculumError(e){
 if(!valid(e.actor))return 'Invalid academic or supply actor';
 switch(e.life_kind){
 case 'study_program':
  if(!id(e.institution_id)||!valid(e.title,200)||!valid(e.place)||!Array.isArray(e.modules)||e.modules.length<1||e.modules.length>20||e.modules.some(x=>!x||Object.keys(x).length!==2||!id(x.id)||!valid(x.title,200))||new Set(e.modules.map(x=>x.id)).size!==e.modules.length||!['active','retired'].includes(e.status))return 'Invalid study program';break;
 case 'program_enrollment':
  if(!id(e.program_id)||!id(e.enrollment_id)||!['active','completed','withdrawn'].includes(e.status))return 'Invalid program enrollment';break;
 case 'module_result':
  if(!id(e.program_enrollment_id)||!id(e.module_id)||!id(e.assessment_id)||!['passed','failed'].includes(e.status))return 'Invalid module result';break;
 case 'qualification':
  if(!id(e.program_enrollment_id)||!valid(e.title,200)||!['awarded','revoked'].includes(e.status)||!valid(e.description,600))return 'Invalid qualification';break;
 case 'supply_contract':
  if(!id(e.enterprise_id)||!id(e.agreement_id)||!valid(e.supplier)||e.actor===e.supplier||!valid(e.title,200)||!valid(e.currency,80)||!Number.isSafeInteger(e.amount)||e.amount<=0||!parseStoryDate(e.due_at)||stockLinesError(e.stock_lines,'transfer')||!['proposed','active','disputed','settled','cancelled'].includes(e.status))return 'Invalid supply contract';
  if(e.status==='settled'&&(!valid(e.transfer_event_id,180)||!valid(e.stock_event_id,180)||!valid(e.outcome,600))||e.status!=='settled'&&(e.transfer_event_id!=null||e.stock_event_id!=null)||e.status==='disputed'&&!valid(e.outcome,600))return 'Supply settlement or dispute requires evidence';break;
 }
 return null;
}
export function curriculumTransition(records,e){
 const old=records.get(e.key),k=e.life_kind,others=fn=>[...records.values()].some(x=>x.life_kind===k&&x.key!==e.key&&fn(x));
 if(old&&old.actor!==e.actor)return 'Changed academic or supply actor';
 if(k==='study_program'){
  const institution=records.get('dynamics:institution:'+e.institution_id);
  if(!institution||institution.place!==e.place||!old&&(institution.status!=='operating'||e.status!=='active')||old&&(old.status!=='active'||e.status!=='retired'||!same(old,e,['institution_id','title','place'])||!modulesEqual(old.modules,e.modules)))return 'Program needs operating institution and fixed curriculum';
 }else if(k==='program_enrollment'){
  const program=get(records,'study_program',e.program_id),enrollment=get(records,'enrollment',e.enrollment_id);
  if(!program||!enrollment||enrollment.actor!==e.actor||enrollment.institution_id!==program.institution_id||enrollment.place!==program.place||others(x=>x.enrollment_id===e.enrollment_id))return 'Program requires own matching enrollment';
  if(!old&&(program.status!=='active'||enrollment.status!=='enrolled'||e.status!=='active')||old&&(old.status!=='active'||!same(old,e,['program_id','enrollment_id'])||!['completed','withdrawn'].includes(e.status)))return 'Invalid program enrollment transition';
  if(e.status==='completed'&&(enrollment.status!=='completed'||!program.modules.every(m=>[...records.values()].some(x=>x.life_kind==='module_result'&&x.program_enrollment_id===e.record_id&&x.module_id===m.id&&x.status==='passed'))))return 'Completion requires all modules passed and closed enrollment';
  if(e.status==='withdrawn'&&enrollment.status!=='withdrawn')return 'Withdraw underlying enrollment first';
 }else if(k==='module_result'){
  const p=get(records,'program_enrollment',e.program_enrollment_id),program=p&&get(records,'study_program',p.program_id),a=get(records,'assessment',e.assessment_id),module=program?.modules.find(m=>m.id===e.module_id);
  if(old||!p||p.actor!==e.actor||p.status!=='active'||!module||!a||a.actor!==e.actor||a.enrollment_id!==p.enrollment_id||a.title!==module.title||a.status!==e.status||others(x=>x.assessment_id===e.assessment_id)||others(x=>x.program_enrollment_id===e.program_enrollment_id&&x.module_id===e.module_id&&x.status==='passed'))return 'Module result needs a distinct matching completed assessment';
 }else if(k==='qualification'){
  const p=get(records,'program_enrollment',e.program_enrollment_id);
  if(!p||p.actor!==e.actor||p.status!=='completed'||others(x=>x.program_enrollment_id===e.program_enrollment_id)||!old&&e.status!=='awarded'||old&&(old.status!=='awarded'||e.status!=='revoked'||!same(old,e,['program_enrollment_id','title'])))return 'Qualification requires completed program and one award';
 }else if(k==='supply_contract'){
  const business=records.get('dynamics:enterprise:'+e.enterprise_id),agreement=records.get('dynamics:economic_agreement:'+e.agreement_id);
  if(!business||business.actor!==e.actor||!agreement||agreement.actor!==e.actor||agreement.counterparty!==e.supplier||agreement.amount!==e.amount||agreement.currency!==e.currency||!['service','other'].includes(agreement.agreement_kind)||others(x=>x.agreement_id===e.agreement_id))return 'Supply contract needs matching enterprise and agreement';
  const transitions={proposed:['active','cancelled'],active:['disputed','settled','cancelled'],disputed:['active','settled','cancelled']};
  if(!old&&e.status!=='proposed'||old&&(!transitions[old.status]?.includes(e.status)||!same(old,e,['enterprise_id','agreement_id','supplier','title','currency','amount','due_at'])||!linesEqual(old.stock_lines,e.stock_lines)))return 'Invalid supply contract transition';
  const expected={proposed:'proposed',active:'active',disputed:'disputed',settled:'settled',cancelled:'cancelled'}[e.status];
  if(agreement.status!==expected||['active','settled'].includes(e.status)&&business.status!=='operating')return 'Supply contract must match agreement and operating enterprise';
 }
 return null;
}
export function supplySceneError(e,events,i,usedMoney){
 if(e.player_life_version!==1||e.life_kind!=='supply_contract'||e.status!=='settled')return null;
 const before=events.slice(0,i),p=before.find(x=>x.id===e.transfer_event_id),s=before.find(x=>x.id===e.stock_event_id);
 if(!p||p.type!=='money'||p.operation!=='transfer'||p.actor!==e.actor||p.counterparty!==e.supplier||p.currency!==e.currency||p.delta!==-e.amount||usedMoney.has(p.id))return 'Supply requires separate exact payment';
 if(!s||s.dynamics_version!==1||s.dynamics_kind!=='stock_operation'||s.stock_action!=='transfer'||s.actor!==e.supplier||s.counterparty!==e.actor||!linesEqual(s.stock_lines,e.stock_lines)||before.some(x=>x.life_kind==='supply_contract'&&x.status==='settled'&&x.stock_event_id===s.id))return 'Supply requires separate exact stock transfer';
 usedMoney.add(p.id);return null;
}
export function supplyReplayError(e,money,stock){
 if(e.player_life_version===1&&e.life_kind==='supply_contract'&&e.status==='settled'&&(!money.has(e.transfer_event_id)||!stock.has(e.stock_event_id)))return 'Supply payment or stock transfer rejected';
 return null;
}
export function curriculumView(projection={},actor){
 const rows=projection.worldFacts||[],r=new Map(rows.map(x=>[x.key,x])),page=a=>({records:a.slice(0,40),total:a.length,omitted:Math.max(0,a.length-40)});
 const enrollments=rows.filter(x=>x.life_kind==='program_enrollment'&&x.actor===actor).map(x=>{const p=get(r,'study_program',x.program_id);return {id:x.record_id,title:p?.title??null,program_id:x.program_id,enrollment_id:x.enrollment_id,status:x.status,modules:(p?.modules||[]).map(m=>({...m,passed:rows.some(y=>y.life_kind==='module_result'&&y.program_enrollment_id===x.record_id&&y.module_id===m.id&&y.status==='passed')})),source:x.source};});
 const qualifications=rows.filter(x=>x.life_kind==='qualification'&&x.actor===actor).map(x=>({id:x.record_id,title:x.title,status:x.status,description:x.description,source:x.source}));
 const programs=rows.filter(x=>x.life_kind==='study_program'&&x.actor===actor).map(x=>({id:x.record_id,title:x.title,place:x.place,modules:x.modules,status:x.status,source:x.source}));
 const supplies=rows.filter(x=>x.life_kind==='supply_contract'&&(x.actor===actor||x.supplier===actor)).map(x=>({id:x.record_id,title:x.title,buyer:x.actor,supplier:x.supplier,enterprise_id:x.enterprise_id,amount:x.amount,currency:x.currency,due_at:x.due_at,stock_lines:x.stock_lines,status:x.status,outcome:x.outcome??null,source:x.source}));
 return {programs:page(programs),enrollments:page(enrollments),qualifications:page(qualifications),supplies:page(supplies),policy:'Recorded own or directly involved programs and contracts only. No automatic grades, credentials, shipment or money.'};
}
export const CURRICULUM_GUIDANCE='ПРОГРАММЫ И ПОСТАВКИ: player_life_version=1, record_id,key=player-life:<life_kind>:<ID>,evidence. study_program: actor=организатор,institution_id,title,place,modules:[{id,title}] (1–20, неизменяемый состав),status=active/retired. program_enrollment: actor=учащийся,program_id,enrollment_id,status=active/completed/withdrawn; активное обычное enrollment той же организации. module_result: actor,program_enrollment_id,module_id,assessment_id,status=passed/failed; отдельный экзамен того же зачисления и с названием модуля, результат совпадает. Все модули пройдены и enrollment completed до program_enrollment completed. qualification: actor,program_enrollment_id,title,description,status=awarded/revoked; только завершённая программа. supply_contract: actor=покупатель,enterprise_id,agreement_id (economic_agreement service/other),supplier,title,amount,currency,due_at,stock_lines:[{product_id,unit,quantity>0}],status=proposed/active/disputed/settled/cancelled; синхронное состояние обычного соглашения. При settled outcome,transfer_event_id (точный перевод покупатель→поставщик),stock_event_id (точная предыдущая stock_operation transfer поставщик→покупатель), обе операции в той же сцене, не повторно. При disputed outcome. Не совершай выбор за игрока, не придумывай наличие товара или выдачу диплома.';
