import { classifyDirective,extractLocks } from './directives.mjs';

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

export function promptForNarrator({world, directives = [], history = [], projection = null}={}) {
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
    blocks.push('ПОДТВЕРЖДЁННАЯ ПАМЯТЬ (не заменяй догадками):\n' + JSON.stringify(projection));
    const pending=(projection.plans||[]).filter(p=>['active','paused'].includes(p.status));
    if(pending.length)blocks.push('САМОСТОЯТЕЛЬНЫЕ ПЛАНЫ ПЕРСОНАЖЕЙ (это ЕЩЁ НЕ произошедшие действия):\n'+
      pending.map(p=>`• ${p.actor}: ${p.goal} [${p.status}]; последний источник: ${p.source?.scene_id||'неизвестен'}`).join('\n')+
      '\nГерои могут действовать по этим намерениям, менять их или ссориться, если обстоятельства позволяют. Не приписывай им действий без сцены, основания, времени и подтверждения. Не заставляй всех искать примирение.');
  }
  if (history.length) blocks.push('ПОСЛЕДНИЕ ПОДТВЕРЖДЁННЫЕ СЦЕНЫ:\n' + history.map(x=>`[${x.id}; ${x.world_time || 'время не указано'}]\n${x.body}`).join('\n\n'));
  blocks.push('Не вводи новые подтверждённые факты без сцены. Создавай важных новых NPC постепенно, когда того требует история. Не сглаживай заранее установленные антагонизмы. Не требуй выбора после каждого абзаца. Если точных сведений нет, сохраняй неопределённость.');
  return blocks.join('\n\n');
}

export function inspectSeedForDirective(seed){
  return classifyDirective(seed);
}
