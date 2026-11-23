import {FOUNDATIONS,buildWorldDraft,promptForNarrator} from './core/world.mjs';
import {replay,validateScene} from './core/continuity.mjs';
import {prepareRevision} from './core/revisions.mjs';
import {inspectArchive} from './core/portable.mjs';
import {literaryReview} from './core/literary-review.mjs';
import {readConfig,readSession,saveConfig,signIn,signUp,signOut} from './lib/session.mjs';
import {listWorlds,getWorld,createWorld,listDirectives,addDirective,editDirective,setDirectiveActive,directiveHistory,reviseScene,listBranches,activeHistory,allActiveHistory,saveScene,forkBefore,switchBranch,setAutosave,deleteWorld,searchActiveScenes,actorHistory,getScene,exportWorldArchive} from './lib/storage.mjs';

const root=document.querySelector('#app');
const accountButton=document.querySelector('#accountButton');
const state={screen:'worlds',tab:'story',world:null,worlds:[],directives:[],branches:[],scenes:[],historyComplete:true,hasOlder:false,revision:null,pending:false};
const node=(tag,cl='',value='')=>{const e=document.createElement(tag);if(cl)e.className=cl;if(value)e.textContent=value;return e;};
const add=(parent,...children)=>{for(const c of children)if(c!=null)parent.append(c);return parent;};
const button=(label,handler,cl='btn')=>{const b=node('button',cl,label);b.type='button';b.addEventListener('click',handler);return b;};
const field=(placeholder='',cls='field')=>{const t=node('textarea',cls);t.placeholder=placeholder;t.rows=4;return t;};
const row=(...children)=>add(node('div','btn-row'),...children);
const panel=(...children)=>add(node('section','panel'),...children);
const title=(text)=>node('h2','',text);
const para=(text,cls='small')=>node('p',cls,text);
const busy=async(action)=>{if(state.pending)return;state.pending=true;try{await action();}catch(e){console.error(e);toast(e.message||'Ошибка операции',true);}finally{state.pending=false;}};
let toastTimer,archiveUrl=null;
function toast(message,error=false){const n=document.querySelector('#toast');n.textContent=message;n.className='toast visible';n.style.borderColor=error?'#a86d85':'';clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.className='toast',4500);}
function clear(){if(archiveUrl){URL.revokeObjectURL(archiveUrl);archiveUrl=null;}root.replaceChildren();window.scrollTo({top:0});accountButton.textContent=readSession()?'Выйти':'Аккаунт';}
const copy=async s=>{try{await navigator.clipboard.writeText(s);toast('Скопировано.');}catch{const t=field();t.value=s;root.prepend(panel(para('Скопируй текст вручную:'),t));t.select();}};
function loading(){root.replaceChildren(node('div','loading','Загружаю данные мира…'));}

