/** Recorded campus, cultural and sporting events. Scheduling, invitations,
 * attendance, results and reception are independent. No automatic participation. */
import {parseStoryDate} from './world-time.mjs';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const txt=(x,n=140)=>typeof x==='string'&&x.trim()===x&&!!x&&x.length<=n;
const one=(x,v)=>v.includes(x);
const same=(a,b,keys)=>keys.every(k=>(a[k]??null)===(b[k]??null));
const get=(r,k,i)=>r.get('player-life:'+k+':'+i);
const page=records=>({records:records.slice(0,30),total:records.length,omitted:Math.max(0,records.length-30)});
const kinds=['sport','club','lecture','research','festival','performance','exhibition','social','other'];
const teams=e=>e.home_group_id!=null||e.away_group_id!=null;
const exact=x=>{const t=parseStoryDate(x);return t?.precision==='minute'?t.order:null;};
const score=x=>Number.isSafeInteger(x)&&x>=0&&x<=1000000;
const group=(r,i)=>r.get('social:group:'+i);
const member=(r,g,a)=>{const x=[...r.values()].filter(x=>x.social_record_version===1&&x.social_kind==='membership'&&x.group_id===g&&x.actor===a);return group(r,g)?.status==='active'&&x.length===1&&x[0].status==='member';};
export const COMMUNITY_KINDS=['community_event','community_participation','community_result','community_report'];
export function communityError(e){
 if(!txt(e.actor))return 'Invalid community actor';
 switch(e.life_kind){
 case 'community_event':{
  const a=exact(e.starts_at),b=exact(e.ends_at);
  if(!id(e.group_id)||!txt(e.title,200)||!txt(e.description,1000)||!txt(e.place)||!one(e.event_kind,kinds)||a===null||b===null||a>=b||!Number.isSafeInteger(e.capacity)||e.capacity<1||e.capacity>5000||!one(e.status,['scheduled','in_progress','completed','cancelled']))return 'Invalid community event';
  if(e.institution_id!=null&&!id(e.institution_id)||e.series!=null&&!txt(e.series,140)||teams(e)&&(e.event_kind!=='sport'||!id(e.home_group_id)||!id(e.away_group_id)||e.home_group_id===e.away_group_id))return 'Invalid institution or sport teams';
  if(one(e.status,['completed','cancelled'])?!txt(e.outcome,600):e.outcome!=null)return 'Explicit event outcome required';break;
 }
 case 'community_participation':
  if(!id(e.event_id)||!txt(e.organizer)||e.organizer===e.actor||!one(e.role,['guest','member','athlete','performer','speaker','staff','spectator'])||!one(e.status,['invited','accepted','declined','withdrawn','attended','missed','cancelled'])||e.team_id!=null&&(!id(e.team_id)||e.role!=='athlete')||(e.status==='invited'?e.outcome!=null:!txt(e.outcome,600)))return 'Invalid community participation';break;
 case 'community_result':
  if(!id(e.event_id)||!txt(e.description,1200)||e.status!=='recorded'||(e.home_score!=null||e.away_score!=null)&&(!score(e.home_score)||!score(e.away_score)))return 'Invalid community result';break;
 case 'community_report':
  if(!id(e.result_id)||!id(e.event_id)||!txt(e.reporter)||e.reporter===e.actor||!txt(e.description,1200)||e.status!=='received'||(e.home_score!=null||e.away_score!=null)&&(!score(e.home_score)||!score(e.away_score)))return 'Invalid community report';break;
 }
 return null;
}
export function communityTransition(records,e){
 const old=records.get(e.key),rows=[...records.values()],k=e.life_kind;
 const exists=(kind,fn)=>rows.some(r=>r.life_kind===kind&&r.key!==e.key&&fn(r));
 if(k==='community_event'){
  if(!member(records,e.group_id,e.actor))return 'Event needs current organizing membership';
  if(e.institution_id!=null){const i=records.get('dynamics:institution:'+e.institution_id);if(i?.group_id!==e.group_id||i.status!=='operating')return 'Event institution must be operating and match group';}
  if(teams(e)&&(!group(records,e.home_group_id)||!group(records,e.away_group_id)))return 'Sport teams must be established groups';
  if(!old){if(e.status!=='scheduled')return 'Schedule the event first';}
  else {
   const steps={scheduled:['in_progress','cancelled'],in_progress:['completed','cancelled']};
   if(!same(old,e,['actor','group_id','institution_id','title','description','place','event_kind','starts_at','ends_at','capacity','series','home_group_id','away_group_id'])||!steps[old.status]?.includes(e.status))return 'Event identity, schedule and capacity are immutable; cancel and schedule a new event';
  }
 }else if(k==='community_participation'){
  const event=get(records,'community_event',e.event_id);
  if(!event||event.actor!==e.organizer)return 'Participation needs matching organizer and event';
  if(!old){
   if(e.status!=='invited'||event.status!=='scheduled'||!member(records,event.group_id,event.actor)||exists(k,r=>r.event_id===e.event_id&&r.actor===e.actor&&!one(r.status,['declined','withdrawn','cancelled'])))return 'Invite once to an actual scheduled event';
   if(e.team_id!=null&&(![event.home_group_id,event.away_group_id].includes(e.team_id)||!member(records,e.team_id,e.actor)))return 'Athlete must belong to the recorded team';
   if(e.role==='member'&&!member(records,event.group_id,e.actor))return 'Member invitation needs membership';
  }else{
   const steps={invited:['accepted','declined','cancelled'],accepted:['withdrawn','attended','missed','cancelled']};
   if(!same(old,e,['actor','event_id','organizer','role','team_id'])||!steps[old.status]?.includes(e.status))return 'Invalid participation transition';
   if(e.status==='accepted'){
    if(event.status!=='scheduled'||e.team_id!=null&&!member(records,e.team_id,e.actor))return 'Acceptance requires scheduled event and eligible team';
    const reserved=rows.filter(r=>r.life_kind===k&&r.event_id===e.event_id&&one(r.status,['accepted','attended'])).length;
    if(reserved>=event.capacity)return 'No recorded event capacity remaining';
   }
   if(e.status==='attended'&&!one(event.status,['in_progress','completed'])||e.status==='missed'&&event.status!=='completed'||e.status==='cancelled'&&event.status!=='cancelled')return 'Participation outcome must match actual event stage';
   if(one(e.status,['declined','withdrawn'])&&event.status!=='scheduled')return 'Cannot revise RSVP after event begins';
  }
 }else if(k==='community_result'){
  const event=get(records,'community_event',e.event_id);
  if(old||!event||event.status!=='completed'||event.actor!==e.actor||!member(records,event.group_id,e.actor)||exists(k,r=>r.event_id===e.event_id))return 'One distinct result after actual event completion';
  if(teams(event)?!score(e.home_score)||!score(e.away_score):e.home_score!=null||e.away_score!=null)return 'Score requires recorded teams and completed match';
 }else if(k==='community_report'){
  const result=get(records,'community_result',e.result_id),event=get(records,'community_event',e.event_id);
  if(old||!result||!event||result.event_id!==e.event_id||result.actor!==e.reporter||(e.home_score!=null||e.away_score!=null)&&(e.home_score!==result.home_score||e.away_score!==result.away_score)||exists(k,r=>r.result_id===e.result_id&&r.actor===e.actor))return 'Report needs one actual communicated result from its recorder';
 }
 return null;
}
/** Windows for agreed attendance and the organizer, not invitations.
 * No external calendar, no generated time advancement. */
