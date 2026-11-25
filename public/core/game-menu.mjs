import {archiveIndex,ARCHIVE_ACTIONS,ARCHIVE_SECTIONS,validateArchiveAction} from './world-archive.mjs';
import {SOCIETY_ACTIONS,validateSocietyAction} from './magic-society.mjs';
import {magicIndex,MAGIC_ACTIONS,validateMagicAction} from './magic-world.mjs';
import {advancedIndex,ADVANCED_ACTIONS,validateAdvancedAction} from './advanced-world.mjs';
import {worldDepthIndex} from './world-depth.mjs';
import {playerPersonalLife,PERSONAL_ACTIONS,validatePersonalAction} from './personal-menu.mjs';
import {familyGoalView,FAMILY_GOAL_GUIDANCE} from './family-goals.mjs';
import {expenseCareView,EXPENSE_CARE_GUIDANCE} from './expense-care.mjs';
import {dutyCareerView,DUTY_CAREER_GUIDANCE} from './duty-career.mjs';
import {householdView,HOUSEHOLD_GUIDANCE} from './households-careers.mjs';
import {curriculumView,CURRICULUM_GUIDANCE} from './curriculum-supply.mjs';
import {ticketPaymentView,PREPAID_GUIDANCE} from './prepaid-travel.mjs';
import {marketHomeView,MARKET_HOME_GUIDANCE} from './market-home.mjs';
import {propertyView,PROPERTY_GUIDANCE} from './property-lessons.mjs';
import {socialDashboard,SOCIAL_DASHBOARD_GUIDANCE} from './social-dashboard.mjs';
import {homeView,HOME_GUIDANCE} from './home-systems.mjs';
import {workView,WORK_GUIDANCE} from './work-systems.mjs';
import {NPC_GUIDANCE} from './npc-initiatives.mjs';
import {travelServiceView,TRAVEL_GUIDANCE} from './travel-services.mjs';
import {playerOpportunities,OPPORTUNITY_GUIDANCE} from './player-opportunities.mjs';
import {playerLifeView,PLAYER_LIFE_GUIDANCE,ADVANCED_LIFE_GUIDANCE} from './player-life.mjs';
/** Read-only in-chat menu projection. Owner preferences use existing audited directives.
 * They are not fictional facts, and viewing the menu cannot consume a pending choice. */
