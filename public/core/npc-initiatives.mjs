/** Deterministic initiative shortlist. NPC plans remain theirs; only the narrator
 * can commit what actually happened. No random behavior or real-time ticking. */
const eligible=new Set(['intention','goal_opportunity','routine','habit_opportunity','employment','lesson','assignment','estate_sale','invitation','household_invitation','household_task','career_change','consequence_response','expense_share','care_plan','care_support','shared_goal','shared_goal_invitation','health_episode','assessment','home_condition','work_shift','production_order','enterprise','payment_schedule','appointment','journey','service_visit','service_provider','supply_buyer','supply_supplier','development','family_duty','obligation','project','activity','contest_participant','community_member','market_peer','employer_response','mentor_response','thread_participant','agreement_party','market_offer']);
const blockers=new Set(['qualification_unconfirmed','recorded_obstacle','recorded_place_constraint','stock_insufficient','stock_unknown','insufficient_recorded_funds','enterprise_not_operating','offer_custody_unconfirmed','competing_schedule','travel_requires_story','funds_unknown','clock_unknown','place_access_unknown','ambiguous_place']);
const mandatory=c=>c.timing==='reached_requires_story';
const optionalKinds=new Set(['community_member','market_peer','habit_opportunity','mentor_response','thread_participant','contest_participant','goal_opportunity']);
/** Derive actor-specific opportunities from the latest canonical projection.
 * No new records, automatic rivalry, membership, transaction or private knowledge.
 * One pass over records plus bounded per-group context, not pairwise expansion. */