function showConnect(){state.screen='connect';clear();add(root,node('div','eyebrow','Один раз при настройке'),node('h1','hero-title','Подключить память мира'),para('Храним истории в твоём Supabase. Нужны URL проекта и его публичный publishable/anon key — не service_role и не пароль базы.','subtitle'));
  const form=node('form');const url=node('input','field');url.type='url';url.value=readConfig()?.url||'';url.placeholder='https://project.supabase.co';url.required=true;
  const key=node('input','field');key.type='password';key.value=readConfig()?.key||'';key.placeholder='sb_publishable_… или anon JWT';key.required=true;
  add(form,node('label','input-label','Supabase Project URL'),url,node('label','input-label','Публичный API key'),key,para('Используется только публичный ключ. Секрет service_role никогда не вводи в браузере.'),row(button('Сохранить подключение',()=>busy(async()=>{saveConfig({url:url.value,key:key.value});toast('Подключение сохранено.');showAuth();}))));
  add(root,panel(form));
}
function showAuth(mode='signin'){if(!readConfig())return showConnect();state.screen='auth';clear();add(root,node('div','eyebrow','Защищённое пространство'),node('h1','hero-title','Твои миры. Твоя история.'),para('Войди в Supabase-аккаунт, чтобы открыть свои сохранения.','subtitle'));
  const form=node('form');const email=node('input','field');email.type='email';email.autocomplete='email';email.placeholder='Email';email.required=true;
  const password=node('input','field');password.type='password';password.autocomplete=mode==='signin'?'current-password':'new-password';password.placeholder='Пароль';password.required=true;
  const submit=button(mode==='signin'?'Войти':'Зарегистрироваться',()=>busy(async()=>{if(!email.value||!password.value)return toast('Заполни email и пароль.',true);if(mode==='signin'){await signIn(email.value,password.value);await openWorlds();}else{await signUp(email.value,password.value);toast('Проверь почту, если Supabase требует подтверждение.');showAuth();}}));
  add(form,node('label','input-label','Email'),email,node('label','input-label','Пароль'),password,row(submit,button(mode==='signin'?'Создать аккаунт':'У меня уже есть аккаунт',()=>showAuth(mode==='signin'?'signup':'signin'),'btn ghost')));
  add(root,panel(form),button('Изменить подключение Supabase',showConnect,'text-button'));
}
async function openWorlds(){if(!readConfig())return showConnect();if(!readSession())return showAuth();state.screen='worlds';loading();try{state.worlds=await listWorlds();renderWorlds();}catch(e){clear();add(root,node('h1','hero-title','Не удалось открыть миры'),node('div','notice',e.message||'Ошибка загрузки'),para('Если это новый проект, проверь, что схема supabase/schema.sql установлена. Входить повторно не требуется.'),row(button('Повторить',()=>busy(openWorlds)),button('Подключение',showConnect,'btn secondary')));}}
function renderWorlds(){state.screen='worlds';clear();add(root,node('div','eyebrow','Интерактивные вселенные'),add(node('h1','hero-title'),document.createTextNode('Придумай мир. '),node('em','','Он оживёт.')),para('Никаких анкет и обязательных биографий. Опиши идею своими словами — детали мира сформируются по мере истории.','subtitle'));
  const prompt=field('Например: Гарри Поттер, 1991 год. Начинаем с Хогвартса. Гарри и Малфой — непримиримые враги. Никакого взаимного уважения.','field large-field');
  const preview=para('Сначала создаём основу, не придумывая за тебя скрытые события.','helper');
  prompt.addEventListener('input',()=>{try{const d=buildWorldDraft(prompt.value);preview.textContent='Название: '+d.title+' · '+d.start_marker;}catch{preview.textContent='Хватит одного-двух предложений.';}});
  add(root,panel(node('div','eyebrow','01 / Быстрый старт'),title('Каким будет твой мир?'),prompt,preview,row(button('Создать мир →',()=>busy(async()=>{const id=await createWorld(prompt.value);toast('Мир создан.');await openWorld(id);})))));
  add(root,add(node('div','section-head'),title('Твои миры'),node('span','count',`${state.worlds.length} сохранено`)));
  if(!state.worlds.length)add(root,node('div','empty','Пока нет созданных миров. Начни с одной идеи — остальное можно уточнить позже.'));
  else{const list=node('div','world-list');for(const w of state.worlds){
    const card=button('',()=>busy(()=>openWorld(w.id)),'world-card');add(card,node('span','world-meta',w.start_marker||'Начало не установлено'),node('strong','',w.title),para(w.seed));list.append(card);
  }root.append(list);}
}
async function openWorld(id){state.screen='world';state.tab='story';state.revision=null;loading();await reloadWorld(id);renderWorld();}
async function reloadWorld(id){const [world,branches,directives,history]=await Promise.all([getWorld(id),listBranches(id),listDirectives(id),activeHistory(id,{limit:50,offset:0})]);
  const branch=branches.find(b=>b.id===world.active_branch_id);
  state.world={...world,head_scene_id:branch?.head_scene_id||null};state.branches=branches;state.directives=directives;state.scenes=history.slice().reverse();state.hasOlder=history.length===50;state.historyComplete=!state.hasOlder;
}
function renderWorld(){if(!state.world)return openWorlds();const w=state.world;state.screen='world';clear();add(root,button('← Все миры',()=>busy(openWorlds),'back'),node('div','eyebrow',w.start_marker||'Начало не установлено'),node('h1','hero-title',w.title),para(w.seed,'subtitle'));
  const tabs=node('div','tabs');for(const [id,name] of [['story','История'],['search','Поиск'],['people','Персонажи'],['directives','Настройки словами'],['branches','Ветки'],['director','Режиссёр']])tabs.append(button(name,()=>{state.tab=id;renderWorld();},'tab'+(state.tab===id?' active':'')));
  root.append(tabs);
  if(state.tab==='story')renderStory();if(state.tab==='search')renderSearch();if(state.tab==='people')renderPeople();if(state.tab==='directives')renderDirectives();if(state.tab==='branches')renderBranches();if(state.tab==='director')renderDirector();
}
function renderStory(){const w=state.world;
  add(root,panel(node('div','eyebrow','Игра в ChatGPT'),title('Продолжить историю'),para('История пишется в ChatGPT. После подключения нового MCP-моста сохранённые сцены будут появляться здесь автоматически. До этого доступен резервный импорт текста.'),row(button('Скопировать запрос для рассказчика',()=>busy(()=>copy(promptForNarrator({world:w,directives:state.directives,history:state.scenes.slice(-2),projection:state.historyComplete?replay(state.scenes,state.directives):{incomplete:true,reason:'Не вся история загружена. Понадобится восстановить её через историю и MCP.'}})))))));
  const heading=node('div','section-head');add(heading,title('Хроника'),node('span','count',state.scenes.length+' загружено'));root.append(heading);
  if(state.hasOlder){root.append(panel(para('Есть более ранние сцены.'),row(button('Загрузить историю полностью',()=>busy(async()=>{const r=await allActiveHistory(w.id);state.scenes=r.scenes;state.hasOlder=!r.complete;state.historyComplete=r.complete;renderWorld();}),'btn secondary'))));}
  if(!state.scenes.length)root.append(node('div','empty','История ещё не началась. Первый эпизод можно сыграть в ChatGPT и затем сохранить.'));
  const container=node('div','story');state.scenes.forEach((s,i)=>{
    const card=node('article','scene');const chapter=node('h3','',`Сцена ${i+1}${s.world_time?' · '+s.world_time:''}`);const details=node('details','scene-details');if(i===state.scenes.length-1)details.open=true;
    const summary=node('summary','',details.open?'Текст сцены':'Читать сцену');const body=node('div','scene-body',s.body);add(details,summary,body);
    const actions=add(node('div','scene-actions'),button('На это: новая ветка',()=>{state.revision={scene_id:s.id,source_scene:s};renderWorld();document.querySelector('#sceneEditor')?.focus();},'text-button'));
    add(card,chapter,details,actions);container.append(card);
  });root.append(container);
  const changing=!!state.revision;
  const p=panel(node('div','eyebrow',changing?'Точная правка без потери прошлого':'Резервное сохранение'),title(changing?'На это: другое продолжение':'Добавить сцену вручную'));
  if(changing)p.append(para('Начало выбранной сцены можно сохранить. Укажи последнюю короткую уникальную фразу, которая должна остаться. Если оставить поле пустым, вся сцена будет заменена. Старая ветка сохранится.'));
  const anchor=changing?node('input','field'):null;
  if(anchor){anchor.placeholder='Последняя сохранённая фраза (необязательно)';anchor.type='text';p.append(anchor);}
  const editor=field(changing?'Напиши новое продолжение после сохранённой фразы…':'Текст новой сцены…','field large-field');editor.id='sceneEditor';editor.rows=8;
  const worldTime=node('input','field');worldTime.placeholder='Время сцены (если известно), например: 1991-09-01 10:00';worldTime.type='text';
  if(changing)worldTime.value=state.revision.source_scene.world_time||'';
  const save=button(changing?'Сохранить новую ветку целиком':'Сохранить сцену',()=>busy(async()=>{
    if(changing){
      const rev=prepareRevision(state.revision.source_scene,{lastKeptQuote:anchor.value,newContinuation:editor.value});
      const checked=validateScene({body:rev.body,events:rev.preservedEvents,directives:[]});
      if(!checked.ok)throw Error(checked.errors.join(' '));
      // The DB makes fork+replacement one transaction; no empty branch after an error.
      await reviseScene({world:w,sourceSceneId:state.revision.scene_id,prefix:rev.prefix,continuation:rev.continuation,worldTime:worldTime.value.trim()||null});
      state.revision=null;
    }else{
      const body=editor.value.trim();const checked=validateScene({body,events:[],directives:state.directives});
      if(!checked.ok)throw Error(checked.errors.join(' '));
      await saveScene({world:w,body,worldTime:worldTime.value.trim()||null});
    }
    await reloadWorld(w.id);toast('Сцена сохранена.');renderWorld();
  }));
  add(p,editor,para(changing?'Подтверждённые события в сохранённом начале сцены останутся; события отменённого окончания не перейдут в новую ветку.':'Время не будет придумано автоматически.'),worldTime,
    row(save,...(changing?[button('Отменить',()=>{state.revision=null;renderWorld();},'btn ghost')]:[])));
  root.append(p);
}
function renderDirectives(){const w=state.world;
  add(root,panel(node('div','eyebrow','Никаких длинных форм'),title('Измени мир обычными словами'),para('Каждое условие сохраняется дословно. Его можно позже исправить или отключить, не переписывая прошлые сцены.'),(()=>{
    const text=field('Например: «Гарри и Малфой — враги. Никакого примирения и уважения».','field large-field');
    return add(node('div'),text,row(button('Запомнить условие',()=>busy(async()=>{
      await addDirective(w.id,text.value);await reloadWorld(w.id);toast('Условие сохранено.');renderWorld();
    }))));
  })()));
  const items=panel(title('Твои условия'));
  if(!state.directives.length)items.append(para('Дополнительных условий нет. Постоянные принципы действуют всегда.'));
  for(const rule of state.directives){
    const part=node('div','rule user');add(part,node('strong','',rule.active===false?'Отключено · '+rule.category:rule.category),para(rule.text));
    const editor=field('Исправь формулировку…');editor.value=rule.text;editor.rows=3;editor.hidden=true;
    const edit=button('Изменить',()=>{editor.hidden=!editor.hidden;},'text-button');
    const save=button('Сохранить правку',()=>busy(async()=>{
      await editDirective(w.id,rule.id,editor.value,w.directive_version);
      await reloadWorld(w.id);toast('Правило изменено с записью в журнале.');renderWorld();
    }),'btn secondary');
    const toggle=button(rule.active===false?'Включить':'Отключить',()=>busy(async()=>{
      await setDirectiveActive(w.id,rule.id,rule.active===false,w.directive_version);
      await reloadWorld(w.id);toast('Состояние правила сохранено.');renderWorld();
    }),'text-button');
    add(part,row(edit,toggle),editor,row(save));save.hidden=true;
    edit.addEventListener('click',()=>{save.hidden=editor.hidden;});
    items.append(part);
  }
  root.append(items);
  const history=panel(title('Журнал изменений'),para('Предыдущие формулировки остаются в истории аудита.'));
  const hbox=node('div');history.append(button('Показать последние изменения',()=>busy(async()=>{
    const edits=await directiveHistory(w.id);hbox.replaceChildren();
    if(!edits.length)hbox.append(para('Изменений ещё нет.'));
    for(const h of edits){const cell=node('div','rule');
      add(cell,node('strong','',`${h.action} · ${new Date(h.created_at).toLocaleString('ru-RU')}`),para('Было: '+(h.before_state?.text||'')),para('Стало: '+(h.after_state?.text||'')));
      hbox.append(cell);
    }
  }),'btn secondary'),hbox);root.append(history);
  const f=panel(title('Постоянные принципы рассказчика'));
  for(const rule of FOUNDATIONS){const item=node('div','rule');add(item,node('strong','',rule.name),para(rule.text));f.append(item);}
  root.append(f);
}
function renderBranches(){const w=state.world;add(root,panel(title('Альтернативные линии'),para('«На это» создаёт новую ветку от состояния перед выбранной сценой. История старой ветки не удаляется.')));
 const list=panel();state.branches.forEach(b=>{const active=b.id===w.active_branch_id;const card=node('div','branch-card');add(card,node('span','',b.name+(active?' · текущая':'')),button(active?'Открыта':'Перейти',()=>busy(async()=>{if(active)return;await switchBranch(w.id,b.id);await reloadWorld(w.id);renderWorld();}),'btn secondary'));list.append(card);});root.append(list);
}