export const MENU_PREFIX='NEXT_MENU_V1:';
export const MENU_REQUEST_PREFIX='NEXT_MENU_REQUEST_V1:';
export const DEFAULT_MENU_SETTINGS=Object.freeze({pace:'dynamic',detail:'high',agency:'normal',events:'normal',choices:'important',visibility:'immersive',hud:true,skip_routine:true});
const enums={pace:['slow','normal','dynamic','fast'],detail:['brief','normal','high','maximum'],agency:['low','normal','high'],events:['low','normal','high'],choices:['frequent','important','free'],visibility:['immersive','rpg','director']};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseMenuDirective(text){
 if(typeof text!=='string'||!text.startsWith(MENU_PREFIX))return null;
 let v;try{v=JSON.parse(text.slice(MENU_PREFIX.length));}catch{throw Error('Invalid NEXT menu JSON');}
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid NEXT menu record');
 if(v.kind==='settings'){
  if(Object.keys(v).length!==2||!v.settings||typeof v.settings!=='object'||Array.isArray(v.settings))throw Error('Invalid NEXT settings');
  const s=v.settings;
  if(Object.keys(s).length!==Object.keys(DEFAULT_MENU_SETTINGS).length||Object.keys(DEFAULT_MENU_SETTINGS).some(k=>!Object.hasOwn(s,k)))throw Error('Incomplete or unknown NEXT settings');
  for(const [k,values] of Object.entries(enums))if(!values.includes(s[k]))throw Error('Invalid menu setting: '+k);
  for(const k of ['hud','skip_routine'])if(typeof s[k]!=='boolean')throw Error('Invalid menu boolean: '+k);
  return {kind:'settings',settings:{...s}};
 }
 if(v.kind==='focus'){
  if(Object.keys(v).length!==3||typeof v.branch_id!=='string'||!uuid.test(v.branch_id)||!Array.isArray(v.priorities)||v.priorities.length>3||v.priorities.some(x=>typeof x!=='string'||!x.trim()||x.length>200))throw Error('Invalid NEXT branch priorities');
  const priorities=v.priorities.map(x=>x.trim());
  if(new Set(priorities).size!==priorities.length)throw Error('Duplicate priority');
  return {kind:'focus',branch_id:v.branch_id,priorities};
 }
 throw Error('Unknown NEXT menu record');
}
export function isMenuDirective(text){return typeof text==='string'&&text.startsWith(MENU_PREFIX);}
export function menuPreferences(directives=[],branchId){
 const settings=[],focus=[],warnings=[];
 for(const d of directives){
  if(d?.active===false||!isMenuDirective(d?.text))continue;
  try{
   const parsed=parseMenuDirective(d.text);
   if(parsed.kind==='settings')settings.push({id:d.id??null,...parsed});
   else if(parsed.branch_id===branchId)focus.push({id:d.id??null,...parsed});
  }catch(e){warnings.push('Invalid menu directive: '+(d.id??'unknown')+'; '+e.message);}
 }
 if(settings.length>1)warnings.push('Multiple active settings records; resolve duplicates before editing.');
 if(focus.length>1)warnings.push('Multiple active priority records for this branch; resolve duplicates before editing.');
 return {settings:settings.length===1?settings[0].settings:{...DEFAULT_MENU_SETTINGS},
  settings_directive_id:settings.length===1?settings[0].id:null,
  settings_status:settings.length===1?'saved':settings.length?'conflict':'default',
  priorities:focus.length===1?focus[0].priorities:[],focus_directive_id:focus.length===1?focus[0].id:null,
  focus_status:focus.length===1?'saved':focus.length?'conflict':'default',warnings,can_edit:!warnings.length};
}
const SECTION_META={
 rituals:['hero','circle-dashed'],alchemy:['hero','flask-conical'],magical_ecology:['world','leaf'],magical_clinics:['life','hospital'],magical_science:['world','microscope'],magic:['hero','wand-sparkles'],magical_medicine:['life','heart-pulse'],investments:['life','chart-no-axes-combined'],psychology:['hero','brain'],network:['social','network'],news:['world','newspaper'],timeline:['story','history'],map:['world','map'],interests:['hero','heart'],goals:['world','target'],circles:['social','users-round'],character:['hero','user-round'],health:['hero','heart-pulse'],wardrobe:['hero','shirt'],inventory:['hero','backpack'],
 library:['story','book-open'],documents:['story','file-text'],notebooks:['story','notebook-pen'],gallery:['story','image'],catalogues:['life','store'],newspapers:['world','newspaper'],medical_records:['life','heart-pulse'],bank_records:['life','landmark'],
 relationships:['social','users'],contacts:['social','contact'],letters:['social','mail'],
 finances:['life','wallet'],property:['life','house'],work:['life','briefcase-business'],education:['life','graduation-cap'],skills:['life','sparkles'],
 calendar:['world','calendar-days'],places:['world','map'],tasks:['world','list-checks'],journal:['story','book-open'],memories:['story','history'],settings:['story','settings']
};
export function dashboardSummary(overview){
 const l=overview.life,s=overview.social_dashboard,h=overview.home_systems,w=overview.work_systems;
 const notices=[];
 const add=(kind,section,title,source,priority='normal',extra={})=>notices.push({kind,section,title,source:source??null,priority,...extra});
 for(const n of l?.needs||[])if(['critical','urgent'].includes(n.forecast?.estimated_status??n.status))add('need','health',n.label,n.source,n.forecast?.estimated_status==='critical'||n.status==='critical'?'urgent':'normal',{status:n.status,estimate:n.forecast?.estimated_status??null});
 for(const e of s?.health.records||[])if(e.status!=='resolved'&&e.severity==='severe')add('health','health',e.title,e.source,'urgent');
 for(const e of s?.invitations.incoming.records||[])if(e.status==='sent')add('invitation','relationships',e.title,e.source,'normal',{invitation_id:e.id});
 for(const e of l?.letters.incoming.records||[])if(e.status==='delivered')add('letter','letters','Непрочитанное письмо от '+e.from,e.source,'normal',{letter_id:e.id});
 for(const e of l?.calendar?.entries||[])if(['due_now','past_unresolved','same_day_uncertain'].includes(e.timing))add(e.kind,'calendar',e.title,e.source,e.timing==='same_day_uncertain'?'normal':'urgent',{record_id:e.id,when:e.when});
 for(const e of overview.family_goals?.goals.records||[])if(e.membership==='invited'&&['proposed','active'].includes(e.status))add('shared_goal','tasks',e.title,e.source,'normal',{goal_id:e.id,membership_id:e.membership_id});
 for(const e of overview.expense_care?.shares.records||[])if(e.actor===overview.actor&&e.status==='proposed')add('expense_share','finances',e.title,e.source,'normal',{share_id:e.id});
 for(const e of overview.expense_care?.care_plans.records||[])if(e.status==='proposed')add('care_plan','health',e.title,e.source,'normal',{care_plan_id:e.id});
 for(const e of overview.duty_career?.tasks.records||[])if(e.actor===overview.actor&&e.status==='proposed'&&e.accessible)add('household_task','property',e.title,e.source,'normal',{household_task_id:e.id});
 for(const e of overview.household_career?.homes.records||[])if(e.status==='active'&&e.members.some(m=>m.actor===overview.actor&&m.status==='invited'))add('household_invitation','property',e.title,e.source,'normal',{household_id:e.id});
 for(const e of w?.shifts.records||[])if(e.actor===overview.actor&&e.settlement==='unpaid')add('wage','work',e.title,e.source,'normal',{shift_id:e.id});
 for(const e of h?.budgets.records||[])if(e.status==='active'&&e.over_recorded_limit===true)add('budget','finances',e.title,e.source,'normal');
 notices.sort((a,b)=>Number(b.priority==='urgent')-Number(a.priority==='urgent'));
 const field=name=>overview.character?.fields.find(x=>x.field===name)??null;
 return {actor:overview.actor,clock:overview.clock,location:field('location'),appearance:field('appearance'),notifications:{records:notices.slice(0,15),total:notices.length,omitted:Math.max(0,notices.length-15)},quick_actions:overview.opportunities?.options.slice(0,6)??[],counts:{inventory:overview.inventory.total,tasks:overview.tasks.total,contacts:s?.contacts.total??0,letters:l?.letters.incoming.total??0,library:overview.archive?.library?.total??0},policy:'Notifications are derived from visible recorded state, not automatic events; a past unresolved date is not proof of failure.'};
}
export function menuSection(overview,section){
 const l=overview.life,s=overview.social_dashboard,h=overview.home_systems,w=overview.work_systems,t=overview.travel;
 const sections={...Object.fromEntries(ARCHIVE_SECTIONS.map(k=>[k,overview.archive?.[k]])),rituals:overview.magic_system.society?.rituals,alchemy:overview.magic_system.society?.alchemy,magical_ecology:overview.magic_system.society?.ecology,magical_clinics:overview.magic_system.society?.clinics,magical_science:overview.magic_system.society?.science,magic:overview.magic_system.magic,magical_medicine:overview.magic_system.medicine,investments:{...overview.advanced.investments,loans:overview.advanced.loans},psychology:{...overview.world_depth.psychology,motives:overview.advanced.motives},network:overview.world_depth.social,news:{knowledge:overview.world_depth.news,...overview.advanced.channels},timeline:overview.world_depth.timeline,map:{...overview.world_depth.places,coordinates:overview.advanced.map_points},interests:{interests:overview.personal_life.interests,habits:overview.personal_life.habits,activities:overview.personal_life.activities},goals:{goals:overview.personal_life.goals,projects:overview.personal_life.projects,tasks:overview.tasks},circles:{circles:overview.personal_life.circles,contacts:s.contacts},character:{character:overview.character,needs:l.needs},health:{needs:l.needs,episodes:s.health,care:overview.household_career.care,care_plans:overview.expense_care.care_plans,quick_actions:l.quick_actions},wardrobe:{wardrobe:l.wardrobe,outfit:l.outfit,presets:l.presets},relationships:{...s,households:overview.household_career.homes,household_tasks:overview.duty_career.tasks,children:overview.family_goals.children,shared_goals:overview.family_goals.goals},contacts:{contacts:s.contacts},inventory:overview.inventory,finances:{financial_review:overview.world_depth.economy,balances:overview.balances,budgets:h.budgets,observed_prices:overview.market_home.observations,household_expenses:overview.expense_care.expenses,expense_shares:overview.expense_care.shares},property:{housing:h.housing,estates:overview.property_systems.estates,sales:overview.property_systems.sales,furnishing:overview.market_home.furnishing,households:overview.household_career.homes,contributions:overview.household_career.contributions,household_expenses:overview.expense_care.expenses,expense_shares:overview.expense_care.shares,household_tasks:overview.duty_career.tasks},work:{employment:t.work,businesses:t.businesses,shifts:w.shifts,recipes:w.recipes,services:overview.market_home.services,price_changes:overview.market_home.adjustments,supply_contracts:overview.curriculum_supply.supplies,job_eligibility:overview.household_career.jobs,career_history:overview.duty_career.careers},education:{enrollment:h.enrollment,assessments:h.assessments,practice:h.practice,lessons:overview.property_systems.lessons,assignments:overview.property_systems.assignments,programs:overview.curriculum_supply.programs,program_enrollments:overview.curriculum_supply.enrollments,qualifications:overview.curriculum_supply.qualifications},skills:overview.skills,calendar:l.calendar,places:{opportunities:overview.opportunities,travel:t,transport:w.transport,reservations:h.reservations,tickets:overview.property_systems.tickets,payments:overview.ticket_payments},letters:l.letters,tasks:{...overview.tasks,consequence_responses:overview.duty_career.responses,consequences:overview.duty_career.consequences,household_tasks:overview.duty_career.tasks,shared_goals:overview.family_goals.goals},journal:{read:'get_branch_history'},memories:{read:'get_actor_memory'},settings:{read:'get_world_context'}};
 if(!Object.hasOwn(sections,section))throw Error('Unknown menu section');
 return {section,data:sections[section]};
}

