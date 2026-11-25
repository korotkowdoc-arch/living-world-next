/** Evidence-backed long-lived NPC profiles and staged time review.
 * Uses existing canonical events; no new event format or simulated outcomes. */
import {parseStoryDate} from './world-time.mjs';
const clip=(x,n=180)=>typeof x==='string'?x.slice(0,n):null;
const key=(...xs)=>JSON.stringify(xs);
const active=s=>['active','planned','ongoing','open','in_progress','scheduled','accepted','confirmed','working'].includes(s);
const DAY=1440;
const validName=x=>typeof x==='string'&&!!x.trim();
const page=(rows,limit)=>({records:rows.slice(0,limit),total:rows.length,omitted:Math.max(0,rows.length-limit)});
const title=r=>clip(r.title||r.name||r.goal||r.description||r.activity||r.evidence);
const actors=r=>[...new Set([r.actor,r.counterparty,...(r.actors||[])].filter(validName))];
const date=x=>parseStoryDate(x);
const elapsedDays=(a,b)=>a&&b&&a.day<=b.day?Math.floor(b.order/DAY)-Math.floor(a.order/DAY):null;
export function buildLongLifeIndex(scenes=[],projection={}, {complete=true}={}){
 const positions=new Map(scenes.map((s,i)=>[s.id,i])),dates=new Map(scenes.map(s=>[s.id,date(s.world_time)]));
 const records=(projection.worldFacts||[]).filter(r=>positions.has(r.source?.scene_id)),byKey=new Map(records.map(r=>[r.key,r]));
 const profiles=new Map(),groups=new Map(),memberGroups=new Map(),interestPeers=new Map();
 const get=a=>{if(!profiles.has(a))profiles.set(a,{interests:[],goals:[],threads:[],circles:[],experience:[],causes:[],last:null});return profiles.get(a);};
 const add=(a,category,r)=>{if(!validName(a)||!positions.has(r.source?.scene_id))return;const p=get(a);p[category].push(r);if(!p.last||positions.get(p.last.scene_id)<positions.get(r.source.scene_id))p.last=r.source;};
 const compact=(r,kind,extra={})=>({kind,key:r.key??r.plan_id??r.commitment_id??null,title:title(r),status:r.status??null,source:r.source,...extra});
 for(const p of projection.people||[]){
  if(!validName(p.name))continue;get(p.name);
  for(const f of p.state_fields||[]){
   if(!validName(f.value)||!positions.has(f.source?.scene_id))continue;
   if(['preference','aversion','habit'].includes(f.field))add(p.name,'interests',{kind:f.field,title:clip(f.value),status:'recorded',source:f.source});
   if(['personal_goal','career_goal','family_goal'].includes(f.field))add(p.name,'goals',{kind:f.field,title:clip(f.value),status:'recorded_goal',source:f.source});
  }
 }
 for(const r of records)if(r.social_record_version===1&&r.social_kind==='group')groups.set(r.record_id,r);
 for(const r of records){
  if(r.activity_version===1&&r.activity_kind==='habit')add(r.actor,'interests',compact(r,'habit',{frequency:clip(r.frequency),description:clip(r.description)}));
  if(r.growth_version===1&&r.growth_kind==='skill')add(r.actor,'interests',compact(r,'skill_not_necessarily_interest',{description:clip(r.description)}));
  if(r.growth_version===1&&r.growth_kind==='project')add(r.actor,'goals',compact(r,'project',{due_at:r.due_at??null,next_step:clip(r.next_step),obstacle:clip(r.obstacle)}));
  if(r.social_record_version===1&&r.social_kind==='thread')for(const a of r.actors||[])add(a,'threads',compact(r,'thread',{description:clip(r.description),participants:(r.actors||[]).slice(0,12)}));
  if(r.social_record_version===1&&r.social_kind==='membership'){
   const g=groups.get(r.group_id);
   if(g){add(r.actor,'circles',compact(r,'membership',{group_id:r.group_id,title:clip(g.name),group_status:g.status,role:clip(r.role),group_source:g.source}));if(r.status==='member'&&g.status==='active'){if(!memberGroups.has(r.group_id))memberGroups.set(r.group_id,new Set());memberGroups.get(r.group_id).add(r.actor);}}
  }
  if(r.dynamics_version===1&&r.dynamics_kind==='bond'){
   for(const a of actors(r))add(a,'circles',compact(r,'bond',{other:a===r.actor?r.counterparty:r.actor,bond_type:r.bond_type}));
  }
  if(r.dynamics_version===1&&r.dynamics_kind==='employment')for(const a of actors(r))add(a,'circles',compact(r,'employment',{other:a===r.actor?r.counterparty:r.actor,role:a===r.actor?'employee':'employer'}));
  if(r.dynamics_version===1&&['life_transition','development','family_event'].includes(r.dynamics_kind)){
   for(const a of actors(r))add(a,'goals',compact(r,r.dynamics_kind,{due_at:r.due_at??null,outcome:clip(r.outcome)}));
  }
  if(r.player_life_version===1&&r.life_kind==='shared_goal')add(r.actor,'goals',compact(r,'shared_goal',{due_at:r.due_at??null}));
  if(r.player_life_version===1&&r.life_kind==='shared_goal_member'&&r.status==='accepted'){
   const g=byKey.get('player-life:shared_goal:'+r.goal_id);
   if(g)add(r.actor,'goals',compact(r,'shared_goal_member',{title:title(g),status:g.status,due_at:g.due_at??null,goal_source:g.source}));
  }
  const completed=r.activity_version===1&&r.activity_kind==='activity'&&r.status==='completed'||r.dynamics_version===1&&['family_event','life_transition','development','production_order'].includes(r.dynamics_kind)&&r.status==='completed'||r.player_life_version===1&&(['service_visit','appointment','shared_goal','career_change','care_plan'].includes(r.life_kind)&&r.status==='completed'||r.life_kind==='work_shift'&&r.status==='worked'||r.life_kind==='lesson'&&r.status==='attended');
  if(completed){
   const participants=new Set([...actors(r),...(r.participants||[]),r.life_kind==='service_visit'?r.provider:null,r.life_kind==='work_shift'?r.employer:null].filter(validName));
   for(const a of participants)add(a,'experience',compact(r,r.life_kind||r.dynamics_kind||r.activity_kind,{outcome:clip(r.outcome),place:clip(r.place)}));
  }
 }
 for(const r of projection.plans||[])add(r.actor,'goals',compact(r,'plan',{due_at:r.due_at??r.deadline??r.due??null,next_step:clip(r.next_step),obstacle:clip(r.obstacle)}));
 for(const r of projection.obligations||[])add(r.actor,'goals',compact(r,'commitment',{due_at:r.due_at??r.deadline??r.due??null}));
 for(const r of projection.offscreen||[])for(const a of actors(r))add(a,'experience',compact(r,'offscreen',{place:clip(r.place)}));
 for(const r of projection.relationships||[])add(r.a,'circles',{kind:'own_relationship',other:r.b,title:clip(r.stance),status:'recorded',source:r.source});
 const accepted=new Set((projection.relationship_history||[]).map(r=>key(r.source?.scene_id,r.source?.event_id)));
 for(const s of scenes)for(const e of s.events||[]){
  if(e.type!=='world'||e.interaction_version!==1||!accepted.has(key(s.id,e.id)))continue;
  for(const a of e.actors||[])add(a,'experience',{kind:e.interaction_kind,title:clip(e.description),participants:(e.actors||[]).slice(0,12),outcome:clip(e.outcome),place:clip(e.place),source:{scene_id:s.id,event_id:e.id,world_time:s.world_time??null}});
 }
 for(const r of records)if(r.growth_version===1&&r.growth_kind==='cause'){
  const from=byKey.get(r.from_key),to=byKey.get(r.to_key);if(!from||!to)continue;
  // A claimed/disputed cause remains that actor's claim; no knowledge propagation.
  const participants=r.status==='established'?new Set([...actors(from),...actors(to),r.actor].filter(validName)):new Set([r.actor].filter(validName));
  for(const a of participants)add(a,'causes',compact(r,'cause',{description:clip(r.description),from_key:r.from_key,to_key:r.to_key,from_source:from.source,to_source:to.source}));
 }
 const recent=(a,b)=>(positions.get(b.source.scene_id)??-1)-(positions.get(a.source.scene_id)??-1);
 for(const [a,p] of profiles){
  for(const cat of ['interests','goals','threads','circles','experience','causes'])p[cat].sort(recent);
  for(const r of p.interests)if((r.kind==='habit'&&r.status==='active'||r.kind==='preference')&&r.title&&r.title.length<180){
   // Exact recorded text only. Skills alone do not imply a hobby.
   if(!interestPeers.has(r.title))interestPeers.set(r.title,new Map());
   const peers=interestPeers.get(r.title);if(!peers.has(a))peers.set(a,r);
  }
 }
 const view=(actor,{clock=null,limit=8}={})=>{
  const p=profiles.get(actor),at=date(clock);
  if(!complete)return {actor,memory_complete:false,policy:'Incomplete history; no long-term inference.'};
  if(!p)return {actor,memory_complete:true,interests:page([],limit),goals:page([],limit),threads:page([],limit),circles:page([],limit),experience:page([],limit),causes:page([],limit),last_recorded_activity:null};
  const circles=p.circles.map(r=>r.kind==='membership'?{...r,recorded_active_members:memberGroups.get(r.group_id)?.size??0}:r);
  return {actor,memory_complete:true,interests:page(p.interests,limit),goals:page([...p.goals.filter(r=>active(r.status)||r.status==='recorded_goal'),...p.goals.filter(r=>!active(r.status)&&r.status!=='recorded_goal')],limit),threads:page([...p.threads.filter(r=>r.status==='open'),...p.threads.filter(r=>r.status!=='open')],limit),circles:page(circles,limit),experience:page(p.experience,limit),causes:page(p.causes,limit),last_recorded_activity:p.last,calendar_days_since_record:elapsedDays(dates.get(p.last?.scene_id),at),policy:'Narrator memory, not character knowledge. Gaps do not prove inactivity. Skills, membership, shared interests and causal claims do not imply feelings, attendance, consent or actual progress.'};
 };
 const opportunities=()=>{
  if(!complete)return [];
  const result=[];
  const aversionsByActor=new Map([...profiles].map(([a,p])=>[a,new Set(p.interests.filter(i=>i.kind==='aversion').map(i=>i.title))]));
  for(const [actor,p] of profiles){
   const goals=new Set([...p.goals,...p.threads].map(g=>g.title).filter(Boolean));
   const aversions=new Set(p.interests.filter(i=>i.kind==='aversion').map(i=>i.title));
   const interest=p.interests.find(i=>i.kind==='preference'&&i.title&&!goals.has(i.title)&&!aversions.has(i.title));
   if(interest)result.push({kind:'interest_project',row:{actor,key:key('interest_project',actor,interest.title),title:interest.title,status:'opportunity',source:interest.source},info:{record_key:key(actor,'preference'),long_life:{interest:interest.title},timing:'requires_character_choice',guidance:'Consider a concrete independent hobby or project only if the character chooses it in the story. No automatic plan, skill or progress.'}});

  }
  // At most one candidate per actor from shared recorded interests, no quadratic pairs.
  const seen=new Set();
  const relations=new Map((projection.relationships||[]).map(r=>[key(r.a,r.b),r]));
  const blocked=(a,b)=>[relations.get(key(a,b)),relations.get(key(b,a))].some(r=>r?.relationship_fields?.some(f=>f.field==='boundary'&&['distance','no_contact'].includes(f.value)));
  const pending=new Set();
  for(const r of records){if(r.life_kind==='invitation'&&['sent','accepted'].includes(r.status)){pending.add(key(r.actor,r.recipient));pending.add(key(r.recipient,r.actor));}if(r.life_kind==='appointment'&&['proposed','confirmed'].includes(r.status)){const members=(r.participants||[]).slice(0,12);for(const a of members)for(const b of members)if(a!==b)pending.add(key(a,b));}}
  for(const [interest,peers] of interestPeers){
   if(peers.size<2)continue;
   const sample=[...peers].slice(0,8);
   for(const [actor,r] of peers){
    if(seen.has(actor)||aversionsByActor.get(actor).has(interest))continue;
    const other=sample.find(([b])=>b!==actor&&!blocked(actor,b)&&!pending.has(key(actor,b))&&!aversionsByActor.get(b).has(interest));
    if(!other)continue;seen.add(actor);
    result.push({kind:'shared_interest',row:{actor,counterparty:other[0],key:key('shared_interest',actor,interest),title:interest,status:'opportunity',source:r.source},info:{record_key:r.key??key(actor,'preference'),long_life:{interest,other:other[0],other_source:other[1].source},timing:'requires_character_choice',guidance:'Narrator-only matching recorded interests; neither character automatically knows this about the other. Establish an actual encounter and willingness before joint activity.'}});
   }
  }
  return result;
 };
 return {view,opportunities,actors:[...profiles.keys()]};
}
/** Long jumps are a sequence of pinned reviews, never prewritten outcomes.
 * Only candidates whose explicit date falls in this segment enter its due list. */
