/** Deterministic routing: classify but never silently rewrite an instruction. */
export function classifyDirective(raw) {
  const text = String(raw ?? '').trim();
  if (!text) throw new Error('Напиши, что нужно изменить в мире.');
  if (text.length > 5000) throw new Error('Изменение должно быть короче 5000 символов.');
  const low = text.toLocaleLowerCase('ru');
  const tags = [];
  if (/ненавид|враг|вражд|соперни|примир|мириться|уважен|довер|дружб|отношени/.test(low)) tags.push('relations');
  if (/характер|инициатив|решительн|боится|желани|секс|близост|любов|ревн|чувств/.test(low)) tags.push('characters');
  if (/магия|закон|правил|запрещ|невозможн|канон|альтернативн|вселенн/.test(low)) tags.push('world-rules');
  if (/дата|год|день|месяц|врем|расписан|событи/.test(low)) tags.push('timeline');
  if (!tags.length) tags.push('general');
  // Only clearly named dyads are extracted. No implicit sentiment score or fake psychometrics.
  let relationship_lock = null;
  const explicitNoReconciliation = /(?:никогда|никак(?:ого|ой)|запрещен[оа]?|не должны|не могут|не будет|без)\s+(?:\w+\s+){0,3}(?:мирит|примир|друж|уважен)|(?:не\s+)?(?:помирятся|помирить)/i.test(text);
  const pair = text.match(/(?:^|[.!?]\s*)([\p{L}][\p{L}\s'-]{0,45}?)\s+и\s+([\p{L}][\p{L}\s'-]{0,45}?)\s*(?:[—:–-]\s*|\s+)(?:враги|ненавидят|не\s+мирятся|никогда)/iu);
  if (pair && explicitNoReconciliation) {
    const a=pair[1].trim(); const b=pair[2].trim();
    if(a!==b) relationship_lock={a,b,forbid_reconciliation:true};
  }
  return {text, category:tags[0], tags, relationship_lock};
}

export function extractLocks(directives=[]) {
  return directives.map(d=>d?.metadata?.relationship_lock || d?.relationship_lock).filter(Boolean)
    .filter(x=>x.forbid_reconciliation && x.a && x.b);
}

export function pairKey(a,b) {
  return [String(a).trim().toLocaleLowerCase('ru'),String(b).trim().toLocaleLowerCase('ru')].sort().join('::');
}
