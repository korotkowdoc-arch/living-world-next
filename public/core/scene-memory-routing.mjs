import {normalizeLegacyKnowledge} from './knowledge.mjs';
/** Scene extraction protocol, domain routing, and evidence-backed episodic recall.
 * The narrator performs semantic extraction; these deterministic helpers never
 * manufacture facts from prose. Supplemental memory is never a ledger operation,
 * knowledge grant, plan completion, or canonical character state. */
const txt=(x,n=140)=>typeof x==='string'&&x.trim()===x&&x.length>0&&x.length<=n;
const list=(x,max,n=140)=>Array.isArray(x)&&x.length<=max&&x.every(a=>txt(a,n))&&new Set(x).size===x.length;
const domains={
 character:['character','wardrobe','health','psychology'],relationships:['relationships','contacts','network'],knowledge:['memories','news'],finance:['finances','bank_records','investments','inheritance','treasury'],inventory:['inventory','wardrobe'],property:['property','map'],education:['education','skills'],work:['work','finances'],magic:['magic','rituals','alchemy','magical_science'],medicine:['health','magical_medicine','medical_records','magical_clinics'],community:['circles','education'],civic:['circles','documents'],documents:['library','documents','letters','archives'],travel:['places','map','calendar'],calendar:['calendar','tasks'],goals:['goals','tasks'],world:['map','timeline'],experiences:['memories','journal']
};
export const MEMORY_DOMAINS=Object.freeze(Object.keys(domains));
const types=['observed','claim','intention','belief','description','uncertain'];
const allowed=new Set(['id','type','scene_memory_version','memory_kind','domain','actors','actor','summary','evidence','place','topics']);
export const isSceneMemory=e=>!!e&&Object.hasOwn(e,'scene_memory_version');
export function sceneMemoryError(e){
 if(!isSceneMemory(e))return null;
 if(e.scene_memory_version!==1||e.type!=='world'||Object.keys(e).some(k=>!allowed.has(k))||!types.includes(e.memory_kind)||!Object.hasOwn(domains,e.domain)||!list(e.actors,8)||!txt(e.summary,600)||!txt(e.evidence,1200)||e.place!=null&&!txt(e.place)||e.topics!=null&&!list(e.topics,8,100))return 'Invalid isolated scene memory record';
 if(['claim','intention','belief'].includes(e.memory_kind)&&(!txt(e.actor)||!e.actors.includes(e.actor)))return 'Claim, intention or belief requires explicit speaker/holder';
 if(e.actor!=null&&(!txt(e.actor)||!e.actors.includes(e.actor)))return 'Memory actor must be explicitly listed';
 if(!e.actors.length&&!e.place&&!e.topics?.length)return 'Memory needs explicit actor, place or topic';
 return null;
}
const lifeRoutes={
 character:'need garment outfit preset impression',relationships:'invitation household household_member care_record child_birth child_milestone shared_goal shared_goal_member shared_goal_step',finance:'budget household_contribution household_expense expense_share ticket_payment market_adjustment market_observation wage supply_contract',property:'lease home_condition estate estate_sale estate_condition furnishing room room_layout room_connection household_task',education:'enrollment assessment practice_record lesson assignment study_program program_enrollment module_result qualification',work:'work_shift service_recipe job_requirement career_change venue_service service_visit',medicine:'health_episode care_plan',documents:'letter',travel:'journey transit_notice transport_ticket discovery capacity_slot reservation',calendar:'appointment',civic:'civic_office civic_case civic_notice civic_submission civic_decision civic_motion civic_ballot',community:'community_event community_participation community_result community_report',goals:'consequence_response',world:'reputation'
};
const lifeMap=new Map(Object.entries(lifeRoutes).flatMap(([domain,words])=>words.split(' ').map(k=>[k,domain])));
const dynRoutes={
 community:'institution',relationships:'bond family_event family_duty',finance:'economic_agreement payment_schedule payment_occurrence stock_operation market_offer',work:'employment enterprise production_order',calendar:'player_choice',world:'causal_link information rumor'
};
const dynMap=new Map(Object.entries(dynRoutes).flatMap(([domain,words])=>words.split(' ').map(k=>[k,domain])));
export function eventRoute(e){
 if(!e||typeof e!=='object')return {domain:'unclassified',destinations:[],layer:'unknown'};
 if(isSceneMemory(e))return sceneMemoryError(e)?{domain:'unclassified',destinations:[],layer:'invalid_memory'}:{domain:e.domain,destinations:['narrator_recall'],layer:'interpretive_memory'};
 let d=null;
 if(normalizeLegacyKnowledge(e)!==e)d='knowledge';
 else if(e.type==='character')d='character';
 else if(e.type==='relationship')d='relationships';
 else if(e.type==='knowledge')d='knowledge';
 else if(e.type==='money')d='finance';
 else if(e.type==='item')d='inventory';
 else if(e.type==='commitment')d='calendar';
 else if(e.type==='plan')d='goals';
 else if(e.type==='offscreen')d='world';
 else if(e.type==='world'){
  if(e.player_life_version===1)d=lifeMap.get(e.life_kind)??null;
  else if(e.wealth_version===1)d='finance';
  else if(e.document_version===1)d='documents';
  else if(e.magic_version===1)d=['condition','diagnosis','therapy','course','treatment'].includes(e.magic_kind)?'medicine':'magic';
  else if(e.magic_society_version===1)d=['clinic','credential','admission','clinical_visit'].includes(e.magic_society_kind)?'medicine':'magic';
  else if(e.advanced_version===1)d=['instrument','lot','distribution','lot_transfer','loan','loan_payment'].includes(e.advanced_kind)?'finance':['channel','edition','subscription'].includes(e.advanced_kind)?'knowledge':e.advanced_kind==='motive'?'character':'world';
  else if(e.dynamics_version===1)d=dynMap.get(e.dynamics_kind)??'world';
  else if(e.interaction_version===1||e.social_record_version===1)d='relationships';
  else if(e.growth_version===1)d=e.growth_kind==='project'?'goals':e.growth_kind==='rumor'?'knowledge':e.growth_kind==='cause'?'world':'education';
  else if(e.activity_version===1)d='experiences';
  else if(e.consequence_version===1)d='world';
  else if(e.world_record_version===1)d=e.record_kind==='routine'?'calendar':'world';
 }
 return {domain:d??'unclassified',destinations:d?domains[d]:[],layer:d?'canonical_event':'unclassified_event'};
}
const actors=e=>[...new Set([e.actor,e.name,e.a,e.b,e.sender,e.recipient,e.counterparty,e.teacher,e.student,e.provider,e.employer,e.organizer,e.holder,e.parent,e.supporter,e.reporter,...(Array.isArray(e.actors)?e.actors:[]),...(Array.isArray(e.participants)?e.participants:[]),...(Array.isArray(e.parties)?e.parties:[])].filter(a=>typeof a==='string'&&a.trim()))];
const norm=v=>String(v??'').normalize('NFKC').toLocaleLowerCase('ru');
const compact=(v,n=240)=>typeof v==='string'?v.slice(0,n):null;
const cuePatterns={
 finance:/\b(?:paid|bought|sold|price|salary|loan|debt|coins?)\b|заплатил|купил|продал|стоимост|галлеон|сикл|кнат|долг|зарплат|наследств/iu,
 inventory:/\b(?:received|gave|handed|took|inventory|wand)\b|передал|получил|подарил|вручил|забрал|палочк|сумк/iu,
 relationships:/\b(?:met|promised|apologized|friend|kissed)\b|познаком|пообещ|извин|довер|дружб|поцелов|отношен/iu,
 knowledge:/\b(?:learned|discovered|revealed|rumou?r|told)\b|узнал|выяснил|рассказал|признал|слух|секрет/iu,
 education:/\b(?:lesson|exam|studied|homework|grade)\b|урок|экзамен|лекци|задан|оценк|зач[её]т/iu,
 work:/\b(?:hired|shift|contract|job|employee)\b|нанял|смен[ау]|договор|работодатель|заказ/iu,
 medicine:/\b(?:injury|diagnos|healed|treatment|pain)\w*\b|ран[аеуы]|бол[ье]|диагноз|лечен|зелье|лекарств/iu,
 magic:/\b(?:spell|ritual|potion|enchant|magic)\w*\b|заклинан|ритуал|зель[ея]|чар[ыа]|магическ/iu,
 property:/\b(?:house|room|lease|rent|repair)\b|комнат|дом[ауе]|аренд|ремонт|недвижим/iu,
 documents:/\b(?:letter|book|document|newspaper|diary)\b|письм[оа]|учебник|книг|газет|дневник|документ/iu,
 calendar:/\b(?:tomorrow|deadline|appointment|scheduled|o'clock)\b|завтра|послезавтра|срок|договорил|назначил|встреч[ау]|\d{1,2}:\d{2}/iu,
 travel:/\b(?:arrived|departed|ticket|train|journey)\b|прибыл|уехал|поезд|билет|путешеств/iu,
 community:/\b(?:match|club|festival|tournament)\b|клуб|матч|квиддич|турнир|фестивал/iu,
 civic:/\b(?:court|vote|hearing|verdict)\b|судеб|голосован|приговор|слушани|министерств/iu,
 character:/\b(?:changed clothes|wore|hungry|tired|appearance)\b|переодел|устал|голод|внешност|одежд/iu,
 goals:/\b(?:decided|planned|intended|goal)\b|решил|намерен|запланир|цель/iu
};
/** Identify the records a typed event targets. This is not a second write path:
 * the existing canonical fold performs the operation; the receipt exposes its identity. */
export function eventRecordTargets(event){
 if(!event||eventRoute(event).layer!=='canonical_event')return [];
 const e=normalizeLegacyKnowledge(event),out=[];
 const add=(registry,identity,operation,fields=[])=>{
  if(identity.every(v=>typeof v==='string'&&v.trim()))out.push({registry,identity,operation,fields});
 };
 const fields=p=>p&&typeof p==='object'&&!Array.isArray(p)?Object.keys(p):[];
 switch(e.type){
 case 'character':add('people',[e.name],'patch',fields(e.state_patch));break;
 case 'relationship':add('relationships',[e.a,e.b],'patch',fields(e.relationship_patch));break;
 case 'knowledge':add('knowledge',[e.actor,e.knowledge_version===1?'topic':'legacy',e.knowledge_version===1?e.topic_id:e.fact],'upsert',['fact','status']);break;
 case 'money':add('balances',[e.actor,e.currency],e.operation||'adjust',['balance']);if(e.operation==='transfer')add('balances',[e.counterparty,e.currency],'transfer_counterparty',['balance']);break;
 case 'item':add('items',[e.item_id],e.action||'change',['custody']);break;
 case 'commitment':add('obligations',[e.commitment_id],'upsert',['status','description','due_at']);break;
 case 'plan':add('plans',[e.actor,e.plan_id],e.action,fields(e.plan_patch));break;
 case 'world':if(typeof e.key==='string'&&e.key.trim())add('worldFacts',[e.key],'upsert',['status']);else if(e.interaction_version===1)add('relationship_history',[e.id],'append');break;
 case 'offscreen':add('offscreen',[e.id],'append');break;
 }
 return out;
}
export function sceneSaveAudit(body,events=[]){
 const rows=Array.isArray(events)?events:[],by=new Map(),unclassified=[],semantic=[],updates=[],recordTargets=[],affected=new Map();
 for(const e of rows){
  const route=eventRoute(e);
  if(route.layer==='interpretive_memory'){semantic.push(e);continue;}
  if(!by.has(route.domain))by.set(route.domain,{domain:route.domain,destinations:route.destinations,count:0,event_ids:[]});
  const r=by.get(route.domain);r.count++;if(r.event_ids.length<10)r.event_ids.push(e?.id??null);
  if(route.layer==='canonical_event'){
   for(const section of route.destinations)affected.set(section,(affected.get(section)||0)+1);
   for(const target of eventRecordTargets(e))recordTargets.push({...target,event_id:e.id,domain:route.domain});
  }
  if(route.layer==='canonical_event'&&e.type==='plan')updates.push({actor:e.actor,plan_id:e.plan_id,action:e.action,event_id:e.id,destinations:route.destinations,changed_fields:Object.keys(e.plan_patch||{}),performed_event_id:e.performed_event_id??null});
  if(route.layer==='unclassified_event'||route.layer==='invalid_memory')unclassified.push(e?.id??null);
 }
 const text=typeof body==='string'?body:'',cueGroups=new Map(),coverage=new Map(),segments=[];
 // Exact source offsets; evidence spanning a boundary marks both segments.
 // A repeated quote is ambiguous and cannot certify a second occurrence.
 let cursor=0;
 while(cursor<text.length){
  let end=Math.min(text.length,cursor+1200);
  if(end<text.length){
   const paragraph=text.lastIndexOf('\n\n',end-2),newline=text.lastIndexOf('\n',end-1),space=text.lastIndexOf(' ',end-1);
   if(paragraph>=cursor+300)end=paragraph+2;
   else if(newline>=cursor+600)end=newline+1;
   else if(space>=cursor+900)end=space+1;
   if(/[\uDC00-\uDFFF]/.test(text[end]))end--;
  }
  segments.push({start:cursor,end});cursor=end;
 }
 for(const e of rows){
  const route=eventRoute(e);
  if(route.layer!=='canonical_event'&&route.layer!=='interpretive_memory'||typeof e.evidence!=='string'||!e.evidence.trim())continue;
  const start=text.indexOf(e.evidence);if(start<0||text.indexOf(e.evidence,start+1)>=0)continue;
  if(!coverage.has(route.domain))coverage.set(route.domain,[]);
  coverage.get(route.domain).push({start,end:start+e.evidence.length,layer:route.layer});
 }
 // Local lexical review only: no automatic fact extraction, and no quota.
 for(const segment of segments){
  const excerpt=text.slice(segment.start,segment.end);
  for(const [d,pattern] of Object.entries(cuePatterns)){
   const local=(coverage.get(d)||[]).filter(x=>x.start<segment.end&&x.end>segment.start);
   // One cited action must not mask a different action later in the same passage.
   const matches=excerpt.matchAll(new RegExp(pattern.source,pattern.flags+'g'));
   let hit=null;for(const m of matches){const at=segment.start+m.index;if(!local.some(x=>x.layer==='canonical_event'&&x.start<=at&&x.end>=at+m[0].length)){hit=m;break;}}
   if(!hit)continue;
   const at=segment.start+hit.index,start=Math.max(segment.start,at-90),end=Math.min(segment.end,at+hit[0].length+110);
   if(!cueGroups.has(d))cueGroups.set(d,[]);
   cueGroups.get(d).push({domain:d,destinations:domains[d],start,end,excerpt:text.slice(start,end),interpretive_note_present:local.some(x=>x.layer==='interpretive_memory'),kind:'review_cue_not_a_fact'});
  }
 }
 const cues=[],groups=[...cueGroups.values()];const totalCues=groups.reduce((n,g)=>n+g.length,0);
 for(let i=0;cues.length<12&&i<segments.length;i++)for(const group of groups){if(cues.length>=12)break;if(group[i])cues.push(group[i]);}
 return {event_count:rows.length,canonical_candidates:rows.length-semantic.length,interpretive_memory_count:semantic.length,routes:[...by.values()],unclassified_event_ids:unclassified.slice(0,20),unclassified_count:unclassified.length,
  record_updates:recordTargets.slice(0,100),omitted_record_updates:Math.max(0,recordTargets.length-100),affected_sections:[...affected].map(([section,event_count])=>({section,event_count})),task_updates:updates.slice(0,40),omitted_task_updates:Math.max(0,updates.length-40),review_cues:cues,omitted_cues:Math.max(0,totalCues-cues.length),source_segments:segments.length,
  policy:'Routing reports intended destinations and record identities, not a second write, proof that every event is true or every detail was extracted. Review lexical cues in context; do not manufacture a transition. Supplemental memory is not canonical knowledge.'};
}
export function sceneMemoryDuplicateKey(e){return JSON.stringify([e.memory_kind,e.domain,e.actor??null,[...(e.actors||[])].sort(),e.place??null,e.summary,e.evidence]);}
/** Recall explicitly saved semantic notes, not generated summaries of old prose.
 * All sources are from the supplied active ancestry. Invalid scenes/events are
 * excluded. Round-robin across domains prevents one topic monopolizing context. */
const legacyRecord=e=>e?.type==='world'&&!isSceneMemory(e)&&!Object.keys(e).some(k=>k.endsWith('_version'))&&typeof e.key==='string'&&typeof e.description==='string'&&typeof e.evidence==='string'&&!!e.evidence.trim();
/** Legacy generic world records are searchable source hints, not migrations.
 * Domain labels below are lexical cues; actual names, claims and meaning
 * must be checked against the full scene before use. */
export function legacySourceRecall(scenes=[],projection={}, {actors:focus=[],place=null,queries=[],complete=true,maxRecords=8,maxChars=4200}={}){
 const phrases=[...new Set([...focus,place,...queries].filter(x=>typeof x==='string'&&x.trim()).map(x=>norm(x.trim())))];
 const badScenes=new Set(),badEvents=new Set();
 for(const f of projection.validation_warnings||[]){if(!f.scene_id)continue;if(f.event_id)badEvents.add(JSON.stringify([f.scene_id,f.event_id]));else badScenes.add(f.scene_id);}
 const records=[],keys=new Set();let total=0;
 const cap=Math.max(1,Math.min(20,Math.floor(Number(maxRecords)||8)));
 const order=(a,b)=>b.rank-a.rank||b.scene_index-a.scene_index||b.event_index-a.event_index;
 if(phrases.length)for(let i=scenes.length-1;i>=0;i--){
  const s=scenes[i];if(!s?.id||badScenes.has(s.id))continue;
  for(let j=(s.events||[]).length-1;j>=0;j--){
   const e=s.events[j];if(!legacyRecord(e)||badEvents.has(JSON.stringify([s.id,e.id])))continue;
   const hay=norm([e.key,e.description,e.evidence].join('\n')),matched=phrases.filter(x=>hay.includes(x));
   if(!matched.length)continue;
   const k=JSON.stringify([e.key,e.description,e.evidence]);if(keys.has(k))continue;keys.add(k);total++;
   const rank=matched.length;
   if(records.length>=cap*3&&rank<=records.at(-1).rank)continue;
   const cues=Object.entries(cuePatterns).filter(([,p])=>p.test(e.description+' '+e.evidence)).map(([d])=>d);
   records.push({rank,scene_index:i,event_index:j,key:compact(e.key,180),description:compact(e.description,360),quote:compact(e.evidence,320),quote_truncated:e.evidence.length>320,matched_terms:matched,possible_domains:cues,source:{scene_id:s.id,event_id:e.id,world_time:s.world_time??null},kind:'legacy_literal_source_hint'});
   records.sort(order);if(records.length>cap*3)records.pop();
  }
 }
 const selected=[];
 for(const row of records){if(selected.length>=cap)break;const {rank,scene_index,event_index,...r}=row;selected.push(r);if(JSON.stringify(selected).length>maxChars)selected.pop();}
 return {canonical:false,memory_complete:complete,total_matching:total,records:selected,omitted:total-selected.length,policy:'Old generic records only: lexical matches and possible routing domains are not proof of current state. Verify original source; never create a payment, item, relationship, knowledge or action from this hint alone.'};
}
export function sceneMemoryRecall(scenes=[],projection={}, {actors:focus=[],place=null,queries=[],complete=true,maxNotes=16,maxChars=7800}={}){
 const a=new Set(focus),q=[...new Set(queries.filter(x=>typeof x==='string'&&x.trim()).map(norm))].slice(0,8);
 const failures=new Set(),badScenes=new Set();
 for(const f of projection.validation_warnings||[]){if(!f.scene_id)continue;if(f.event_id)failures.add(JSON.stringify([f.scene_id,f.event_id]));else badScenes.add(f.scene_id);}
 const queues=new Map(),seen=new Set();let total=0;
 const cap=Math.max(1,Math.min(40,Math.floor(Number(maxNotes)||16)));maxNotes=cap;
 const compare=(a,b)=>b.rank-a.rank||b.scene_index-a.scene_index||b.event_index-a.event_index;
 const rank=(e)=>{const overlap=actors(e).filter(x=>a.has(x)).length;const exactPlace=place&&e.place===place;const text=[e.summary,e.place,e.domain,...(e.topics||[])].filter(Boolean).map(norm).join('\n');const query=q.some(x=>text.includes(x));return overlap*4+Number(!!exactPlace)*3+Number(query)*2;};
 for(let i=scenes.length-1;i>=0;i--){
  const s=scenes[i];if(!s?.id||badScenes.has(s.id))continue;
  for(let j=(s.events||[]).length-1;j>=0;j--){
   const e=s.events[j];if(!isSceneMemory(e)||sceneMemoryError(e)||failures.has(JSON.stringify([s.id,e.id])))continue;
   if(!rank(e))continue;
   const key=sceneMemoryDuplicateKey(e);if(seen.has(key))continue;seen.add(key);total++;
   const group=e.domain;if(!queues.has(group))queues.set(group,[]);
   const bucket=queues.get(group),score=rank(e);if(bucket.length>=cap*2&&score<=bucket.at(-1).rank)continue;
   bucket.push({rank:score,scene_index:i,event_index:j,domain:e.domain,memory_kind:e.memory_kind,actor:e.actor??null,actors:e.actors,place:e.place??null,topics:e.topics||[],summary:compact(e.summary,420),quote:compact(e.evidence,400),quote_truncated:e.evidence.length>400,source:{scene_id:s.id,event_id:e.id,world_time:s.world_time??null}});
   bucket.sort(compare);if(bucket.length>cap*2)bucket.pop();
  }
 }
 for(const rows of queues.values())rows.sort(compare);
 const notes=[],groups=[...queues.values()].sort((a,b)=>b[0].rank-a[0].rank);
 for(let i=0;i<Math.max(1,maxNotes)*2&&notes.length<maxNotes;i++)for(const group of groups){
  if(notes.length>=maxNotes)break;
  const row=group[i];if(!row)continue;
  const {rank,scene_index,event_index,...note}=row;
  notes.push(note);if(JSON.stringify(notes).length>maxChars)notes.pop();
 }
 return {canonical:false,memory_complete:complete,total_matching:total,notes,omitted:Math.max(0,total-notes.length),legacy_source_hints:legacySourceRecall(scenes,projection,{actors:focus,place,queries,complete}),policy:'Interpretive scene memory only. Read original source and verify speaker/context. Never grant knowledge, change ledger or treat an intention or claim as a performed action.'};
}
export function memoryCoverageSummary(scenes=[],{complete=true}={}){
 const counts={scenes:scenes.length,with_events:0,without_events:0,with_supplemental_memory:0,without_supplemental_memory:0,supplemental_records:0,legacy_generic_records:0,recoverable_legacy_knowledge_records:0},domains=Object.create(null);
 for(const s of scenes){const es=Array.isArray(s.events)?s.events:[],notes=es.filter(e=>isSceneMemory(e)&&!sceneMemoryError(e));
  counts[es.some(e=>!isSceneMemory(e))?'with_events':'without_events']++;
  counts[notes.length?'with_supplemental_memory':'without_supplemental_memory']++;counts.supplemental_records+=notes.length;
  for(const e of es){if(legacyRecord(e))counts.legacy_generic_records++;if(normalizeLegacyKnowledge(e)!==e)counts.recoverable_legacy_knowledge_records++;const route=eventRoute(e);domains[route.domain]=(domains[route.domain]||0)+1;}
 }
 return {complete,counts,domains,policy:'Counts are structural coverage indicators, not a semantic completeness score. Review original scenes for missing important details.'};
}
export const SCENE_MEMORY_GUIDANCE='СОХРАНЕНИЕ И ИЗВЛЕЧЕНИЕ: после написания реальной сцены перечитай ВЕСЬ текст от начала до конца, а не только последние реплики. Сначала выдели реальные изменения: состояние и внешность, местонахождение, знакомства и отношения, знания каждого участника, деньги и предметы, обязательства/сроки, учёба и навыки, работа и бизнес, жильё, магия и здоровье, общество/спорт, письма и документы, планы и последствия. Для каждого используй соответствующую существующую версионированную запись, стабильные ID и дословное evidence. Сравни изменения с текущими реестрами: существующий объект обновляй по его ID, новый создавай только если он действительно новый. Сначала обнови затронутые активные задания, затем проверь связанные состояния: финансы, предметы, здоровье, знания, встречи, работа и учёба. Не заменяй запись прогресса общим пересказом. Для знания обязательно type=knowledge (НЕ world), knowledge_version=1, actor, topic_id, fact, channel, status; отдельная запись на каждого обладателя. Сохраняй отдельные связанные операции в причинном порядке (перевод, владение, принятие, результат); не дублируй деньги или предметы. Значимые детали, для которых нет подходящей записи состояния, можно атомарно сохранить внутри events как type=world, scene_memory_version=1, id, memory_kind=observed/claim/intention/belief/description/uncertain, domain из character/relationships/knowledge/finance/inventory/property/education/work/magic/medicine/community/civic/documents/travel/calendar/goals/world/experiences, actors (до 8), actor обязательно для claim/intention/belief и входит в actors, summary (до 600), evidence (точная цитата до 1200), опционально place/topics. НЕ добавляй key или другой version. Это подсказка рассказчику с источником, НЕ состояние, НЕ знание героя и НЕ замена канонического события. Не делай двойную запись одного факта без причины. Не заменяй формальную запись смены, договора, навыка, знакомства или задачи заметкой, если уже есть все обязательные подтверждённые поля. Не выдумывай отсутствующее время, договор или результат. Запись встречи: interaction_version=1, actors, interaction_kind, description, evidence; она попадает в контакты даже без отношения. Явная долгосрочная цель — character.state_patch.personal_goal/career_goal/family_goal; конкретная открытая задача — type=plan с постоянным plan_id и action=start, выполненное действие не записывай как новую задачу. Для состоявшейся работы проверяй work_shift/wage и связь с фактической оплатой, не добавляй повторную money операцию. Перед сохранением используй review_scene_draft для всех игровых сцен; проверь routing, state_delta, identity_review, causal_review, task_review.possible_missing_updates и review_cues, сверяй незавершённые планы по active_tasks из следующего хода, не превращая слова в факты. Первый answered и последний pending остаются на своих местах. После save_scene проверь receipt/routing, не сохраняй повторно. При следующем ходе используй scene_memory_recall, включая legacy_source_hints, и focused context. Старые универсальные записи — только подсказки к первоисточнику; не считать их автоматически перенесёнными в реестр. Старые сцены с пропусками — read-only review, исторические подсказки отдельно через save_memory_notes, без ретроактивных событий. Никаких внешних платных API; смысловое извлечение выполняет сама модель рассказчика.';
