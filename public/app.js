import {FOUNDATIONS,buildWorldDraft,promptForNarrator} from './core/world.mjs';
import {replay,validateScene} from './core/continuity.mjs';
import {prepareRevision} from './core/revisions.mjs';
import {inspectArchive} from './core/portable.mjs';
import {literaryReview} from './core/literary-review.mjs';
import {storyDrivers} from './core/story-drivers.mjs';
import {recordedWorldAgenda} from './core/world-time.mjs';
import {livingWorldView} from './core/living-world.mjs';
import {annotationPassages} from './core/annotation-passages.mjs';
import {socialWorldView} from './core/social-world.mjs';
import {knowledgeView} from './core/knowledge.mjs';
import {economyView} from './core/economy.mjs';
import {characterStateView} from './core/character-state.mjs';
import {detectWorldChange} from './core/cloud-sync.mjs';
import {readReaderPrefs,saveReaderPrefs} from './core/reader.mjs';
import {readConfig,readSession,saveConfig,signIn,signUp,signOut} from './lib/session.mjs';
import {getReturnId,consentPath} from './lib/oauth-return.mjs';
import {listWorlds,getWorld,createWorld,listDirectives,addDirective,editDirective,setDirectiveActive,directiveHistory,reviseScene,listBranches,activeHistory,allActiveHistory,loadEarlierHistory,saveScene,forkBefore,switchBranch,setAutosave,deleteWorld,searchActiveScenes,actorHistory,getScene,exportWorldArchive,restoreWorldArchive,cancelArchiveImport,fullStructuredMemory,readMemoryNotes} from './lib/storage.mjs';

const root=document.querySelector('#app');
const accountButton=document.querySelector('#accountButton');
const oauthReturnId=getReturnId(new URL(location.href).searchParams);
function resumeOAuth(){
 if(!oauthReturnId)return false;
 location.replace(consentPath(oauthReturnId));return true;
}
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
const readerStorage=(()=>{try{return window.localStorage;}catch{return null;}})();
let readerPrefs=readReaderPrefs(readerStorage);
function updateSceneTypography(){
 for(const element of document.querySelectorAll('.scene-body')){
  element.style.fontSize=readerPrefs.fontSize+'px';
  element.style.lineHeight=String(readerPrefs.lineHeight);
 }
 const label=document.querySelector('#readerSizeLabel');
 if(label)label.textContent=readerPrefs.fontSize+' px · '+readerPrefs.lineHeight+' интервал';
}
function changeReaderPrefs(change){
 readerPrefs=saveReaderPrefs(readerStorage,{...readerPrefs,...change});
 updateSceneTypography();
}
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
  const submit=button(mode==='signin'?'Войти':'Зарегистрироваться',()=>busy(async()=>{if(!email.value||!password.value)return toast('Заполни email и пароль.',true);if(mode==='signin'){await signIn(email.value,password.value);password.value='';if(!resumeOAuth())await openWorlds();}else{await signUp(email.value,password.value);toast('Проверь почту, если Supabase требует подтверждение.');showAuth();}}));
  add(form,node('label','input-label','Email'),email,node('label','input-label','Пароль'),password,row(submit,button(mode==='signin'?'Создать аккаунт':'У меня уже есть аккаунт',()=>showAuth(mode==='signin'?'signup':'signin'),'btn ghost')));
  add(root,panel(form),button('Изменить подключение Supabase',showConnect,'text-button'));
  if(oauthReturnId){const back=node('a','btn secondary','К мирам без ChatGPT');back.href='/';add(root,panel(para('После входа вернёмся к авторизации ChatGPT. Нужен пароль аккаунта NEXT, а не панели Supabase.'),back));}
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
  renderRestoreArchive();
}
function renderRestoreArchive(){
 const section=panel(node('div','eyebrow','Сохранность истории'),title('Восстановить мир из архива'),
   para('Загрузи JSON-файл резервной копии. После SHA-256 проверки будут восстановлены все ветки, сцены, правила и история правок в новый мир. Существующие миры не трогаем.'));
 const fileInput=node('input','field');fileInput.type='file';fileInput.accept='.json,application/json';
 const out=node('div');
 fileInput.addEventListener('change',()=>busy(async()=>{
  out.replaceChildren();
  const file=fileInput.files?.[0];if(!file)return;
  if(file.size>101*1024*1024)throw Error('Архив превышает предел пакетного режима (100 МБ данных).');
  const raw=await file.text();
  const info=await inspectArchive(raw);
  const progress=node('div','notice');progress.hidden=true;
  const save=button('Восстановить как отдельный мир',()=>busy(async()=>{
   if(!confirm(`Восстановить «${info.title}» как НОВЫЙ мир, не удаляя существующие?`))return;
   save.disabled=true;
   try{
    const result=await restoreWorldArchive(raw,{onProgress:p=>{progress.hidden=false;progress.textContent=p.phase==='finalize'?'Все пакеты приняты. Создаётся новый мир…':'Загружено пакетов: '+p.done+' / '+p.total;}});
    toast('Восстановлен новый мир, сцен: '+result.scenes);
    await openWorld(result.world_id);
   }finally{save.disabled=false;}
  }));
  out.replaceChildren(para(`Проверено: «${info.title}», ${info.scene_count} сцен, ${info.branch_count} веток. SHA-256 совпадает.`),
    row(save),progress,para('Большой архив загружается частями. При обрыве выбери тот же файл и повтори: принятые пакеты сохраняются. Мир появляется только после атомарной финальной операции.'),button('Отменить незавершённую загрузку',()=>busy(async()=>{if(confirm('Удалить только временные пакеты этого импорта? Существующие миры останутся.')){await cancelArchiveImport(raw);progress.hidden=true;toast('Незавершённая загрузка отменена.');}}),'text-button'));
 }));
 add(section,fileInput,out,para('До 5000 сцен / 30 МБ — прежний импорт; крупнее — пакетный режим (до 50 000 записей в разделе и 100 МБ) после установки миграции 008. Реальная производительность большого импорта пока требует проверки.'));
 root.append(section);
}