function renderSearch(){const w=state.world;
 const box=panel(node('div','eyebrow','По всей действующей ветке'),title('Найти старое событие'),para('Ищем точную фразу во всех сохранённых сценах, включая историю старше тысячи эпизодов. Отменённые ветки в результаты не попадают. Это текстовый, а не смысловой поиск.'));
 const query=node('input','field');query.type='search';query.placeholder='Например: кому Гарри передал письмо';query.maxLength=180;
 const results=node('div','search-results');let lastQuery='',offset=0;
 const search=async(append=false)=>{
   if(!append){offset=0;results.replaceChildren();lastQuery=query.value.trim();}
   const found=await searchActiveScenes(w.id,lastQuery,{limit:20,offset});offset+=found.length;
   if(!found.length&&!append)results.append(para('Совпадений в действующей ветке не найдено. Это не доказывает отсутствия события — текст мог быть сформулирован иначе.'));
   for(const hit of found){const block=node('div','rule');
     const body=node('div','scene-body');
     add(block,node('strong','',hit.world_time||'Без точной даты'),para(hit.snippet||''),
       button('Открыть исходную сцену',()=>busy(async()=>{const scene=await getScene(w.id,hit.scene_id);body.textContent=scene.body;body.hidden=false;}),'btn secondary'),body);
     body.hidden=true;results.append(block);
   }
   more.hidden=found.length<20;
 };
 const more=button('Показать ещё',()=>busy(()=>search(true)),'btn secondary');more.hidden=true;
 const form=node('form');form.addEventListener('submit',e=>{e.preventDefault();busy(()=>search());});
 const run=node('button','btn','Искать');run.type='submit';add(form,query,row(run));
 add(box,form,results,row(more));root.append(box);
}

