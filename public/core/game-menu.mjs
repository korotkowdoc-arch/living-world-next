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
export const MENU_GUIDANCE='ИГРОВОЕ МЕНЮ NEXT: /меню, /menu и обычная просьба открыть меню вызывают отдельный интерактивный интерфейс, а не сцену. Используй game_menu из get_world_context, сохрани текущий pending choice. Покажи сетку разделов с кнопками, по нажатию открывай выбранный раздел (через новое сообщение пользователя, если клиент поддерживает кнопки). Вне поддержки кнопок — понятный текстовый выбор. Чтение меню, возврат, просмотр и настройки не тратят игровое время, не создают сцену и не являются ответом на выбор. Не придумывай проценты здоровья, вещи, задания или текущий адрес. Скрывай чужие тайны и планы по умолчанию. Настройки: после явного подтверждения владельца сохрани полный объект {kind:"settings",settings:...} как единственную активную директиву с префиксом NEXT_MENU_V1: и JSON. При сохранённом ID используй edit_world_directive с текущей версией, иначе add_world_directive; перечитай контекст и убедись в записи. При conflict или can_edit=false не записывай, предложи разрешить дубликаты. Настройки применяются ко всем веткам мира. Темп slow — подробные короткие отрезки, normal — обычные сцены, dynamic — адаптивный, fast — сжатие рутины; никогда не пропускай значимый выбор, обязательства и последствия. detail управляет объёмом текста; agency — частотой обоснованных инициатив NPC; events — плотностью естественных событий; choices — формой передачи управления (значимый выбор всегда остаётся за игроком); visibility immersive — знания игрока, rpg — раскрытие игровых показателей без тайн, director — явно отмеченная режиссёрская информация; hud и skip_routine управляют отображением и сжатием. Дела: показывай подтверждённые собственные обязательства, цели, доступные игроку сведения. Выбор приоритета сохраняй отдельно как {kind:"focus",branch_id:текущая ветка,priorities:[до трёх целей в порядке важности]} в единственной активной директиве NEXT_MENU_V1:; редактируй существующий ID или добавь, затем перечитай. Это указание рассказчику чаще показывать подходящие возможности и напоминания, не действие Гарри и не факт успеха. Не переносить приоритет из другой ветки, не отменять другие дела. Облик: показывай только подтверждённое appearance и доступную одежду; после явного намерения игрока проверь место, деньги, предметы и время, разреши реальное действие через текущий выбор или свободный ввод, затем сохрани character state_patch.appearance и необходимые экономические события с evidence. NPC реагируют только на то, что могут заметить, по характеру и ситуации. Покупки, поездки, тренировки, сообщения и прочие действия аналогично являются намерениями, не мгновенной записью результата. Настройки и приоритеты не расходуют выбор: после изменения версии правил восстанови тот же pending из обновлённого контекста, не используй старые кнопки.';