export function independentSocialOpportunities(records=[],people=[]){
 const out=[],groups=new Map(),institutions=new Map(),members=new Map(),markets=new Map();
 const known=new Set(people.map(p=>p.name));
 const add=(kind,r,actor,info={},extra={})=>{
  if(!actor||!r.source?.scene_id)return;
  out.push({kind,row:{...r,...extra,actor,actors:[actor],counterparty:null,key:JSON.stringify([kind,r.key,actor])},info:{timing:'requires_character_choice',record_key:r.key,...info}});
 };
 for(const r of records){
  if(r.social_record_version===1&&r.social_kind==='group'&&r.status==='active')groups.set(r.record_id,r);
  if(r.dynamics_version===1&&['enterprise','institution'].includes(r.dynamics_kind)&&['operating','restricted'].includes(r.status)){
   if(!institutions.has(r.group_id))institutions.set(r.group_id,r);
  }
  if(r.social_record_version===1&&r.social_kind==='membership'&&r.status==='member'){
   if(!members.has(r.group_id))members.set(r.group_id,new Map());
   members.get(r.group_id).set(r.actor,r);
  }
  if(r.dynamics_version===1&&r.dynamics_kind==='enterprise'&&r.status==='operating'&&r.actor&&r.place&&r.business_kind){
   const key=JSON.stringify([r.place,r.business_kind]);
   if(!markets.has(key))markets.set(key,new Map());
   const peers=markets.get(key);if(!peers.has(r.actor))peers.set(r.actor,r);
  }
  if(r.dynamics_version===1&&r.dynamics_kind==='contest'&&['open','negotiating'].includes(r.status)){
   for(const actor of new Set(r.actors||[]))add('contest_participant',r,actor,{resource:r.resource,participants:(r.actors||[]).slice(0,12),guidance:'Consider only this participant’s recorded claim or response; no automatic winner or knowledge of other plans.'});
  }
  if(r.social_record_version===1&&r.social_kind==='thread'&&r.status==='open'){
   for(const actor of new Set(r.actors||[]))add('thread_participant',r,actor,{guidance:'A recorded unresolved thread is an opportunity for this participant, not an obligation or predetermined outcome.'});
  }
  if(r.growth_version===1&&r.growth_kind==='skill'&&['learning','practicing'].includes(r.status)&&r.teacher&&r.teacher!==r.actor)
   add('mentor_response',r,r.teacher,{learner:r.actor,guidance:'The recorded teacher can initiate, reschedule or decline practice. No progress or attendance is implied.'});
  if(r.dynamics_version===1&&r.dynamics_kind==='employment'&&['offered','active'].includes(r.status)&&known.has(r.counterparty))
   add('employer_response',r,r.counterparty,{employee:r.actor,guidance:'Consider an independent employer decision or work coordination; no hiring, dismissal or wage change without evidence.'});
  if(r.dynamics_version===1&&r.dynamics_kind==='economic_agreement'&&['proposed','active','disputed'].includes(r.status))
   add('agreement_party',r,r.counterparty,{other_party:r.actor,guidance:'The other party may respond or negotiate. No unilateral settlement or transfer.'});
 }
 for(const [id,group] of groups){
  const institution=institutions.get(id),active=members.get(id);
  if(!institution||!active||active.size<2)continue;
  for(const member of active.values())add('community_member',member,member.actor,{group_id:id,group_name:group.name,role:member.role??null,purpose:group.purpose,group_source:group.source,institution_source:institution.source,guidance:'Recorded professional or institutional membership can motivate a contribution or disagreement, not establish loyalty, access or attendance.'},{title:group.name,place:institution.place});
 }
 for(const peers of markets.values()){
  if(peers.size<2)continue;
  const sample=[...peers.values()].slice(0,4);
  for(const r of peers.values())add('market_peer',r,r.actor,{business_kind:r.business_kind,peer_count:peers.size-1,peers:sample.filter(p=>p.actor!==r.actor).slice(0,3).map(p=>({actor:p.actor,title:p.title,source:p.source})),guidance:'Same recorded location and business category only; possible independent adaptation, cooperation or competition, not proven rivalry, price knowledge or demand.'});
 }
 return out;
}
export function npcInitiativeView(candidates=[],{focus=[],player=null,players=[],settings={},scenes=[],complete=true,elapsed=null}={}){
 const known=[...new Set([player,...players].filter(Boolean))];
 const protectedActors=new Set(known.length?known:focus);
 // Without a named player or focus, a separate character must not be guessed.
 if(!protectedActors.size||!complete)return {initiatives:[],omitted:0,policy:'Player identity or complete history required; no inferred autonomous action.'};
 const byActor=new Map(),seen=new Set(),positions=new Map(scenes.map((s,i)=>[s.id,i]));
 const base={low:1,normal:3,high:6}[settings.agency]??3;
 const density={low:0,normal:1,high:2}[settings.events]??1;
 const timeBonus=Number.isFinite(elapsed)&&elapsed>=1440?2:Number.isFinite(elapsed)&&elapsed>=480?1:0;
 const limit=Math.min(10,base+density+timeBonus);
 for(const c of candidates){
  if(!eligible.has(c.kind)||c.status==='paused'||c.status==='suspended'||c.timing==='future'&&!['appointment','development','supply_buyer','supply_supplier','consequence_response','expense_share','care_plan','care_support','shared_goal'].includes(c.kind))continue;
  // The first participant is the recorded owner of personal plans and obligations.
  // Never reinterpret a counterparty as the owner of the player's plan.
  const actor=c.actors?.[0];
  if(!actor||protectedActors.has(actor))continue;
  const identity=JSON.stringify([actor,c.kind,c.key]);if(seen.has(identity))continue;seen.add(identity);
  const checks=(c.checks||[]).filter(x=>blockers.has(x.kind));
  const stale=c.source?.scene_id&&positions.has(c.source.scene_id)?scenes.length-1-positions.get(c.source.scene_id):null;
  const row={actor,kind:c.kind,key:c.key,title:c.title,status:c.status,source:c.source,place:c.place??null,player_involved:c.actors.some(x=>protectedActors.has(x)),reason:mandatory(c)?'recorded_due':c.timing==='scheduled_window_not_presence'?'routine_window':'own_recorded_motive',checks,checks_omitted:c.checks_omitted??0,next_step:c.next_step??null,obstacle:c.obstacle??null,priority:mandatory(c)?0:checks.length||c.checks_omitted?3:optionalKinds.has(c.kind)?2:1,scenes_since_update:stale,record_key:c.record_key??null,context:c.record_key?Object.fromEntries(['resource','participants','learner','employee','other_party','group_id','group_name','role','purpose','group_source','institution_source','business_kind','peer_count','peers','guidance'].filter(k=>c[k]!=null).map(k=>[k,c[k]])):null,certainty:'candidate_only_not_performed'};
  if(!byActor.has(actor))byActor.set(actor,[]);
  byActor.get(actor).push(row);
 }
 const compare=(a,b)=>a.priority-b.priority||(b.scenes_since_update??-1)-(a.scenes_since_update??-1)||String(a.key).localeCompare(String(b.key));
 const groups=[...byActor.values()];for(const xs of groups)xs.sort(compare);
 groups.sort((a,b)=>compare(a[0],b[0])||a[0].actor.localeCompare(b[0].actor));
 const total=groups.reduce((n,x)=>n+x.length,0),result=[];
 // One per character per round prevents the same NPC monopolizing the world.
 // Urgent recorded duties take precedence over optional activity. Rotate actors within each tier.
 for(const tier of [0,1,2,3]){
  const queues=groups.map(xs=>xs.filter(x=>x.priority===tier));
  for(let i=0;result.length<limit&&queues.some(xs=>xs.length>i);i++)for(const xs of queues){if(xs[i])result.push(xs[i]);if(result.length>=limit)break;}
 }
 return {initiatives:result,omitted:Math.max(0,total-result.length),budget:limit,policy:'Narrator-only candidates grounded in each NPC own goal, schedule or responsibility; blocked actions require resolution. May happen independently of player, but do not act for player, manufacture consent, invent resources or claim a candidate already happened.'};
}
export const NPC_GUIDANCE='САМОСТОЯТЕЛЬНАЯ ЖИЗНЬ NPC: next_turn.npc_initiatives — внутренний список возможных инициатив отдельных NPC, не меню героя. У каждого кандидата собственная цель или обязательство, ограничения, источник и степень срочности. Используй особенно при переходах времени; не концентрируй все события на игроке, чередуй NPC, учитывай работу, деньги, расписания, препятствия и характер. Если кандидат конфликтует с условиями, NPC может отложить дело, изменить план или столкнуться с последствием. Не раскрывай приватный список игроку. Участники конкуренции, профессиональных групп, наставники и контрагенты имеют отдельные инициативы; схожие предприятия не означают вражду или известные цены. Инициативы не являются событиями до записи offscreen/world/plan и доказанного результата; не совершай выбор за героя. Настройки agency/events меняют размер списка, а не принуждают к случайным приключениям.';
