import { classifyDirective,extractLocks } from './directives.mjs';
import {storyDrivers,storyDriverPrompt} from './story-drivers.mjs';
import {limitedNarratorMemory,narratorSceneExcerpt} from './narration-budget.mjs';
import {agendaNarrationGuidance,recordedWorldAgenda} from './world-time.mjs';

export const FOUNDATIONS = Object.freeze([
  {
    key: 'initiative', name: 'Инициатива и характер',
    text: 'Каждый персонаж имеет собственные цели, желания и право проявлять инициативу, действовать, спорить, ошибаться, проявлять настойчивость и открыто выражать чувства. Не подменяй автономность бесконечным ожиданием разрешения другого героя. Поведение индивидуально и учитывает контекст и отказ.'
  },
  {
    key: 'no-forced-harmony', name: 'Без обязательного примирения',
    text: 'Не стремись автоматически превращать ненависть во взаимное уважение, конфликт в компромисс, соперников в друзей. Вражда может сохраняться пожизненно. Совместная опасность, спасение и сотрудничество сами по себе не доказывают улучшения отношений.'
  },
  {
    key: 'causality', name: 'Последствия и знания',
    text: 'Никто не узнаёт фактов без канала получения информации. Деньги, предметы, травмы, обязательства, решения и события сохраняются по подтверждённым сценам действующей ветки. Планы не равны совершившимся событиям.'
  },
  {
    key: 'living-world', name: 'Жизнь вне главного героя',
    text: 'Второстепенные персонажи не ждут игрока: у них свои занятия, интересы, связи, конфликты. Разумные события вне кадра возможны при наличии времени и причин, но не считаются фактом без записи события.'
  },
  {
    key: 'continuous-scenes', name: 'Цельное повествование',
    text: 'Пиши сцену цельно от третьего лица, без обязательного меню выборов и без внезапного обрыва разговора, конфликта либо близости ради смены темы. Не оптимизируй историю для всеобщей гармонии или чередования сюжетных жанров.'
  }
]);

export function buildWorldDraft(raw) {
  const seed = String(raw ?? '').trim().replace(/\r\n/g, '\n');
  if (seed.length < 8) throw new Error('Опиши мир хотя бы одним предложением.');
  if (seed.length > 12000) throw new Error('Описание слишком длинное (максимум 12 000 символов).');
  const first = seed.split(/[\n.!?]/, 1)[0].trim();
  const short = first.length > 58 ? first.slice(0, 57).trimEnd() + '…' : first;
  const yearMatch = seed.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\s*(?:г\.|года|год)?\b/i);
  return {
    title: short || 'Новый мир',
    seed,
    start_marker: yearMatch ? `${yearMatch[1]} год (точная дата не установлена)` : 'Время ещё не установлено',
    description: seed.length > 200 ? seed.slice(0, 197) + '…' : seed,
    auto_save: true,
    directives: [],
    foundations: FOUNDATIONS.map(({key}) => key)
  };
}