async function openWorld(id){state.screen='world';state.tab='story';state.revision=null;loading();await reloadWorld(id);renderWorld();}
async function reloadWorld(id){const [world,branches,directives,history]=await Promise.all([getWorld(id),listBranches(id),listDirectives(id),activeHistory(id,{limit:50,offset:0})]);
  const branch=branches.find(b=>b.id===world.active_branch_id);
  state.world={...world,head_scene_id:branch?.head_scene_id||null};state.branches=branches;state.directives=directives;state.scenes=history.slice().reverse();state.hasOlder=history.length===50;state.historyComplete=!state.hasOlder;
}
/** Read-only cloud change detection: never replace the text being read or edited. */
let syncChecking=false;
function confirmLeaveDraft(){
 const editor=document.querySelector('#sceneEditor');
 return !editor?.value?.trim()||confirm('В редакторе есть несохранённый текст. Загрузить облачную версию и оставить правки?');
}
async function refreshFromCloud(worldId){
 if(!confirmLeaveDraft())return;
 await reloadWorld(worldId);
 renderWorld();
 toast('История и настройки синхронизированы.');
}
async function checkCloudChanges(){
 if(syncChecking||state.pending||state.screen!=='world'||!state.world||!readSession()||document.visibilityState!=='visible')return;
 syncChecking=true;
 const snapshot=state.world;
 try{
  const latest=await getWorld(snapshot.id);
  if(latest.updated_at===snapshot.updated_at&&latest.active_branch_id===snapshot.active_branch_id&&
     latest.directive_version===snapshot.directive_version&&latest.auto_save===snapshot.auto_save)return;
  const branches=await listBranches(snapshot.id);
  const head=branches.find(b=>b.id===latest.active_branch_id)?.head_scene_id??null;
  const change=detectWorldChange(snapshot,latest,head);
  if(!change||state.world?.id!==snapshot.id||state.screen!=='world')return;
  if(document.querySelector('#cloud-change-banner'))return;
  const buttonReload=button('Загрузить изменения',()=>busy(()=>refreshFromCloud(snapshot.id)),'btn secondary');
  const banner=panel(title('Есть изменения в облаке'),para(change.message),
   para('Текст и место чтения сохранены. Новые данные загрузятся только по твоему нажатию.'),
   row(buttonReload));
  banner.id='cloud-change-banner';
  banner.setAttribute('role','status');
  root.prepend(banner);
 }catch(e){console.warn('Cloud change check skipped',e);}
 finally{syncChecking=false;}
}

