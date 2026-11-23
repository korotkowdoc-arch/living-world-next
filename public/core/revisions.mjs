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
