/** Owner-authored directives remain verbatim; extracted locks are only a strict, optional index. */
const norm = v => String(v ?? '').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
export const pairKey = (a,b) => [norm(a),norm(b)].sort().join('::');

function noReconciliation(text) {
  return /(?:никак(?:ого|ой)|без|запрещено|не\s+(?:должны|могут|будут))\s+(?:[\p{L}-]+\s+){0,4}(?:примирен|дружб|сближен|мирить)|никогда\s+не\s+(?:помир|подруж|примир)|не\s+(?:помирятся|примирятся|подружатся)/iu.test(text);
}
function noRespect(text) {
  return /(?:никак(?:ого|ой)|без|запрещено|не\s+(?:должны|могут|будут))\s+(?:[\p{L}-]+\s+){0,4}(?:уважен|уважать|уважа)|никогда\s+не\s+(?:уваж|признают\s+достоинств)/iu.test(text);
}

/** Only explicit names + explicit lasting prohibition are machine locks. Do not guess dyads. */
export function inferRelationshipLocks(text) {
  const matches=[...text.matchAll(/(?:^|[.!?;\n]\s*)([\p{Lu}][\p{L}'’-]*(?:\s+[\p{Lu}][\p{L}'’-]*){0,2})\s+и\s+([\p{Lu}][\p{L}'’-]*(?:\s+[\p{Lu}][\p{L}'’-]*){0,2})\s*(?:[—:–-]\s*|\s+)(?:враг[\p{L}]*|ненавидят|не\s+мирятся|соперник[\p{L}]*)/giu)];
  const locks=new Map();
  for (let i=0;i<matches.length;i++) {
    const m=matches[i], a=m[1].trim(),b=m[2].trim();
    if (norm(a)===norm(b))continue;
    // Attach a prohibition only to the immediately adjacent clause(s), not to every pair in the description.
    const local=text.slice(m.index+m[0].length,Math.min(matches[i+1]?.index??text.length,m.index+m[0].length+260));
    const reconcile=noReconciliation(local),respect=noRespect(local);
    if (!reconcile&&!respect)continue;
    const id=pairKey(a,b);const prev=locks.get(id);
    const next={a,b,forbid_reconciliation:!!(prev?.forbid_reconciliation||reconcile)};
    if(prev?.forbid_respect||respect)next.forbid_respect=true;
    locks.set(id,next);
  }
  return [...locks.values()];
}

/** Exact source text is authoritative even if this conservative extractor misses a pair. */
export function classifyDirective(raw) {
  const text=String(raw??'').trim();
  if (!text) throw new Error('Напиши, что нужно изменить в мире.');
  if (text.length>5000) throw new Error('Изменение должно быть короче 5000 символов.');
  const low=text.toLocaleLowerCase('ru'); const tags=[];
  if (/ненавид|враг|вражд|соперни|примир|мириться|уважен|довер|дружб|отношени/.test(low)) tags.push('relations');
  if (/характер|инициатив|решительн|боится|желани|секс|близост|любов|ревн|чувств/.test(low)) tags.push('characters');
  if (/магия|закон|правил|запрещ|невозможн|канон|альтернативн|вселенн/.test(low)) tags.push('world-rules');
  if (/дата|год|день|месяц|врем|расписан|событи/.test(low)) tags.push('timeline');
  if (!tags.length)tags.push('general');
  const relationship_locks=inferRelationshipLocks(text);
  return {text,category:tags[0],tags,relationship_lock:relationship_locks[0]??null,relationship_locks};
}

export function extractLocks(directives=[]) {
  const locks=new Map();
  for(const d of directives){
    if(d?.active===false)continue;
    const meta=d?.metadata??d??{};
    const candidates=Array.isArray(meta.relationship_locks)?meta.relationship_locks:
      meta.relationship_lock?[meta.relationship_lock]:[];
    for(const lock of candidates){
      if(!lock?.a||!lock?.b||(!lock.forbid_reconciliation&&!lock.forbid_respect))continue;
      const id=pairKey(lock.a,lock.b);const old=locks.get(id);
      const merged={a:lock.a,b:lock.b,forbid_reconciliation:!!(old?.forbid_reconciliation||lock.forbid_reconciliation)};
      if(old?.forbid_respect||lock.forbid_respect)merged.forbid_respect=true;
      locks.set(id,merged);
    }
  }
  return [...locks.values()];
}
