/** Shared households, recorded care and evidence-based job qualifications.
 * Membership is not ownership, residence, consent or a common bank account. */
const valid=(x,n=140)=>typeof x==='string'&&x.trim()===x&&!!x&&x.length<=n;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const get=(r,k,i)=>r.get('player-life:'+k+':'+i);
const same=(a,b,ks)=>ks.every(k=>a[k]===b[k]);
const listEqual=(a,b)=>a.length===b.length&&a.every((x,i)=>same(x,b[i],['name','level']));
export const HOUSEHOLD_KINDS=['household','household_member','household_contribution','job_requirement','care_record'];
export function householdAccessible(records,h){
 const home=h&&get(records,h.home_kind,h.home_id);
 return !!home&&h.status==='active'&&home.actor===h.actor&&(h.home_kind==='estate'?home.status==='owned'&&(home.last_sale_id??null)===(h.title_revision??null):home.status==='active');
}
export function householdRecordError(e){
 if(!valid(e.actor))return 'Invalid household or career actor';
 switch(e.life_kind){
 case 'household':
  if(!valid(e.title,200)||!['lease','estate'].includes(e.home_kind)||!id(e.home_id)||e.title_revision!=null&&(e.home_kind!=='estate'||!id(e.title_revision))||!['active','closed'].includes(e.status))return 'Invalid household';break;
 case 'household_member':
  if(!id(e.household_id)||!valid(e.host)||e.actor===e.host||!['invited','joined','declined','left','removed'].includes(e.status)||e.status!=='invited'&&!valid(e.outcome,600))return 'Invalid household membership';break;
 case 'household_contribution':
  if(!id(e.household_id)||!valid(e.host)||e.actor===e.host||!Number.isSafeInteger(e.amount)||e.amount<=0||!valid(e.currency,80)||!valid(e.title,200)||!valid(e.transfer_event_id,180)||e.status!=='recorded')return 'Invalid household contribution';break;
 case 'job_requirement':
  if(!id(e.employment_id)||e.qualification_title!=null&&!valid(e.qualification_title,200)||!Array.isArray(e.skills)||e.skills.length>8||e.skills.some(x=>!x||Object.keys(x).length!==2||!valid(x.name)||!['competent','advanced'].includes(x.level))||new Set(e.skills.map(x=>x.name)).size!==e.skills.length||(!e.qualification_title&&!e.skills.length)||e.status!=='active')return 'Invalid job requirements';break;
 case 'care_record':
  if(!id(e.episode_id)||!id(e.visit_id)||!valid(e.description,600)||e.status!=='recorded')return 'Invalid care record';break;
 }
 return null;
}
export function householdTransition(records,e){
 const old=records.get(e.key),k=e.life_kind,others=fn=>[...records.values()].some(x=>x.life_kind===k&&x.key!==e.key&&fn(x));
 if(old&&old.actor!==e.actor)return 'Changed household or career actor';
 if(k==='household'){
  if(!old&&(e.status!=='active'||!householdAccessible(records,e)||others(x=>x.home_kind===e.home_kind&&x.home_id===e.home_id&&householdAccessible(records,x)))||old&&(old.status!=='active'||e.status!=='closed'||!same(old,e,['title','home_kind','home_id'])||(old.title_revision??null)!==(e.title_revision??null)))return 'Household needs accessible home and stable identity';
 }else if(k==='household_member'){
  const h=get(records,'household',e.household_id);
  const steps={invited:['joined','declined','removed'],joined:['left','removed']};
  if(!h||h.actor!==e.host||!old&&(e.status!=='invited'||!householdAccessible(records,h)||others(x=>x.household_id===e.household_id&&x.actor===e.actor&&['invited','joined'].includes(x.status)))||old&&(!same(old,e,['household_id','host'])||!steps[old.status]?.includes(e.status))||e.status==='joined'&&!householdAccessible(records,h))return 'Membership requires explicit invitation and current access';
 }else if(k==='household_contribution'){
  const h=get(records,'household',e.household_id);
  if(old||!h||h.actor!==e.host||!householdAccessible(records,h)||![...records.values()].some(x=>x.life_kind==='household_member'&&x.household_id===e.household_id&&x.actor===e.actor&&x.status==='joined'))return 'Contribution needs joined member of accessible household';
 }else if(k==='job_requirement'){
  const job=records.get('dynamics:employment:'+e.employment_id);
  if(old||!job||job.counterparty!==e.actor||job.status!=='offered'||others(x=>x.employment_id===e.employment_id))return 'Requirements must be established by employer before accepting offer';
 }else if(k==='care_record'){
  const episode=get(records,'health_episode',e.episode_id),visit=get(records,'service_visit',e.visit_id),service=visit&&get(records,'venue_service',visit.service_id);
  if(old||!episode||episode.actor!==e.actor||episode.status==='resolved'||!visit||visit.actor!==e.actor||visit.status!=='completed'||service?.category!=='health'||others(x=>x.visit_id===e.visit_id))return 'Care needs completed health service and observed unresolved episode';
 }
 return null;
}
export function jobEligibility(records,job){
 const req=[...records.values()].find(x=>x.life_kind==='job_requirement'&&x.employment_id===job.record_id);
 if(!req)return {status:'not_specified',missing:[]};
 const missing=[],rows=[...records.values()];
 if(req.qualification_title&&!rows.some(x=>x.life_kind==='qualification'&&x.actor===job.actor&&x.title===req.qualification_title&&x.status==='awarded'))missing.push({kind:'qualification',title:req.qualification_title});
 for(const s of req.skills)if(!rows.some(x=>x.growth_version===1&&x.growth_kind==='skill'&&x.actor===job.actor&&x.name===s.name&&(s.level==='advanced'?x.status==='advanced':['competent','advanced'].includes(x.status))))missing.push({kind:'skill',...s});
 return {status:missing.length?'not_confirmed':'confirmed',missing,source:req.source??null};
}
export function employmentGate(records,e){
 if(e.dynamics_version!==1||e.dynamics_kind!=='employment'||e.status!=='active'||records.get(e.key)?.status==='active')return null;
 return jobEligibility(records,e).status==='not_confirmed'?'Employment requirements not confirmed by applicant records':null;
}
export function householdSceneError(e,events,i,used){
 if(e.player_life_version!==1||e.life_kind!=='household_contribution')return null;
 const p=events.slice(0,i).find(x=>x.id===e.transfer_event_id);
 if(!p||p.type!=='money'||p.operation!=='transfer'||p.actor!==e.actor||p.counterparty!==e.host||p.currency!==e.currency||p.delta!==-e.amount||used.has(p.id))return 'Contribution needs own preceding exact transfer';
 used.add(p.id);return null;
}
export function householdReplayError(e,money){
 return e.player_life_version===1&&e.life_kind==='household_contribution'&&!money.has(e.transfer_event_id)?'Household transfer rejected':null;
}
export function householdView(projection={},actor){
 const rows=projection.worldFacts||[],records=new Map(rows.map(x=>[x.key,x])),page=a=>({records:a.slice(0,40),total:a.length,omitted:Math.max(0,a.length-40)});
 const relevant=new Set(rows.filter(x=>x.life_kind==='household_member'&&x.actor===actor&&['invited','joined'].includes(x.status)).map(x=>x.household_id));
 const homes=rows.filter(x=>x.life_kind==='household'&&(x.actor===actor||relevant.has(x.record_id))).map(x=>({id:x.record_id,title:x.title,host:x.actor,home_kind:x.home_kind,home_id:x.home_id,status:householdAccessible(records,x)?'active':x.status==='closed'?'closed':'access_unconfirmed',members:rows.filter(m=>m.life_kind==='household_member'&&m.household_id===x.record_id&&(x.actor===actor||m.actor===actor||m.status==='joined'&&householdAccessible(records,x)&&rows.some(y=>y.life_kind==='household_member'&&y.household_id===x.record_id&&y.actor===actor&&y.status==='joined'))).map(m=>({id:m.record_id,actor:m.actor,status:m.status==='joined'&&!householdAccessible(records,x)?'access_unconfirmed':m.status,source:m.source})),source:x.source}));
 const contributions=rows.filter(x=>x.life_kind==='household_contribution'&&(x.actor===actor||x.host===actor)).map(x=>({id:x.record_id,household_id:x.household_id,from:x.actor,to:x.host,title:x.title,amount:x.amount,currency:x.currency,source:x.source}));
 const jobs=rows.filter(x=>x.dynamics_kind==='employment'&&(x.actor===actor||x.counterparty===actor)).map(x=>({id:x.record_id,title:x.title,applicant:x.actor,employer:x.counterparty,status:x.status,...(x.actor===actor?jobEligibility(records,x):{status:x.status,requirements_specified:rows.some(r=>r.life_kind==='job_requirement'&&r.employment_id===x.record_id)}),employment_status:x.status,source:x.source}));
 const care=rows.filter(x=>x.life_kind==='care_record'&&x.actor===actor).map(x=>({id:x.record_id,episode_id:x.episode_id,visit_id:x.visit_id,description:x.description,source:x.source}));
 return {homes:page(homes),contributions:page(contributions),jobs:page(jobs),care:page(care),policy:'Household access does not grant ownership or imply residence. Contributions are recorded payments, not a shared balance. Employer sees no private skill or qualification history. Care is not automatic recovery.'};
}
export const HOUSEHOLD_GUIDANCE='СЕМЬЯ, КАРЬЕРА И УХОД: player_life_version=1,record_id,key=player-life:<life_kind>:<ID>,evidence. household: actor=хозяин,title,home_kind=estate/lease,home_id,title_revision (для estate last_sale_id или null),status=active/closed. household_member: actor=приглашённый,host,household_id,status=invited/joined/declined/left/removed,outcome после приглашения; не выбирай за героя, не считай приглашение согласием. При утрате доступа к жилью хозяйство больше не активно; новый титул не восстанавливает его. household_contribution: actor=участник,host,household_id,title,amount>0,currency,transfer_event_id,status=recorded; отдельный точный перевод хозяину, не общий счёт. job_requirement: actor=работодатель,employment_id (offered),qualification_title (необязательно),skills:[{name,level=competent/advanced}] (0–8, хотя бы одно требование),status=active. Перед принятием работы требуются собственные подтверждённые навыки/действующая квалификация; не увольняй автоматически при отзыве. care_record: actor,episode_id (наблюдаемое незавершённое health_episode),visit_id (completed health service_visit),description,status=recorded. Не означает лечение или выздоровление само по себе. Для изменений здоровья — отдельное наблюдение. Семейные обязанности продолжают использовать family_duty/family_event.';
