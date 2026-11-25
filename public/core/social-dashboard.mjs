/** Player-facing social and health continuity. Never exposes incoming private
 * emotional state; an invitation is not acceptance or consent to further acts. */
import {parseStoryDate} from './world-time.mjs';
const valid=(v,n=140)=>typeof v==='string'&&v.trim()===v&&!!v&&v.length<=n;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
const same=(a,b,ks)=>ks.every(k=>a[k]===b[k]);
const exact=x=>{const t=parseStoryDate(x);return t?.precision==='minute'?t.order:null;};
export const SOCIAL_LIFE_KINDS=['invitation','health_episode'];
const inviteTransitions={sent:['accepted','declined','withdrawn'],accepted:['completed','cancelled'],declined:[],withdrawn:[],completed:[],cancelled:[]};
const healthTransitions={observed:['observed','recovering','resolved','worsened'],recovering:['recovering','resolved','worsened'],worsened:['worsened','recovering','resolved'],resolved:[]};
export function socialLifeError(e){
 if(e.life_kind==='invitation'){
  if(!valid(e.actor)||!valid(e.recipient)||e.actor===e.recipient||!valid(e.title,200)||!valid(e.place)||!['meeting','shared_activity','date','family','study','work','other'].includes(e.invite_kind)||exact(e.starts_at)===null||exact(e.ends_at)===null||exact(e.ends_at)<=exact(e.starts_at)||!Object.hasOwn(inviteTransitions,e.status))return 'Invalid social invitation';
  if(e.status==='accepted'||e.status==='completed'||e.status==='cancelled'){
   if(!id(e.appointment_id))return 'Accepted invitation requires confirmed appointment';
  }else if(e.appointment_id!=null)return 'Unaccepted invitation cannot create appointment';
  if(['accepted','declined','withdrawn','completed','cancelled'].includes(e.status)&&!valid(e.outcome,600))return 'Invitation response requires evidenced outcome';
 }else if(e.life_kind==='health_episode'){
  if(!valid(e.actor)||!valid(e.title,200)||!['illness','injury','exhaustion','other'].includes(e.health_kind)||!['mild','moderate','severe','unknown'].includes(e.severity)||!Object.hasOwn(healthTransitions,e.status)||!valid(e.description,600))return 'Invalid observed health episode';
 }
 return null;
}
export function socialLifeTransition(records,e){
 const old=records.get(e.key);
 if(e.life_kind==='invitation'){
  if(!old){if(e.status!=='sent')return 'Invitation must first be sent';}
  else if(!same(old,e,['actor','recipient','title','place','invite_kind','starts_at','ends_at'])||!inviteTransitions[old.status]?.includes(e.status)||old.status==='accepted'&&old.appointment_id!==e.appointment_id)return 'Invalid invitation transition';
  if(e.appointment_id){
   const a=records.get('player-life:appointment:'+e.appointment_id);
   const status={accepted:'confirmed',completed:'completed',cancelled:'cancelled'}[e.status];
   if(!a||a.actor!==e.actor||!a.participants.includes(e.recipient)||!same(a,e,['title','place','starts_at','ends_at'])||a.status!==status)return 'Invitation must match its evidenced appointment';
   if([...records.values()].some(r=>r.life_kind==='invitation'&&r.key!==e.key&&r.appointment_id===e.appointment_id))return 'Appointment already linked to invitation';
  }
 }else if(e.life_kind==='health_episode'){
  if(!old&&e.status!=='observed'||old&&(!same(old,e,['actor','health_kind'])||!healthTransitions[old.status]?.includes(e.status)))return 'Invalid health episode transition';
 }
 return null;
}
const page=records=>({records:records.slice(0,30),total:records.length,omitted:Math.max(0,records.length-30)});
export function socialDashboard(projection={},actor,scenes=[]){
 const records=projection.worldFacts||[],byName=new Map();
 const get=name=>{if(!byName.has(name))byName.set(name,{name,own_attitude:null,bonds:[],recent_interactions:[]});return byName.get(name);};
 for(const r of projection.relationships||[])if(r.a===actor&&r.b!==actor)get(r.b).own_attitude={stance:r.stance??null,fields:(r.relationship_fields||[]).map(x=>({field:x.field,value:x.value,source:x.source})),source:r.source};
 for(const b of records)if(b.dynamics_version===1&&b.dynamics_kind==='bond'&&(b.actor===actor||b.counterparty===actor)){
  const other=b.actor===actor?b.counterparty:b.actor;get(other).bonds.push({id:b.record_id,kind:b.bond_type,status:b.status,source:b.source});
 }
 const accepted=new Set((projection.relationship_history||[]).map(x=>JSON.stringify([x.source.scene_id,x.source.event_id])));
 for(let i=scenes.length-1;i>=0;i--)for(const e of [...(scenes[i].events||[])].reverse()){
  if(e.type!=='world'||e.interaction_version!==1||!e.actors?.includes(actor)||!accepted.has(JSON.stringify([scenes[i].id,e.id])))continue;
  for(const other of e.actors.filter(x=>x!==actor)){
   const row=get(other);if(row.recent_interactions.length<3)row.recent_interactions.push({kind:e.interaction_kind,place:e.place??null,description:e.description,source:{scene_id:scenes[i].id,event_id:e.id,world_time:scenes[i].world_time??null}});
  }
 }
 const invites=records.filter(x=>x.player_life_version===1&&x.life_kind==='invitation'&&(x.actor===actor||x.recipient===actor)).map(x=>({id:x.record_id,from:x.actor,to:x.recipient,title:x.title,kind:x.invite_kind,place:x.place,starts_at:x.starts_at,ends_at:x.ends_at,status:x.status,appointment_id:x.appointment_id??null,outcome:x.outcome??null,source:x.source}));
 const health=records.filter(x=>x.player_life_version===1&&x.life_kind==='health_episode'&&x.actor===actor).map(x=>({id:x.record_id,title:x.title,kind:x.health_kind,severity:x.severity,status:x.status,description:x.description,source:x.source}));
 return {contacts:page([...byName.values()]),invitations:{incoming:page(invites.filter(x=>x.to===actor)),outgoing:page(invites.filter(x=>x.from===actor))},health:page(health),policy:'Own attitudes, recorded shared bonds, participated episodes and delivered invitations only. Health states are fictional observations, never a diagnosis or timer. Missing data is unknown.'};
}
export const SOCIAL_DASHBOARD_GUIDANCE='ОТНОШЕНИЯ И ЗДОРОВЬЕ: social_dashboard — свои отношения и состоявшиеся совместные эпизоды, без скрытых чувств других. invitation (player_life_version=1, key=player-life:invitation:<ID>, record_id, actor=приглашающий,recipient,title,place,invite_kind=meeting/shared_activity/date/family/study/work/other,starts_at/ends_at, status=sent/accepted/declined/withdrawn/completed/cancelled, evidence). Ответ требует outcome; accepted требует предшествующую подтверждённую appointment с теми же условиями, завершение/отмена — соответствующее состояние встречи. Не подменяй согласие другого героя приглашением, не приписывай игроку ответ. Приглашения не означают согласия на последующие действия. health_episode: actor,title,health_kind=illness/injury/exhaustion/other,severity=mild/moderate/severe/unknown,status=observed/recovering/worsened/resolved,description,evidence. Только сыгранные наблюдения, без автоматического диагноза, лечения или выздоровления. Изменение физического состояния записывай также обычным character patch, когда это установлено сценой.';
