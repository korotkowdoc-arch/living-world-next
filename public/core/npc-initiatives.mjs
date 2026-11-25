/** Deterministic initiative shortlist. NPC plans remain theirs; only the narrator
 * can commit what actually happened. No random behavior or real-time ticking. */
const eligible=new Set(['intention','goal_opportunity','routine','habit_opportunity','employment','invitation','health_episode','assessment','home_condition','work_shift','production_order','enterprise','payment_schedule','appointment','journey','service_visit','development','family_duty','obligation','project','activity','contest']);
const blockers=new Set(['recorded_obstacle','recorded_place_constraint','stock_insufficient','stock_unknown','insufficient_recorded_funds','enterprise_not_operating','offer_custody_unconfirmed','competing_schedule','travel_requires_story','funds_unknown','clock_unknown','place_access_unknown','ambiguous_place']);
const mandatory=c=>c.timing==='reached_requires_story';
export function npcInitiativeView(candidates=[],{focus=[],player=null,players=[],settings={},scenes=[],complete=true,elapsed=null}={}){
 const known=[...new Set([player,...players].filter(Boolean))];
 const protectedActors=new Set(known.length?known:focus);
 // Without a named player or focus, a separate character must not be guessed.
 if(!protectedActors.size||!complete)return {initiatives:[],omitted:0,policy:'Player identity or complete history required; no inferred autonomous action.'};
 const byActor=new Map(),positions=new Map(scenes.map((s,i)=>[s.id,i]));
 const base={low:1,normal:3,high:6}[settings.agency]??3;
 const density={low:0,normal:1,high:2}[settings.events]??1;
 const timeBonus=Number.isFinite(elapsed)&&elapsed>=1440?2:Number.isFinite(elapsed)&&elapsed>=480?1:0;
 const limit=Math.min(10,base+density+timeBonus);
 for(const c of candidates){
  if(!eligible.has(c.kind)||c.status==='paused'||c.status==='suspended'||c.timing==='future'&&!['appointment','development'].includes(c.kind))continue;
  // The first participant is the recorded owner of personal plans and obligations.
  // Never reinterpret a counterparty as the owner of the player's plan.
  const actor=c.actors?.[0];
  if(!actor||protectedActors.has(actor))continue;
  const checks=(c.checks||[]).filter(x=>blockers.has(x.kind));
  const stale=c.source?.scene_id&&positions.has(c.source.scene_id)?scenes.length-1-positions.get(c.source.scene_id):null;
  const row={actor,kind:c.kind,key:c.key,title:c.title,status:c.status,source:c.source,place:c.place??null,player_involved:c.actors.some(x=>protectedActors.has(x)),reason:mandatory(c)?'recorded_due':c.timing==='scheduled_window_not_presence'?'routine_window':'own_recorded_motive',checks,checks_omitted:c.checks_omitted??0,next_step:c.next_step??null,obstacle:c.obstacle??null,priority:mandatory(c)?0:checks.length?2:1,scenes_since_update:stale,certainty:'candidate_only_not_performed'};
  if(!byActor.has(actor))byActor.set(actor,[]);
  byActor.get(actor).push(row);
 }
 const compare=(a,b)=>a.priority-b.priority||(b.scenes_since_update??-1)-(a.scenes_since_update??-1)||String(a.key).localeCompare(String(b.key));
 const groups=[...byActor.values()];for(const xs of groups)xs.sort(compare);
 groups.sort((a,b)=>compare(a[0],b[0])||a[0].actor.localeCompare(b[0].actor));
 const total=groups.reduce((n,x)=>n+x.length,0),result=[];
 // One per character per round prevents the same NPC monopolizing the world.
 // Urgent recorded duties take precedence over optional activity. Rotate actors within each tier.
 for(const urgent of [true,false]){
  const queues=groups.map(xs=>xs.filter(x=>(x.priority===0)===urgent));
  for(let i=0;result.length<limit&&queues.some(xs=>xs.length>i);i++)for(const xs of queues){if(xs[i])result.push(xs[i]);if(result.length>=limit)break;}
 }
 return {initiatives:result,omitted:Math.max(0,total-result.length),budget:limit,policy:'Narrator-only candidates grounded in each NPC own goal, schedule or responsibility; blocked actions require resolution. May happen independently of player, but do not act for player, manufacture consent, invent resources or claim a candidate already happened.'};
}
export const NPC_GUIDANCE='САМОСТОЯТЕЛЬНАЯ ЖИЗНЬ NPC: next_turn.npc_initiatives — внутренний список возможных инициатив отдельных NPC, не меню героя. У каждого кандидата собственная цель или обязательство, ограничения, источник и степень срочности. Используй особенно при переходах времени; не концентрируй все события на игроке, чередуй NPC, учитывай работу, деньги, расписания, препятствия и характер. Если кандидат конфликтует с условиями, NPC может отложить дело, изменить план или столкнуться с последствием. Не раскрывай приватный список игроку. Инициативы не являются событиями до записи offscreen/world/plan и доказанного результата; не совершай выбор за героя. Настройки agency/events меняют размер списка, а не принуждают к случайным приключениям.';