function renderPeople(){const w=state.world;const projection=replay(state.scenes);
 const box=panel(node('div','eyebrow','Причинная память'),title('Персонажи и отношения'),
   para('Здесь только подтверждённые записи: характер нельзя угадать по названию мира или одной реплике. Можно искать историю любого героя по имени, даже если он не отмечен в карточках.'));
 if(!state.historyComplete)box.append(node('div','notice','Загружена не вся история, поэтому карточки ниже неполные. Историю конкретного человека можно запросить по всей действующей ветке.'));
 const people=projection.people.map(p=>p.name).filter(Boolean);
 for(const person of people){const card=node('div','rule');add(card,node('strong','',person),para(projection.people.find(p=>p.name===person)?.description||'Состояние из подтверждённых событий'));box.append(card);}
 const fieldName=node('input','field');fieldName.placeholder='Имя персонажа';fieldName.type='search';fieldName.maxLength=140;
 const choices=node('div','btn-row');for(const name of people.slice(0,12))choices.append(button(name,()=>{fieldName.value=name;busy(()=>load());},'btn secondary'));
 const results=node('div');let offset=0,lastActor='';const more=button('Ещё события',()=>busy(()=>load(true)),'btn secondary');more.hidden=true;
 const load=async(append=false)=>{
   if(!append){offset=0;lastActor=fieldName.value.trim();results.replaceChildren();}
   const rows=await actorHistory(w.id,lastActor,{limit:40,offset});offset+=rows.length;
   if(!rows.length&&!append)results.append(para('Структурированных событий о персонаже пока нет. Это не доказывает, что его не было в тексте.'));
   for(const r of rows){const block=node('div','rule');
     add(block,node('strong','',`${r.world_time||'Без даты'} · ${r.event.type}`),para(r.event.evidence||'Подтверждение не заполнено'),
       para(JSON.stringify(Object.fromEntries(Object.entries(r.event).filter(([k])=>!['evidence','id'].includes(k))))));
     const full=node('div','scene-body');full.hidden=true;
     add(block,button('Показать сцену-источник',()=>busy(async()=>{const scene=await getScene(w.id,r.scene_id);full.textContent=scene.body;full.hidden=false;}),'text-button'),full);results.append(block);
   }more.hidden=rows.length<40;
 };
 const form=node('form');form.addEventListener('submit',e=>{e.preventDefault();busy(()=>load());});
 const submit=node('button','btn','Найти события героя');submit.type='submit';
 add(form,fieldName,row(submit));add(box,choices,form,results,row(more));
 root.append(box);
 const ties=panel(title('Подтверждённые связи'),para('Направленные отношения: отношение А к Б не означает того же чувства у Б к А.'));
 if(!projection.relationships.length)ties.append(para('Связи ещё не отмечены в сохранённых событиях.'));
 for(const link of projection.relationships){const item=node('div','rule');add(item,node('strong','',`${link.a} → ${link.b}`),para(`Состояние: ${link.stance||'не указано'}`),para(link.evidence||''));ties.append(item);}
 root.append(ties);
}

