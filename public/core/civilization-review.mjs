import {communityWindows} from './community-life.mjs';
/** Read-only cross-system coordination on the active canonical ancestry.
 * No wall clock, no automatic debt, no NPC/player action and no inferred attendance.
 * This is narrator-only; never copy private rows to the player-facing menu. */
import {parseStoryDate} from './world-time.mjs';
import {paymentScheduleWindow} from './world-dynamics.mjs';
const clip=v=>typeof v==='string'?v.slice(0,180):null;
const names=xs=>[...new Set(xs.filter(x=>typeof x==='string'&&x.trim()))];
const key=(...xs)=>JSON.stringify(xs);
const byDate=(a,b)=>a.order-b.order||String(a.key).localeCompare(String(b.key));
const page=(rows,limit)=>({total:rows.length,records:rows.slice(0,limit),omitted:Math.max(0,rows.length-limit)});
const exact=v=>{const d=parseStoryDate(v);return d?.precision==='minute'?d:null;};
const scheduledKinds={lesson:['scheduled'],assessment:['scheduled'],work_shift:['scheduled','working'],appointment:['confirmed']};
function scheduleRows(records,from,to){
 const out=[],seen=new Set();
 for(const r of records){
  if(r.player_life_version!==1||!Object.hasOwn(scheduledKinds,r.life_kind)||!scheduledKinds[r.life_kind].includes(r.status)||!r.source?.scene_id)continue;
  const a=exact(r.starts_at),b=exact(r.ends_at);
  if(!a||!b||b.order<=a.order||b.order<=from.order||a.order>to.order)continue;
  // Employers are not automatically attending each worker's shift.
  const actors=r.life_kind==='appointment'?names(r.participants||[]):r.life_kind==='lesson'?names([r.actor,r.teacher]):names([r.actor]);
  for(const actor of actors){
   const id=key(actor,r.key);if(seen.has(id))continue;seen.add(id);
   out.push({actor,key:r.key,kind:r.life_kind,title:clip(r.title),place:clip(r.place),starts_at:a.literal,ends_at:b.literal,order:a.order,end:b.order,source:r.source});
  }
 }
 for(const e of communityWindows({worldFacts:records})){
  const a=exact(e.starts_at),b=exact(e.ends_at);if(!a||!b||b.order<=a.order||b.order<=from.order||a.order>to.order)continue;
  out.push({actor:e.window_actor,key:e.window_id,kind:'community_event',title:clip(e.title),place:clip(e.place),starts_at:a.literal,ends_at:b.literal,order:a.order,end:b.order,source:e.window_source});
 }
 return out;
}
function conflicts(rows){
 const groups=new Map(),out=[];
 for(const r of rows){if(!groups.has(r.actor))groups.set(r.actor,[]);groups.get(r.actor).push(r);}
 for(const list of groups.values()){
  list.sort(byDate);let longest=null;
  // A sweep reports one real overlapping counterpart for each later window,
  // not every pair. Complexity stays bounded even for crowded calendars.
  for(const row of list){
   if(longest&&longest.end>row.order){
    const item=x=>({key:x.key,kind:x.kind,title:x.title,place:x.place,starts_at:x.starts_at,ends_at:x.ends_at,source:x.source});
    out.push({actor:row.actor,first:item(longest),second:item(row),overlap_minutes:Math.min(longest.end,row.end)-row.order,order:row.order,key:row.key,certainty:'overlapping_recorded_windows_not_attendance'});
   }
   if(!longest||row.end>longest.end)longest=row;
  }
 }
 return out.sort(byDate).map(({order,key,...r})=>r);
}
function scheduledFunds(records,projection,to){
 const occurrences=new Map(),groups=new Map(),balances=new Map();
 for(const r of records)if(r.dynamics_kind==='payment_occurrence'&&r.dynamics_version===1){
  if(!occurrences.has(r.schedule_id))occurrences.set(r.schedule_id,[]);occurrences.get(r.schedule_id).push(r);
 }
 for(const b of projection.balances||[])balances.set(key(b.actor,b.currency),b);
 for(const r of records){
  if(r.dynamics_version!==1||r.dynamics_kind!=='payment_schedule'||!r.source?.scene_id)continue;
  const window=paymentScheduleWindow(r,to,occurrences.get(r.record_id)||[]);if(!window)continue;
  const id=key(r.actor,r.currency);
  if(!groups.has(id))groups.set(id,{actor:r.actor,currency:r.currency,total:0,overflow:false,count:0,schedules:[]});
  const g=groups.get(id),amount=r.amount*window.pending_occurrences;
  if(!Number.isSafeInteger(amount)||!Number.isSafeInteger(g.total+amount))g.overflow=true;else g.total+=amount;
  g.count++;
  if(g.schedules.length<4)g.schedules.push({key:r.key,recipient:r.counterparty,amount_per_occurrence:r.amount,pending_occurrences:window.pending_occurrences,first_due_on:window.first_due_on,last_due_on:window.last_due_on,source:r.source});
 }
 return [...groups.values()].map(g=>{
  const b=balances.get(key(g.actor,g.currency)),known=b?.known===true&&Number.isSafeInteger(b.balance);
  const total=g.overflow?null:g.total;
  const delta=known&&total!==null?total-b.balance:null;
  return {actor:g.actor,currency:g.currency,scheduled_review_amount:total,recorded_balance:known?b.balance:null,recorded_balance_source:known?b.source??null:null,
   possible_shortfall:Number.isSafeInteger(delta)?Math.max(0,delta):null,schedule_count:g.count,schedules:g.schedules,omitted_schedules:g.count-g.schedules.length,
   certainty:'schedule_review_not_debt_or_transfer'};
 }).sort((a,b)=>(b.possible_shortfall??-1)-(a.possible_shortfall??-1)||a.actor.localeCompare(b.actor)||a.currency.localeCompare(b.currency));
}
function reviewQueue(candidates,from,to){
 const rows=[],seen=new Set();
 for(const c of candidates){
  if(!c.source?.scene_id||!c.key||['paused','suspended'].includes(c.status))continue;
  const d=parseStoryDate(c.review_at),actors=names(c.actors||[]);
  if(!d||!actors.length||d.order>to.order)continue;
  const id=key(c.kind,c.key,actors);if(seen.has(id))continue;seen.add(id);
  const sameDay=d.precision==='day'&&d.day===to.day;
  rows.push({key:c.key,kind:c.kind,actors,title:clip(c.title),at:d.literal,order:d.order,certainty:sameDay?'same_day_time_unknown':d.order<from.order?'past_unreviewed':'within_review_window',source:c.source});
 }
 return rows.sort(byDate).map(({order,...r})=>r);
}
export function civilizationReview(projection={},candidates=[],{clock,until,complete=true,pending=false,limit=10}={}){
 const from=exact(clock),to=exact(until??clock);
 if(!complete||!from||!to||to.order<from.order)return {status:'unavailable',reason:'complete history and comparable exact clock required'};
 if(pending)return {status:'player_choice_pending',policy:'Do not advance or complete any obligation while a player choice is pending.'};
 limit=Math.max(1,Math.min(12,Number.isInteger(limit)?limit:10));
 const records=projection.worldFacts||[];
 return {status:'review_only',from:from.literal,until:to.literal,
  schedule_conflicts:page(conflicts(scheduleRows(records,from,to)),limit),
  scheduled_funds:page(scheduledFunds(records,projection,to),limit),
  due_queue:page(reviewQueue(candidates,from,to),limit),
  policy:'Narrator only. Review overlapping recorded appointments and aggregate scheduled payments before selecting autonomous actions. A schedule is not attendance, debt, payment, or proof of knowledge; same-day deadlines are not midnight deadlines. Resolve by evidence and character choice, never by automatic completion. Recompute from the next saved head.'};
}