export function gameMenuContext({world,directives=[],context}){
 const p=menuPreferences(directives,world.active_branch_id);
 return {version:1,world_id:world.id,branch_id:world.active_branch_id,expected_head:context.head_scene_id??null,
  expected_rules_version:world.directive_version,history_complete:context.memory_complete,preferences:p,
  clock:context.recorded_agenda?.latest_recorded_time??null,clock_is_current:context.recorded_agenda?.anchor_is_latest_scene===true,
  pending_choice:context.player_choice?.status??'unknown',
  layout_version:8,sections:[
   {id:'library',label:'Библиотека',read:'get_game_menu',actions:['read_document','study_document','write_document','write_document_part','annotate_document','bookmark_document','remove_document_bookmark','review_document','publish_document','request_document_access']},
   {id:'documents',label:'Документы',read:'get_game_menu',actions:['read_document','write_document','write_document_part','annotate_document','request_document_access']},
   {id:'notebooks',label:'Записные книги',read:'get_game_menu',actions:['read_document','study_document','write_document','write_document_part','annotate_document','bookmark_document']},
   {id:'gallery',label:'Альбомы',read:'get_game_menu',actions:['read_document','write_document','write_document_part','annotate_document']},
   {id:'catalogues',label:'Каталоги',read:'get_game_menu',actions:['read_document','request_document_access']},
   {id:'newspapers',label:'Газетный архив',read:'get_game_menu',actions:['read_document','review_document','request_document_access']},
   {id:'medical_records',label:'Медицинская карта',read:'get_game_menu',actions:['read_document','request_document_access']},
   {id:'bank_records',label:'Банковские документы',read:'get_game_menu',actions:['read_document','request_document_access']},
   {id:'rituals',label:'Ритуалистика',read:'get_game_menu',actions:['plan_ritual','invite_ritual_member','respond_ritual_invitation','perform_ritual_stage']},
   {id:'alchemy',label:'Алхимия и артефакты',read:'get_game_menu',actions:['study_formula','brew_potion','maintain_enchantment']},
   {id:'magical_ecology',label:'Магические существа',read:'get_game_menu',actions:['study_species','visit_habitat']},
   {id:'magical_clinics',label:'Целительские учреждения',read:'get_game_menu',actions:['request_clinic','review_clinical_admission','seek_healer_credential']},
   {id:'magical_science',label:'Наука и открытия',read:'get_game_menu',actions:['join_laboratory','conduct_lab_research','file_patent','negotiate_patent_license']},
   {id:'magic',label:'Магия',read:'get_game_menu',actions:['study_magic','learn_technique','practice_magic','cast_magic','start_magic_research','continue_magic_research','create_artifact','investigate_magic','rest_magic','review_magic_law']},
   {id:'magical_medicine',label:'Магическая медицина',read:'get_game_menu',actions:['seek_magical_healer','request_magical_diagnosis','consider_therapy','respond_magic_course','continue_magic_course']},
   {id:'investments',label:'Инвестиции',read:'get_game_menu',actions:['review_investment','buy_investment','sell_investment','transfer_investment','issue_instrument','pay_distribution','offer_loan','respond_loan','repay_loan','review_loan']},
   {id:'psychology',label:'Личность',read:'get_game_menu',actions:['set_preference','set_aversion','set_life_goal','create_motive','edit_motive','resolve_motive']},
   {id:'network',label:'Круг общения',read:'get_game_menu',actions:['contact','invite_contact']},
   {id:'news',label:'Новости',read:'get_game_menu',actions:['seek_news','subscribe_news','cancel_subscription','publish_news']},
   {id:'timeline',label:'Хронология',read:'get_game_menu',actions:[]},
   {id:'map',label:'Карта мест',read:'get_game_menu',actions:['travel','explore','record_map_point']},
   {id:'interests',label:'Увлечения',read:'get_game_menu',actions:['set_preference','set_aversion','create_habit','edit_habit','pause_habit','resume_habit','abandon_habit','start_activity','practice_habit','continue_activity']},
   {id:'goals',label:'Жизненные цели',read:'get_game_menu',actions:['set_life_goal','start_project','edit_project','create_task','set_priority','clear_priority']},
   {id:'circles',label:'Сообщества',read:'get_game_menu',actions:['join_circle','leave_circle','contact','invite_contact']},
   {id:'character',label:'Персонаж',read:'get_character_state',actions:['change_appearance','equip_item','remove_item','eat','drink','rest','wash','relax','save_outfit','apply_outfit','remove_outfit']},
   {id:'health',label:'Здоровье',read:'get_character_state',actions:['eat','drink','rest','wash','relax','seek_care','plan_care','respond_care_plan','finish_care_plan']},
   {id:'wardrobe',label:'Гардероб',read:'get_character_state',actions:['change_appearance','equip_item','remove_item','save_outfit','apply_outfit','remove_outfit']},
   {id:'relationships',label:'Отношения',read:'get_relationship_history',actions:['contact','invite_contact','respond_invitation','withdraw_invitation','review_reputation','record_child_milestone','propose_shared_goal','invite_shared_goal','respond_shared_goal','leave_shared_goal','advance_shared_goal','finish_shared_goal','plan_consequence_response','perform_consequence_response']},
   {id:'work',label:'Работа',read:'get_world_dynamics',actions:['seek_work','respond_employment','perform_work','start_shift','finish_shift','claim_wage','manage_business','manage_recipe','adjust_price','propose_supply','respond_supply','settle_supply','dispute_supply','set_job_requirements','plan_career_change','finish_career_change']},
   {id:'education',label:'Учёба',read:'get_character_growth',actions:['apply_education','take_assessment','practice','attend_lesson','submit_assignment','review_program','request_qualification']},
   {id:'memories',label:'Воспоминания',read:'get_actor_memory',actions:[]},
   {id:'inventory',label:'Инвентарь',read:'get_world_economy',actions:['use_item','equip_item']},
   {id:'finances',label:'Финансы',read:'get_world_economy',actions:['plan_purchase','seek_work','respond_employment','perform_work','manage_business','start_shift','finish_shift','claim_wage','manage_recipe','set_budget','review_budget','record_household_expense','propose_expense_share','respond_expense_share','pay_expense_share']},
   {id:'contacts',label:'Знакомые',read:'get_actor_memory',actions:['contact','review_reputation','invite_contact','respond_invitation','withdraw_invitation']},
   {id:'calendar',label:'Календарь',read:'get_world_agenda',actions:['plan_time','plan_routine','plan_appointment','change_appointment','cancel_appointment']},
   {id:'journal',label:'Дневник',read:'get_branch_history',actions:[]},
   {id:'places',label:'Места',read:'get_living_world',actions:['travel','explore','continue_activity','practice_habit','plan_journey','continue_journey','pause_journey','cancel_journey','request_service','complete_service','cancel_service','choose_transport','reserve_service','cancel_reservation','issue_ticket','use_ticket','cancel_ticket','prepay_ticket','refund_ticket']},
   {id:'skills',label:'Навыки',read:'get_character_growth',actions:['practice','apply_education','take_assessment']},
   {id:'property',label:'Имущество',read:'get_world_economy',actions:['manage_property','arrange_lease','end_lease','repair_home','offer_estate','respond_estate_sale','settle_estate_sale','repair_estate','place_furnishing','remove_furnishing','create_household','invite_household','respond_household','leave_household','contribute_household','assign_household_task','respond_household_task','finish_household_task']},
   {id:'letters',label:'Письма',read:'get_character_knowledge',actions:['send_letter','read_letter']},
   {id:'tasks',label:'Дела',read:'get_world_agenda',actions:['set_priority','clear_priority','create_task','edit_task','pause_task','resume_task','abandon_task','propose_shared_goal','invite_shared_goal','respond_shared_goal','leave_shared_goal','advance_shared_goal','finish_shared_goal','plan_consequence_response','perform_consequence_response']},
   {id:'settings',label:'Настройки',read:'get_world_context',actions:['save_settings','reset_settings']}
  ].map(s=>({...s,group:SECTION_META[s.id]?.[0]??'world',icon:SECTION_META[s.id]?.[1]??'circle'})),policy:'Read only; menu navigation never advances fictional time or answers the pending choice. No unobserved player information in immersive mode. Gameplay actions are explicit intents, resolved through the normal choice and scene workflow.'};
}
export function menuRecordFromInput(input,branchId){
 if(input?.kind==='settings')return parseMenuDirective(MENU_PREFIX+JSON.stringify({kind:'settings',settings:input.settings}));
 if(input?.kind==='focus')return parseMenuDirective(MENU_PREFIX+JSON.stringify({kind:'focus',branch_id:branchId,priorities:input.priorities}));
 throw Error('Unknown menu preference kind');
}
/** Compatibility for clients whose OAuth session cached the old tools/list.
 * A request is an explicit operation, not a directive to be stored verbatim. */
