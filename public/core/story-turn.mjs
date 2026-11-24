/** A unified turn preparation view. All candidates are read-only. The narrator
 * chooses plausible developments, writes them in the scene and commits evidence.
 * Nothing advances merely because the user opens a context. */
import {parseStoryDate} from './world-time.mjs';
import {routineWindow} from './living-world.mjs';
import {characterAge} from './character-state.mjs';
import {familyDutyWindow} from './world-dynamics.mjs';
import {storyDrivers} from './story-drivers.mjs';
const text=v=>typeof v==='string'?v.trim():'';
const closed=new Set(['completed','complete','abandoned','resolved','ended','cancelled','canceled','decided','closed','fulfilled','done']);
const clip=v=>typeof v==='string'?v.slice(0,300):null;
const source=x=>x?.source||null;
export function prepareStoryTurn(scenes=[],projection={},directives=[],opts={}){
 const actors=Array.isArray(opts.actors)?opts.actors:[];
 if(actors.length>8||actors.some(a=>!text(a)||a.length>140))throw Error('Укажи до восьми имён персонажей.');
 const focus=new Set(actors.map(text)),place=text(opts.place);
 if(place.length>140)throw Error('Слишком длинное название места.');
 const limit=Math.max(1,Math.min(30,Math.floor(Number(opts.limit)||16)));
 const last=scenes.at(-1),clock=parseStoryDate(last?.world_time);
 const proposed=opts.target_time==null?null:parseStoryDate(opts.target_time);
 if(opts.target_time!=null&&!proposed)throw Error('Нужна точная игровая дата, не реальное время.');
 const comparable=clock&&proposed&&(clock.precision===proposed.precision||clock.day!==proposed.day);
 if(comparable&&proposed.order<clock.order)throw Error('Для возврата в прошлое используй альтернативную ветку, а не продвижение времени.');
 const anchor=proposed||clock;
 const interval=comparable?proposed.order-clock.order:null;
 const records=projection.worldFacts||[],dutyOccurrences=new Map();
 for(const r of records)if(r.dynamics_kind==='family_event'&&r.duty_id){if(!dutyOccurrences.has(r.duty_id))dutyOccurrences.set(r.duty_id,[]);dutyOccurrences.get(r.duty_id).push(r);}
 const positions=new Map(scenes.map((s,i)=>[s.id,i]));
 const placeRecords=new Map(records.filter(x=>x.world_record_version===1&&x.record_kind==='place').map(x=>[x.name,x]));
 const location=new Map((projection.people||[]).map(x=>[x.name,x.state_fields?.find(y=>y.field==='location')]));
 const byKind=new Map(),all=[];
 function add(kind,row,info={}){
  const participants=[...new Set([row.actor,row.counterparty,...(Array.isArray(row.actors)?row.actors:[])].filter(Boolean))];
  const relevant=participants.some(x=>focus.has(x))||!!place&&row.place===place;
  const where=row.place&&placeRecords.get(row.place);
  const candidate={kind,key:row.key||row.plan_id||row.commitment_id||row.id||null,actors:participants,title:clip(row.title||row.name||row.goal||row.activity||row.description||row.evidence),
   status:row.status||'unknown',source:source(row),place:row.place||null,
   location_status:where?.status||null,location_source:source(where),focus_match:relevant,
   next_step:clip(row.next_step),obstacle:clip(row.obstacle),...info,certainty:'candidate_only_not_performed'};
  all.push(candidate);if(!byKind.has(kind))byKind.set(kind,[]);byKind.get(kind).push(candidate);
 }
 const timing=row=>{
  const due=parseStoryDate(row.due_at||row.deadline||row.due);
  if(!due||!anchor)return 'unknown';
  if(due.precision!==anchor.precision&&due.day===anchor.day)return 'same_day_uncertain';
  return due.order<=anchor.order?'reached_requires_story':'future';
 };
 for(const p of projection.plans||[])if(['active','paused'].includes(p.status))add('intention',p,{timing:timing(p)});
 for(const p of projection.obligations||[])if(!closed.has(text(p.status)))add('obligation',p,{timing:timing(p)});
 for(const r of records){
  if(r.world_record_version===1&&r.record_kind==='routine'&&r.status==='active'&&anchor?.precision==='minute'){
   const atTarget=routineWindow(r,anchor);
   const atStart=clock?.precision==='minute'?routineWindow(r,clock):'clock_unknown';
   // A routine may begin and end during a time jump. Evaluate actual weekly
   // windows without iterating once per minute. Bound examination to one week.
   let intersects=atTarget==='scheduled_window_not_actual_presence'||atStart==='scheduled_window_not_actual_presence';
   if(!intersects&&comparable&&interval>0&&clock.precision==='minute'&&anchor.precision==='minute'){
    const startDay=Math.floor(clock.order/1440),endDay=Math.floor(anchor.order/1440);
    const start=Number(r.start.slice(0,2))*60+Number(r.start.slice(3)),end=Number(r.end.slice(0,2))*60+Number(r.end.slice(3));
    for(let d=startDay-1;d<=Math.min(endDay,startDay+7);d++){
     const weekday=new Date(d*86400000).getUTCDay()||7;
     if(r.weekdays.includes(weekday)&&d*1440+start<=anchor.order&&d*1440+end+(end<start?1440:0)>clock.order){intersects=true;break;}
    }
   }
   if(intersects)add('routine',r,{timing:'scheduled_window_not_presence',last_known_location:location.get(r.actor)?.value||null});
  }
  if(r.social_record_version===1&&r.social_kind==='thread'&&['open','paused'].includes(r.status))add('thread',r);
  if(r.activity_version===1&&r.activity_kind==='activity'&&['planned','in_progress'].includes(r.status))add('activity',r,{timing:timing(r)});
  if(r.consequence_version===1&&r.status!=='resolved')add('consequence',r);
  if(r.growth_version===1&&r.growth_kind==='project'&&['planned','active','paused'].includes(r.status))add('project',r,{timing:timing(r)});
  if(r.dynamics_version===1){
   if(r.dynamics_kind==='family_duty'){const window=familyDutyWindow(r,clock,anchor,dutyOccurrences.get(r.record_id)||[]);if(window)add('family_duty',r,{family_kind:r.family_kind,timing:'scheduled_window_not_presence',...window});}
   if(r.dynamics_kind==='life_transition'&&!closed.has(r.status))add('life_transition',r,{transition_kind:r.transition_kind,timing:timing(r)});
   if(r.dynamics_kind==='family_event'&&!closed.has(r.status))add('family_event',r,{family_kind:r.family_kind,timing:timing(r)});
   if(r.dynamics_kind==='contest'&&!closed.has(r.status))add('contest',r,{resource:clip(r.resource),timing:timing(r)});
   if(r.dynamics_kind==='institution'&&!closed.has(r.status))add('institution',r,{group_id:r.group_id});
   if(r.dynamics_kind==='development'&&!closed.has(r.status))add('development',r,{timing:timing(r)});
   if(r.dynamics_kind==='bond'&&r.status==='strained')add('strained_bond',r,{bond_type:r.bond_type});
   else if(r.dynamics_kind==='bond'&&['active','estranged'].includes(r.status)&&['family','romantic','marriage','parenthood','cohabitation'].includes(r.bond_type)&&(focus.has(r.actor)||focus.has(r.counterparty)))add('personal_bond',r,{bond_type:r.bond_type});
  }
 }
 const life_context=[];
 for(const person of projection.people||[]){
  const before=characterAge(person,clock?.literal),after=characterAge(person,anchor?.literal);
  if(focus.has(person.name)&&after)life_context.push({actor:person.name,current_age:before,target_age:after});
  if(before?.status==='calendar_derived'&&after?.status==='calendar_derived'&&after.years>before.years)
   add('age_milestone',{actor:person.name,title:'День рождения: '+person.name,source:after.source,status:'calendar_derived'},{timing:'reached_requires_story',previous_age:before.years,age_years:after.years,birthdays_crossed:after.years-before.years});
 }
 const rank=x=>x.timing==='reached_requires_story'?0:x.focus_match?1:x.timing==='future'?3:2;
 for(const xs of byKind.values())xs.sort((a,b)=>rank(a)-rank(b)||(positions.get(b.source?.scene_id)??-1)-(positions.get(a.source?.scene_id)??-1));
 const categories=[...byKind.values()].sort((a,b)=>rank(a[0])-rank(b[0]));
 const candidates=[];for(let i=0;candidates.length<limit;i++){let added=false;for(const xs of categories){if(xs[i]){candidates.push(xs[i]);added=true;if(candidates.length===limit)break;}}if(!added)break;}
 // Attach a bounded actor context to the actual turn, instead of forcing the narrator
 // to retrieve every subsystem independently. Focused actors precede background actors.
 const selectedActors=[...focus],omittedActors=new Set();
 const addActor=name=>{if(!text(name)||selectedActors.includes(name))return;if(selectedActors.length<12)selectedActors.push(name);else omittedActors.add(name);};
 for(const candidate of candidates)for(const actor of candidate.actors)addActor(actor);
 const actorIndex=new Map(selectedActors.map(actor=>[actor,{actor,state_fields:[],intentions:[],knowledge:[],relationships:[],recent_offscreen:[],omitted:{}}]));
 const actorRows=(actor,kind,row,cap)=>{const ctx=actorIndex.get(actor);if(!ctx)return;
  if(ctx[kind].length<cap)ctx[kind].push(row);else ctx.omitted[kind]=(ctx.omitted[kind]||0)+1;
 };
 // Latest source in canonical ancestry first; updates of old keys are not insert order.
 const recent=rows=>rows.slice().reverse().sort((a,b)=>(positions.get(b.source?.scene_id)??-1)-(positions.get(a.source?.scene_id)??-1));
 const stateFields=new Set(['location','residence','availability','occupation','condition','injury','mood','temperament','speech_style','values','personal_goal','family_goal','pregnancy','coping_style','humor','register','life_stage','education','career_goal']);
 for(const p of projection.people||[]){
  if(!actorIndex.has(p.name))continue;
  const ctx=actorIndex.get(p.name);ctx.age=characterAge(p,anchor?.literal);
  for(const field of (p.state_fields||[]).filter(x=>stateFields.has(x.field)))actorRows(p.name,'state_fields',{field:field.field,value:clip(field.value),source:source(field)},12);
 }
 for(const p of recent(projection.plans||[]))if(['active','paused'].includes(p.status))actorRows(p.actor,'intentions',{plan_id:p.plan_id,goal:clip(p.goal),status:p.status,next_step:clip(p.next_step),obstacle:clip(p.obstacle),source:source(p)},3);
 for(const k of recent(projection.knowledge||[]))actorRows(k.actor,'knowledge',{holder:k.actor,topic_id:k.topic_id||null,fact:clip(k.fact),status:k.status||'legacy_recorded_knowledge',channel:clip(k.channel),source:source(k)},4);
 for(const r of recent(projection.relationships||[])){
  const row={a:r.a,b:r.b,stance:clip(r.stance),fields:(r.relationship_fields||[]).map(x=>({field:x.field,value:x.value,source:source(x)})),source:source(r)};
  actorRows(r.a,'relationships',row,3);if(r.a!==r.b)actorRows(r.b,'relationships',row,3);
 }
 for(const e of recent(projection.offscreen||[])){
  for(const actor of new Set([e.actor,...(Array.isArray(e.actors)?e.actors:[])].filter(Boolean)))actorRows(actor,'recent_offscreen',{description:clip(e.description||e.evidence),place:clip(e.place),source:source(e)},2);
 }
 // Round-robin across actors AND categories, reserving counts up front.
 // Bound extra turn payload even if all participants have lengthy records.
 const actorQueues=[...actorIndex.values()],kinds=['state_fields','intentions','knowledge','relationships','recent_offscreen'];
 const actor_context=actorQueues.map(({actor,age,omitted,...rows})=>({actor,age,omitted:Object.fromEntries(kinds.map(k=>[k,(omitted[k]||0)+rows[k].length])),...Object.fromEntries(kinds.map(k=>[k,[]]))}));
 const actorBudget=18000;
 for(let i=0;i<12;i++)for(const kind of kinds)for(let j=0;j<actor_context.length;j++){
  const value=actorQueues[j][kind][i];if(!value)continue;
  const ctx=actor_context[j];ctx[kind].push(value);ctx.omitted[kind]--;
  if(JSON.stringify(actor_context).length>actorBudget){ctx[kind].pop();ctx.omitted[kind]++;}
 }
 for(const ctx of actor_context)for(const k of kinds)if(ctx.omitted[k]===0)delete ctx.omitted[k];
 const relationship_context=[];
 let relationship_context_omitted=0;
 if(focus.size){
  const accepted=new Set((projection.relationship_history||[]).map(e=>JSON.stringify([e.source.scene_id,e.source.event_id])));
  // Reverse canonical scene and event order, not an inferred emotional score.
  for(let i=scenes.length-1;i>=0;i--){
   const s=scenes[i],events=s.events||[];
   for(let j=events.length-1;j>=0;j--){
    const e=events[j],relation=e.type==='relationship',episode=e.type==='world'&&e.interaction_version===1;
    if(!(relation&&(focus.has(e.a)||focus.has(e.b))||episode&&e.actors?.some(a=>focus.has(a))))continue;
    if(!accepted.has(JSON.stringify([s.id,e.id])))continue;
    if(relationship_context.length>=12){relationship_context_omitted++;continue;}
    relationship_context.push({type:relation?'relationship_change':'interaction',kind:e.interaction_kind,a:e.a,b:e.b,actors:e.actors,stance:e.stance,fields:e.relationship_patch,description:clip(e.description),outcome:clip(e.outcome),source:{scene_id:s.id,event_id:e.id,world_time:s.world_time??null}});
   }
  }
 }
 const warnings=[];
 if(!clock)warnings.push('Последняя сцена не задаёт точное время; длительность перехода неизвестна.');
 if(clock&&proposed&&!comparable)warnings.push('Точность дат различается: длительность перехода неизвестна.');
 if(opts.complete===false)warnings.push('История неполна; кандидаты не охватывают все события.');
 return {head_scene_id:last?.id??null,clock:clock?.literal??null,target_time:proposed?.literal??null,elapsed_story_minutes:interval,
  memory_complete:opts.complete!==false,focus:{actors:[...focus],place:place||null},candidates,omitted_candidates:all.length-candidates.length,
  relationship_context,relationship_context_omitted,life_context,actor_context,actor_context_omitted:omittedActors.size,
  drivers:storyDrivers(projection,directives,{max:8,actors:[...focus]}),warnings,
  workflow:['Read the pinned head and rules.','Read actor_context for each participant; consult full sources for omitted fields. A recorded incoming relationship is not the participant’s own feeling or knowledge.','Choose only developments compatible with elapsed fictional time, access, motives and player agency; show them in narrative (including offscreen if appropriate).','Record exact evidenced state changes and save one scene against the expected head.','On uncertain save, check the receipt before generating another continuation.'],
  policy:'This is a read-only turn proposal, not simulation results. No candidate changes world state, completes a deadline, transfers a resource, reveals a secret or proves presence. The player controls their own character.'};
}