export function promptForNarrator({world, directives = [], history = [], projection = null, timeContext = null}={}) {
  if (!world?.seed) throw new Error('Нет описания выбранного мира.');
  const blocks = [
    'Ты — рассказчик интерактивного причинного мира. Художественный текст — на русском от третьего лица.',
    'ОСНОВА МИРА:\n' + world.seed,
    'ПОСТОЯННЫЕ ПРИНЦИПЫ:\n' + FOUNDATIONS.map(x => `• ${x.text}`).join('\n'),
  ];
  const active=directives.filter(x=>x.active!==false);
  if (active.length) blocks.push('УСТАНОВЛЕННЫЕ ИГРОКОМ УСЛОВИЯ (приоритетнее творческой импровизации):\n' + active.map(x=>`• ${x.text}`).join('\n'));
  const locks=extractLocks(active);
  if(locks.length)blocks.push('ЖЁСТКИЕ ОГРАНИЧЕНИЯ ОТНОШЕНИЙ — НЕ ПЕРЕОСМЫСЛЯЙ:\n' + locks.map(x=>`${x.a} ↔ ${x.b}: ${x.forbid_reconciliation?'нет примирения/дружбы; ':''}${x.forbid_respect?'нет взаимного уважения; ':''}совместная опасность/помощь не меняет эту установку`).join('\n'));
  if (projection){
    const sample=limitedNarratorMemory(projection);
    blocks.push('ДОКАЗАТЕЛЬНАЯ ПАМЯТЬ ДЛЯ СЛЕДУЮЩЕЙ СЦЕНЫ (выборка, не исчерпывающий архив):\n' + JSON.stringify(sample));
    const omitted=Object.entries(sample.omitted||{});
    if(omitted.length)blocks.push('ПРОПУЩЕННЫЕ ЗАПИСИ ДЛИННОЙ ПАМЯТИ (не значит, что событий не было): '+omitted.map(([key,count])=>key+': '+count).join('; ')+'. Запроси первоисточники через MCP перед утверждением фактов.');
    blocks.push('Если краткая память не содержит нужного факта, он НЕ становится ложным или неизвестным — найди первоисточник в MCP по всей действующей ветке.');
    const pending=(projection.plans||[]).filter(p=>['active','paused'].includes(p.status));
    if(pending.length)blocks.push('САМОСТОЯТЕЛЬНЫЕ ПЛАНЫ ПЕРСОНАЖЕЙ (это ЕЩЁ НЕ произошедшие действия):\n'+
      pending.slice(-12).map(p=>`• ${p.actor}: ${String(p.goal||'').slice(0,360)} [${p.status}]; последний источник: ${p.source?.scene_id||'неизвестен'}`).join('\n')+(pending.length>12?'\nЕщё намерений: '+(pending.length-12)+'. Найди их через get_npc_agency.':'')+
      '\nГерои могут действовать по этим намерениям, менять их или ссориться, если обстоятельства позволяют. Не приписывай им действий без сцены, основания, времени и подтверждения. Не заставляй всех искать примирение.');
  }
  if (projection) blocks.push(storyDriverPrompt(storyDrivers(projection,active)));
  if (timeContext || (projection&&history.length))blocks.push(agendaNarrationGuidance(timeContext||recordedWorldAgenda(history,projection)));
  if (history.length) blocks.push('ПОСЛЕДНИЕ ПОДТВЕРЖДЁННЫЕ СЦЕНЫ (большие тексты показываются фрагментами):\n' + history.slice(-3).map(x=>narratorSceneExcerpt(x)).join('\n\n'));
  if(history.length>3)blocks.push('Показаны последние три сцены; более ранние доступны в хронологии и поиске MCP.');
  blocks.push('ПЕРЕД ВАЖНОЙ СЦЕНОЙ В ДЛИННОЙ ИСТОРИИ: используй get_scene_context с именами участвующих героев и короткими словами, связывающими эпизод с прошлым. Он возвращает только релевантную доказательную выборку и отдельные буквальные цитаты. Не выдавай тайну одного героя за знание другого; прежде чем опереться на старое событие, открой его сцену. Не вызывай лишние инструменты для каждой обычной фразы.');
  blocks.push('СОСТОЯНИЕ ГЕРОЕВ: перед важным действием сверяй get_character_state и исходные сцены. Записывай только действительно показанные изменения через character event с name и state_patch: location, occupation, condition, injury, appearance, mood, habit, preference, aversion, affiliation, role, availability, personal_goal. Поля независимы: изменение места не стирает травму или характер. Последнее выраженное настроение и место могут устареть; не объявляй их текущими без контекста. null допустим лишь для явно установленной неопределённости, а не чтобы забыть прошлое. Не выводи любовь, дружбу, знания или намерения другого из одной реплики. Герои действуют самостоятельно, их состояние не заставляет их просить разрешения на обычные действия или примиряться.');
  blocks.push('ИМУЩЕСТВО И ДЕНЬГИ: перед покупкой или передачей значимой вещи запроси get_world_economy. Не считай неизвестные деньги нулём, не выдумывай доходы, цены и имущество. Для одного денежного перевода используй один money event: operation=transfer, actor=отправитель, counterparty=получатель, currency, delta=отрицательная сумма; не дублируй зачисление. Для уникальной вещи используй item_id, custody_version=1, actor, action=acquire/transfer/take/drop/destroy/recover/observe, counterparty при transfer (получатель) или take (прежний держатель). take позволяет отобрать вещь без согласия, если это действительно произошло в тексте; observe лишь отмечает наблюдение, не присваивает предмет. Подтверждай каждое событие точной цитатой. Не исправляй старый сюжет задним числом.');
  blocks.push('Не вводи новые подтверждённые факты без сцены. Создавай важных новых NPC постепенно, когда того требует история. Не сглаживай заранее установленные антагонизмы. Не требуй выбора после каждого абзаца. Если точных сведений нет, сохраняй неопределённость.');
  return blocks.join('\n\n');
}

export function inspectSeedForDirective(seed){
  return classifyDirective(seed);
}