function renderArchive(){const w=state.world;
 const box=panel(title('Резервная копия мира'),para('Сохранить ВСЕ ветки, включая отменённые продолжения, сцены, настройки и журнал изменений. Файл остаётся у тебя. Секреты Supabase и токены входа в него не записываются.'));
 const output=node('div');
 const btn=button('Подготовить полный архив',()=>busy(async()=>{
   btn.disabled=true;
   try{
    const data=await exportWorldArchive(w.id);
    const json=JSON.stringify(data);
    if(archiveUrl)URL.revokeObjectURL(archiveUrl);
    archiveUrl=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    const a=node('a','btn','Скачать JSON-архив');a.href=archiveUrl;a.download=`living-world-next-${w.id.slice(0,8)}-${new Date().toISOString().slice(0,10)}.json`;
    output.replaceChildren(para(`Готово: ${data.archive.counts.scenes} сцен, ${data.archive.counts.branches} веток. SHA-256 записана в файле.`),a);
   }finally{btn.disabled=false;}
 }));
 add(box,row(btn),output,para('Этот экспорт предназначен для сохранности истории. Автоматическое восстановление в другую базу пока не поддерживается — не удаляй мир после выгрузки.'));
 const upload=node('input','field');upload.type='file';upload.accept='.json,application/json';
 const inspection=node('div');upload.addEventListener('change',()=>busy(async()=>{
   const file=upload.files?.[0];if(!file)return;
   if(file.size>100*1024*1024)throw Error('Файл слишком большой для проверки в браузере.');
   const info=await inspectArchive(await file.text());
   inspection.replaceChildren(para(`Контрольная сумма совпадает: ${info.title} · ${info.scene_count} сцен · ${info.branch_count} веток. Это только проверка; данные не импортировались.`));
 }));
 add(box,title('Проверить сохранённый архив'),para('Проверка содержимого и контрольной суммы без загрузки файла на сервер.'),upload,inspection);
 root.append(box);
}