export function backgroundTimeReview(candidates=[],{clock,target,segmentUntil,protectedActors=[],complete=true,pace='dynamic',pending=false}={}){
 const from=date(clock),to=date(target),stop=date(segmentUntil),protectedSet=new Set(protectedActors);
 if(!complete||!protectedSet.size||!from||!to||from.precision!=='minute'||to.precision!=='minute'||to.order<=from.order)return null;
 if(pending)return {status:'player_choice_pending',from:from.literal,target:to.literal,segments:[],policy:'Answer the current choice first.'};
 const cap={slow:120,normal:480,dynamic:1440,fast:4320}[pace]??1440;
 const end=Math.min(to.order,from.order+cap,stop?.order??Infinity);
 const literal=n=>new Date(n*60000).toISOString().slice(0,16).replace('T',' ');
 const due=[],later=[],recurring=[],optional=[];
 for(const c of candidates){
  const actor=c.actors?.[0];if(!actor||protectedSet.has(actor))continue;
  const row={actor,kind:c.kind,key:c.key,title:clip(c.title),source:c.source};
  const raw=c.review_at??c.starts_at??c.due_at??c.first_due_on??null,t=date(raw);
  if(t&&t.order<=end)due.push({...row,at:t.literal,precision:t.precision});
  else if(t&&t.order<=to.order)later.push({...row,at:t.literal,precision:t.precision});
  else if(c.timing==='scheduled_window_not_presence'||c.kind==='routine')recurring.push(row);
  else if(c.timing!=='future'&&!t)optional.push(row);
 }
 const sort=(a,b)=>date(a.at).order-date(b.at).order||String(a.key).localeCompare(String(b.key));
 due.sort(sort);later.sort(sort);
 const days=elapsedDays(from,to),remaining=to.order-end;
 return {status:end<=from.order?'review_now':'segment_proposed',from:from.literal,target:to.literal,segment_until:literal(Math.max(from.order,end)),remaining_minutes:remaining,calendar_days_requested:days,minimum_remaining_segments:Math.ceil(remaining/cap),due:page(due,12),later:page(later,8),recurring:page(recurring,8),optional:page(optional,8),policy:'Review only this segment; narrate actual independent events and save them with evidence, then recompute from the new head. Do not mark all recurring obligations performed or invent months of completed history.'};
}
