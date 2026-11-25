import {travelServiceView} from './travel-services.mjs';
/** Player-visible opportunities, not guarantees of access, money or NPC consent. */
import {parseStoryDate} from './world-time.mjs';
const str=(v,max=300)=>typeof v==='string'?v.slice(0,max):null;
const source=x=>x?.source??null;
const closed=new Set(['closed','restricted','damaged','destroyed']);
export function playerOpportunities(projection={},actor,{scenes=[],clock=null,complete=true}={}){
 const head=scenes.at(-1)?.id??null,character=(projection.people||[]).find(x=>x.name===actor);
 const location=character?.state_fields?.find(x=>x.field==='location');
 const place=location?.value||null,atHead=!!head&&source(location)?.scene_id===head;
 const records=projection.worldFacts||[],knownPlaces=new Map();
 const remember=(name,s,reason)=>{if(typeof name==='string'&&name.trim()&&!knownPlaces.has(name))knownPlaces.set(name,{name,source:s,reason});};
 remember(place,source(location),'last_recorded_location');
 const home=character?.state_fields?.find(x=>x.field==='residence');
 remember(home?.value,source(home),'recorded_residence');
 for(const s of scenes)for(const e of s.events||[])if(e.type==='character'&&e.name===actor){
  const from={scene_id:s.id,event_id:e.id,world_time:s.world_time??null};
  remember(e.state_patch?.location,from,'recorded_visit');remember(e.state_patch?.residence,from,'recorded_residence');
 }
 const habits=records.filter(x=>x.activity_version===1&&x.activity_kind==='habit'&&x.actor===actor&&x.status==='active');
 const activities=records.filter(x=>x.activity_version===1&&x.activity_kind==='activity'&&x.actors?.includes(actor)&&['planned','in_progress'].includes(x.status));
 const routines=records.filter(x=>x.world_record_version===1&&x.record_kind==='routine'&&x.actor===actor&&x.status==='active');
 const meetings=records.filter(x=>x.player_life_version===1&&x.life_kind==='appointment'&&x.participants?.includes(actor)&&(x.status==='confirmed'||x.status==='proposed'&&x.actor===actor));
 for(const x of [...habits,...activities,...routines,...meetings])remember(x.place,source(x),'own_planned_or_recorded_activity');
 const places=[...knownPlaces.values()].map(x=>{
  // Only a place observation in the same saved scene as the hero's location can
  // inform a visible access hint. Offscreen closure/opening is not disclosed.
  const p=records.filter(r=>r.world_record_version===1&&r.record_kind==='place'&&r.name===x.name&&source(r)?.scene_id===x.source?.scene_id);
  return {...x,current_location:place===x.name&&atHead,access:p.length===1?p[0].status:'unknown',access_source:p.length===1?source(p[0]):null};
 });
 const options=[];
 const add=(action,label,detail,extra={})=>options.push({id:action+':'+options.length,action,label,detail,availability:'requires_scene_check',...extra});
 const travel=travelServiceView(projection,actor);
 for(const x of travel.journeys.records.filter(x=>['travelling','paused','planned'].includes(x.status)).slice(0,3))add('continue_journey','Продолжить: '+x.title,'Продолжить путешествие '+x.title,{journey_id:x.id,place:x.next_stop?.place??null,source:x.source});
 for(const x of travel.visits.records.filter(x=>x.status==='accepted').slice(0,4))add('complete_service',x.title,'Воспользоваться принятой услугой '+x.title,{visit_id:x.id,place:x.place,amount:x.amount,currency:x.currency,source:x.source});
 for(const x of travel.catalogue.records.filter(x=>x.status==='available'&&x.place===place&&atHead).slice(0,8))add('request_service',x.title,'Уточнить условия и заказать '+x.title,{service_id:x.id,place:x.place,amount:x.amount,currency:x.currency,affordability:x.affordability,availability:x.affordability==='insufficient_recorded_funds'?'recorded_funds_insufficient':'requires_scene_check',source:x.source});
 for(const x of travel.work.records.filter(x=>x.status==='active'&&x.actor===actor&&x.place===place&&atHead).slice(0,3))add('perform_work',x.title,'Выполнить рабочие обязанности: '+x.title,{employment_id:x.id,place:x.place,source:x.source});
 if(place&&atHead)add('explore','Осмотреться','Осмотреться в '+place,{source:source(location)});
 if(home?.value&&home.value!==place)add('travel','Вернуться домой','Отправиться домой: '+home.value,{place:home.value,source:source(home)});
 for(const x of activities.slice(0,6))add('continue_activity',str(x.name,140),'Продолжить занятие: '+x.name,{activity_id:x.record_id,place:x.place??null,source:source(x)});
 for(const x of habits.slice(0,6))add('practice_habit',str(x.name,140),'Заняться привычным делом: '+x.name,{activity_id:x.record_id,place:x.place??null,source:source(x)});
 for(const x of places.filter(x=>!x.current_location&&!closed.has(x.access)).slice(0,10))if(!options.some(o=>o.action==='travel'&&o.place===x.name))add('travel','Отправиться: '+x.name,'Отправиться в '+x.name,{place:x.name,source:x.source});
 for(const x of (projection.worldFacts||[]).filter(x=>x.growth_version===1&&x.growth_kind==='skill'&&x.actor===actor&&['learning','practicing','competent','advanced'].includes(x.status)).slice(0,5))add('practice','Потренироваться: '+x.name,'Потренировать навык '+x.name,{skill_id:x.record_id,source:source(x)});
 const recent=new Set();
 for(const x of records)if(x.interaction_version===1&&x.actors?.includes(actor)&&head&&source(x)?.scene_id===head)for(const n of x.actors)if(n!==actor)recent.add(n);
 for(const n of [...recent].slice(0,5))add('contact','Продолжить общение: '+n,'Попробовать продолжить общение с '+n,{contact:n});
 const current=parseStoryDate(clock??scenes.at(-1)?.world_time);
 const reminders=meetings.filter(x=>x.status==='confirmed').map(x=>({id:x.record_id,title:x.title,starts_at:x.starts_at,place:x.place,source:source(x),timing:current?.precision==='minute'&&parseStoryDate(x.starts_at)?.order<=current.order?'review_due':'scheduled'})).slice(0,10);
 return {location:{name:place,source:source(location),current_scene_observation:atHead},known_places:{records:places.slice(0,40),total:places.length,omitted:Math.max(0,places.length-40)},options:options.slice(0,24),omitted_options:Math.max(0,options.length-24),reminders,history_complete:complete,policy:'Only own recorded locations, activities and interactions. No hidden place list, private NPC schedules, guaranteed travel, access, presence or purchases.'};
}
export const OPPORTUNITY_GUIDANCE='КОНТЕКСТНЫЕ ДЕЙСТВИЯ: overview.opportunities.options — предложения из известных герою мест, занятий, навыков и недавних контактов. Покажи доступные действия кнопками; не превращай в гарантированный результат. Для неизвестного места разреши свободное исследование. В разделе Места используй known_places, не показывай неизвестные герою заведения, закрытия или скрытые локации. Список недавних собеседников не доказывает, что они ещё рядом. Напоминания — только собственные подтверждённые встречи. В текущем подтверждённом месте предложи известные услуги с последней узнанной ценой; нехватку средств покажи как препятствие, не как бесплатное получение. Предлагай продолжение маршрута и принятых заказов, собственную работу.';
