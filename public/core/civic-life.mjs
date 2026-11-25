/** Fictional institutions: offices, legal cases, delivered notices, submissions,
 * decisions and ballots. No automatic sanctions, guilt, knowledge or enactment. */
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const txt=(x,n=140)=>typeof x==='string'&&x.trim()===x&&!!x&&x.length<=n;
const one=(x,values)=>values.includes(x);
const names=(x,max)=>Array.isArray(x)&&x.length>0&&x.length<=max&&x.every(a=>txt(a))&&new Set(x).size===x.length;
const same=(a,b,fields)=>fields.every(k=>a[k]===b[k]);
const sameList=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>x===b[i]);
const get=(records,kind,id)=>records.get('player-life:'+kind+':'+id);
const page=rows=>({records:rows.slice(0,30),total:rows.length,omitted:Math.max(0,rows.length-30)});
const roles=['magistrate','investigator','clerk','councillor'];
export const CIVIC_KINDS=['civic_office','civic_case','civic_notice','civic_submission','civic_decision','civic_motion','civic_ballot'];
export function civicError(e){
 if(!txt(e.actor))return 'Civic record requires a named actor';
 switch(e.life_kind){
 case 'civic_office':
  if(!id(e.institution_id)||!one(e.role,roles)||!one(e.status,['active','revoked'])||!txt(e.description,600))return 'Invalid office';break;
 case 'civic_case':
  if(!id(e.institution_id)||!txt(e.title,200)||!txt(e.description,600)||!one(e.case_kind,['civil','criminal','disciplinary','administrative','other'])||!names(e.parties,12)||!one(e.status,['open','hearing','closed','dismissed'])||e.handover_from!=null&&!txt(e.handover_from))return 'Invalid case';break;
 case 'civic_notice':
  if(!id(e.target_id)||!txt(e.sender)||e.sender===e.actor||!one(e.target_kind,['case','motion'])||!txt(e.title,200)||!txt(e.description,1200)||e.status!=='delivered')return 'Invalid delivered notice';
  if(e.target_kind==='case'&&(!one(e.notice_kind,['opened','hearing','decision'])||!one(e.role,['party','witness','officer']))||e.target_kind==='motion'&&(!one(e.notice_kind,['ballot','result'])||e.role!=='voter'))return 'Invalid notice role or kind';break;
 case 'civic_submission':
  if(!id(e.case_id)||!txt(e.title,200)||!txt(e.description,1600)||!one(e.submission_kind,['claim','response','witness_statement','document','expert_report','other'])||e.status!=='submitted')return 'Invalid case submission';break;
 case 'civic_decision':
  if(!id(e.case_id)||!one(e.disposition,['resolved','dismissed'])||!txt(e.outcome,1200)||e.status!=='issued')return 'Invalid reasoned decision';break;
 case 'civic_motion':
  if(!id(e.institution_id)||!txt(e.title,200)||!txt(e.description,1200)||!names(e.voters,30)||!Number.isSafeInteger(e.quorum)||e.quorum<1||e.quorum>e.voters.length||!Number.isSafeInteger(e.required_yes)||e.required_yes<1||e.required_yes>e.voters.length||!one(e.status,['open','approved','rejected','no_quorum','withdrawn'])||(e.status==='open'?e.outcome!=null:!txt(e.outcome,600)))return 'Invalid motion';break;
 case 'civic_ballot':
  if(!id(e.motion_id)||!one(e.vote,['yes','no','abstain'])||e.status!=='cast')return 'Invalid ballot';break;
 }
 return null;
}
function activeInstitution(records,institutionId){
 const i=records.get('dynamics:institution:'+institutionId);
 return i?.status==='operating'&&records.get('social:group:'+i.group_id)?.status==='active'?i:null;
}
function member(records,institutionId,actor){
 const i=activeInstitution(records,institutionId);
 if(!i)return false;
 const matching=[...records.values()].filter(r=>r.social_record_version===1&&r.social_kind==='membership'&&r.group_id===i.group_id&&r.actor===actor);
 return matching.length===1&&matching[0].status==='member';
}
function office(records,institutionId,actor,allowed){
 return member(records,institutionId,actor)&&[...records.values()].some(r=>r.player_life_version===1&&r.life_kind==='civic_office'&&r.institution_id===institutionId&&r.actor===actor&&r.status==='active'&&allowed.includes(r.role));
}
const decision=(records,caseId)=>[...records.values()].find(r=>r.life_kind==='civic_decision'&&r.case_id===caseId&&r.status==='issued');
const notice=(records,kind,id,actor,filter=()=>true)=>[...records.values()].some(r=>r.life_kind==='civic_notice'&&r.target_kind===kind&&r.target_id===id&&r.actor===actor&&r.status==='delivered'&&filter(r));
const caseAccess=(records,c,actor)=>c.actor===actor||notice(records,'case',c.record_id,actor,r=>r.role==='officer')||decision(records,c.record_id)?.actor===actor;
function tally(records,motion){
 const votes=new Map();
 for(const r of records.values())if(r.life_kind==='civic_ballot'&&r.motion_id===motion.record_id&&r.status==='cast'&&motion.voters.includes(r.actor))votes.set(r.actor,r.vote);
 const result={yes:0,no:0,abstain:0,cast:votes.size,eligible:motion.voters.length};
 for(const v of votes.values())result[v]++;
 return {...result,quorum:motion.quorum,required_yes:motion.required_yes,result:result.cast<motion.quorum?'no_quorum':result.yes>=motion.required_yes?'approved':'rejected'};
}
export function civicTransition(records,e){
 const old=records.get(e.key),k=e.life_kind,rows=[...records.values()];
 const exists=(kind,fn)=>rows.some(r=>r.life_kind===kind&&r.key!==e.key&&fn(r));
 if(k==='civic_office'){
  if(!old){if(e.status!=='active'||!member(records,e.institution_id,e.actor)||exists(k,r=>same(r,e,['actor','institution_id','role'])&&r.status==='active'))return 'Office needs recorded active membership and unique appointment';}
  else if(old.status!=='active'||e.status!=='revoked'||!same(old,e,['actor','institution_id','role']))return 'Invalid office revocation';
 }else if(k==='civic_case'){
  if(!office(records,e.institution_id,e.actor,['magistrate','investigator']))return 'Case handler needs current recorded office';
  if(!old){if(e.status!=='open'||e.handover_from!=null)return 'New case must be opened';}
  else{
   if(!same(old,e,['institution_id','title','description','case_kind'])||!sameList(old.parties,e.parties)||!one(old.status,['open','hearing']))return 'Immutable or closed case';
   if(e.actor!==old.actor){if(e.handover_from!==old.actor||e.status!==old.status)return 'Transfer requires explicit handover at same stage';}
   else if(e.handover_from!=null)return 'Unexpected handover';
   if(e.status==='open'&&old.status!=='open')return 'Cannot reopen a hearing';
   const d=decision(records,e.record_id);
   if(e.status==='closed'&&(old.status!=='hearing'||d?.disposition!=='resolved')||e.status==='dismissed'&&d?.disposition!=='dismissed')return 'Closure requires separate issued decision';
   if(d&&one(e.status,['open','hearing'])&&e.actor===old.actor)return 'Review existing decision and close case';
  }
 }else if(k==='civic_notice'){
  if(old)return 'Delivered notice is immutable';
  if(e.target_kind==='case'){
   const c=get(records,'civic_case',e.target_id);
   if(!c||!office(records,c.institution_id,e.sender,['magistrate','investigator','clerk'])||!caseAccess(records,c,e.sender))return 'Notice requires authorized case office';
   if(e.role==='party'&&!c.parties.includes(e.actor)||e.role==='officer'&&!office(records,c.institution_id,e.actor,['magistrate','investigator','clerk']))return 'Invalid recipient role';
   if(e.notice_kind==='hearing'&&c.status!=='hearing'||e.notice_kind==='decision'&&(!one(c.status,['closed','dismissed'])||!decision(records,c.record_id)))return 'Notice requires actual hearing or issued and closed decision';
   if(e.notice_kind==='opened'&&!one(c.status,['open','hearing']))return 'Case no longer open';
  }else{
   const m=get(records,'civic_motion',e.target_id);
   if(!m||!m.voters.includes(e.actor)||!office(records,m.institution_id,e.sender,['councillor','clerk'])||e.notice_kind==='ballot'&&m.status!=='open'||e.notice_kind==='result'&&m.status==='open')return 'Notice requires recorded voter and matching motion stage';
  }
 }else if(k==='civic_submission'){
  const c=get(records,'civic_case',e.case_id);
  if(old||!c||!one(c.status,['open','hearing'])||decision(records,c.record_id)||!((office(records,c.institution_id,e.actor,['magistrate','investigator'])&&caseAccess(records,c,e.actor))||notice(records,'case',e.case_id,e.actor,r=>one(r.notice_kind,['opened','hearing']))))return 'Submission requires open case and informed participant or official';
 }else if(k==='civic_decision'){
  const c=get(records,'civic_case',e.case_id);
  if(old||!c||!one(c.status,['open','hearing'])||e.disposition==='resolved'&&c.status!=='hearing'||!office(records,c.institution_id,e.actor,['magistrate'])||!caseAccess(records,c,e.actor)||decision(records,e.case_id))return 'Decision requires distinct authorized magistrate and matching case stage';
 }else if(k==='civic_motion'){
  if(!office(records,e.institution_id,e.actor,['councillor']))return 'Motion requires active councillor';
  if(!old){if(e.status!=='open'||e.voters.some(a=>!member(records,e.institution_id,a)))return 'Motion requires explicit current member electorate';}
  else{
   if(old.status!=='open'||e.status==='open'||!same(old,e,['actor','institution_id','title','description','quorum','required_yes'])||!sameList(old.voters,e.voters))return 'Motion identity and voting rules are fixed';
   if(e.status!=='withdrawn'&&tally(records,old).result!==e.status)return 'Motion outcome disagrees with recorded ballot tally';
  }
 }else if(k==='civic_ballot'){
  const m=get(records,'civic_motion',e.motion_id);
  if(old||!m||m.status!=='open'||!m.voters.includes(e.actor)||!member(records,m.institution_id,e.actor)||!notice(records,'motion',e.motion_id,e.actor,r=>r.notice_kind==='ballot')||exists(k,r=>r.motion_id===e.motion_id&&r.actor===e.actor))return 'Ballot requires open informed eligible voter and unique vote';
 }
 return null;
}
export function civicIndex(projection={}, {complete=true}={}){
 const rows=(projection.worldFacts||[]).filter(r=>r.player_life_version===1&&r.source?.scene_id);
 // Institution and membership records also participate in current authority checks.
 const all=new Map((projection.worldFacts||[]).map(r=>[r.key,r]));
 const byKind=k=>rows.filter(r=>r.life_kind===k);
 const offices=byKind('civic_office'),cases=byKind('civic_case'),notices=byKind('civic_notice'),submissions=byKind('civic_submission'),decisions=byKind('civic_decision'),motions=byKind('civic_motion'),ballots=byKind('civic_ballot');
 const compact=(r,fields)=>({id:r.record_id,...Object.fromEntries(fields.map(k=>[k,r[k]??null])),source:r.source});
 const view=actor=>{
  if(!complete)return {memory_complete:false};
  return {memory_complete:true,
   offices:page(offices.filter(r=>r.actor===actor).map(r=>({...compact(r,['institution_id','role','description','status']),effective:r.status==='active'&&member(all,r.institution_id,actor)}))),
   managed_cases:page(cases.filter(r=>r.actor===actor&&office(all,r.institution_id,actor,['magistrate','investigator'])).map(r=>compact(r,['institution_id','title','case_kind','description','parties','status']))),
   notices:page(notices.filter(r=>r.actor===actor).map(r=>{
    // Action availability is based on what was delivered to this person, not a
    // hidden current court or council status. The scene preflight rechecks it.
    const resolved=notices.some(n=>n.actor===actor&&n.target_kind===r.target_kind&&n.target_id===r.target_id&&one(n.notice_kind,['decision','result']));
    const voted=ballots.some(b=>b.actor===actor&&b.motion_id===r.target_id);
    const responded=submissions.some(b=>b.actor===actor&&b.case_id===r.target_id);
    return {...compact(r,['target_kind','target_id','sender','notice_kind','role','title','description','status']),can_respond:!resolved&&r.target_kind==='case'&&one(r.notice_kind,['opened','hearing']),can_vote:!resolved&&!voted&&r.target_kind==='motion'&&r.notice_kind==='ballot',own_submission_recorded:r.target_kind==='case'&&responded};
   })),
   submissions:page(submissions.filter(r=>r.actor===actor).map(r=>compact(r,['case_id','title','description','submission_kind','status']))),
   decisions:page(decisions.filter(r=>r.actor===actor).map(r=>compact(r,['case_id','disposition','outcome','status']))),
   motions:page(motions.filter(r=>r.actor===actor&&office(all,r.institution_id,actor,['councillor'])).map(r=>({...compact(r,['institution_id','title','description','status','outcome']),tally:tally(all,r)}))),
   ballots:page(ballots.filter(r=>r.actor===actor).map(r=>compact(r,['motion_id','vote','status']))),
   policy:'Only own recorded office, managed records, delivered notices and personal submissions or votes. Other cases, secret ballots and undelivered outcomes are not player knowledge.'};
 };
 const opportunities=()=>{
  if(!complete)return [];
  const out=[],seen=new Set();
  const add=(kind,actor,r,context,guidance)=>{
   const k=JSON.stringify([kind,actor,context.case_id??context.motion_id??r.record_id]);if(seen.has(k))return;seen.add(k);
   out.push({kind,row:{actor,key:k,title:r.title||kind,status:'review_required',source:r.source},info:{record_key:r.key,timing:'requires_character_choice',civic:context,guidance}});
  };
  for(const c of cases)if(one(c.status,['open','hearing'])&&office(all,c.institution_id,c.actor,['magistrate','investigator']))add('civic_case_review',c.actor,c,{case_id:c.record_id,status:c.status,decision_issued:!!decision(all,c.record_id)},'Review the actual case and authorized steps; allegations are not guilt, decisions do not automatically impose sanctions.');
  for(const m of motions)if(m.status==='open'&&office(all,m.institution_id,m.actor,['councillor']))add('civic_motion_review',m.actor,m,{motion_id:m.record_id,tally:tally(all,m)},'Review recorded votes and explicit quorum; an approved proposal is not an enacted law or automatic world change.');
  for(const n of notices){
   if(n.target_kind==='case'&&one(n.notice_kind,['opened','hearing'])){
    const c=get(all,'civic_case',n.target_id);
    if(c&&one(c.status,['open','hearing'])&&!decision(all,c.record_id)&&!submissions.some(r=>r.case_id===c.record_id&&r.actor===n.actor))add('civic_notice_response',n.actor,n,{case_id:c.record_id,notice_id:n.record_id,role:n.role},'Consider a response to the notice actually delivered. No inferred compliance, guilt or knowledge beyond the notice.');
   }
   if(n.target_kind==='motion'&&n.notice_kind==='ballot'){
    const m=get(all,'civic_motion',n.target_id);
    if(m?.status==='open'&&member(all,m.institution_id,n.actor)&&!ballots.some(r=>r.motion_id===m.record_id&&r.actor===n.actor))add('civic_ballot_review',n.actor,n,{motion_id:m.record_id,notice_id:n.record_id},'Consider the voter own preferences, motives and information. Do not cast a vote for the player or infer support from membership.');
   }
  }
  return out;
 };
 return {view,opportunities};
}
export const CIVIC_GUIDANCE='ОБЩЕСТВЕННЫЕ ИНСТИТУТЫ: player_life_version=1, record_id, key=player-life:<life_kind>:<ID>, evidence. civic_office: actor,institution_id,role=magistrate/investigator/clerk/councillor,description,status=active/revoked; действующее учреждение и членство, должность только после назначения. civic_case: actor=ответственный магистрат/следователь,institution_id,title,description,case_kind=civil/criminal/disciplinary/administrative/other,parties (имена, 1–12),status=open/hearing/closed/dismissed; смена ответственного отдельным подтверждённым handover_from, стадия та же. civic_notice: actor=получатель,sender=уполномоченный, target_kind=case/motion,target_id,notice_kind=opened/hearing/decision либо ballot/result,role=party/witness/officer либо voter,title,description,status=delivered; только фактически сообщённое. civic_submission: actor,case_id,title,description,submission_kind=claim/response/witness_statement/document/expert_report/other,status=submitted; отдельное заявление, не истина. civic_decision: actor=магистрат,case_id,disposition=resolved/dismissed,outcome,status=issued; одна отдельная запись до закрытия дела; магистрат должен вести дело или получить служебное уведомление. Полномочия сами по себе не дают знания. civic_motion: actor=советник,institution_id,title,description,voters (фиксированные 1–30 членов),quorum,required_yes,status=open/approved/rejected/no_quorum/withdrawn,outcome при закрытии; точный подсчёт, не автоматическое принятие закона. civic_ballot: actor,motion_id,vote=yes/no/abstain,status=cast; один голос после доставленного уведомления, членство проверяется. Никаких автоматических штрафов, ареста, вины, раскрытия секретных голосов или санкций; изменения мира отдельными событиями. Герой видит только свои сообщения, заявления, голоса и управляемые дела.';