function renderDirector(){const w=state.world;add(root,panel(title('Состояние памяти'),para('Режиссёрская информация отделена от художественного текста.'),node('div','rule',`Загружено сцен: ${state.scenes.length}${state.hasOlder?' (есть ещё)': ''}`),node('div','rule',`Текущая ветка: ${w.active_branch_id}`)));
 const p=replay(state.scenes,state.directives);const stats=panel(title('Подтверждённые события'),para(`Записанных изменений: ${p.events_replayed}. Неотмеченные сцены не означают отсутствия событий.`));
 for(const [name,arr] of [['Персонажи',p.people],['Отношения',p.relationships],['Знания',p.knowledge],['Финансы',p.balances],['Вещи',p.items],['Обязательства',p.obligations],['События вне кадра',p.offscreen]])stats.append(para(`${name}: ${arr.length}`));
 if(!state.historyComplete)stats.append(node('div','notice','Загружена только часть истории. Проекция не полная. Нельзя делать выводы о старых событиях.'));
 if(p.validation_warnings.length)stats.append(node('div','notice',`Некоторые события отклонены: ${p.validation_warnings.length}.`));root.append(stats);
 const audit=literaryReview(state.scenes);
 const literary=panel(title('Литературные повторения'),para('Диагностика нежелательных клише: «разрешите мне всё», примирение вопреки характеру и универсальная дипломатичность. Совпадение — повод проверить сцену, не автоматический запрет.'));
 if(!audit.samples.length)literary.append(para('В загруженных сценах характерных повторений не найдено. Это не доказывает идеальность текста.'));
 for(const [id,name] of [['permission-loop','Ожидание разрешения'],['forced-reconciliation','Примирение'],['generic-compromise','Универсальные компромиссы']])literary.append(para(`${name}: ${audit.counts[id]}`));
 for(const s of audit.samples.slice(0,10)){const item=node('div','rule');add(item,node('strong','',s.label),para(s.excerpt));literary.append(item);}
 if(!state.historyComplete)literary.append(node('div','notice','Литературная проверка охватывает только загруженные сцены.'));
 root.append(literary);
 add(root,panel(title('Автосохранение через MCP'),para('После публикации и подключения OAuth-моста ChatGPT сможет сохранять сцены при включённом разрешении. Эта настройка не запускает модель в фоне.'),row(button(w.auto_save?'Автосохранение включено':'Автосохранение выключено',()=>busy(async()=>{await setAutosave(w.id,!w.auto_save);await reloadWorld(w.id);renderWorld();}),'btn secondary'))));
 renderArchive();
 add(root,panel(title('Удалить мир'),para('Удаление безвозвратное. Старый LIVING WORLD не затрагивается.'),row(button('Удалить этот мир',()=>busy(async()=>{if(!confirm(`Удалить мир «${w.title}» вместе с его ветками?`))return;await deleteWorld(w.id);await openWorlds();toast('Мир удалён.');}),'btn danger'))));
}
accountButton.addEventListener('click',()=>busy(async()=>{if(readSession()){await signOut();showAuth();}else showAuth();}));
document.querySelector('#homeLink').addEventListener('click',e=>{e.preventDefault();busy(openWorlds);});
window.addEventListener('unhandledrejection',e=>{console.error(e.reason);toast('Ошибка подключения. Попробуй обновить страницу.',true);});
openWorlds();

if('serviceWorker' in navigator && window.isSecureContext)navigator.serviceWorker.register('/sw.js').catch(()=>{});
