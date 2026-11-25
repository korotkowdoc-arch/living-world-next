/** Read-only in-chat menu projection. Owner preferences use existing audited directives.
 * They are not fictional facts, and viewing the menu cannot consume a pending choice. */
export const MENU_PREFIX='NEXT_MENU_V1:';
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
export function gameMenuContext({world,directives=[],context}){
 const p=menuPreferences(directives,world.active_branch_id);
 return {version:1,world_id:world.id,branch_id:world.active_branch_id,expected_head:context.head_scene_id??null,
  expected_rules_version:world.directive_version,history_complete:context.memory_complete,preferences:p,
  clock:context.recorded_agenda?.latest_recorded_time??null,clock_is_current:context.recorded_agenda?.anchor_is_latest_scene===true,
  pending_choice:context.player_choice?.status??'unknown',
  sections:[
   {id:'character',label:'Персонаж',read:'get_character_state',actions:['change_appearance']},
   {id:'inventory',label:'Инвентарь',read:'get_world_economy',actions:['use_item','equip_item']},
   {id:'finances',label:'Финансы',read:'get_world_economy',actions:['plan_purchase']},
   {id:'contacts',label:'Знакомые',read:'get_actor_memory',actions:['contact']},
   {id:'calendar',label:'Календарь',read:'get_world_agenda',actions:['plan_time']},
   {id:'journal',label:'Дневник',read:'get_branch_history',actions:[]},
   {id:'places',label:'Места',read:'get_living_world',actions:['travel']},
   {id:'skills',label:'Навыки',read:'get_character_growth',actions:['practice']},
   {id:'property',label:'Имущество',read:'get_world_economy',actions:['manage_property']},
   {id:'letters',label:'Письма',read:'get_character_knowledge',actions:['send_letter']},
   {id:'tasks',label:'Дела',read:'get_world_agenda',actions:['set_priority','clear_priority']},
   {id:'settings',label:'Настройки',read:'get_world_context',actions:['save_settings','reset_settings']}
  ],policy:'Read only; menu navigation never advances fictional time or answers the pending choice. No unobserved player information in immersive mode. Gameplay actions are explicit intents, resolved through the normal choice and scene workflow.'};
}
export function menuRecordFromInput(input,branchId){
 if(input?.kind==='settings')return parseMenuDirective(MENU_PREFIX+JSON.stringify({kind:'settings',settings:input.settings}));
 if(input?.kind==='focus')return parseMenuDirective(MENU_PREFIX+JSON.stringify({kind:'focus',branch_id:branchId,priorities:input.priorities}));
 throw Error('Unknown menu preference kind');
}
export function assertMenuAnchor(input,world,active){
 if(input.world_id!==world.id||input.branch_id!==world.active_branch_id||input.expected_head!==active.head_scene_id||input.expected_rules_version!==world.directive_version)throw Error('Stale menu: refresh the current game menu.');
}
const own=(v,actor)=>typeof v==='string'&&v===actor;
const sourceOf=x=>x?.source??null;
const display=x=>typeof x==='string'?x.slice(0,600):null;
/** Evidence-backed menu overview. The caller selects the player character explicitly;
 * no character is guessed from a seed and no incoming/private relationships are exposed. */