/** Strict priority tiers, then fair rounds across categories. Previously the
 * second urgent item in a busy category could sit behind unrelated leisure. */
export function orderTurnCandidates(categories,rank,{offset=0,limit=16}={}){
 const tiers=new Map();
 for(const category of categories)for(const row of category){
  const priority=rank(row);
  if(!tiers.has(priority))tiers.set(priority,new Map());
  const groups=tiers.get(priority),kind=row.kind;
  if(!groups.has(kind))groups.set(kind,[]);
  groups.get(kind).push(row);
 }
 const out=[];
 for(const [,groups] of [...tiers.entries()].sort((a,b)=>a[0]-b[0])){
  const queues=[...groups.values()];
  for(let i=0;queues.some(q=>q.length>i);i++)for(const q of queues){
   if(q[i])out.push(q[i]);
   if(out.length>=offset+limit)return out.slice(offset);
  }
 }
 return out.slice(offset);
}
// Match complete words, not substring guesses about a character or a place.
const terms=v=>new Set((String(v??'').toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{4,}/gu)||[]).slice(0,40));
const excerpt=r=>clip(r.goal||r.title||r.description||r.fact||r.stance||r.evidence);
const participants=r=>names([r.actor,r.a,r.b,r.counterparty,r.sender,r.recipient,r.responsible,...(Array.isArray(r.actors)?r.actors:[])]);
/** Source retrieval for the narrator, not semantic proof or actor knowledge.
 * Use only projection records with an actual source in the supplied ancestry.
 * An old shared topic is a reason to open the exact scene, not to assume recall. */