export function parseLegacyMenuRequest(text,worldId){
 if(typeof text!=='string'||!text.startsWith(MENU_REQUEST_PREFIX))return null;
 if(text.length>5000)throw Error('Menu request too long');
 let v;try{v=JSON.parse(text.slice(MENU_REQUEST_PREFIX.length));}catch{throw Error('Invalid menu request JSON');}
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['branch_id','expected_head','expected_rules_version','kind','settings','priorities'].includes(k)))throw Error('Invalid menu request');
 if(typeof v.branch_id!=='string'||!uuid.test(v.branch_id)||!(v.expected_head===null||typeof v.expected_head==='string'&&uuid.test(v.expected_head))||!Number.isSafeInteger(v.expected_rules_version)||v.expected_rules_version<0)throw Error('Menu request must pin branch, head and version');
 if(v.kind==='settings'&&Object.hasOwn(v,'priorities')||v.kind==='focus'&&Object.hasOwn(v,'settings'))throw Error('Ambiguous menu request');
 const record=menuRecordFromInput(v,v.branch_id);
 return {world_id:worldId,branch_id:v.branch_id,expected_head:v.expected_head,expected_rules_version:v.expected_rules_version,kind:record.kind,...(record.kind==='settings'?{settings:record.settings}:{priorities:record.priorities})};
}
export function assertMenuAnchor(input,world,active){
 if(input.world_id!==world.id||input.branch_id!==world.active_branch_id||input.expected_head!==active.head_scene_id||input.expected_rules_version!==world.directive_version)throw Error('Stale menu: refresh the current game menu.');
}
const own=(v,actor)=>typeof v==='string'&&v===actor;
const sourceOf=x=>x?.source??null;
const display=x=>typeof x==='string'?x.slice(0,600):null;
/** Evidence-backed menu overview. The caller selects the player character explicitly;
 * no character is guessed from a seed and no incoming/private relationships are exposed. */