export function playerMenuOverview(projection={},actor,clock=null){
 if(typeof actor!=='string'||!actor.trim()||actor!==actor.trim()||actor.length>140)throw Error('Enter exact player character name');
 const character=(projection.people||[]).find(p=>p.name===actor);
 const fields=(character?.state_fields||[]).filter(x=>['appearance','location','condition','injury','occupation','education','residence','personal_goal','life_stage','birth_date'].includes(x.field));
 const held=(projection.items||[]).filter(x=>own(x.holder,actor)&&x.custody_status==='held');
 const goals=[
  ...(projection.plans||[]).filter(x=>own(x.actor,actor)&&['active','paused'].includes(x.status)).map(x=>({id:'plan:'+x.plan_id,title:display(x.goal),status:x.status,source:sourceOf(x)})),
  ...(projection.obligations||[]).filter(x=>own(x.actor,actor)&&!['completed','resolved','fulfilled','cancelled','broken','ended'].includes(x.status)).map(x=>({id:'commitment:'+String(x.source?.event_id??x.id??''),title:display(x.description||x.evidence||x.title),status:x.status,source:sourceOf(x)})),
  ...(projection.worldFacts||[]).filter(x=>x.growth_version===1&&x.growth_kind==='project'&&own(x.actor,actor)&&['planned','active','paused'].includes(x.status)).map(x=>({id:'project:'+x.record_id,title:display(x.title),status:x.status,source:sourceOf(x)}))
 ].filter(x=>x.title);
 const skills=(projection.worldFacts||[]).filter(x=>x.growth_version===1&&x.growth_kind==='skill'&&own(x.actor,actor)).map(x=>({id:x.record_id,name:x.name,status:x.status,source:sourceOf(x)}));
 const contacts=new Set();
 for(const x of projection.relationships||[])if(own(x.a,actor)&&typeof x.b==='string')contacts.add(x.b);
 for(const x of projection.worldFacts||[])if(x.interaction_version===1&&x.actors?.includes(actor))for(const name of x.actors)if(name!==actor)contacts.add(name);
 const bounded=rows=>({records:rows.slice(0,30),total:rows.length,omitted:Math.max(0,rows.length-30)});
 return {actor,clock,character:character?{name:actor,fields}:null,inventory:bounded(held.map(x=>({id:x.item_id,name:x.name??null,source:sourceOf(x)}))),balances:bounded((projection.balances||[]).filter(x=>own(x.actor,actor)).map(x=>({currency:x.currency,known:x.known===true,balance:x.known===true?x.balance:null,source:sourceOf(x)}))),tasks:bounded(goals),skills:bounded(skills),contacts:bounded([...contacts].map(name=>({name}))),policy:'Recorded observations only. Last location and appearance may be stale; missing fields are unknown. Contacts are not a guarantee of availability. No hidden NPC plans or incoming feelings.'};
}
export function menuActionIntent(input,overview){
 const action=input?.action;
 const simple={change_appearance:'Изменить внешний вид',use_item:'Использовать предмет',equip_item:'Экипировать предмет',plan_purchase:'Запланировать покупку',contact:'Связаться',plan_time:'Перейти к игровому времени',travel:'Отправиться в место',practice:'Тренироваться',manage_property:'Управлять имуществом',send_letter:'Отправить письмо'};
 if(!Object.hasOwn(simple,action))throw Error('Unknown gameplay action');
 if(typeof input.detail!=='string'||!input.detail.trim()||input.detail.length>1500)throw Error('Describe intended action');
 if(['use_item','equip_item'].includes(action)&&(!input.item_id||!overview.inventory.records.some(x=>x.id===input.item_id)))throw Error('Item not in confirmed visible inventory; refresh or use a free story action to establish availability.');
 return {action,actor:overview.actor,intent:simple[action]+': '+input.detail.trim(),item_id:input.item_id??null,saved:false,policy:'Explicit user intent only. Do not claim success, spend money or change appearance until the scene is narrated and saved. If a choice is pending use validate_player_choice custom with this intent.'};
}
export const MENU_GUIDANCE='ИГРОВОЕ МЕНЮ NEXT: /меню, /menu и обычная просьба открыть меню вызывают отдельный интерактивный интерфейс, а не сцену. Используй get_game_menu с точным именем управляемого игроком героя или game_menu из get_world_context; сохрани текущий pending choice. Для игровой кнопки после явного нажатия вызови validate_game_menu_action; это намерение, затем обычный цикл выбора и сохранения сцены. Покажи сетку разделов с кнопками, по нажатию открывай выбранный раздел (через новое сообщение пользователя, если клиент поддерживает кнопки). Вне поддержки кнопок — понятный текстовый выбор. Чтение меню, возврат, просмотр и настройки не тратят игровое время, не создают сцену и не являются ответом на выбор. Не придумывай проценты здоровья, вещи, задания или текущий адрес. Скрывай чужие тайны и планы по умолчанию. Настройки: после явного подтверждения владельца сохрани полный объект {kind:"settings",settings:...} как единственную активную директиву с префиксом NEXT_MENU_V1: и JSON. Используй save_game_menu_preferences с текущими world_id, branch_id, expected_head, expected_rules_version; при успехе перечитай меню. Если новая операция недоступна, не утверждай, что настройки сохранены. При conflict или can_edit=false не записывай, предложи разрешить дубликаты. Настройки применяются ко всем веткам мира. Темп slow — подробные короткие отрезки, normal — обычные сцены, dynamic — адаптивный, fast — сжатие рутины; никогда не пропускай значимый выбор, обязательства и последствия. detail управляет объёмом текста; agency — частотой обоснованных инициатив NPC; events — плотностью естественных событий; choices — формой передачи управления (значимый выбор всегда остаётся за игроком); visibility immersive — знания игрока, rpg — раскрытие игровых показателей без тайн, director — явно отмеченная режиссёрская информация; hud и skip_routine управляют отображением и сжатием. Дела: показывай подтверждённые собственные обязательства, цели, доступные игроку сведения. Выбор приоритета сохраняй отдельно как {kind:"focus",branch_id:текущая ветка,priorities:[до трёх целей в порядке важности]} в единственной активной директиве NEXT_MENU_V1:; используй save_game_menu_preferences с kind=focus, затем перечитай. Это указание рассказчику чаще показывать подходящие возможности и напоминания, не действие Гарри и не факт успеха. Не переносить приоритет из другой ветки, не отменять другие дела. Облик: показывай только подтверждённое appearance и доступную одежду; после явного намерения игрока проверь место, деньги, предметы и время, разреши реальное действие через текущий выбор или свободный ввод, затем сохрани character state_patch.appearance и необходимые экономические события с evidence. NPC реагируют только на то, что могут заметить, по характеру и ситуации. Покупки, поездки, тренировки, сообщения и прочие действия аналогично являются намерениями, не мгновенной записью результата. Настройки и приоритеты не расходуют выбор: после изменения версии правил восстанови тот же pending из обновлённого контекста, не используй старые кнопки.';