export function communityWindows(projection={},actor=null){
 const rows=projection.worldFacts||[],events=new Map(rows.filter(r=>r.player_life_version===1&&r.life_kind==='community_event'&&r.source?.scene_id).map(r=>[r.record_id,r])),out=[];
 for(const e of events.values())if(one(e.status,['scheduled','in_progress'])&&(actor==null||e.actor===actor))out.push({...e,window_actor:e.actor,window_id:'event:'+e.record_id,window_source:e.source});
 for(const r of rows)if(r.life_kind==='community_participation'&&r.status==='accepted'&&(actor==null||actor===r.actor)&&events.has(r.event_id)&&r.source?.scene_id){
  const e=events.get(r.event_id);if(actor==null&&!one(e.status,['scheduled','in_progress']))continue;out.push({...e,status:actor==null?e.status:r.status,window_actor:r.actor,window_id:'participation:'+r.record_id,window_source:r.source});
 }
 return out;
}
export function communityIndex(projection={}, {complete=true}={}){
 const rows=(projection.worldFacts||[]).filter(r=>r.source?.scene_id),records=new Map(rows.map(r=>[r.key,r]));
 const by=k=>rows.filter(r=>r.player_life_version===1&&r.life_kind===k);
 const events=by('community_event'),participants=by('community_participation'),results=by('community_result'),reports=by('community_report');
 const summary=e=>({id:e.record_id,title:e.title,event_kind:e.event_kind,group_id:e.group_id,place:e.place,starts_at:e.starts_at,ends_at:e.ends_at,series:e.series??null,home_group_id:e.home_group_id??null,away_group_id:e.away_group_id??null});
 const ownResult=r=>({id:r.record_id,event_id:r.event_id,description:r.description,home_score:r.home_score??null,away_score:r.away_score??null,source:r.source});
 const view=actor=>{
  if(!complete)return {memory_complete:false};
  const ownEvents=events.filter(e=>e.actor===actor),received=reports.filter(r=>r.actor===actor);
  const matches=results.filter(r=>r.actor===actor||received.some(x=>x.result_id===r.record_id)).map(r=>({result:r,event:get(records,'community_event',r.event_id),report:received.find(x=>x.result_id===r.record_id)}));
  const tables=new Map();
  for(const {result:r,event:e,report} of matches){
   if(!e||!teams(e)||!e.series||!score(r.home_score)||!score(r.away_score)||r.actor!==actor&&(!score(report?.home_score)||!score(report?.away_score)))continue;
   const k=JSON.stringify([e.group_id,e.series]);if(!tables.has(k))tables.set(k,{group_id:e.group_id,series:e.series,teams:new Map(),matches:0});const t=tables.get(k);t.matches++;
   for(const [g,points,against] of [[e.home_group_id,r.home_score,r.away_score],[e.away_group_id,r.away_score,r.home_score]]){
    const v=t.teams.get(g)||{group_id:g,played:0,won:0,drawn:0,lost:0,score_for:0,score_against:0};v.played++;v.won+=Number(points>against);v.drawn+=Number(points===against);v.lost+=Number(points<against);v.score_for+=points;v.score_against+=against;t.teams.set(g,v);
   }
  }
  return {memory_complete:true,groups:page(rows.filter(r=>r.social_record_version===1&&r.social_kind==='membership'&&r.actor===actor&&member(records,r.group_id,actor)).map(r=>({id:r.group_id,title:group(records,r.group_id)?.name??r.group_id,role:r.role??null,source:r.source}))),
   organized:page(ownEvents.map(e=>({...summary(e),description:e.description,status:e.status,capacity:e.capacity,accepted:participants.filter(p=>p.event_id===e.record_id&&one(p.status,['accepted','attended'])).length,outcome:e.outcome??null,source:e.source}))),
   participation:page(participants.filter(r=>r.actor===actor).map(r=>{const e=get(records,'community_event',r.event_id);return {id:r.record_id,event_id:r.event_id,title:e?.title??r.event_id,event_kind:e?.event_kind??null,organizer:r.organizer,role:r.role,team_id:r.team_id??null,starts_at:e?.starts_at??null,ends_at:e?.ends_at??null,place:e?.place??null,status:r.status,description:e?.description??null,source:r.source};})),
   results:page(matches.map(({result:r,event:e,report})=>({...ownResult(r),title:e?.title??null,description:r.actor===actor?r.description:report.description,home_score:r.actor===actor?r.home_score??null:report.home_score??null,away_score:r.actor===actor?r.away_score??null:report.away_score??null,source:r.actor===actor?r.source:report.source}))),
   standings:page([...tables.values()].map(t=>({group_id:t.group_id,series:t.series,recorded_matches:t.matches,teams:[...t.teams.values()].sort((a,b)=>b.won-a.won||b.drawn-a.drawn||a.group_id.localeCompare(b.group_id)),coverage:'known_results_only_not_official_ranking'}))),
   policy:'Only organized events, own invitations and actually received reports. Known match summaries are partial statistics, not official ranking. Cancellation is not known to a participant until separately communicated.'};
 };
 const opportunities=()=>{
  if(!complete)return [];
  const out=[],add=(kind,actor,e,r,context,guidance,timing='requires_character_choice')=>out.push({kind,row:{actor,key:JSON.stringify([kind,e.record_id,actor,r.record_id]),title:e.title,status:r.status,place:e.place,source:r.source},info:{record_key:r.key,timing,community:context,guidance}});
  for(const e of events){
   if(one(e.status,['scheduled','in_progress']))add('community_organize',e.actor,e,e,{event_id:e.record_id,starts_at:e.starts_at,ends_at:e.ends_at,capacity:e.capacity},'Review actual event preparation, membership, venue access and timing. Do not perform or complete automatically.');
   if(e.status==='completed'&&!results.some(r=>r.event_id===e.record_id))add('community_record_result',e.actor,e,e,{event_id:e.record_id},'Record only the actual event outcome; never invent a match score.');
  }
  for(const p of participants){
   const e=get(records,'community_event',p.event_id);if(!e)continue;
   if(p.status==='invited'&&e.status==='scheduled')add('community_rsvp',p.actor,e,p,{event_id:e.record_id,participation_id:p.record_id,role:p.role},'Choose an independent RSVP using known invitation and interests; never answer for player.');
   if(p.status==='accepted'&&one(e.status,['scheduled','in_progress']))add('community_attendance',p.actor,e,p,{event_id:e.record_id,participation_id:p.record_id,starts_at:e.starts_at,ends_at:e.ends_at},'Review known schedule and travel; acceptance is not attendance.');
   if(one(p.status,['invited','accepted'])&&e.status==='cancelled')add('community_cancel_notice',e.actor,e,p,{event_id:e.record_id,participant:p.actor,participation_id:p.record_id},'Actually communicate cancellation before recording cancelled participation.');
  }
  return out;
 };
 return {view,opportunities};
}
export const COMMUNITY_ACTIONS=Object.freeze({community_schedule:'Организовать мероприятие',community_invite:'Пригласить участника',community_manage:'Провести или отменить мероприятие',community_record_result:'Записать результат',community_rsvp:'Ответить на приглашение',community_attend:'Посетить мероприятие'});
export function communityTargets(action,v){
 if(!v?.memory_complete)return [];
 if(action==='community_schedule')return v.groups.records;
 if(action==='community_invite')return v.organized.records.filter(e=>e.status==='scheduled');
 if(action==='community_manage')return v.organized.records.filter(e=>one(e.status,['scheduled','in_progress']));
 if(action==='community_record_result')return v.organized.records.filter(e=>e.status==='completed'&&!v.results.records.some(r=>r.event_id===e.id));
 if(action==='community_rsvp')return v.participation.records.filter(e=>one(e.status,['invited','accepted']));
 if(action==='community_attend')return v.participation.records.filter(e=>e.status==='accepted');
 return [];
}
export function validateCommunityAction(input,overview){
 if(!Object.hasOwn(COMMUNITY_ACTIONS,input.action))return;
 if(!id(input.community_record_id)||!communityTargets(input.action,overview.community).some(r=>r.id===input.community_record_id))throw Error('Community record unavailable in player view');
}
export const COMMUNITY_GUIDANCE='КЛУБЫ, СПОРТ И КУЛЬТУРА: player_life_version=1, record_id, key=player-life:<life_kind>:<ID>, evidence. community_event: actor=организатор,group_id (активное членство),опционально institution_id,title,description,place,event_kind=sport/club/lecture/research/festival/performance/exhibition/social/other,starts_at/ends_at точные минуты,capacity 1–5000,опционально series и home_group_id/away_group_id (две существующие команды для sport),status=scheduled/in_progress/completed/cancelled,outcome при завершении/отмене; условия фиксированы. community_participation: actor=приглашённый,organizer,event_id,role=guest/member/athlete/performer/speaker/staff/spectator,team_id опционально для athlete, status=invited/accepted/declined/withdrawn/attended/missed/cancelled,outcome после приглашения. Согласие и посещение отдельно, вместимость ограничивает accepted. community_result: actor=организатор,event_id,description,status=recorded,home_score/away_score целые неотрицательные только для матча команд; один результат после completed. community_report: actor=получатель,reporter=автор результата,result_id,event_id,description,status=received; отдельно фактическое сообщение. home_score/away_score только если именно счёт сообщён, совпадает с сохранённым результатом. Никакой автоматической явки, победы, знаний или списания денег. Плата через отдельные существующие service/money события. Календарь отражает согласованные записи; известная статистика не официальный рейтинг.';
