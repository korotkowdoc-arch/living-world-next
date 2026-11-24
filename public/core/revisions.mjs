import {needsStatePreflight,validateScene,validateStateAppend} from './continuity.mjs';
/** A user may preserve an exact opening of a scene and replace only its ending.
 * The old scene is immutable. A new branch and replacement scene must be committed atomically.
 */
export function prepareRevision(scene,{lastKeptQuote='',newContinuation=''}={}) {
  if(typeof scene?.body!=='string')throw Error('Не найдена исходная сцена.');
  const anchor=String(lastKeptQuote??'').trim();
  let prefix='';
  if(anchor){
    const first=scene.body.indexOf(anchor);
    if(first<0)throw Error('Фрагмент для сохранения отсутствует в исходной сцене.');
    if(scene.body.indexOf(anchor,first+anchor.length)>=0)
      throw Error('Фрагмент повторяется. Выбери более длинную уникальную цитату.');
    prefix=scene.body.slice(0,first+anchor.length);
  }
  const tail=String(newContinuation??'').trim();
  if(!tail)throw Error('Напиши новое продолжение сцены.');
  const continuation=prefix&&!/\s$/.test(prefix)?'\n\n'+tail:tail;
  const body=prefix+continuation;
  if(body.length<10||body.length>200000)throw Error('Итоговая сцена должна содержать от 10 до 200 000 символов.');
  const oldEvents=Array.isArray(scene.events)?scene.events:[];
  const preservedEvents=oldEvents.filter(e=>e&&typeof e.evidence==='string'&&e.evidence.trim()&&prefix.includes(e.evidence));
  return {prefix,continuation,body,preservedEvents,droppedEvents:oldEvents.length-preservedEvents.length};
}

/** Use the immutable source's earlier ancestors, not the current world's later
 * events. The server still checks ownership, active ancestry and rule version
 * in the atomic revision transaction. A receipt bypasses this read-only preflight.
 */
export function revisionStatePreflight(memory,source,{prefix,continuation,events=[],directives=[]}){
 if(typeof source?.body!=='string'||typeof prefix!=='string'||!source.body.startsWith(prefix)||typeof continuation!=='string')throw Error('Начало новой сцены не совпадает с оригиналом.');
 if(!Array.isArray(events))throw Error('Неверный список событий.');
 const preserved=(source.events||[]).filter(e=>e&&typeof e.evidence==='string'&&e.evidence.trim()&&prefix.includes(e.evidence));
 const merged=[...preserved,...events],body=prefix+continuation;
 const checked=validateScene({body,events:merged,directives});
 if(!checked.ok)return checked;
 if(!needsStatePreflight(merged))return {ok:true,errors:[]};
 if(!memory?.complete||!Array.isArray(memory.scenes))return {ok:false,errors:['Для изменения состояния в альтернативной сцене нужна полная причинная память.']};
 const index=memory.scenes.findIndex(s=>s.id===source.id);
 if(index<0)return {ok:false,errors:['Исходная сцена отсутствует в действующей ветке.']};
 const prior=memory.scenes.slice(0,index);
 if((prior.at(-1)?.id??null)!==(source.parent_scene_id??null))return {ok:false,errors:['Нарушена цепочка предков исходной сцены.']};
 for(let i=0;i<prior.length;i++)if((prior[i].parent_scene_id??null)!==(prior[i-1]?.id??null))return {ok:false,errors:['Неполная или смешанная история предков.']};
 return validateStateAppend(prior,merged,body);
}