function renderWorld(){if(!state.world)return openWorlds();const w=state.world;state.screen='world';clear();add(root,row(button('← Все миры',()=>busy(openWorlds),'back'),button('↻ Синхронизировать',()=>busy(()=>refreshFromCloud(w.id)),'btn secondary')),node('div','eyebrow',w.start_marker||'Начало не установлено'),node('h1','hero-title',w.title),para(w.seed,'subtitle'));
  const tabs=node('div','tabs');for(const [id,name] of [['story','История'],['search','Поиск'],['people','Персонажи'],['directives','Настройки словами'],['branches','Ветки'],['agenda','Время'],['life','Мир'],['social','Общество'],['economy','Имущество'],['archive','Архив'],['director','Режиссёр']])tabs.append(button(name,()=>{state.tab=id;renderWorld();},'tab'+(state.tab===id?' active':'')));
  root.append(tabs);
  if(state.tab==='story')renderStory();if(state.tab==='search')renderSearch();if(state.tab==='people')renderPeople();if(state.tab==='directives')renderDirectives();if(state.tab==='branches')renderBranches();if(state.tab==='agenda')renderAgenda();if(state.tab==='life')renderLivingWorld();if(state.tab==='social')renderSocialWorld();if(state.tab==='economy')renderEconomy();if(state.tab==='archive')renderArchive();if(state.tab==='director')renderDirector();
}
function renderStory(){const w=state.world;
  add(root,panel(node('div','eyebrow','Игра в ChatGPT'),title('Продолжить историю'),para('История пишется в ChatGPT. После подключения нового MCP-моста сохранённые сцены будут появляться здесь автоматически. До этого доступен резервный импорт текста.'),row(button('Скопировать запрос для рассказчика',()=>busy(()=>copy(promptForNarrator({world:w,directives:state.directives,history:state.scenes.slice(-2),projection:state.historyComplete?replay(state.scenes,state.directives):{incomplete:true,reason:'Не вся история загружена. Понадобится восстановить её через историю и MCP.'}})))))));
  const heading=node('div','section-head');add(heading,title('Хроника'),node('span','count',state.scenes.length+' загружено'));root.append(heading);
  const readerInfo=node('span','count',readerPrefs.fontSize+' px · '+readerPrefs.lineHeight+' интервал');
  readerInfo.id='readerSizeLabel';
  root.append(panel(title('Удобство чтения на iPhone'),row(
   button('A−',()=>changeReaderPrefs({fontSize:readerPrefs.fontSize-2}),'btn secondary'),
   readerInfo,
   button('A+',()=>changeReaderPrefs({fontSize:readerPrefs.fontSize+2}),'btn secondary'),
   button('Строки −',()=>changeReaderPrefs({lineHeight:readerPrefs.lineHeight-0.1}),'btn secondary'),
   button('Строки +',()=>changeReaderPrefs({lineHeight:readerPrefs.lineHeight+0.1}),'btn secondary')
  ),para('Размер и интервал сохраняются только в этом браузере. Сюжет и история не изменяются.')));
  if(state.hasOlder){root.append(panel(para('Есть более ранние сцены. Подгружай порциями без скачивания всей истории в память телефона.'),
   row(button('Загрузить предыдущие 50 сцен',()=>busy(async()=>{
     const result=await loadEarlierHistory(w,state.scenes,{pageSize:50});
     state.scenes=result.scenes;state.hasOlder=result.hasOlder;state.historyComplete=result.complete;renderWorld();
   }),'btn secondary'))));}
  if(!state.scenes.length)root.append(node('div','empty','История ещё не началась. Первый эпизод можно сыграть в ChatGPT и затем сохранить.'));
  const container=node('div','story');state.scenes.forEach((s,i)=>{
    const card=node('article','scene');const chapter=node('h3','',`${state.historyComplete?'Сцена '+(i+1):'Сцена из действующей ветки'}${s.world_time?' · '+s.world_time:''}`);const details=node('details','scene-details');if(i===state.scenes.length-1)details.open=true;
    const summary=node('summary','',details.open?'Текст сцены':'Читать сцену');const body=node('div','scene-body',s.body);body.style.fontSize=readerPrefs.fontSize+'px';body.style.lineHeight=String(readerPrefs.lineHeight);add(details,summary,body);
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
 const profile=node('div');
 const results=node('div');let offset=0,lastActor='';const more=button('Ещё события',()=>busy(()=>load(true)),'btn secondary');more.hidden=true;
 const load=async(append=false)=>{
   if(!append){
    offset=0;lastActor=fieldName.value.trim();results.replaceChildren();
    if(!lastActor)return;
    showProfile(projection,state.historyComplete);
   }
   const rows=await actorHistory(w.id,lastActor,{limit:40,offset});offset+=rows.length;
   if(!rows.length&&!append)results.append(para('Структурированных событий о персонаже пока нет. Это не доказывает, что его не было в тексте.'));
   for(const r of rows){const block=node('div','rule');
     add(block,node('strong','',`${r.world_time||'Без даты'} · ${r.event.type}`),para(r.event.evidence||'Подтверждение не заполнено'),
       para(JSON.stringify(Object.fromEntries(Object.entries(r.event).filter(([k])=>!['evidence','id'].includes(k))))));
     const full=node('div','scene-body');full.hidden=true;
     add(block,button('Показать сцену-источник',()=>busy(async()=>{const scene=await getScene(w.id,r.scene_id);full.textContent=scene.body;full.hidden=false;}),'text-button'),full);results.append(block);
   }more.hidden=rows.length<40;
   if(!append)await findMentions(false);
 };
 const mentions=node('div');let mentionOffset=0,mentionActor='';
 const moreMentions=button('Ещё упоминания в тексте',()=>busy(()=>findMentions(true)),'btn secondary');
 moreMentions.hidden=true;
 const findMentions=async(append=false)=>{
  if(!append){mentionOffset=0;mentionActor=fieldName.value.trim();mentions.replaceChildren();}
  if(mentionActor.length<2){if(!append)mentions.append(para('Для поиска по исходным сценам нужно хотя бы два символа имени.'));return;}
  const hits=await searchActiveScenes(w.id,mentionActor,{limit:20,offset:mentionOffset});
  mentionOffset+=hits.length;
  if(!hits.length&&!append)mentions.append(para('Буквальных упоминаний имени не найдено. Это не доказывает, что герой не появлялся под другим именем.'));
  for(const hit of hits){
   const card=node('div','rule');
   const body=node('div','scene-body');body.hidden=true;
   add(card,node('strong','',hit.world_time||'Время не указано'),
    para(hit.snippet||'В тексте найдено совпадение.'),
    para('Только совпадение текста, а не подтверждённый факт или изменение отношений.'),
    button('Прочитать сцену',()=>busy(async()=>{
     const scene=await getScene(w.id,hit.scene_id);
     body.textContent=scene.body;body.style.fontSize=readerPrefs.fontSize+'px';
     body.style.lineHeight=String(readerPrefs.lineHeight);body.hidden=false;
    }),'text-button'),body);
   mentions.append(card);
  }
  moreMentions.hidden=hits.length<20;
 };
 const showProfile=(p,complete)=>{
  profile.replaceChildren();
  const current=characterStateView(p,lastActor,{complete});
  profile.append(title('Последнее известное состояние'));
  if(current.ambiguous_names.length)profile.append(para('Есть разные записанные имена: '+current.ambiguous_names.join(', ')+'. Уточни имя.'));
  if(!current.character?.state_fields.length)profile.append(para('Отдельные свойства ещё не записаны. Это не означает отсутствия места, травм или привычек.'));
  for(const field of current.character?.state_fields||[]){
   const card=node('div','rule');
   add(card,node('strong','',field.label),para(field.value??'Не установлено'));
   if(field.source?.world_time)card.append(para('Когда записано: '+field.source.world_time));
   if(field.source?.scene_id)card.append(button('Показать источник',()=>busy(async()=>{
    const source=await getScene(w.id,field.source.scene_id);
    card.append(node('div','scene-body',source.body));
   }),'text-button'));
   profile.append(card);
  }
  profile.append(para(complete?'Сведения отражают последнее записанное состояние, а не автоматически текущее.':'Показаны данные только загруженной части истории.'));
 };
 const fullProfile=button('Состояние по всей ветке',()=>busy(async()=>{
  if(!fieldName.value.trim())throw Error('Укажи имя персонажа.');
  lastActor=fieldName.value.trim();fullProfile.disabled=true;
  try{const memory=await fullStructuredMemory(w);showProfile(replay(memory.scenes,[],{evidencePrevalidated:true}),memory.complete);}
  finally{fullProfile.disabled=false;}
 }),'btn secondary');
 const form=node('form');form.addEventListener('submit',e=>{e.preventDefault();busy(()=>load());});
 const submit=node('button','btn','Найти историю героя');submit.type='submit';
 add(form,fieldName,row(submit));add(box,choices,form,row(fullProfile),profile,title('Подтверждённые события'),results,row(more),title('Упоминания в исходных сценах'),para('Находим упоминания имени даже без ручной разметки. Цитата — подсказка: чтобы установить факт, открой сцену и проверь контекст.'),mentions,row(moreMentions));
 root.append(box);
 const ties=panel(title('Подтверждённые связи'),para('Направленные отношения: отношение А к Б не означает того же чувства у Б к А.'));
 if(!projection.relationships.length)ties.append(para('Связи ещё не отмечены в сохранённых событиях.'));
 for(const link of projection.relationships){const item=node('div','rule');add(item,node('strong','',`${link.a} → ${link.b}`),para(`Состояние: ${link.stance||'не указано'}`),para(link.evidence||''));ties.append(item);}
 root.append(ties);
 const agency=panel(title('Самостоятельные планы NPC'),para('Цели — это намерения, а не уже совершившиеся поступки. Персонажи могут стремиться к разному, ссориться и не искать примирения. Завершение плана требует фактического события и источника.'));
 const resultsFull=node('div');
 const inspect=button('Загрузить планы из всей истории',()=>busy(async()=>{
  resultsFull.replaceChildren(para('Читаю события действующей ветки…'));
  const memory=await fullStructuredMemory(w);
  const p=replay(memory.scenes,[],{evidencePrevalidated:true});
  resultsFull.replaceChildren(para(`Обработано сцен: ${memory.scenes.length}. ${memory.complete?'Цепочка загружена полностью.':'Достигнут лимит чтения: результат неполный.'}`));
  if(!p.plans.length)resultsFull.append(para('Планы пока не отмечены в сохранённых событиях. Это не означает отсутствия желаний у героев.'));
  for(const plan of p.plans){
   const card=node('div','rule');add(card,node('strong','',`${plan.actor} · ${plan.status==='active'?'действует':plan.status==='paused'?'отложен':plan.status==='completed'?'выполнен':'оставлен'}`),para(plan.goal),para(`Последний источник: ${plan.source?.scene_id||'не указан'}`));
   resultsFull.append(card);
  }
  if(p.validation_warnings.length)resultsFull.append(node('div','notice',`Обнаружены противоречивые события: ${p.validation_warnings.length}. Это требует проверки текста.`));
 }),'btn secondary');
 add(agency,row(inspect),resultsFull);root.append(agency);
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
 add(box,row(btn),output,para('Этот экспорт предназначен для сохранности истории. Для восстановления открой список миров и выбери «Восстановить мир из архива». Исходный мир не удаляется.'));
 const upload=node('input','field');upload.type='file';upload.accept='.json,application/json';
 const inspection=node('div');upload.addEventListener('change',()=>busy(async()=>{
   const file=upload.files?.[0];if(!file)return;
   if(file.size>100*1024*1024)throw Error('Файл слишком большой для проверки в браузере.');
   const info=await inspectArchive(await file.text());
   inspection.replaceChildren(para(`Контрольная сумма совпадает: ${info.title} · ${info.scene_count} сцен · ${info.branch_count} веток. Архив проверен, но ещё не импортирован.`));
 }));
 add(box,title('Проверить сохранённый архив'),para('Проверка содержимого и контрольной суммы без загрузки файла на сервер.'),upload,inspection);
 root.append(box);
}

/** Fictional time never ticks in the background: we display only saved scenes. */
function renderEconomy(){
 const w=state.world, output=node('div'), actor=node('input','field');
 actor.placeholder='Имя персонажа (необязательно)';
 let projection=replay(state.scenes,[]), complete=state.historyComplete,offset=0;
 const show=()=>{
  const result=economyView(projection,{actor:actor.value,offset,limit:40,complete});
  output.replaceChildren();
  if(!complete)output.append(node('div','notice','Показана часть истории. Остатки и владение могут быть неполными; загрузи всю память.'));
  if(!result.records.length)output.append(para('Подтверждённых записей нет. Это не означает отсутствие денег или вещей.'));
  for(const e of result.records){
   const card=node('div','rule');
   if(e.kind==='money')add(card,node('strong','',e.actor+' · '+e.currency),
    para(e.known?'Записанный остаток: '+e.balance:'Остаток неизвестен · записанное изменение: '+e.delta));
   else add(card,node('strong','',e.name||e.item_id),para(e.custody_status==='held'?'Владелец по записи: '+e.holder:
    e.custody_status==='lost'?'Потерян':e.custody_status==='destroyed'?'Уничтожен':'Владение не установлено'),
    para('Последнее действие: '+e.action));
   if(e.source?.scene_id)card.append(button('Открыть источник',()=>busy(async()=>{
    const scene=await getScene(w.id,e.source.scene_id);
    const body=node('div','scene-body',scene.body);card.append(body);
   }),'text-button'));
   output.append(card);
  }
  if(offset>0)output.append(button('Предыдущие записи',()=>{offset=Math.max(0,offset-40);show();},'btn secondary'));
  if(result.next_offset!==null)output.append(button('Следующие записи',()=>{offset=result.next_offset;show();},'btn secondary'));
 };
 actor.addEventListener('input',()=>{offset=0;show();});
 const load=button('Прочитать имущество по всей ветке',()=>busy(async()=>{
  load.disabled=true;
  try{const memory=await fullStructuredMemory(w);projection=replay(memory.scenes,[],{evidencePrevalidated:true});complete=memory.complete;offset=0;show();}
  finally{load.disabled=false;}
 }),'btn secondary');
 root.append(panel(title('Деньги и имущество'),para('Учёт только подтверждённых событий. Неизвестный остаток не равен нулю. Предметы не появляются и не исчезают автоматически.'),actor,row(load),output));
 show();
}

function renderLivingWorld(){
 const w=state.world, output=node('div');
 const actor=node('input','field'),place=node('input','field');actor.placeholder='Точное имя героя (необязательно)';place.placeholder='Название места (необязательно)';actor.maxLength=140;place.maxLength=140;
 let scenes=state.scenes, complete=state.historyComplete, verified=false, offset=0;
 const show=()=>{
  const data=livingWorldView(scenes,replay(scenes,[],{evidencePrevalidated:verified}),{actor:actor.value,place:place.value,complete,offset,limit:20});
  output.replaceChildren(para('Время последней сцены: '+(data.clock||'точное время неизвестно')));
  const addSource=(card,record)=>{if(record.source?.scene_id){
   const source=node('div','scene-body');source.hidden=true;
   card.append(button('Открыть источник',()=>busy(async()=>{const s=await getScene(w.id,record.source.scene_id);source.textContent=s.body;source.hidden=false;}),'text-button'),source);
  }};
  const groups=[
   ['Места',data.places,r=>[r.name,r.status+(r.access?' · '+r.access:''),r.description||'']],
   ['Распорядок NPC',data.routines,r=>[r.actor+' · '+r.activity,r.place+' · '+r.start+'–'+r.end+' · дни '+r.weekdays.join(', '),r.status+' · '+(r.window==='scheduled_window_not_actual_presence'?'По расписанию возможно сейчас; присутствие не установлено':r.window==='clock_unknown'?'Точное время неизвестно':'Вне окна или неактивно')]],
   ['Последнее известное местонахождение',data.last_known_locations,r=>[r.actor,r.location||'Явно неизвестно','Не подтверждает текущее присутствие']],
   ['События вне кадра',data.offscreen_events,r=>[r.actor||r.actors.join(', ')||'Участник не указан',r.place||'Место не указано',r.description||'']]
  ];
  for(const [heading,records,labels] of groups){
   output.append(title(heading));
   if(!records.length)output.append(para('В этой выборке нет записей.'));
   for(const r of records){const [a,b,c]=labels(r),card=add(node('div','rule'),node('strong','',a),para(b),para(c));addSource(card,r);output.append(card);}
  }
  if(offset>0)output.append(button('Предыдущая страница',()=>{offset=Math.max(0,offset-20);show();},'btn secondary'));
  if(data.next_offset!==null)output.append(button('Следующая страница',()=>{offset=data.next_offset;show();},'btn secondary'));
  if(!complete)output.append(node('div','notice','Загружена часть истории. Для полного состояния прочитай всю действующую ветку.'));
 };
 const refresh=button('Читать память всей ветки',()=>busy(async()=>{const m=await fullStructuredMemory(w);scenes=m.scenes;complete=m.complete;verified=true;offset=0;show();}),'btn secondary');
 add(root,panel(title('Живой мир'),para('Места меняются, у NPC есть привычный распорядок и собственные дела. Записи возникают из сцен, а не из ручной карты. Расписание не доказывает присутствие.'),actor,place,row(button('Найти',()=>{offset=0;show();}),refresh),output));
 show();
 const review=panel(title('Разобрать старую сцену'),para('Выбери сцену из загруженной истории. Получишь точные фрагменты для извлечения воспоминаний рассказчиком; оригинальный текст не меняется.'));
 const choices=node('select','field');for(const s of state.scenes.slice().reverse()){const opt=node('option','', (s.world_time||'Без даты')+' · '+String(s.body||'').slice(0,70));opt.value=s.id;choices.append(opt);}
 const fragments=node('div');let cursor=0;
 const read=()=>{const s=state.scenes.find(x=>x.id===choices.value);fragments.replaceChildren();if(!s)return;
  const page=annotationPassages(s,{offset:cursor,limit:4});
  for(const item of page.passages)fragments.append(add(node('div','rule'),para('Фрагмент '+item.start+'–'+item.end+' · событий с цитатой: '+item.existing_event_ids.length),node('div','scene-body',item.quote)));
  if(cursor>0)fragments.append(button('К началу',()=>{cursor=0;read();},'btn secondary'));
  if(page.next_offset!==null)fragments.append(button('Следующие фрагменты',()=>{cursor=page.next_offset;read();},'btn secondary'));
 };
 choices.addEventListener('change',()=>{cursor=0;read();});
 add(review,choices,fragments);root.append(review);read();
}
function renderSocialWorld(){
 const w=state.world,out=node('div'),actor=node('input','field'),group=node('input','field');
 actor.placeholder='Имя героя';group.placeholder='Группа или ID';actor.maxLength=140;group.maxLength=140;
 let scenes=state.scenes,complete=state.historyComplete,verified=false,offset=0;
 const source=(card,r)=>{if(!r.source?.scene_id)return;const body=node('div','scene-body');body.hidden=true;card.append(button('Источник',()=>busy(async()=>{body.textContent=(await getScene(w.id,r.source.scene_id)).body;body.hidden=false;}),'text-button'),body);};
 const show=()=>{
  const p=replay(scenes,[],{evidencePrevalidated:verified}),view=socialWorldView(p,{actor:actor.value,group:group.value,complete,offset,limit:20});
  out.replaceChildren();
  for(const [heading,rows] of [['Организации',view.groups],['Членство',view.memberships],['Независимые сюжетные линии',view.threads]]){
   out.append(title(heading));
   if(!rows.length)out.append(para('Нет записей в этой выборке.'));
   for(const r of rows){const card=add(node('div','rule'),node('strong','',r.name||r.title||r.actor),para([r.group_id,r.role,r.status,r.visibility].filter(Boolean).join(' · ')),para(r.purpose||r.description||''),para(r.actors?.join(', ')||''));source(card,r);out.append(card);}
  }
  if(actor.value.trim()){
   const view=knowledgeView(p,{actor:actor.value,complete,offset,limit:20});out.append(title('Что знает или считает герой'));
   for(const r of view.records){const card=add(node('div','rule'),node('strong','',r.content),para(r.status+' · '+r.channel),para(r.informant||''));source(card,r);out.append(card);}
   if(!view.records.length)out.append(para('Записанных сведений нет; это не доказывает незнание.'));
   if(view.next_offset!==null&&out.querySelector('[data-more-knowledge]')===null){const more=button('Ещё сведения',()=>{offset=view.next_offset;show();},'btn secondary');more.dataset.moreKnowledge='1';out.append(more);}
  }
  if(offset)out.append(button('Предыдущая страница',()=>{offset=Math.max(0,offset-20);show();},'btn secondary'));
  if(view.next_offset!==null)out.append(button('Следующая страница',()=>{offset=view.next_offset;show();},'btn secondary'));
  if(!complete)out.append(node('div','notice','Память загружена частично.'));
 };
 const refresh=button('Прочитать всю память',()=>busy(async()=>{const m=await fullStructuredMemory(w);scenes=m.scenes;complete=m.complete;verified=true;offset=0;show();}),'btn secondary');
 const notesOut=node('div');let notesOffset=0,notesActor=null;
 const getNotes=async(append=false)=>{if(!append){notesOffset=0;notesActor=actor.value.trim()||null;notesOut.replaceChildren();}
  const rows=await readMemoryNotes(w,{actor:notesActor,offset:notesOffset});
  for(const r of rows){const card=add(node('div','rule'),node('strong','',r.note.summary),para('Предложение памяти · '+r.note.kind),para(r.note.quote));source(card,{source:{scene_id:r.scene_id}});notesOut.append(card);}
  notesOffset+=rows.length;more.hidden=rows.length<20;
  if(!append&&!rows.length)notesOut.append(para('Предложений пока нет.'));};
 const more=button('Ещё предложения',()=>busy(()=>getNotes(true)),'btn secondary');more.hidden=true;
 root.append(panel(title('Общество и личные знания'),para('Состав групп, личные убеждения и чужие сюжетные линии остаются раздельными. Не каждая запись известна всем героям.'),actor,group,row(button('Найти',()=>{offset=0;show();}),refresh),out),
  panel(title('Восстановленная память'),para('Отдельные предложения рассказчика по старым сценам. Не меняют канон. Требуется миграция 009.'),button('Читать предложения',()=>busy(()=>getNotes(false)),'btn secondary'),notesOut,more));
 show();
}
function renderAgenda(){
 const w=state.world;
 const intro=panel(title('Игровое время и обязательства'),
  para('Время определяют только сыгранные сцены. Обещания и планы не выполняются автоматически, пока ты не играешь.'));
 const output=node('div');
 const show=(scenes,complete,isVerified)=>{
  const projection=replay(scenes,[],{evidencePrevalidated:isVerified});
  const agenda=recordedWorldAgenda(scenes,projection,{maxEntries:80});
  output.replaceChildren();
  output.append(para('Последнее указанное время: '+(agenda.latest_recorded_time||'не установлено')+
   (agenda.anchor_is_latest_scene?'':' · после последней даты есть сцены без точного времени')));
  if(!agenda.anchor_is_latest_scene&&agenda.latest_recorded_time)
   output.append(node('div','notice','Последняя указанная дата не обязательно является текущей. Не перескакивай к ней автоматически.'));
  if(!agenda.items.length)output.append(para('Сроков и активных целей в загруженных подтверждённых событиях не отмечено.'));
  for(const item of agenda.items){
   const description=item.kind==='npc_plan'?'Цель NPC':'Обязательство';
   const line=node('div','rule');
   add(line,node('strong','',description+' · '+(item.actor||'участник не указан')),
    para(item.title),para('Срок: '+(item.deadline||'не указан')+' · состояние: '+item.status),
    para(item.timing==='date_past_status_requires_verification'
      ?'Дата срока уже раньше последнего известного времени — требуется проверить, было ли исполнение.'
      :item.timing==='future_date_as_recorded'?'Срок в будущем по записанной дате; никаких действий автоматически не произойдёт.'
      :item.timing==='same_day_time_uncertain'?'Точное время в пределах суток не установлено.'
      :'Момент исполнения не установлен; нельзя делать вывод о нарушении.'),
    para('Источник: '+(item.source?.scene_id||'не указан')));
   output.append(line);
  }
  if(agenda.omitted_items>0)output.append(para('Не показано дополнительных записей: '+agenda.omitted_items));
  for(const warning of agenda.chronology_to_review.slice(-5))output.append(
   node('div','notice','Возможный переход назад по времени: '+warning.from+' → '+warning.to+
    ' (сцены '+warning.from_scene_id+' / '+warning.to_scene_id+'). Это может быть флешбэк.'));
  if(!complete)output.append(node('div','notice','История загружена не полностью: в старых сценах могут быть другие сроки, цели или изменения статуса.'));
 };
 show(state.scenes,state.historyComplete,false);
 const refresh=button('Просмотреть время во всей действующей истории',()=>busy(async()=>{
  refresh.disabled=true;
  try{
   const memory=await fullStructuredMemory(w);
   show(memory.scenes,memory.complete,true);
   toast('Хронология обновлена из подтверждённой памяти.');
  }finally{refresh.disabled=false;}
 }),'btn secondary');
 add(intro,output,row(refresh),para('Сведения о времени не сравниваются с настоящими часами. Срок — лишь зафиксированное условие, а не сигнал немедленного изменения истории.'));
 root.append(intro);
}

function renderDirector(){const w=state.world;add(root,panel(title('Состояние памяти'),para('Режиссёрская информация отделена от художественного текста.'),node('div','rule',`Загружено сцен: ${state.scenes.length}${state.hasOlder?' (есть ещё)': ''}`),node('div','rule',`Текущая ветка: ${w.active_branch_id}`)));
 const p=replay(state.scenes,state.directives);const stats=panel(title('Подтверждённые события'),para(`Записанных изменений: ${p.events_replayed}. Неотмеченные сцены не означают отсутствия событий.`));
 for(const [name,arr] of [['Персонажи',p.people],['Отношения',p.relationships],['Знания',p.knowledge],['Финансы',p.balances],['Вещи',p.items],['Обязательства',p.obligations],['Планы NPC',p.plans],['События вне кадра',p.offscreen]])stats.append(para(`${name}: ${arr.length}`));
 if(!state.historyComplete)stats.append(node('div','notice','Загружена только часть истории. Проекция не полная. Нельзя делать выводы о старых событиях.'));
 if(p.validation_warnings.length)stats.append(node('div','notice',`Некоторые события отклонены: ${p.validation_warnings.length}.`));root.append(stats);
 const drivers=storyDrivers(p,state.directives);
 const pressure=panel(title('Что движет персонажами'),para('Настоящие желания, обещания и конфликты из подтверждённых источников. Это подсказки для повествования, не произошедшие автоматически события.'));
 if(!drivers.length)pressure.append(para('Структурных мотивов пока нет. Это не значит, что герои лишены собственных целей: точные первоисточники доступны через поиск.'));
 for(const d of drivers){
  const source=d.source?.scene_id?' · источник: '+d.source.scene_id:'';
  const label=d.kind==='npc_intention'?d.actor+' — '+d.goal+' ('+d.status+')':
   d.kind==='recorded_commitment'?'Обязательство '+d.commitment_id+' ('+d.status+')':
   d.kind==='independent_thread'?'Сюжетная линия: '+d.title+' ('+d.status+')':
   d.kind==='established_antagonism'?d.actors.join(' → ')+' · '+d.stance:
   d.actors.join(' ↔ ')+' · авторский запрет';
  pressure.append(add(node('div','rule'),node('strong','',label),para(d.guidance+source)));
 }
 if(!state.historyComplete)pressure.append(node('div','notice','Загружена часть истории. Ранее записанные цели могут пока не отображаться.'));
 root.append(pressure);
 const audit=literaryReview(state.scenes);
 const literary=panel(title('Литературные повторения'),para('Диагностика нежелательных клише: «разрешите мне всё», примирение вопреки характеру и универсальная дипломатичность. Совпадение — повод проверить сцену, не автоматический запрет.'));
 if(!audit.samples.length)literary.append(para('В загруженных сценах характерных повторений не найдено. Это не доказывает идеальность текста.'));
 for(const [id,name] of [['permission-loop','Ожидание разрешения'],['forced-reconciliation','Примирение'],['generic-compromise','Универсальные компромиссы']])literary.append(para(`${name}: ${audit.counts[id]}`));
 for(const ending of audit.repeated_endings||[])literary.append(add(node('div','rule'),node('strong','','Повтор одинакового окончания: '+ending.count),para(ending.excerpt)));
 for(const s of audit.samples.slice(0,10)){const item=node('div','rule');add(item,node('strong','',s.label),para(s.excerpt));literary.append(item);}
 if(!state.historyComplete)literary.append(node('div','notice','Литературная проверка охватывает только загруженные сцены.'));
 root.append(literary);
 add(root,panel(title('Автосохранение через MCP'),para('После публикации и подключения OAuth-моста ChatGPT сможет сохранять сцены при включённом разрешении. Эта настройка не запускает модель в фоне.'),row(button(w.auto_save?'Автосохранение включено':'Автосохранение выключено',()=>busy(async()=>{await setAutosave(w.id,!w.auto_save);await reloadWorld(w.id);renderWorld();}),'btn secondary'))));
 add(root,panel(title('Удалить мир'),para('Удаление безвозвратное. Старый LIVING WORLD не затрагивается.'),row(button('Удалить этот мир',()=>busy(async()=>{if(!confirm(`Удалить мир «${w.title}» вместе с его ветками?`))return;await deleteWorld(w.id);await openWorlds();toast('Мир удалён.');}),'btn danger'))));
}
accountButton.addEventListener('click',()=>busy(async()=>{if(readSession()){await signOut();showAuth();}else showAuth();}));
document.querySelector('#homeLink').addEventListener('click',e=>{e.preventDefault();busy(openWorlds);});
window.addEventListener('unhandledrejection',e=>{console.error(e.reason);toast('Ошибка подключения. Попробуй обновить страницу.',true);});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void checkCloudChanges();});
window.addEventListener('focus',()=>void checkCloudChanges());
// While visible, check only inexpensive owner/branch metadata; never download scenes automatically.
setInterval(()=>{if(document.visibilityState==='visible')void checkCloudChanges();},90000);
if(!(readSession()&&resumeOAuth()))openWorlds();

if('serviceWorker' in navigator && window.isSecureContext)navigator.serviceWorker.register('/sw.js').catch(()=>{});