export function playerMenuOverview(projection={},actor,clock=null,options={}){
 if(typeof actor!=='string'||!actor.trim()||actor!==actor.trim()||actor.length>140)throw Error('Enter exact player character name');
 const character=(projection.people||[]).find(p=>p.name===actor);
 const fields=(character?.state_fields||[]).filter(x=>['appearance','location','condition','injury','occupation','education','residence','personal_goal','life_stage','birth_date'].includes(x.field));
 const held=(projection.items||[]).filter(x=>own(x.holder,actor)&&x.custody_status==='held');
 const goals=[
  ...(projection.plans||[]).filter(x=>own(x.actor,actor)&&['active','paused'].includes(x.status)).map(x=>({id:'plan:'+x.plan_id,title:display(x.goal),status:x.status,source:sourceOf(x)})),
  ...(projection.obligations||[]).filter(x=>own(x.actor,actor)&&!['completed','resolved','fulfilled','cancelled','broken','ended'].includes(x.status)).map(x=>({id:'commitment:'+String(x.commitment_id??x.id??''),title:display(x.description||x.evidence||x.title),status:x.status,source:sourceOf(x)})),
  ...(projection.worldFacts||[]).filter(x=>x.growth_version===1&&x.growth_kind==='project'&&own(x.actor,actor)&&['planned','active','paused'].includes(x.status)).map(x=>({id:'project:'+x.record_id,title:display(x.title),status:x.status,source:sourceOf(x)}))
 ].filter(x=>x.title);
 const skills=(projection.worldFacts||[]).filter(x=>x.growth_version===1&&x.growth_kind==='skill'&&own(x.actor,actor)).map(x=>({id:x.record_id,name:x.name,status:x.status,source:sourceOf(x)}));
 const contacts=new Set();
 for(const x of projection.relationships||[])if(own(x.a,actor)&&typeof x.b==='string')contacts.add(x.b);
 for(const x of projection.worldFacts||[])if(x.interaction_version===1&&x.actors?.includes(actor))for(const name of x.actors)if(name!==actor)contacts.add(name);
 const bounded=rows=>({records:rows.slice(0,30),total:rows.length,omitted:Math.max(0,rows.length-30)});
 const archive=archiveIndex(options.scenes||[],projection,{complete:options.complete!==false});
 const overview={actor,clock,archive:archive.view(actor,{offset:options.offset??0,limit:options.limit??24}),magic_system:magicIndex(options.scenes||[],projection,{complete:options.complete!==false}).view(actor,{offset:options.offset??0,limit:options.limit??24}),advanced:advancedIndex(options.scenes||[],projection,{complete:options.complete!==false}).view(actor,{offset:options.offset??0,limit:options.limit??24}),world_depth:worldDepthIndex(options.scenes||[],projection,{complete:options.complete!==false}).view(actor,{offset:options.offset??0,limit:Math.min(options.limit??40,40)}),personal_life:playerPersonalLife(projection,actor),family_goals:familyGoalView(projection,actor,clock),expense_care:expenseCareView(projection,actor),duty_career:dutyCareerView(projection,actor),household_career:householdView(projection,actor),curriculum_supply:curriculumView(projection,actor),ticket_payments:ticketPaymentView(projection,actor),market_home:marketHomeView(projection,actor),property_systems:propertyView(projection,actor),social_dashboard:socialDashboard(projection,actor,options.scenes),home_systems:homeView(projection,actor,clock),work_systems:workView(projection,actor,clock),travel:travelServiceView(projection,actor),opportunities:playerOpportunities(projection,actor,{...options,clock}),life:playerLifeView(projection,actor,{...options,clock}),character:character?{name:actor,fields}:null,inventory:bounded(held.map(x=>({id:x.item_id,name:x.name??null,source:sourceOf(x)}))),balances:bounded((projection.balances||[]).filter(x=>own(x.actor,actor)).map(x=>({currency:x.currency,known:x.known===true,balance:x.known===true?x.balance:null,source:sourceOf(x)}))),tasks:bounded(goals),skills:bounded(skills),contacts:bounded([...contacts].map(name=>({name}))),policy:'Recorded observations only. Last location and appearance may be stale; missing fields are unknown. Contacts are not a guarantee of availability. No hidden NPC plans or incoming feelings.'};
 const result={...overview,dashboard:dashboardSummary(overview)};
 Object.defineProperties(result,{archive_reader:{value:(doc,part)=>archive.open(actor,doc,part)},archive_owner:{value:doc=>archive.owns(actor,doc)}});
 return result;
}
export const MENU_ACTION_LABELS=Object.freeze({...ARCHIVE_ACTIONS,...SOCIETY_ACTIONS,...MAGIC_ACTIONS,...ADVANCED_ACTIONS,...PERSONAL_ACTIONS,change_appearance:'Изменить внешний вид',use_item:'Использовать предмет',equip_item:'Экипировать предмет',plan_purchase:'Запланировать покупку',seek_work:'Искать работу',start_shift:'Начать смену',finish_shift:'Закончить смену',claim_wage:'Получить оплату',choose_transport:'Выбрать транспорт',manage_recipe:'Настроить ресурсы услуги',respond_employment:'Ответить на предложение работы',perform_work:'Выполнить рабочую задачу',manage_business:'Управлять предприятием',review_program:'Посмотреть учебную программу',request_qualification:'Получить квалификацию',propose_supply:'Предложить договор поставки',respond_supply:'Ответить на договор поставки',settle_supply:'Исполнить поставку',dispute_supply:'Обсудить нарушение договора',contact:'Связаться',invite_contact:'Пригласить на встречу',respond_invitation:'Ответить на приглашение',withdraw_invitation:'Отозвать приглашение',seek_care:'Обратиться за помощью',plan_time:'Перейти к игровому времени',travel:'Отправиться в место',plan_journey:'Спланировать путешествие',continue_journey:'Продолжить путешествие',pause_journey:'Приостановить путешествие',cancel_journey:'Отменить путешествие',request_service:'Заказать услугу',complete_service:'Воспользоваться услугой',cancel_service:'Отменить заказ',explore:'Осмотреться',continue_activity:'Продолжить занятие',practice_habit:'Заняться привычным делом',practice:'Тренироваться',manage_property:'Управлять имуществом',create_household:'Создать совместное хозяйство',invite_household:'Пригласить в хозяйство',respond_household:'Ответить на приглашение',leave_household:'Выйти из хозяйства',contribute_household:'Внести вклад в расходы',set_job_requirements:'Установить требования к вакансии',place_furnishing:'Разместить предмет дома',remove_furnishing:'Убрать предмет',adjust_price:'Изменить цену услуги',offer_estate:'Предложить продажу недвижимости',respond_estate_sale:'Ответить на предложение',settle_estate_sale:'Заключить сделку',repair_estate:'Отремонтировать недвижимость',issue_ticket:'Оформить билет',prepay_ticket:'Оплатить билет заранее',refund_ticket:'Вернуть оплаченный билет',use_ticket:'Воспользоваться билетом',cancel_ticket:'Отменить билет',attend_lesson:'Посетить занятие',submit_assignment:'Сдать задание',set_budget:'Настроить бюджет',review_budget:'Пересмотреть бюджет',record_household_expense:'Записать семейный расход',propose_expense_share:'Предложить долю расходов',respond_expense_share:'Ответить на предложение доли',pay_expense_share:'Возместить согласованную долю',plan_care:'Запланировать заботу о здоровье',respond_care_plan:'Ответить на план заботы',finish_care_plan:'Выполнить план заботы',arrange_lease:'Договориться об аренде',end_lease:'Завершить аренду',repair_home:'Заняться ремонтом',reserve_service:'Забронировать услугу',cancel_reservation:'Отменить бронирование',apply_education:'Подать заявление на обучение',take_assessment:'Пройти испытание',review_reputation:'Обсудить репутацию',record_child_milestone:'Заняться развитием ребёнка',propose_shared_goal:'Предложить совместную цель',invite_shared_goal:'Пригласить участника',respond_shared_goal:'Ответить на приглашение к цели',leave_shared_goal:'Выйти из совместной цели',advance_shared_goal:'Продвинуть совместную цель',finish_shared_goal:'Завершить совместную цель',assign_household_task:'Предложить домашнюю обязанность',respond_household_task:'Ответить на предложение',finish_household_task:'Выполнить домашнюю обязанность',plan_career_change:'Обсудить карьерный переход',finish_career_change:'Завершить карьерный переход',plan_consequence_response:'Запланировать решение проблемы',perform_consequence_response:'Выполнить план решения проблемы',send_letter:'Отправить письмо',read_letter:'Прочитать письмо',remove_item:'Снять одежду',eat:'Поесть',drink:'Попить',rest:'Отдохнуть',wash:'Привести себя в порядок',relax:'Отвлечься',plan_routine:'Запланировать распорядок',create_task:'Поставить личную цель',edit_task:'Изменить личную цель',pause_task:'Приостановить личную цель',resume_task:'Возобновить личную цель',abandon_task:'Отказаться от личной цели',save_outfit:'Сохранить комплект одежды',apply_outfit:'Надеть комплект',remove_outfit:'Удалить комплект',plan_appointment:'Предложить встречу',change_appointment:'Изменить встречу',cancel_appointment:'Отменить встречу'});
export function menuActionIntent(input,overview){
 const action=input?.action;
 const simple=MENU_ACTION_LABELS;
 if(!Object.hasOwn(simple,action))throw Error('Unknown gameplay action');
 if(typeof input.detail!=='string'||!input.detail.trim()||input.detail.length>1500)throw Error('Describe intended action');
 validatePersonalAction(input,overview);
 validateAdvancedAction(input,overview);
 validateMagicAction(input,overview);
 validateSocietyAction(input,overview);
 validateArchiveAction(input,overview);
 if(['use_item','equip_item'].includes(action)&&(!input.item_id||!overview.inventory.records.some(x=>x.id===input.item_id)))throw Error('Item not in confirmed visible inventory; refresh or use a free story action to establish availability.');
 if(action==='remove_item'&&!Object.values(overview.life?.outfit?.slots||{}).includes(input.item_id))throw Error('Item is not currently equipped');
 if(action==='send_letter'&&input.letter_body!=null&&(typeof input.letter_body!=='string'||!input.letter_body.trim()||input.letter_body.length>5000||typeof input.letter_subject!=='string'||!input.letter_subject.trim()||input.letter_subject.length>200||typeof input.letter_recipient!=='string'||!input.letter_recipient.trim()||input.letter_recipient.length>140))throw Error('Invalid full letter');
 if(action==='read_letter'&&!overview.life?.letters?.incoming.records.some(x=>x.id===input.letter_id))throw Error('Letter is not in confirmed inbox');
 if(['edit_task','pause_task','resume_task','abandon_task'].includes(action)){const task=overview.tasks.records.find(x=>x.id===input.task_id&&x.id.startsWith('plan:'));if(!task)throw Error('Personal task not found');if(action==='pause_task'&&task.status!=='active'||action==='resume_task'&&task.status!=='paused')throw Error('Invalid task status');}
 if(['apply_outfit','remove_outfit'].includes(action)){const preset=overview.life?.presets.records.find(x=>x.id===input.preset_id);if(!preset||action==='apply_outfit'&&preset.missing.length)throw Error('Preset is unknown or missing clothing');}
 if(['change_appointment','cancel_appointment'].includes(action)&&!overview.life?.calendar.entries.some(x=>x.kind==='appointment'&&x.id===input.appointment_id))throw Error('Appointment is not in visible calendar');
 if(['continue_journey','pause_journey','cancel_journey'].includes(action)&&!overview.travel?.journeys.records.some(x=>x.id===input.journey_id&& (action==='pause_journey'?x.status==='travelling':['planned','travelling','paused'].includes(x.status))))throw Error('Journey is unavailable');
 if(action==='request_service'&&!overview.travel?.catalogue.records.some(x=>x.id===input.service_id&&x.status==='available'))throw Error('Service is not in the known available catalogue');
 if(['complete_service','cancel_service'].includes(action)&&!overview.travel?.visits.records.some(x=>x.id===input.visit_id&&(action==='complete_service'?x.status==='accepted':['requested','accepted'].includes(x.status))))throw Error('Service request is unavailable');
 if(['respond_employment','perform_work'].includes(action)&&!overview.travel?.work.records.some(x=>x.id===input.employment_id&&(action==='respond_employment'?x.status==='offered':x.status==='active'&&x.actor===overview.actor)))throw Error('Employment is unavailable');
 if(action==='manage_business'&&!overview.travel?.businesses.records.some(x=>x.id===input.enterprise_id&&x.status!=='closed'))throw Error('Enterprise is unavailable');
 if(['start_shift','finish_shift','claim_wage'].includes(action)&&!overview.work_systems?.shifts.records.some(x=>x.id===input.shift_id&&x.actor===overview.actor&&(action==='start_shift'?x.status==='scheduled':action==='finish_shift'?x.status==='working':x.settlement==='unpaid')))throw Error('Shift is unavailable');
 if(action==='choose_transport'&&!overview.work_systems?.transport.records.some(x=>x.id===input.transit_id&&x.status==='scheduled'&&x.timing!=='past'))throw Error('Transport notice is unavailable');
 if(['end_lease','repair_home'].includes(action)&&!overview.home_systems?.housing.records.some(x=>x.id===input.lease_id&&x.status==='active'))throw Error('Active lease is unavailable');
 if(action==='cancel_reservation'&&!overview.home_systems?.reservations.records.some(x=>x.id===input.reservation_id&&x.status==='reserved'))throw Error('Reservation is unavailable');
 if(action==='take_assessment'&&!overview.home_systems?.assessments.records.some(x=>x.id===input.assessment_id&&x.status==='scheduled'))throw Error('Assessment is unavailable');
 if(action==='respond_invitation'&&!overview.social_dashboard?.invitations.incoming.records.some(x=>x.id===input.invitation_id&&x.status==='sent'))throw Error('Incoming invitation unavailable');
 if(action==='withdraw_invitation'&&!overview.social_dashboard?.invitations.outgoing.records.some(x=>x.id===input.invitation_id&&x.status==='sent'))throw Error('Outgoing invitation unavailable');
 if(['offer_estate','repair_estate'].includes(action)&&!overview.property_systems?.estates.records.some(x=>x.id===input.estate_id))throw Error('Estate not owned');
 if(['respond_estate_sale','settle_estate_sale'].includes(action)&&!overview.property_systems?.sales.records.some(x=>x.id===input.sale_id&&(action==='respond_estate_sale'?x.buyer===overview.actor&&x.status==='offered':x.status==='accepted')))throw Error('Sale is unavailable');
 if(action==='issue_ticket'&&!overview.home_systems?.reservations.records.some(x=>x.id===input.reservation_id&&x.status==='reserved'))throw Error('Reserved service unavailable');
 if(action==='prepay_ticket'&&(!overview.property_systems.tickets.records.some(x=>x.id===input.ticket_id&&x.status==='reserved')||overview.ticket_payments.records.some(x=>x.ticket_id===input.ticket_id)))throw Error('Ticket prepayment unavailable');
 if(action==='refund_ticket'&&!overview.ticket_payments.records.some(x=>x.ticket_id===input.ticket_id&&x.actor===overview.actor&&x.status==='paid'))throw Error('Paid ticket unavailable');
 if(['use_ticket','cancel_ticket'].includes(action)&&!overview.property_systems?.tickets.records.some(x=>x.id===input.ticket_id&&x.status==='reserved'))throw Error('Ticket unavailable');
 if(action==='attend_lesson'&&!overview.property_systems?.lessons.records.some(x=>x.id===input.lesson_id&&x.status==='scheduled'))throw Error('Lesson unavailable');
 if(action==='submit_assignment'&&!overview.property_systems?.assignments.records.some(x=>x.id===input.assignment_id&&x.status==='assigned'))throw Error('Assignment unavailable');
 if(action==='adjust_price'&&!overview.market_home.services.records.some(x=>x.id===input.service_id))throw Error('Service is not owned');
 if(action==='place_furnishing'&&(!overview.inventory.records.some(x=>x.id===input.item_id)||!(overview.property_systems.estates.records.some(x=>x.id===input.estate_id)||overview.home_systems.housing.records.some(x=>x.id===input.lease_id&&x.status==='active'))))throw Error('Placement needs owned item and accessible home');
 if(action==='remove_furnishing'&&!overview.market_home.furnishing.records.some(x=>x.id===input.furnishing_id))throw Error('Placement unavailable');
 if(action==='review_program'&&!overview.curriculum_supply.enrollments.records.some(x=>x.id===input.program_enrollment_id))throw Error('Program enrollment unavailable');
 if(action==='request_qualification'&&!overview.curriculum_supply.enrollments.records.some(x=>x.id===input.program_enrollment_id&&x.status==='completed'))throw Error('Completed program unavailable');
 if(['respond_supply','settle_supply','dispute_supply'].includes(action)&&!overview.curriculum_supply.supplies.records.some(x=>x.id===input.contract_id&&(action==='respond_supply'?x.status==='proposed':action==='dispute_supply'?x.status==='active':['active','disputed'].includes(x.status))))throw Error('Supply contract unavailable');
 if(action==='propose_supply'&&!overview.travel.businesses.records.some(x=>x.id===input.enterprise_id&&x.status==='operating'))throw Error('Operating business unavailable');
 if(action==='create_household'&&!(overview.property_systems.estates.records.some(x=>x.id===input.estate_id)||overview.home_systems.housing.records.some(x=>x.id===input.lease_id&&x.status==='active')))throw Error('Accessible home required');
 if(action==='invite_household'&&!overview.household_career.homes.records.some(x=>x.id===input.household_id&&x.host===overview.actor&&x.status==='active'))throw Error('Household unavailable');
 if(['respond_household','leave_household','contribute_household'].includes(action)&&!overview.household_career.homes.records.some(x=>x.id===input.household_id&&(action==='leave_household'||x.status==='active')&&x.members.some(m=>m.actor===overview.actor&&m.id===input.member_id&&(action==='respond_household'?m.status==='invited':action==='leave_household'?['joined','access_unconfirmed'].includes(m.status):m.status==='joined'))))throw Error('Membership unavailable');
 if(action==='set_job_requirements'&&!overview.household_career.jobs.records.some(x=>x.id===input.employment_id&&x.employer===overview.actor&&x.status==='offered'&&!x.requirements_specified))throw Error('Job offer unavailable');
 if(action==='assign_household_task'&&!overview.household_career.homes.records.some(x=>x.id===input.household_id&&x.host===overview.actor&&x.status==='active'))throw Error('Household unavailable');
 if(['respond_household_task','finish_household_task'].includes(action)&&!overview.duty_career.tasks.records.some(x=>x.id===input.household_task_id&&x.actor===overview.actor&&x.accessible&&x.status===(action==='respond_household_task'?'proposed':'accepted')))throw Error('Household task unavailable');
 if(action==='plan_career_change'&&!overview.household_career.jobs.records.some(x=>x.id===input.employment_id&&x.applicant===overview.actor&&['active','suspended'].includes(x.status)))throw Error('Current job unavailable');
 if(action==='finish_career_change'&&!overview.duty_career.careers.records.some(x=>x.id===input.career_change_id&&x.status==='proposed'))throw Error('Career change unavailable');
 if(action==='plan_consequence_response'&&!overview.duty_career.consequences.records.some(x=>x.id===input.consequence_id&&x.status!=='resolved'))throw Error('Own open consequence unavailable');
 if(action==='perform_consequence_response'&&!overview.duty_career.responses.records.some(x=>x.id===input.response_id&&x.status==='planned'))throw Error('Response unavailable');
 if(action==='record_household_expense'&&!overview.household_career.homes.records.some(x=>x.id===input.household_id&&x.host===overview.actor&&x.status==='active'))throw Error('Active hosted household required');
 if(action==='propose_expense_share'&&!overview.expense_care.expenses.records.some(x=>x.id===input.expense_id&&x.host===overview.actor))throw Error('Own expense required');
 if(['respond_expense_share','pay_expense_share'].includes(action)&&!overview.expense_care.shares.records.some(x=>x.id===input.share_id&&x.actor===overview.actor&&x.status===(action==='respond_expense_share'?'proposed':'accepted')))throw Error('Expense share unavailable');
 if(action==='plan_care'&&!overview.social_dashboard.health.records.some(x=>x.id===input.episode_id&&x.status!=='resolved'))throw Error('Own unresolved health episode required');
 if(['respond_care_plan','finish_care_plan'].includes(action)&&!overview.expense_care.care_plans.records.some(x=>x.id===input.care_plan_id&&x.status===(action==='respond_care_plan'?'proposed':'accepted')))throw Error('Care plan unavailable');
 if(action==='record_child_milestone'&&!overview.family_goals.children.records.some(x=>x.id===input.child_id&&x.parents.includes(overview.actor)))throw Error('Known child and parenthood required');
 if(['invite_shared_goal','finish_shared_goal'].includes(action)&&!overview.family_goals.goals.records.some(x=>x.id===input.goal_id&&x.organizer===overview.actor&&(action==='invite_shared_goal'?['proposed','active'].includes(x.status):x.status==='active'&&x.steps.every(s=>s.completed))))throw Error('Shared goal unavailable');
 if(['respond_shared_goal','leave_shared_goal','advance_shared_goal'].includes(action)&&!overview.family_goals.goals.records.some(x=>x.id===input.goal_id&&['proposed','active'].includes(x.status)&&(action==='respond_shared_goal'?x.membership==='invited'&&x.membership_id===input.membership_id:action==='leave_shared_goal'?x.membership==='accepted'&&x.membership_id===input.membership_id:x.status==='active'&&['accepted','organizer'].includes(x.membership)&&x.steps.some(s=>s.id===input.step_id&&!s.completed))))throw Error('Shared goal membership or step unavailable');
 return {action,letter_body:input.letter_body??null,letter_subject:input.letter_subject??null,letter_recipient:input.letter_recipient??null,document_id:input.document_id??null,part_id:input.part_id??null,...Object.fromEntries(['ritual_id','ritual_session_id','ritual_member_id','formula_id','species_id','habitat_id','clinic_id','admission_id','lab_id','patent_id'].map(k=>[k,input[k]??null])),loan_id:input.loan_id??null,technique_id:input.technique_id??null,training_id:input.training_id??null,research_id:input.research_id??null,diagnosis_id:input.diagnosis_id??null,course_id:input.course_id??null,instrument_id:input.instrument_id??null,lot_id:input.lot_id??null,motive_id:input.motive_id??null,channel_id:input.channel_id??null,subscription_id:input.subscription_id??null,habit_id:input.habit_id??null,project_id:input.project_id??null,circle_id:input.circle_id??null,goal_id:input.goal_id??null,membership_id:input.membership_id??null,step_id:input.step_id??null,child_id:input.child_id??null,expense_id:input.expense_id??null,share_id:input.share_id??null,care_plan_id:input.care_plan_id??null,episode_id:input.episode_id??null,consequence_id:input.consequence_id??null,household_task_id:input.household_task_id??null,career_change_id:input.career_change_id??null,response_id:input.response_id??null,household_id:input.household_id??null,member_id:input.member_id??null,program_enrollment_id:input.program_enrollment_id??null,contract_id:input.contract_id??null,furnishing_id:input.furnishing_id??null,estate_id:input.estate_id??null,sale_id:input.sale_id??null,ticket_id:input.ticket_id??null,lesson_id:input.lesson_id??null,assignment_id:input.assignment_id??null,invitation_id:input.invitation_id??null,lease_id:input.lease_id??null,reservation_id:input.reservation_id??null,assessment_id:input.assessment_id??null,shift_id:input.shift_id??null,transit_id:input.transit_id??null,employment_id:input.employment_id??null,enterprise_id:input.enterprise_id??null,journey_id:input.journey_id??null,service_id:input.service_id??null,visit_id:input.visit_id??null,preset_id:input.preset_id??null,appointment_id:input.appointment_id??null,task_id:input.task_id??null,letter_id:input.letter_id??null,actor:overview.actor,intent:simple[action]+': '+input.detail.trim(),item_id:input.item_id??null,saved:false,policy:'Explicit user intent only. Do not claim success, spend money or change appearance until the scene is narrated and saved. If a choice is pending use validate_player_choice custom with this intent.'};
}
// A single shared envelope replaces repeated schema boilerplate. Keep every
// individual record's required fields, transitions and policy in the module guides.
const LIFE_GUIDES=[FAMILY_GOAL_GUIDANCE,EXPENSE_CARE_GUIDANCE,DUTY_CAREER_GUIDANCE,HOUSEHOLD_GUIDANCE,CURRICULUM_GUIDANCE,PREPAID_GUIDANCE,MARKET_HOME_GUIDANCE,PROPERTY_GUIDANCE,SOCIAL_DASHBOARD_GUIDANCE,HOME_GUIDANCE,WORK_GUIDANCE,NPC_GUIDANCE,TRAVEL_GUIDANCE,OPPORTUNITY_GUIDANCE,ADVANCED_LIFE_GUIDANCE,PLAYER_LIFE_GUIDANCE];
const compactLifeGuide=s=>s.replace(/player_life_version=1,\s*record_id,\s*key=player-life:<life_kind>:<ID>,\s*evidence\.\s*/g,'');
export const MENU_GUIDANCE='Все записи player_life_version=1: type=world, life_kind, record_id, key=player-life:<life_kind>:<ID>, evidence=дословная цитата. Ниже дополнительные поля и переходы; действия, деньги, знания и согласие только по фактам.\n'+LIFE_GUIDES.map(compactLifeGuide).join('\n')+'\n'+
'ЛИЧНОЕ МЕНЮ: interests/goals/circles — только свои записи. Предпочтения, антипатии, цели: character.state_patch; привычки/занятия: activity habit/activity, постоянный ID; проекты: growth project; сообщества: social membership. Только сыгранные действия, не чужие планы. ИГРОВОЕ МЕНЮ NEXT: /меню, /menu или просьба открыть меню → get_game_menu (точное имя героя) или game_menu из get_world_context; dashboard для уведомлений, sections для сетки, section для раздела. Кнопки через новое сообщение пользователя, иначе текстовый выбор. Чтение/возврат/настройки не тратят время, не создают сцену и не отвечают на pending choice. Не выдумывай показатели и не раскрывай чужие тайны. Действие после явного нажатия → validate_game_menu_action → обычный цикл выбора и сохранения сцены; намерение не результат. При старом списке инструментов используй game_menu, get_character_state, get_world_economy, validate_player_choice(custom). Проверяй принадлежность, условия, ветку и версию. Настройки и приоритеты сохраняй только после подтверждения через save_game_menu_preferences с world_id,branch_id,expected_head,expected_rules_version. Храни единственную активную NEXT_MENU_V1: JSON {kind:"settings",settings:полный объект} (весь мир) либо {kind:"focus",branch_id,priorities:[до 3]} (текущая ветка). При недоступном инструменте add_world_directive с NEXT_MENU_REQUEST_V1: JSON {branch_id,expected_head,expected_rules_version,kind,settings или priorities}. Сервер выполнит ту же атомарную операцию. При конфликте/can_edit=false не записывай; без квитанции перечитай. После успеха обнови меню и тот же pending choice, старые кнопки не используй. pace slow/normal/dynamic/fast — от подробных отрезков до сжатия рутины, без пропуска значимых решений/обязательств. detail — объём, agency — обоснованные инициативы, events — плотность событий, choices — форма передачи управления, visibility immersive/rpg/director — знания героя/показатели/явно отмеченная режиссёрская информация, hud/skip_routine — отображение/сжатие. Приоритеты — plan:<ID>/project:<ID>/commitment:<ID> из overview.tasks предпочтительнее названия; не переносятся между ветками, не отменяют другие цели и не доказывают успех. Облик — подтверждённый appearance и доступная одежда; проверь место, деньги, предметы и время, затем character state_patch.appearance и экономические события. NPC реагируют на наблюдаемое по характеру. Все действия меню — намерения до сыгранной сцены.';
