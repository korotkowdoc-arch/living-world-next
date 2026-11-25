/** Player menu: only own intentions and activities, never narrator-only NPC context. */
const clip=x=>typeof x==='string'?x.slice(0,300):null;
const page=rows=>({records:rows.slice(0,40),total:rows.length,omitted:Math.max(0,rows.length-40)});
export function playerPersonalLife(p={},actor){
 const facts=p.worldFacts||[],person=(p.people||[]).find(x=>x.name===actor);
 const fields=(person?.state_fields||[]).filter(x=>['preference','aversion','habit','personal_goal','career_goal','family_goal'].includes(x.field)).map(x=>({field:x.field,title:clip(x.value),source:x.source}));
 const own=facts.filter(x=>x.actor===actor);
 const compact=x=>({id:x.record_id,title:clip(x.name||x.title),status:x.status,description:clip(x.description),frequency:clip(x.frequency),next_step:clip(x.next_step),obstacle:clip(x.obstacle),outcome:clip(x.outcome),due_at:x.due_at??null,source:x.source});
 const groups=new Map(facts.filter(x=>x.social_kind==='group'&&x.social_record_version===1).map(x=>[x.record_id,x]));
 return {interests:page(fields.filter(x=>['preference','aversion','habit'].includes(x.field))),habits:page(own.filter(x=>x.activity_version===1&&x.activity_kind==='habit').map(compact)),activities:page(facts.filter(x=>x.activity_version===1&&x.activity_kind==='activity'&&x.actors?.includes(actor)).map(compact)),goals:page(fields.filter(x=>x.field.endsWith('_goal'))),projects:page(own.filter(x=>x.growth_version===1&&x.growth_kind==='project').map(compact)),circles:page(own.filter(x=>x.social_record_version===1&&x.social_kind==='membership').map(x=>({id:x.record_id,title:clip(groups.get(x.group_id)?.name)||x.group_id,status:x.status,role:clip(x.role),source:x.source}))),policy:'Own recorded interests, activities, goals, projects and memberships only. No hidden threads, other members or causal claims.'};
}
export const PERSONAL_ACTIONS=Object.freeze({set_preference:'Уточнить предпочтение',set_aversion:'Уточнить антипатию',create_habit:'Добавить увлечение или привычку',edit_habit:'Изменить увлечение',pause_habit:'Приостановить привычку',resume_habit:'Возобновить привычку',abandon_habit:'Отказаться от привычки',start_activity:'Начать занятие',set_life_goal:'Определить жизненную цель',start_project:'Начать личный проект',edit_project:'Изменить проект',join_circle:'Вступить в сообщество',leave_circle:'Покинуть сообщество'});
export const PERSONAL_ACTION_IDS=Object.freeze({edit_habit:'habit_id',pause_habit:'habit_id',resume_habit:'habit_id',abandon_habit:'habit_id',edit_project:'project_id',leave_circle:'circle_id'});
export function validatePersonalAction(input,overview){
 const field=PERSONAL_ACTION_IDS[input.action];if(!field)return;
 const life=overview.personal_life;
 const list=field==='habit_id'?life?.habits:field==='project_id'?life?.projects:life?.circles;
 const x=list?.records.find(x=>x.id===input[field]);
 if(!x)throw Error('Own personal record unavailable');
 if(input.action==='pause_habit'&&x.status!=='active'||input.action==='resume_habit'&&x.status!=='paused'||input.action==='abandon_habit'&&!['active','paused'].includes(x.status)||input.action==='edit_habit'&&!['active','paused','unknown'].includes(x.status)||input.action==='edit_project'&&!['planned','active','paused'].includes(x.status)||input.action==='leave_circle'&&!['member','candidate','suspended'].includes(x.status))throw Error('Personal record status does not allow this action');
}
