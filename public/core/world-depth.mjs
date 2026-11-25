/** Canonical views of lived experience, society, news, places and economic exposure.
 * No new replay schema: all observations refer to accepted branch-local records.
 * Player views are separate from omniscient narrator views. */
import {parseStoryDate} from './world-time.mjs';
const clip=(v,n=240)=>typeof v==='string'?v.slice(0,n):null;
const key=(...a)=>JSON.stringify(a);
const page=(xs,n=24,offset=0)=>({records:xs.slice(offset,offset+n),total:xs.length,omitted:Math.max(0,xs.length-offset-n),next_offset:offset+n<xs.length?offset+n:null});
const src=(s,e)=>({scene_id:s.id,event_id:e.id,world_time:s.world_time??null});
const names=e=>[...new Set([e.actor,e.name&&e.type==='character'?e.name:null,e.a,e.b,e.counterparty,...(Array.isArray(e.actors)?e.actors:[]),...(Array.isArray(e.participants)?e.participants:[])].filter(x=>typeof x==='string'&&x))];
const summary=e=>clip(e.title||e.name||e.goal||e.fact||e.description||e.evidence);
const psychFields=new Set(['temperament','values','coping_style','preference','aversion','habit','personal_goal','career_goal','family_goal','speech_style','register','humor']);
const notableKinds=new Set(['development','institution','contest','enterprise','life_transition','family_event','economic_agreement','market_offer','production_order']);
const notCompleted=new Set(['planned','scheduled','proposed','open','ongoing','active','in_progress','unknown']);
function acceptedHistory(scenes,p,fn){
 const scenesBad=new Set(),eventsBad=new Set();
 for(const w of p.validation_warnings||[]){if(w.event_id==null)scenesBad.add(w.scene_id);else eventsBad.add(key(w.scene_id,w.event_id));}
 for(const s of scenes){if(scenesBad.has(s.id))continue;for(const e of s.events||[])if(!eventsBad.has(key(s.id,e.id)))fn(s,e);}
}
export function worldDepthIndex(scenes=[],p={}, {complete=true}={}){
 const positions=new Map(scenes.map((s,i)=>[s.id,i]));
 const knownSource=r=>positions.has(r.source?.scene_id);
 const facts=(p.worldFacts||[]).filter(knownSource);
 const people=new Map((p.people||[]).map(r=>[r.name,r]));
 const profiles=new Map(),chronicle=[],newsByActor=new Map(),edges=new Map(),locations=new Map();
 const get=a=>{if(!profiles.has(a))profiles.set(a,{timeline:[],psychology:[],beliefs:[],contacts:new Map(),places:new Map(),lastExperience:null});return profiles.get(a);};
 const push=(xs,r)=>{xs.push(r);};
 const contact=(a,b,kind,source,extra={})=>{
  if(!a||!b||a===b)return;
  const g=get(a),k=key(b,kind),r={other:b,kind,source,...extra};g.contacts.set(k,r);
  edges.set(key(a,b,kind),{from:a,to:b,kind,source,...extra});
 };
 const place=(a,n,s,kind)=>{if(!a||!n)return;const places=get(a).places,old=places.get(n);if(!old||(positions.get(s.scene_id)??-1)>=(positions.get(old.source.scene_id)??-1))places.set(n,{name:n,source:s,kind});};
 const timeline=(a,r)=>{if(a)push(get(a).timeline,r);};

 for(const [actor,person] of people){
  for(const f of person.state_fields||[])if(knownSource(f)&&psychFields.has(f.field))get(actor).psychology.push({field:f.field,value:clip(f.value),source:f.source});
  for(const f of person.state_fields||[])if(knownSource(f)&&['location','residence'].includes(f.field)&&f.value)place(actor,f.value,f.source,f.field);
 }
 for(const r of p.knowledge||[])if(knownSource(r)&&r.actor){
  const row={title:clip(r.fact),status:r.status??'recorded',channel:clip(r.channel),topic_id:r.topic_id??null,informant:clip(r.informant),source:r.source};
  get(r.actor).beliefs.push(row);
  if(!['forgotten','unknown'].includes(row.status)&&row.title){
   if(!newsByActor.has(r.actor))newsByActor.set(r.actor,[]);
   newsByActor.get(r.actor).push(row);
  }
 }
 for(const r of p.relationships||[])if(knownSource(r))contact(r.a,r.b,'own_attitude',r.source,{stance:clip(r.stance),boundary:r.relationship_fields?.find(x=>x.field==='boundary')?.value??null});
 for(const r of facts){
  if(r.world_record_version===1&&r.record_kind==='place')locations.set(r.record_id,{id:r.record_id,name:r.name,parent:clip(r.parent_place),source:r.source,status:r.status});
  if(r.dynamics_version===1&&r.dynamics_kind==='bond'){
   contact(r.actor,r.counterparty,r.bond_type,r.source,{status:r.status});contact(r.counterparty,r.actor,r.bond_type,r.source,{status:r.status});
  }
  if(r.dynamics_version===1&&r.dynamics_kind==='employment'){
   contact(r.actor,r.counterparty,'employer',r.source,{status:r.status});contact(r.counterparty,r.actor,'employee',r.source,{status:r.status});
  }
 }
 const acceptedInteractions=new Set((p.relationship_history||[]).map(r=>key(r.source?.scene_id,r.source?.event_id)));
 if(complete)acceptedHistory(scenes,p,(s,e)=>{
  const source=src(s,e),who=names(e),title=summary(e);
  if(e.type==='character'){
   for(const [field,value] of Object.entries(e.state_patch||{})){
    if(!psychFields.has(field)&&!['location','residence','occupation','education','life_stage'].includes(field))continue;
    if(['location','residence'].includes(field)&&typeof value==='string')place(e.name,value,source,field);
    timeline(e.name,{kind:'state_change',title:field,value:clip(value),source});
   }
   return;
  }
  if(e.type==='world'&&e.interaction_version===1&&acceptedInteractions.has(key(s.id,e.id))){
   const participants=(e.actors||[]).slice(0,12);
   for(const a of participants){
    for(const b of participants)if(a!==b)contact(a,b,'shared_episode',source,{episode:e.interaction_kind});
    const row={kind:'interaction',title,source,participants:participants.filter(b=>b!==a),place:clip(e.place)};
    timeline(a,row);get(a).lastExperience=row;
    if(e.place)place(a,e.place,source,'participated_episode');
   }
   return;
  }
  if(e.type==='offscreen'){for(const a of who){timeline(a,{kind:'offscreen',title,source,place:clip(e.place)});}return;}
  if(e.type==='world'&&(e.dynamics_version===1&&notableKinds.has(e.dynamics_kind)||e.social_record_version===1&&e.social_kind==='group'||e.world_record_version===1&&e.record_kind==='place')){
   chronicle.push({kind:e.dynamics_kind||e.social_kind||e.record_kind,title,status:e.status,place:clip(e.place),source,certainty:notCompleted.has(e.status)?'recorded_open_state':'recorded_state_change'});
  }
  if(e.type==='world'&&(e.activity_version===1&&e.activity_kind==='activity'||e.growth_version===1&&e.growth_kind==='project'||e.dynamics_version===1&&['life_transition','family_event','development'].includes(e.dynamics_kind)||e.player_life_version===1&&['lesson','work_shift','service_visit','appointment','career_change','shared_goal'].includes(e.life_kind))){
   const kind=e.activity_kind||e.growth_kind||e.dynamics_kind||e.life_kind;
   for(const a of who){
    const row={kind,title,status:e.status,outcome:clip(e.outcome),source};
    timeline(a,{...row,own_record:e.actor===a||e.actors?.includes(a)});
    if(['completed','attended','worked'].includes(e.status))get(a).lastExperience=row;
   }
  }
 });
 const recent=(a,b)=>(positions.get(b.source?.scene_id)??-1)-(positions.get(a.source?.scene_id)??-1);
 const order=rows=>rows.slice().reverse().sort(recent);
 const psychology=actor=>{
  const g=get(actor);
  return {fields:page(order(g.psychology)),beliefs:page(order(g.beliefs)),recent_experience:g.lastExperience,policy:'Recorded motives and beliefs only. Experience can motivate a new narrated decision, not change personality automatically.'};
 };
 function socialGraph(actor,{director=false,limit=18}={}){
  const g=get(actor),rows=order([...g.contacts.values()]).filter(r=>director||!['ended','declined'].includes(r.status));
  const contacts=[...new Set(rows.map(r=>r.other))].slice(0,limit),allowed=new Set([actor,...contacts]);
  const relations=director?[...edges.values()].filter(r=>allowed.has(r.from)&&allowed.has(r.to)):rows.map(r=>({from:actor,to:r.other,kind:r.kind,source:r.source,status:r.status,stance:r.stance}));
  return {nodes:[actor,...contacts].map(name=>({name,focus:name===actor})),edges:page(order(relations.filter(r=>allowed.has(r.to))),48),omitted_contacts:Math.max(0,new Set(rows.map(r=>r.other)).size-contacts.length),policy:director?'Narrator network: directed links, not reciprocal feelings.':'Only own relationships, recorded shared bonds and participated episodes. No hidden contacts between others.'};
 }
 function placeGraph(actor,{director=false}={}){
  const g=get(actor),own=g.places,known=[...own.values()],knownNames=new Set(known.map(r=>r.name));
  const rows=director?[...locations.values()]:known;
  const byName=new Map();
  for(const r of locations.values()){if(!byName.has(r.name))byName.set(r.name,[]);byName.get(r.name).push(r);}
  const selected=order(rows).slice(0,30);
  const links=[];
  for(const r of selected){
   const candidates=byName.get(r.name)||[];
   // Player sees a containment edge only if both places were independently known
   // and the containing relation is recorded in the same observation.
   const record=director?r:candidates.length===1&&candidates[0].source.scene_id===r.source.scene_id?candidates[0]:null;
   if(record?.parent&&selected.some(x=>x.name===record.parent)&& (director||knownNames.has(record.parent)))links.push({from:r.name,to:record.parent,source:record.source});
  }
  return {places:page(selected,30),links,policy:'Recorded place hierarchy only, not a geographic map or inferred distances.'};
 }
 function economy(actor){
  const flows=(p.budget_flows||[]).filter(x=>x.actor===actor).sort((a,b)=>String(b.month).localeCompare(String(a.month)));
  const obligations=facts.filter(r=>r.dynamics_kind==='economic_agreement'&&['active','disputed','proposed'].includes(r.status)&&(r.actor===actor||r.counterparty===actor));
  const businesses=facts.filter(r=>r.dynamics_kind==='enterprise'&&r.actor===actor);
  const contracts=facts.filter(r=>r.life_kind==='supply_contract'&&(r.actor===actor||r.supplier===actor)&&['active','disputed','proposed'].includes(r.status));
  const money=(p.balances||[]).filter(r=>r.actor===actor);
  return {cash:page(money.map(r=>({currency:r.currency,known:r.known===true,balance:r.known?r.balance:null,source:r.source}))),flows:page(flows.map(r=>({month:r.month,currency:r.currency,income:r.income,expense:r.expense,net:String(BigInt(r.income)-BigInt(r.expense))}))),agreements:page(obligations.map(r=>({title:summary(r),status:r.status,amount:r.amount,currency:r.currency,role:r.actor===actor?'actor':'counterparty',source:r.source}))),businesses:page(businesses.map(r=>({title:r.title,status:r.status,place:r.place,source:r.source}))),supply:page(contracts.map(r=>({title:summary(r),amount:r.amount,currency:r.currency,status:r.status,source:r.source}))),policy:'Recorded transactions by currency and month; not profit, valuation, interest, expected yield or inferred debt. Never convert currencies automatically.'};
 }
 function view(actor,{director=false,offset=0,limit=40}={}){
  if(!complete)return {memory_complete:false};
  const g=get(actor);
  const time=director?g.timeline:g.timeline.filter(r=>['state_change','interaction','activity','project','lesson','work_shift','service_visit','appointment','career_change'].includes(r.kind)&&(r.kind==='state_change'||r.kind==='interaction'||r.own_record===true));
  return {memory_complete:true,psychology:{...psychology(actor),recent_experience:director?g.lastExperience:order(time.filter(r=>r.kind==='interaction'||['completed','attended','worked'].includes(r.status)))[0]??null},social:socialGraph(actor,{director}),places:placeGraph(actor,{director}),timeline:page(order(time),limit,offset),news:page(order(director?chronicle:newsByActor.get(actor)||[]),Math.min(limit,40),offset),economy:economy(actor)};
 }
 function opportunities(){
  if(!complete)return [];
  const out=[];
  for(const [actor,g] of profiles){
   const e=g.lastExperience;
   if(!e||!g.psychology.length)continue;
   const last=Math.max(...g.psychology.map(f=>positions.get(f.source.scene_id)??-1));
   if((positions.get(e.source.scene_id)??-1)<=last)continue;
   out.push({kind:'experience_reflection',row:{actor,key:key('experience_reflection',actor,e.source.scene_id,e.source.event_id),title:'Review: '+(e.title||e.kind),status:'opportunity',source:e.source},info:{record_key:key(actor,'experience'),timing:'requires_character_choice',reflection:{experience:e,motives:g.psychology.slice(0,3)},guidance:'Consider a response consistent with recorded motives and actual experience. Do not infer a new fear, attachment, personality change or knowledge; record only what is established in the scene.'}});
  }
  // Independent economy reviews are grounded in existing active agreements;
  // no invented investment products or forecasts.
  const seen=new Set();
  for(const r of facts)if(r.dynamics_kind==='economic_agreement'&&['active','disputed'].includes(r.status)){
   for(const actor of [r.actor,r.counterparty])if(actor&&!seen.has(actor)){seen.add(actor);out.push({kind:'financial_review',row:{actor,counterparty:actor===r.actor?r.counterparty:r.actor,key:key('financial_review',actor,r.key),title:summary(r),status:r.status,source:r.source},info:{record_key:r.key,timing:'requires_character_choice',financial_review:{currency:r.currency,amount:r.amount,agreement_kind:r.agreement_kind,own_role:actor===r.actor?'actor':'counterparty'},guidance:'Review the original agreement, actual cash and obligations. Consider negotiation or resource allocation; no automatic investment, profit, price change, payment or settlement.'}});}
  }
  const boundaries=new Map((p.relationships||[]).map(r=>[key(r.a,r.b),r.relationship_fields?.find(f=>f.field==='boundary')?.value]));
  const blocked=(a,b)=>[boundaries.get(key(a,b)),boundaries.get(key(b,a))].some(x=>['no_contact','distance'].includes(x));
  const knownTopics=new Map();
  for(const r of p.knowledge||[])if(r.topic_id&&r.actor&&r.status!=='forgotten'&&r.status!=='unknown'){if(!knownTopics.has(r.actor))knownTopics.set(r.actor,new Set());knownTopics.get(r.actor).add(r.topic_id);}
  for(const [actor,g] of profiles){
   const contacts=[...new Set([...g.contacts.values()].filter(r=>r.kind==='own_attitude'||r.kind==='shared_episode'||r.status==='active').map(r=>r.other))].filter(b=>!blocked(actor,b)).slice(0,8);
   if(contacts.length>=2){
    const a=contacts[0],b=contacts.find(n=>n!==a&&!blocked(a,n)&&!profiles.get(a)?.contacts.has(key(n,'own_attitude'))&&!profiles.get(n)?.contacts.has(key(a,'own_attitude'))&&!profiles.get(a)?.contacts.has(key(n,'shared_episode')));
    if(b){const r=[...g.contacts.values()].find(x=>x.other===a);out.push({kind:'introduction_opportunity',row:{actor,key:key('introduction',actor,a,b),title:'Possible introduction: '+a+' / '+b,status:'opportunity',source:r.source},info:{record_key:key(actor,'introduction'),timing:'requires_character_choice',introduction:{contacts:[a,b]},guidance:'Mediator knows both through recorded links. Confirm both are actually present, willing and not already acquainted. No assumed introduction or new friendship.'}});}
   }
   const latest=(newsByActor.get(actor)||[]).slice().sort(recent).find(r=>r.topic_id&&r.status==='knows'&&r.channel);
   const recipient=latest&&contacts.find(b=>!knownTopics.get(b)?.has(latest.topic_id));
   if(recipient)out.push({kind:'information_opportunity',row:{actor,counterparty:recipient,key:key('information',actor,recipient,latest.topic_id),title:'Possible discussion',status:'opportunity',source:latest.source},info:{record_key:latest.topic_id,timing:'requires_character_choice',information:{topic_id:latest.topic_id,recipient,channel:latest.channel},guidance:'Review the source and confidentiality, motive and access before any voluntary disclosure. Do not reveal secret information automatically or equate an assertion with fact. Save a separate recipient knowledge event only if communicated.'}});
  }
  return out;
 }
 return {view,opportunities,chronicle:()=>({memory_complete:complete,...page(complete?order(chronicle):[],40)})};
}