export function continuityAnchors(scenes=[],projection={}, {focus=[],place=null,candidates=[],complete=true,limit=8}={}){
 if(!complete||!scenes.length||(!focus.length&&!place))return {records:[],total:0,omitted:0,status:'unavailable'};
 const positions=new Map(scenes.map((s,i)=>[s.id,i])),actors=new Set(focus);
 const wanted=new Set(),keys=new Set();
 for(const c of candidates.filter(c=>c.actors?.some(a=>actors.has(a))||place&&c.place===place).slice(0,12)){
  if(c.key)keys.add(c.key);if(c.record_key)keys.add(c.record_key);
  for(const t of terms(c.title))if(wanted.size<60)wanted.add(t);
 }
 const matches=new Map(),categories=['plans','obligations','relationships','relationship_history','knowledge','offscreen','worldFacts'];
 for(const category of categories)for(const r of projection[category]||[]){
  const source=r.source,pos=positions.get(source?.scene_id);
  if(pos==null||!source?.event_id||scenes.length-1-pos<3)continue;
  const people=participants(r),actorMatch=people.filter(a=>actors.has(a)),placeMatch=!!place&&r.place===place;
  const related=keys.has(r.key)||keys.has(r.plan_id)||keys.has(r.commitment_id);
  if(!actorMatch.length&&!placeMatch&&!related)continue;
  const title=excerpt(r),shared=[...terms(title)].filter(t=>wanted.has(t)).slice(0,5);
  const score=(related?8:0)+(placeMatch?3:0)+Math.min(3,actorMatch.length)*2+Math.min(5,shared.length)*2;
  const identity=key(source.scene_id,source.event_id);
  const row={category,actors:actorMatch,excerpt:title,source,matched_words:shared,exact_record_link:related,exact_place_match:placeMatch,score,position:pos};
  if(!matches.has(identity)||matches.get(identity).score<score)matches.set(identity,row);
 }
 const sorted=[...matches.values()].sort((a,b)=>b.score-a.score||a.position-b.position||String(a.source.event_id).localeCompare(String(b.source.event_id)));
 limit=Math.max(1,Math.min(12,Number.isInteger(limit)?limit:8));
 // At most two excerpts from a scene, so an old conversation cannot swamp
 // the source links for different parts of a character's history.
 const counts=new Map(),selected=[];
 for(const row of sorted){
  const id=row.source.scene_id,n=counts.get(id)||0;if(n>=2)continue;
  const {score,position,...result}=row;selected.push(result);counts.set(id,n+1);
  if(selected.length>=limit)break;
 }
 return {status:'source_hints_only',records:selected,total:sorted.length,omitted:sorted.length-selected.length,
  policy:'Open the exact source scene before callbacks. Lexical matches and shared participants are clues, not new facts, private knowledge or proof of causal connection.'};
}