export const CIVIC_ACTIONS=Object.freeze({civic_respond_notice:'Ответить на уведомление по делу',civic_submit_statement:'Подать заявление или показания',civic_cast_ballot:'Проголосовать',civic_manage_case:'Вести дело',civic_manage_motion:'Рассмотреть предложение совета',civic_open_case:'Открыть дело',civic_propose_motion:'Предложить решение совета'});
/** Intents validate only the visible record and player's own role.
 * The actual civicTransition additionally rechecks current case/motion state. */
export function civicActionTargets(action,view){
 if(!view?.memory_complete)return [];
 if(action==='civic_respond_notice'||action==='civic_submit_statement')return (view.notices?.records||[]).filter(n=>n.can_respond);
 if(action==='civic_cast_ballot')return (view.notices?.records||[]).filter(n=>n.can_vote);
 if(action==='civic_manage_case')return (view.managed_cases?.records||[]).filter(n=>one(n.status,['open','hearing']));
 if(action==='civic_manage_motion')return (view.motions?.records||[]).filter(n=>n.status==='open');
 if(action==='civic_open_case'||action==='civic_propose_motion')return (view.offices?.records||[]).filter(n=>n.effective&&(action==='civic_open_case'?one(n.role,['magistrate','investigator']):n.role==='councillor'));
 return [];
}
export function validateCivicAction(input,overview){
 if(!Object.hasOwn(CIVIC_ACTIONS,input.action))return;
 if(!id(input.civic_record_id)||!civicActionTargets(input.action,overview.civic).some(r=>r.id===input.civic_record_id))throw Error('Civic record is not available in current player view');
 if(input.action==='civic_cast_ballot'&&!one(input.civic_vote,['yes','no','abstain']))throw Error('Choose yes, no or abstain explicitly');
 if(input.action!=='civic_cast_ballot'&&input.civic_vote!=null)throw Error('Vote is only valid for a ballot action');
}
