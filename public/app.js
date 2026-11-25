import {EMPTY_SECTION_HINTS,hasMenuRecords,reviewedMenuHistory} from './core/menu-history.mjs';
import {MENU_LABELS,menuLabel,menuValue,isMenuMetadata,menuError} from './core/menu-ru.mjs';
import {MENU_GROUPS,MENU_DESCRIPTIONS,directorySections,menuSnapshotKey,menuSectionTransition} from './core/native-menu.mjs';
import {ROOM_ACTIONS} from './core/room-layout.mjs';
import {COMMUNITY_ACTIONS,communityTargets} from './core/community-life.mjs';
import {CIVIC_ACTIONS,civicActionTargets} from './core/civic-life.mjs';
import {VISUAL_KINDS,VISUAL_SUBJECTS,VISUAL_FREQUENCIES,visualSubjects,visualReferences,visualPrompt,visibleVisuals,parseVisualHash,visualUploadHash} from './core/visual-world.mjs';
import {listVisualAssets,getVisualPreferences,saveVisualPreferences,prepareVisual,uploadVisual,finishVisual,loadVisualBlob,archiveVisual} from './lib/visual-storage.mjs';
import {WEALTH_ACTIONS,WEALTH_IDS,wealthActionRows} from './core/wealth-world.mjs';
import {documentIndex,DOCUMENT_ACTIONS,DOCUMENT_ACTION_IDS,documentActionRows} from './core/documents-world.mjs';
import {SOCIETY_ACTIONS,SOCIETY_ACTION_IDS,societyActionRows} from './core/magic-society.mjs';
import {MAGIC_ACTIONS,MAGIC_ACTION_IDS,magicActionRows} from './core/magic-world.mjs';
import {ADVANCED_ACTIONS,ADVANCED_ACTION_IDS} from './core/advanced-world.mjs';
import {readUI,saveUI,filterSections,hudStates} from './core/ui-preferences.mjs';
import {sectionScrollTarget,WORLD_TABS} from './core/section-navigation.mjs';
import {gameMenuContext,playerMenuOverview,menuSection,menuPreferences,menuRecordFromInput,menuActionIntent,DEFAULT_MENU_SETTINGS,MENU_ACTION_LABELS} from './core/game-menu.mjs';
import {PERSONAL_ACTIONS,PERSONAL_ACTION_IDS} from './core/personal-menu.mjs';
import {recordedPlayerActors} from './core/social-dashboard.mjs';
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
import {relationshipHistory} from './core/relationship-memory.mjs';
import {activityView} from './core/activities.mjs';
import {consequenceView} from './core/consequences.mjs';
import {growthView} from './core/growth.mjs';
import {dynamicsView} from './core/world-dynamics.mjs';
import {prepareStoryTurn} from './core/story-turn.mjs';
import {economyView} from './core/economy.mjs';
import {characterStateView} from './core/character-state.mjs';
import {detectWorldChange,canAutoSyncMenu} from './core/cloud-sync.mjs';
import {readReaderPrefs,saveReaderPrefs} from './core/reader.mjs';
import {sceneReaderUrl,parseSceneReaderHash,readLinkedScene} from './core/scene-links.mjs';
import {readConfig,readSession,saveConfig,signIn,signUp,signOut} from './lib/session.mjs';
import {getReturnId,consentPath} from './lib/oauth-return.mjs';
import {rpc,listWorlds,getWorld,createWorld,listDirectives,addDirective,editDirective,setDirectiveActive,directiveHistory,reviseScene,listBranches,activeHistory,allActiveHistory,loadEarlierHistory,saveScene,forkBefore,switchBranch,setAutosave,deleteWorld,searchActiveScenes,actorHistory,getScene,exportWorldArchive,restoreWorldArchive,cancelArchiveImport,fullStructuredMemory,readMemoryNotes} from './lib/storage.mjs';

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
const sceneLink=(worldId,sceneId,label='Читать отдельно')=>{if(state.screen==='world'&&state.tab==='menu'&&state.world?.id===worldId)return button(label,()=>openMenuSource(worldId,sceneId),'btn secondary');const a=node('a','btn secondary',label);a.href=sceneReaderUrl(worldId,sceneId);return a;};
const row=(...children)=>add(node('div','btn-row'),...children);
const panel=(...children)=>add(node('section','panel'),...children);
const title=(text)=>node('h2','',text);
const para=(text,cls='small')=>node('p',cls,text);
const busy=async(action)=>{if(state.pending)return;state.pending=true;try{await action();}catch(e){console.error(e);toast(menuError(e)||'Ошибка операции',true);}finally{state.pending=false;}};
const readerStorage=(()=>{try{return window.localStorage;}catch{return null;}})();
let readerPrefs=readReaderPrefs(readerStorage),uiPrefs=readUI(readerStorage);
function applyUI(){document.documentElement.dataset.theme=uiPrefs.theme;document.documentElement.dataset.density=uiPrefs.density;document.documentElement.dataset.textScale=uiPrefs.textScale;}
function updateUI(change){uiPrefs=saveUI(readerStorage,{...uiPrefs,...change});applyUI();}
applyUI();
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
function clear(){if(archiveUrl){URL.revokeObjectURL(archiveUrl);archiveUrl=null;}root.replaceChildren();window.scrollTo({top:0,behavior:'instant'});accountButton.textContent=readSession()?'Выйти':'Аккаунт';}
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
  const submit=button(mode==='signin'?'Войти':'Зарегистрироваться',()=>busy(async()=>{if(!email.value||!password.value)return toast('Заполни email и пароль.',true);if(mode==='signin'){await signIn(email.value,password.value);password.value='';if(!resumeOAuth())await openLanding();}else{await signUp(email.value,password.value);toast('Проверь почту, если Supabase требует подтверждение.');showAuth();}}));
  add(form,node('label','input-label','Email'),email,node('label','input-label','Пароль'),password,row(submit,button(mode==='signin'?'Создать аккаунт':'У меня уже есть аккаунт',()=>showAuth(mode==='signin'?'signup':'signin'),'btn ghost')));
  add(root,panel(form),button('Изменить подключение Supabase',showConnect,'text-button'));
  if(oauthReturnId){const back=node('a','btn secondary','К мирам без ChatGPT');back.href='/';add(root,panel(para('После входа вернёмся к авторизации ChatGPT. Нужен пароль аккаунта NEXT, а не панели Supabase.'),back));}
}
function clearReaderHash(){if(location.hash)history.replaceState(null,'',location.pathname+location.search);}
async function openLanding(){
 if(!readConfig())return showConnect();if(!readSession())return showAuth();
 const visual=parseVisualHash(location.hash);if(visual){await openWorld(visual.worldId);state.tab='menu';menuUiState.set(state.world.id+':'+state.world.active_branch_id,{section:'illustrations',actor:'',offset:0,visualFocus:visual.assetId});renderWorld();return;}
 let link;try{link=parseSceneReaderHash(location.hash);}catch(e){clear();add(root,title('Ссылка недействительна'),para(menuError(e)),button('Все миры',()=>busy(openWorlds)));return;}
 return link?openLinkedScene(link):openWorlds();
}
async function openLinkedScene(link){
 state.screen='reader';state.world=null;state.scenes=[];state.revision=null;loading();
 try{
  const result=await readLinkedScene(link,{getWorld,getScene,rpc});
  if(!readSession())return showAuth();
  const {world,scene,inActiveBranch}=result;clear();
  add(root,row(button('← Все миры',()=>busy(openWorlds),'back'),button('Открыть мир',()=>busy(()=>openWorld(world.id)),'btn secondary')),
   node('div','eyebrow','Чтение сохранённой сцены'),node('h1','hero-title',world.title));
  if(!inActiveBranch)root.append(node('div','notice','Альтернативная ветка. Этот эпизод не относится к текущему канону.'));
  const body=node('div','scene-body',scene.body);
  add(root,add(node('article','scene'),title(scene.world_time||'Сохранённый эпизод'),body),
   panel(row(button('A−',()=>changeReaderPrefs({fontSize:readerPrefs.fontSize-2}),'btn secondary'),button('A+',()=>changeReaderPrefs({fontSize:readerPrefs.fontSize+2}),'btn secondary'),button('Скопировать ссылку',()=>busy(()=>copy(sceneReaderUrl(world.id,scene.id))),'btn secondary')),para('Ссылка открывает только уже сохранённый текст. Она не меняет историю или ветку.')));
  updateSceneTypography();
 }catch(e){clear();add(root,title('Не удалось открыть сцену'),para(menuError(e)||'Сцена недоступна.'),row(button('Повторить',()=>busy(openLanding)),button('Все миры',()=>busy(openWorlds),'btn secondary')));}
}
async function openWorlds(){menuMemoryCache=null;menuMemoryJob=null;clearReaderHash();if(!readConfig())return showConnect();if(!readSession())return showAuth();state.screen='worlds';loading();try{state.worlds=await listWorlds();renderWorlds();}catch(e){clear();add(root,node('h1','hero-title','Не удалось открыть миры'),node('div','notice',menuError(e)||'Ошибка загрузки'),para('Если это новый проект, проверь, что схема supabase/schema.sql установлена. Входить повторно не требуется.'),row(button('Повторить',()=>busy(openWorlds)),button('Подключение',showConnect,'btn secondary')));}}
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
 add(section,fileInput,out,para('До 5000 сцен / 30 МБ — прежний импорт; крупнее — пакетный режим (до 50 000 записей в разделе и 100 МБ) при наличии миграции 008 (установлена в NEXT). Реальная производительность большого импорта пока требует проверки.'));
 root.append(section);
}

async function openWorld(id){clearReaderHash();state.screen='world';state.tab='story';state.revision=null;loading();await reloadWorld(id);renderWorld();}
async function reloadWorld(id,{accept=null}={}){const [world,branches,directives,history]=await Promise.all([getWorld(id),listBranches(id),listDirectives(id),activeHistory(id,{limit:50,offset:0})]);
  const branch=branches.find(b=>b.id===world.active_branch_id);
  if(accept&&(!accept()||(branch?.head_scene_id??null)!==(history[0]?.id??null)))return false;
  state.world={...world,head_scene_id:branch?.head_scene_id||null};state.branches=branches;state.directives=directives;state.scenes=history.slice().reverse();state.hasOlder=history.length===50;state.historyComplete=!state.hasOlder;return true;
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
  const autoSafe=()=>{const menu=root.querySelector('.native-game-menu'),section=menuUiState.get(snapshot.id+':'+snapshot.active_branch_id)?.section;return state.world===snapshot&&!state.pending&&state.screen==='world'&&state.tab==='menu'&&canAutoSyncMenu(change,{section,dirty:menu?.dataset.syncDirty==='true',blocked:!menu||!!root.querySelector('dialog[open],.menu-action-panel[open]')||!!document.querySelector('dialog[open]')||document.activeElement?.matches('input,textarea,select,[contenteditable=true]')});};
  if(autoSafe()&&await reloadWorld(snapshot.id,{accept:autoSafe})){renderWorld();toast('Игровое меню обновлено из сохранённой сцены.');return;}
  if(state.world!==snapshot||state.screen!=='world'||document.querySelector('#cloud-change-banner'))return;
  const buttonReload=button('Загрузить изменения',()=>busy(()=>refreshFromCloud(snapshot.id)),'btn secondary');
  const banner=panel(title('Есть изменения в облаке'),para(menuError(change.message)),
   para('Текст и место чтения сохранены. Новые данные загрузятся только по твоему нажатию.'),
   row(buttonReload));
  banner.id='cloud-change-banner';
  banner.setAttribute('role','status');
  root.prepend(banner);
 }catch(e){console.warn('Cloud change check skipped',e);}
 finally{syncChecking=false;}
}

let renderedWorldKey=null,renderedTab=null;
function worldSectionContent(tabs){
 const old=tabs.nextSibling;let n=old;while(n){const next=n.nextSibling;n.remove();n=next;}
 if(archiveUrl){URL.revokeObjectURL(archiveUrl);archiveUrl=null;}
 const tab=state.tab;renderedTab=tab;
 if(tab==='story')renderStory();if(tab==='menu')renderGameMenu();if(tab==='search')renderSearch();if(tab==='people')renderPeople();if(tab==='directives')renderDirectives();if(tab==='branches')renderBranches();if(tab==='agenda')renderAgenda();if(tab==='life')renderLivingWorld();if(tab==='social')renderSocialWorld();if(tab==='growth')renderGrowth();if(tab==='economy')renderEconomy();if(tab==='archive')renderArchive();if(tab==='director')renderDirector();
 const content=node('div','world-section-content');
 while(tabs.nextSibling)content.append(tabs.nextSibling);
 root.append(content);
}
function renderWorld(){if(!state.world)return openWorlds();const w=state.world;state.screen='world';
 const key=w.id+':'+w.active_branch_id,existing=root.querySelector('.world-tabs');
 if(existing&&renderedWorldKey===key){
  const y=window.scrollY,anchor=root.querySelector('.world-tabs-anchor');
  const top=anchor.getBoundingClientRect().top+y;
  // Re-render header when the world changes, without replacing navigation.
  const heading=root.querySelector('.world-heading');if(heading){heading.textContent=w.title;}
  for(const tab of existing.children){const selected=tab.dataset.section===state.tab;tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',String(selected));}
  const changed=renderedTab!==state.tab;worldSectionContent(existing);
  window.scrollTo({top:changed?sectionScrollTarget(y,top):y,behavior:'instant'});return;
 }
 clear();renderedWorldKey=key;
 add(root,row(button('← Все миры',()=>busy(openWorlds),'back'),button('↻ Синхронизировать',()=>busy(()=>refreshFromCloud(w.id)),'btn secondary')),node('div','eyebrow',w.start_marker||'Начало не установлено'),node('h1','hero-title world-heading',w.title),para(w.seed,'subtitle'),node('div','world-tabs-anchor'));
 const tabs=node('div','tabs world-tabs');tabs.setAttribute('role','tablist');
 for(const [id,name] of WORLD_TABS){const tab=button(name,()=>{if(state.tab===id)return;if(state.tab==='story'&&!confirmLeaveDraft())return;state.tab=id;renderWorld();},'tab'+(state.tab===id?' active':''));tab.dataset.section=id;tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(state.tab===id));tabs.append(tab);}
 root.append(tabs);worldSectionContent(tabs);
}

function visualLibrary(w,overview,section='illustrations',focus=null){
 const out=node('div','menu-data'),list=node('div','menu-data'),controls=node('div','menu-data');
 const subjects=visualSubjects(overview,w.head_scene_id),primary=section==='illustrations'||section==='portraits';
 let assets=[],prefs,offset=0,refreshing=false,lastFingerprint=null,watch=null;
 const syncStatus=node('p','small','Проверяю галерею…');
 const chooser=(choices)=>{const s=node('select','field');for(const [v,label] of Object.entries(choices)){const o=node('option','',label);o.value=v;s.append(o);}return s;};
 const showAsset=(a,opened=false)=>{
  const card=node('details','rule');card.dataset.visualId=a.id;card.append(node('summary','',a.title+' · '+(VISUAL_KINDS[a.kind]||menuValue(a.kind,'kind'))+' · '+(a.status==='ready'?'Готово':'Ожидает файл')));
  const body=node('div','menu-data');card.append(body);
  body.append(para('Объект: '+(subjects.find(s=>s.subject_id===a.subject_id)?.title||a.title)),para(a.identity_notes||''));
  if(a.status==='ready'){
   const img=node('img');img.alt=a.title;img.loading='lazy';img.style.maxWidth='100%';img.style.borderRadius='12px';img.style.height='auto';
   let loaded=false;const open=()=>{if(loaded)return;loaded=true;loadVisualBlob(a).then(blob=>{if(!card.isConnected)return;const url=URL.createObjectURL(blob);img.onload=img.onerror=()=>URL.revokeObjectURL(url);img.src=url;}).catch(e=>{loaded=false;body.append(para(menuError(e)));});};
   card.addEventListener('toggle',()=>{if(card.open)open();});body.append(img);
  }else{
   const file=node('input','field');file.type='file';file.accept='image/png,image/jpeg,image/webp';
   const paste=node('div','rule','Можно также вставить скопированное изображение сюда (Ctrl+V).');paste.tabIndex=0;paste.addEventListener('paste',event=>{const image=[...(event.clipboardData?.files||[])].find(x=>x.type.startsWith('image/'));if(!image)return;event.preventDefault();void busy(async()=>{await uploadVisual(a,image);toast('Иллюстрация сохранена.');await refresh();});});
   body.append(para('Изображение можно сохранить непосредственно из ChatGPT командой «Сохрани эту картинку в мир». Если клиент не передал файл, выбери его здесь.'),paste,file,row(button('Загрузить и сохранить',()=>busy(async()=>{await uploadVisual(a,file.files?.[0]);toast('Иллюстрация сохранена.');await refresh();})),button('Проверить уже загруженный файл',()=>busy(async()=>{await finishVisual(a.id);await refresh();}),'btn secondary')));
  }
  body.append(row(button('Скопировать промпт для генерации',()=>busy(()=>copy(a.prompt)),'btn secondary'),button('Скопировать ссылку на изображение',()=>busy(()=>copy(location.origin+'/'+visualUploadHash(w.id,a.id))),'btn secondary')));
  if(a.scene_id)body.append(sceneLink(w.id,a.scene_id,'Сцена-источник'));
  if(primary)body.append(button('Архивировать изображение',()=>busy(async()=>{if(!confirm('Убрать это изображение из галереи?'))return;await archiveVisual(a);await refresh();}),'btn secondary'));
  if(a.id===focus||opened)card.open=true;
  return card;
 };
 const draw=()=>{
  const expanded=new Set([...list.querySelectorAll('details[open][data-visual-id]')].map(c=>c.dataset.visualId));
  list.replaceChildren();
  const matches=visibleVisuals(assets,subjects,section);
  if(!matches.length)list.append(para('Сохранённых иллюстраций на этой странице пока нет.'));
  for(const a of matches)list.append(showAsset(a,expanded.has(a.id)));
  if(primary)list.append(row(...(offset>0?[button('← Назад',()=>busy(async()=>{offset=Math.max(0,offset-40);await refresh();}),'btn secondary')]:[]),...(assets.length===40?[button('Далее →',()=>busy(async()=>{offset+=40;await refresh();}),'btn secondary')]:[])));
 };
 const refresh=async({force=true}={})=>{
  if(refreshing)return;refreshing=true;
  try{
   let next=await listVisualAssets(w.id,offset,40);
   if(focus&&!next.some(a=>a.id===focus)&&offset===0){for(let o=40;o<400;o+=40){const more=await listVisualAssets(w.id,o,40);if(more.some(a=>a.id===focus)){next=more;offset=o;break;}if(more.length<40)break;}}
   if(!out.isConnected)return;
   const fingerprint=JSON.stringify([offset,next.map(a=>[a.id,a.status,a.byte_size,a.mime_type,a.title])]);
   assets=next;if(force||fingerprint!==lastFingerprint){lastFingerprint=fingerprint;draw();}
   syncStatus.textContent=assets.some(a=>a.status==='pending')?'Есть заявки, ожидающие файл из ChatGPT. Галерея обновляется автоматически.':'Галерея синхронизирована.';
  }finally{refreshing=false;}
 };
 const check=()=>{if(!out.isConnected){clearInterval(watch);document.removeEventListener('visibilitychange',check);window.removeEventListener('focus',check);return;}if(document.visibilityState==='visible'&&state.world?.id===w.id&&state.world.active_branch_id===w.active_branch_id)void refresh({force:false}).catch(()=>{syncStatus.textContent='Не удалось обновить галерею. Можно повторить.';});};
 queueMicrotask(()=>{if(!out.isConnected)return;watch=setInterval(check,15000);document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);});
 const form=()=>{
  controls.replaceChildren();
  const freq=chooser(VISUAL_FREQUENCIES);freq.value=prefs.frequency;const style=field('Общий стиль мира, например кинематографический реализм');style.value=prefs.style;style.maxLength=1000;
  if(primary)controls.append(title('Настройки иллюстраций'),freq,style,button('Сохранить настройки',()=>busy(async()=>{prefs=await saveVisualPreferences(w.id,{frequency:freq.value,style:style.value});toast('Настройки иллюстраций сохранены.');}),'btn secondary'));
  const subject=chooser(Object.fromEntries(subjects.map((s,i)=>[String(i),VISUAL_SUBJECTS[s.subject_kind]+': '+s.title])));
  const kind=chooser(VISUAL_KINDS),description=field('Что именно показать?'),identity=field('Постоянные особенности внешности, формы или оформления');
  description.maxLength=3500;identity.maxLength=4000;const references=node('div','menu-data');
  const selected=()=>subjects[Number(subject.value)];
  const choose=()=>{const s=selected();if(!s)return;const rs=visualReferences(assets,s);identity.value=rs[0]?.identity_notes||s.detail||'';references.replaceChildren(para(rs.length?'Сохранённые референсы: '+rs.map(x=>x.title).join(', '):'Для объекта ещё нет готовых референсов.'));kind.value=({character:'portrait',scene:'scene',place:'location',item:'artifact',document:'cover',chapter:'illustration',photo:'photo',creature:'creature',ritual:'diagram',outfit:'outfit'}[s.subject_kind]||'illustration');};
  subject.addEventListener('change',choose);choose();
  if(!subjects.length){controls.append(para('Нет подтверждённых объектов для иллюстрации.'));return;}
  controls.append(title('Новая иллюстрация'),subject,kind,description,identity,references,button('Создать заявку и скопировать запрос в ChatGPT',()=>busy(async()=>{
   const s=selected();if(!s||!description.value.trim())throw Error('Выбери объект и опиши изображение.');
   const refs=visualReferences(assets,s),prompt=visualPrompt({...s,detail:identity.value},description.value,refs,prefs);
   const a=await prepareVisual(w,{...s,kind:kind.value,prompt,title:s.title,identity_notes:identity.value,reference_asset_ids:refs.map(x=>x.id)});
   const link=location.origin+'/'+visualUploadHash(w.id,a.id);
   await copy('Создай изображение по следующему запросу. Заявка уже сохранена, не создавай новую. '+prompt+'\nПосле генерации вызови save_chatgpt_illustration с настоящим файлом ChatGPT Library, world_id='+w.id+', asset_id='+a.id+'. Если клиент не передал файл, прикрепи его к заявке: '+link);
   focus=a.id;offset=0;await refresh();
  })));
 };
 out.append(para('Иллюстрации не меняют канон и не расходуют игровое время. Файлы хранятся в приватной галерее.'),row(syncStatus,button('Обновить галерею',()=>busy(()=>refresh()),'btn secondary')),list);
 if(primary){out.append(controls);getVisualPreferences(w.id).then(v=>{prefs=v;form();}).catch(e=>controls.append(para(menuError(e))));}
 queueMicrotask(()=>{if(out.isConnected)refresh().then(()=>{if(primary&&prefs)form();}).catch(e=>list.append(para('Галерея недоступна: '+menuError(e))));});
 return out;
}
function readableMaterials(section,overview,index,w,actor){
 const out=node('div','menu-data'),d=overview.documents;
 const intent=(action,detail,ids={})=>busy(async()=>{
  const input={action,detail,...ids};menuActionIntent(input,overview);
  await copy('Мир '+w.title+' ('+w.id+'), герой '+actor+'. Прочитай текущее меню, проверь validate_game_menu_action: '+JSON.stringify(input)+'. Сыграй действие только после моего явного выбора; не считай его выполненным.');
 });
 const body=text=>{const el=node('div','document-body',text);el.style.whiteSpace='pre-wrap';el.style.lineHeight='1.75';el.style.overflowWrap='anywhere';return el;};
 if(section==='letters'){
  const l=overview.life.letters;
  for(const [heading,rows] of [['Входящие',l.incoming],['Отправленные',l.outgoing]]){
   out.append(title(heading));if(!rows.records.length)out.append(para('Пока нет писем.'));
   for(const r of rows.records){
    const card=node('details','rule');card.append(node('summary','', (r.status==='delivered'?'● ':'')+(r.from||r.to||'')+' · '+(r.subject||'Непрочитанное письмо')));
    card.append(para(r.source?.world_time||menuValue(r.status,'status')));
    if(r.message!=null)card.append(body(r.message));
    else card.append(para('Первое чтение происходит в истории.'),button('Прочитать в истории',()=>intent('read_letter','Прочитать письмо от '+r.from,{letter_id:r.id}),'btn secondary'));
    if(r.from&&r.status==='read'){
     const reply=field('Полный текст ответа');reply.rows=6;card.append(reply,button('Передать ответ в ChatGPT',()=>intent('reply_letter','Ответить на письмо от '+r.from,{letter_id:r.id,letter_recipient:r.from,letter_subject:('Re: '+r.subject).slice(0,200),letter_body:reply.value}),'btn secondary'));
    }
    if(r.source?.scene_id)card.append(sceneLink(w.id,r.source.scene_id,'Источник'));
    out.append(card);
   }
  }
  const recipient=field('Получатель'),subject=field('Тема письма'),message=field('Полный текст письма');recipient.rows=1;subject.rows=1;message.rows=7;
  out.append(title('Написать письмо'),recipient,subject,message,button('Передать письмо в ChatGPT',()=>intent('send_letter','Отправить письмо',{letter_recipient:recipient.value,letter_subject:subject.value,letter_body:message.value}),'btn secondary'));
  return out;
 }
 if(!d?.memory_complete){out.append(para('Для чтения нужна полная подтверждённая история.'));return out;}
 const rows=section==='library'?d.library:section==='news'?d.newspapers:section==='documents'?d.documents:section==='archives'?d.archives:section==='publishing'?d.authored:d[section];
 if(!rows){out.append(para('Нет доступных материалов.'));return out;}
 const q=node('input','field');q.type='search';q.placeholder='Поиск по названию, автору или оглавлению';
 const shelf=node('div','menu-data');out.append(q,shelf);
 const draw=()=>{shelf.replaceChildren();const search=q.value.trim().toLocaleLowerCase('ru');
  const list=rows.records.filter(r=>[r.title,r.author,r.summary,...r.contents.map(c=>c.title)].some(x=>String(x||'').toLocaleLowerCase('ru').includes(search)));
  if(!list.length)shelf.append(para('Нет доступных материалов на этой странице.'));
  for(const r of list){
   const card=node('details','rule'),heading=node('summary','',r.title+' · '+r.author+' · изд. '+r.number);
   card.append(heading,para(r.category+' · '+r.read_chapters+' / '+r.total_chapters+' глав прочитано'),para(r.summary));
   const meter=node('progress');meter.max=r.total_chapters;meter.value=r.read_chapters;card.append(meter);
   const reader=node('div','menu-data');
   const chapters=node('select','field');
   for(const ch of r.contents){const o=node('option','',(ch.bookmark?'★ ':'')+(ch.read?'✓ ':'')+ch.title);o.value=ch.id;chapters.append(o);}
   const show=()=>{reader.replaceChildren();const ch=r.contents.find(x=>x.id===chapters.value);if(!ch)return;
    let data;try{data=index.read(actor,r.id,ch.id);}catch(e){reader.append(para(String(menuError(e)||e)));return;}
    reader.append(node('h3','',data.title));
    if(data.body!=null)reader.append(body(data.body));
    else reader.append(para(data.text_available?'Текст сохранён, но герой ещё не прочитал главу.':'Полный текст ещё не записан в мире. Он появится при реально сыгранном чтении.'));
    if(data.summary)reader.append(para('Конспект: '+data.summary));if(data.reaction)reader.append(para('Реакция: '+data.reaction));
    if(data.notes.length)reader.append(title('Личные заметки'),...data.notes.map(n=>body(n.body)));
    if(data.links.length)reader.append(title('Связанные сведения'),...data.links.map(n=>para(n.label+' · '+n.target_kind)));
    const ids={edition_id:r.id,chapter_id:ch.id};
    if(data.access==='available')reader.append(row(button(ch.read?'Изучить повторно':'Прочитать в истории',()=>intent(ch.read?'study_document':'read_document',(ch.read?'Изучить ':'Прочитать ')+'«'+data.title+'» из «'+r.title+'»',ids),'btn secondary'),button(ch.bookmark?'Убрать закладку':'Закладка',()=>intent(ch.bookmark?'remove_document_bookmark':'bookmark_document',(ch.bookmark?'Убрать':'Поставить')+' закладку «'+ch.title+'»',ids),'btn secondary')));
    if(data.access==='available'&&data.can_read&&data.body!=null){const note=field('Личная заметка к главе');note.rows=2;reader.append(note,button('Передать заметку в ChatGPT',()=>intent('write_document_note',note.value,ids),'btn secondary'));}
    if(data.source?.scene_id)reader.append(sceneLink(w.id,data.source.scene_id,'Источник текста'));
   };
   chapters.addEventListener('change',show);
   card.addEventListener('toggle',()=>{if(card.open)show();});
   const previous=()=>{if(chapters.selectedIndex>0){chapters.selectedIndex--;show();}},next=()=>{if(chapters.selectedIndex<chapters.options.length-1){chapters.selectedIndex++;show();}};
   card.append(chapters,row(button('← Предыдущая глава',previous,'btn secondary'),button('Следующая глава →',next,'btn secondary')),reader);
   if(section==='publishing'&&r.own){card.append(row(button('Продолжить рукопись',()=>intent('continue_document','Продолжить «'+r.title+'»',{edition_id:r.id}),'btn secondary'),...(r.status==='draft'?[button('Предложить публикацию',()=>intent('publish_document','Опубликовать «'+r.title+'»',{edition_id:r.id}),'btn secondary')]:[])));}
   shelf.append(card);
  }
 };q.addEventListener('input',draw);draw();
 if(section==='publishing')out.append(title('Рецензии'),renderMenuData(d.reviews),title('Авторские выплаты'),renderMenuData(d.royalties));
 return out;
}
function renderFloorplans(w,overview){
 const out=node('div','menu-data'),homes=overview.market_home?.floorplans?.records||[],rooms=overview.market_home?.rooms?.records||[];
 out.append(title('Планировка и комнаты'));
 if(!homes.length){out.append(para('Подтверждённых комнат пока нет. Сначала осмотри жильё в истории.'));return out;}
 const homeSelect=node('select','field'),floorSelect=node('select','field'),roomSelect=node('select','field'),action=node('select','field'),other=node('select','field'),detail=field('Что герой хочет изменить или уточнить?'),diagram=node('div','floorplan-view'),roomDetails=node('div','rule');
 for(const [i,h] of homes.entries()){const o=node('option','',h.title);o.value=String(i);homeSelect.append(o);}
 for(const [value,label] of Object.entries(ROOM_ACTIONS)){const o=node('option','',label);o.value=value;action.append(o);}
 const svg=(tag,attrs={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
 const selectedHome=()=>homes[Number(homeSelect.value)]||homes[0];
 const chosenRoom=()=>rooms.find(r=>r.id===roomSelect.value);
 function drawRoom(){
  const r=chosenRoom();roomDetails.replaceChildren();other.replaceChildren();
  if(!r)return;
  roomDetails.append(node('strong','',r.label),para('Назначение: '+r.purpose),para(r.description||''));
  if(r.walls||r.flooring||r.lighting)roomDetails.append(para([r.walls&&'Стены: '+r.walls,r.flooring&&'Пол: '+r.flooring,r.lighting&&'Свет: '+r.lighting].filter(Boolean).join(' · ')));
  if(r.furnishings?.total)roomDetails.append(para('Предметы: '+r.furnishings.records.map(x=>x.name||x.item_id).join(', ')));
  for(const b of rooms.filter(x=>x.id!==r.id&&x.home_id===r.home_id&&x.home_kind===r.home_kind)){const o=node('option','',b.label);o.value=b.id;other.append(o);}
  other.hidden=action.value!=='room_connect';
 }
 function drawPlan(){
  const h=selectedHome(),f=h.floors.records.find(x=>String(x.floor)===floorSelect.value);diagram.replaceChildren();
  diagram.append(para(h.measured_rooms+' из '+h.room_count+' комнат с подтверждёнными размерами.'));
  if(f?.rooms.records.length){
   const rs=f.rooms.records,minX=Math.min(...rs.map(x=>x.geometry.x_cm)),minY=Math.min(...rs.map(x=>x.geometry.y_cm)),maxX=Math.max(...rs.map(x=>x.geometry.x_cm+x.geometry.width_cm)),maxY=Math.max(...rs.map(x=>x.geometry.y_cm+x.geometry.height_cm)),pad=Math.max(20,(maxX-minX+maxY-minY)*0.025);
   const map=svg('svg',{viewBox:[minX-pad,minY-pad,maxX-minX+2*pad,maxY-minY+2*pad].join(' '),role:'img','aria-label':'Подтверждённая планировка, этаж '+f.floor,class:'floorplan-svg'});
   const centers=new Map(),labels=[];
   for(const r of rs){
    const g=r.geometry,cx=g.x_cm+g.width_cm/2,cy=g.y_cm+g.height_cm/2;centers.set(r.id,[cx,cy]);
    const rect=svg('rect',{x:g.x_cm,y:g.y_cm,width:g.width_cm,height:g.height_cm,class:'floorplan-room'+(r.id===roomSelect.value?' selected':''),'vector-effect':'non-scaling-stroke',tabindex:0,role:'button','aria-label':r.label+' '+g.width_cm/100+' × '+g.height_cm/100+' м'});
    const tip=svg('title');tip.textContent=r.label+' · '+g.width_cm/100+' × '+g.height_cm/100+' м';rect.append(tip);
    const pick=()=>{if([...roomSelect.options].some(o=>o.value===r.id)){roomSelect.value=r.id;drawRoom();for(const x of map.querySelectorAll('rect'))x.classList.remove('selected');rect.classList.add('selected');}};
    rect.addEventListener('click',pick);rect.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();}});map.append(rect);
    const size=Math.min(40,Math.max(4,Math.min(g.width_cm/Math.max(4,r.label.length*.65),g.height_cm/4)));
    const label=svg('text',{x:cx,y:cy,'text-anchor':'middle','dominant-baseline':'central','font-size':size,class:'floorplan-label'});label.textContent=r.label;labels.push(label);
   }
   for(const l of h.connections.records){
    const a=centers.get(l.room_id),b=centers.get(l.other_room_id);if(!a||!b)continue;
    map.append(svg('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],class:'floorplan-link'+(l.status==='closed'?' closed':''),'vector-effect':'non-scaling-stroke'}));
   }
   map.append(...labels);diagram.append(map,para('Линии показывают подтверждённые связи, не точное положение дверей. Масштаб — записанные сантиметры.'));
   if(f.rooms.omitted)diagram.append(para('Ещё комнат на этаже: '+f.rooms.omitted));
  }else diagram.append(para('Размеры и расположение не установлены. Схема не выдумывается.'));
  if(h.unknown_rooms.total)diagram.append(para('Без измерений: '+h.unknown_rooms.records.map(r=>r.label).join(', ')+(h.unknown_rooms.omitted?' и ещё '+h.unknown_rooms.omitted:'')));
  if(h.connections.total)diagram.append(para('Связи: '+h.connections.records.map(l=>l.from+' ↔ '+l.to+' ('+({doorway:'дверь',passage:'проход',stairs:'лестница'}[l.kind]||l.kind)+', '+(l.status==='closed'?'закрыто':'открыто')+')').join('; ')));
 }
 function drawHome(){
  const h=selectedHome();floorSelect.replaceChildren();roomSelect.replaceChildren();
  for(const f of h.floors.records){const o=node('option','',f.floor===0?'Уровень 0':'Этаж '+f.floor);o.value=String(f.floor);floorSelect.append(o);}
  floorSelect.hidden=!h.floors.records.length;
  for(const r of rooms.filter(x=>x.home_id===h.home_id&&x.home_kind===h.home_kind)){const o=node('option','',r.label);o.value=r.id;roomSelect.append(o);}
  drawRoom();drawPlan();
 }
 homeSelect.addEventListener('change',drawHome);floorSelect.addEventListener('change',drawPlan);roomSelect.addEventListener('change',()=>{drawRoom();drawPlan();});action.addEventListener('change',drawRoom);
 out.append(homeSelect,floorSelect,diagram,roomSelect,roomDetails,action,other,detail,button('Передать намерение в ChatGPT',()=>busy(async()=>{
  const input={action:action.value,room_id:roomSelect.value,detail:detail.value.trim()||ROOM_ACTIONS[action.value],...(action.value==='room_connect'?{other_room_id:other.value}:{})};
  menuActionIntent(input,overview);await copy('Мир '+w.title+' ('+w.id+'), герой '+overview.actor+'. Проверь текущий head и validate_game_menu_action: '+JSON.stringify(input)+'. Сыграй намерение, не считай результат уже выполненным.');
 }),'btn secondary'));drawHome();return out;
}
// Sources are a local overlay, not a hash navigation or page reload.
async function openMenuSource(worldId,sceneId){
 const w=state.world;if(!w||w.id!==worldId)return;
 const key=menuSnapshotKey(w),dialog=node('dialog','menu-source-dialog'),body=node('div','menu-source-body'),heading=title('Источник');
 const close=button('Закрыть',()=>dialog.close(),'btn secondary');
 dialog.append(add(node('div','menu-source-header'),heading,close),body);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 document.body.append(dialog);dialog.showModal();body.append(para('Загружаю сохранённую сцену…'));
 try{
  const known=state.scenes.find(s=>s.id===sceneId&&typeof s.body==='string');
  const source=known||await getScene(worldId,sceneId);
  if(!dialog.open)return;
  if(state.screen!=='world'||state.tab!=='menu'||menuSnapshotKey(state.world)!==key){dialog.close();return;}
  heading.textContent=source.world_time||'Сохранённая сцена';
  body.replaceChildren(node('div','scene-body',source.body));
 }catch(e){if(dialog.open)body.replaceChildren(para('Не удалось прочитать источник: '+menuError(e)));}
}
function menuJournal(w,scenes){
 const out=node('div','menu-journal'),list=node('div'),search=node('input','field');box.addEventListener('input',e=>{if(e.target!==search&&e.target!==actor)box.dataset.syncDirty='true';});box.addEventListener('change',e=>{if(e.target!==search&&e.target!==actor)box.dataset.syncDirty='true';});
 search.type='search';search.placeholder='Дата или номер сцены';
 let offset=0;const draw=()=>{
  list.replaceChildren();const q=search.value.trim().toLocaleLowerCase('ru'),rows=scenes.map((s,i)=>({s,n:i+1})).reverse().filter(({s,n})=>!q||[s.world_time,'Сцена '+n].some(x=>String(x||'').toLocaleLowerCase('ru').includes(q)));
  for(const {s,n} of rows.slice(0,offset+20)){
   const b=button('',()=>openMenuSource(w.id,s.id),'menu-record-button');b.append(add(node('span',''),node('strong','','Сцена '+n),para(s.world_time||'Дата не установлена')),node('span','menu-chevron','›'));list.append(b);
  }
  if(!rows.length)list.append(para('Нет подходящих сцен.'));
  if(rows.length>offset+20)list.append(button('Показать ещё',()=>{offset+=20;draw();},'btn secondary'));
 };
 search.addEventListener('input',()=>{offset=0;draw();});out.append(search,list);draw();return out;
}
function menuMemories(w,overview,projection){
 const out=node('div','menu-memories'),search=node('input','field'),list=node('div'),status=node('p','small');
 search.type='search';search.placeholder='Найти воспоминание или тему';
 let rows=[],offset=0,more=true,loading=false,failed=false;
 const known=(projection.knowledge||[]).filter(r=>r.actor===overview.actor);
 const draw=()=>{
  list.replaceChildren();const q=search.value.trim().toLocaleLowerCase('ru'),matches=v=>!q||String(v??'').toLocaleLowerCase('ru').includes(q);
  const notes=rows.filter(r=>matches([r.note?.summary,r.note?.quote,r.note_key].join(' ')));
  for(const r of notes){
   const card=node('details','menu-record');card.append(node('summary','',r.note.summary),para('Историческая заметка · '+menuValue(r.note.kind,'kind')),node('blockquote','memory-quote',r.note.quote),sceneLink(w.id,r.scene_id,'Прочитать сцену'));list.append(card);
  }
  const facts=known.filter(r=>matches(r.fact||r.description));if(facts.length){list.append(node('h3','menu-label','Подтверждённые знания героя'));for(const f of facts)list.append(renderMenuData([f]));}
  status.textContent=failed?'Не удалось загрузить воспоминания. Можно повторить.':loading?'Загружаю воспоминания…':rows.length+' заметок загружено'+(more?' · есть дополнительные':'')+'.';
  if(!notes.length&&!facts.length&&!loading)list.append(para(more?'На загруженных страницах совпадений нет.':'Совпадений нет.'));
  if(more||failed){const load=button(failed?'Повторить загрузку':'Загрузить ещё',()=>void fetchPage(),'btn secondary');load.disabled=loading;list.append(load);}
 };
 async function fetchPage(){
  if(loading||(!more&&!failed))return;loading=true;failed=false;draw();
  try{const page=await readMemoryNotes(w,{actor:overview.actor,offset});if(!Array.isArray(page))throw Error('Неверный ответ памяти');if(!out.isConnected)return;rows.push(...page);offset+=page.length;more=page.length===20;}
  catch{failed=true;}finally{loading=false;if(out.isConnected)draw();}
 }
 search.addEventListener('input',draw);out.append(para('Исторические заметки помогают вспомнить прошлые события, но сами по себе не являются знанием героя.'),search,status,list);draw();queueMicrotask(()=>{if(out.isConnected)void fetchPage();});return out;
}
function renderMenuData(value,depth=0,w=state.world){
 const out=node('div','menu-data');if(depth>5)return out;
 if(value==null){out.append(para('Не установлено'));return out;}
 if(Array.isArray(value)){if(!value.length)out.append(para('Пока нет записей.'));for(const r of value.slice(0,40)){
  if(r&&typeof r==='object'){
   const card=node('div','menu-record'),label=r.label||r.title||r.name||r.actor||r.field||r.kind||'Запись';
   if(label)card.append(node('strong','',menuValue(label,r.label!=null?'label':r.title!=null?'title':r.name!=null?'name':r.actor!=null?'actor':r.field!=null?'field':r.kind!=null?'kind':'title')));
   for(const [k,v] of Object.entries(r)){
    if(isMenuMetadata(k)||['title','name','label'].includes(k)||v==null||v==='')continue;
    if(typeof v==='object')card.append(node('h4','menu-label',menuLabel(k)),renderMenuData(v,depth+1,w));
    else card.append(para(menuLabel(k)+': '+menuValue(v,k)));
   }
   if(r.source?.scene_id&&w)card.append(sceneLink(w.id,r.source.scene_id,'Источник'));
   out.append(card);
  }else out.append(para(menuValue(r)));
 }return out;}
 if(typeof value!=='object'){out.append(para(menuValue(value)));return out;}
 if(Array.isArray(value.records)){
  out.append(renderMenuData(value.records,depth+1,w));if(value.omitted>0)out.append(para('Дополнительных записей: '+value.omitted));return out;
 }
 for(const [k,v] of Object.entries(value)){
  if(isMenuMetadata(k)||v==null)continue;
  if(typeof v==='object'){
   const empty=Array.isArray(v)?v.length===0:Array.isArray(v.records)?v.records.length===0:false;
   const group=node('details','menu-data-group');group.append(node('summary','',menuLabel(k)+(Array.isArray(v.records)?' · '+(v.total??v.records.length):Array.isArray(v)?' · '+v.length:'')),renderMenuData(v,depth+1,w));group.open=!empty&&depth===0;out.append(group);
  }else out.append(add(node('div','menu-data-line'),node('span','',menuLabel(k)),node('strong','',menuValue(v,k))));
 }
 if(value.source?.scene_id&&w)out.append(sceneLink(w.id,value.source.scene_id,'Источник'));
 return out;
}
function renderLongProfile(current,w){
 const out=panel(title('Долгосрочная жизнь · режиссёрский просмотр'),para('Могут быть сведения, неизвестные игровому герою. Только записи истории.'));
 if(current.long_life?.memory_complete===false){out.append(para('Загрузи всю ветку для долгосрочного профиля.'));return out;}
 for(const [key,label] of [['interests','Интересы'],['goals','Цели и проекты'],['threads','Сюжетные линии'],['circles','Социальные круги'],['experience','Жизненный опыт'],['causes','Причинные связи']]){
  out.append(node('h3','',label),renderMenuData(current.long_life?.[key],0,w));
 }
 out.append(node('h3','','Изменения личности'),renderMenuData(current.personality_history,0,w));if(current.magic_system?.memory_complete)out.append(title('Магия и целительство'),renderMenuData(current.magic_system.magic),renderMenuData(current.magic_system.medicine),renderMenuData(current.magic_system.society));if(current.advanced?.memory_complete)out.append(title('Мотивы и интересы'),renderMenuData(current.advanced.motives),title('Капитал'),renderMenuData(current.advanced.investments),title('Известные точки карты'),coordinateMap(current.advanced.map_points));if(current.world_depth?.memory_complete){out.append(title('Психология и убеждения'),renderMenuData(current.world_depth.psychology),title('Круг общения'),networkView(current.world_depth.social,current.actor),title('Хронология жизни'),timelineView(current.world_depth.timeline));}return out;
}
function hudView(overview){
 const box=node('div','hud-grid');
 for(const n of hudStates(overview.life.needs,uiPrefs.hudFields)){
  const card=node('div','hud-item'),bar=node('div','hud-bar');
  for(let i=0;i<4;i++){const cell=node('span');const level=['comfortable','noticeable','urgent','critical'].indexOf(n.observed);if(level>=0&&i<=level)cell.dataset.level=n.observed;bar.append(cell);}
  card.append(node('strong','',n.label),para(menuValue(n.observed)),bar);
  if(n.estimate&&n.estimate!==n.observed)card.append(para('Прогноз без удовлетворения: '+menuValue(n.estimate)));
  box.append(card);
 }return box;
}
function networkView(graph,actor){
 const out=node('div','network-view');if(!graph?.nodes?.length)return para('Нет записанных связей.');
 const focus=node('div','network-focus',actor),list=node('div','network-nodes'),detail=node('div','rule');
 out.append(focus,list,detail);
 const show=name=>detail.replaceChildren(node('strong','',name),renderMenuData(graph.edges.records.filter(e=>e.to===name||e.from===name)));
 for(const n of graph.nodes.filter(n=>!n.focus))list.append(button(n.name,()=>show(n.name),'btn secondary'));
 if(graph.nodes.length>1)show(graph.nodes.find(n=>!n.focus).name);else detail.append(para('Другие связи не установлены.'));
 if(graph.omitted_contacts)out.append(para('Дополнительных контактов: '+graph.omitted_contacts));
 return out;
}
function coordinateMap(data){
 const points=data?.records||[];if(!points.length)return para('Точные точки ещё не установлены в истории.');
 const root=node('div','coordinate-map'),select=node('select','field'),canvas=node('div'),detail=node('div','rule');
 const maps=[...new Set(points.map(p=>p.map_id))];
 for(const id of maps){const o=node('option','',id);o.value=id;select.append(o);}
 const draw=()=>{
  canvas.replaceChildren();detail.replaceChildren();
  const rows=points.filter(p=>p.map_id===select.value);
  const x0=Math.min(...rows.map(p=>p.x)),x1=Math.max(...rows.map(p=>p.x)),y0=Math.min(...rows.map(p=>p.y)),y1=Math.max(...rows.map(p=>p.y));
  const scale=Math.min(300/Math.max(1,x1-x0),180/Math.max(1,y1-y0));
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 340 220');svg.setAttribute('role','img');svg.setAttribute('aria-label','Установленные координаты карты');
  const ns='http://www.w3.org/2000/svg';
  for(const p of rows){
   const x=170+(p.x-(x0+x1)/2)*scale,y=110-(p.y-(y0+y1)/2)*scale;
   const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.setAttribute('r','6');dot.setAttribute('fill','currentColor');svg.append(dot);
   const label=document.createElementNS(ns,'text');label.setAttribute('x',x);label.setAttribute('y',Math.max(12,y-11));label.setAttribute('text-anchor','middle');label.setAttribute('fill','currentColor');label.setAttribute('font-size','10');label.textContent=p.title.slice(0,22);svg.append(label);
  }
  canvas.append(svg);
  const actions=node('div','place-grid');for(const p of rows)actions.append(button(p.title,()=>detail.replaceChildren(renderMenuData([p])),'btn secondary'));canvas.append(actions);detail.append(renderMenuData([rows[0]]));
 };select.addEventListener('change',draw);root.append(para('Точки показывают только записанную условную карту. Масштаб и расстояния не являются транспортным расчётом.'),select,canvas,detail);draw();return root;
}
function placesView(graph){
 const out=node('div','places-view');if(!graph?.places?.records?.length)return para('Известные места пока не записаны.');
 const places=graph.places.records,detail=node('div','rule'),links=new Map(graph.links.map(l=>[l.from,l.to]));
 const show=p=>detail.replaceChildren(node('strong','',p.name),renderMenuData(p),renderMenuData(graph.links.filter(l=>l.from===p.name||l.to===p.name)));
 const list=node('div','place-grid');
 for(const p of places)list.append(button((links.has(p.name)?links.get(p.name)+' → ':'')+p.name,()=>show(p),'btn secondary'));
 out.append(para('Схема известных мест, без вымышленных координат и расстояний.'),list,detail);show(places[0]);return out;
}
function timelineView(data){const out=node('div','life-timeline');for(const e of data?.records||[])out.append(add(node('article','timeline-entry'),node('strong','',e.source?.world_time||'Дата не установлена'),renderMenuData([e])));if(!data?.records?.length)out.append(para('Нет подтверждённых событий.'));if(data?.omitted)out.append(para('Ещё записей: '+data.omitted));return out;}
const menuUiState=new Map();
let menuMemoryCache=null;
let menuMemoryJob=null;
// Small local stroke icons: no network requests or icon font dependency.
function menuGlyph(name){
 const paths={
 'user-round':'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
 'backpack':'M6 8V6a6 6 0 0 1 12 0v2 M5 7h14v14H5z M8 14h8v4H8z',
 'users':'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-4 M16 3a4 4 0 0 1 0 8',
 'mail':'M3 5h18v14H3z M3 6l9 7 9-7',
 'list-checks':'M9 6h12 M9 12h12 M9 18h12 M3 5l1 1 2-2 M3 11l1 1 2-2 M3 17l1 1 2-2',
 'calendar-days':'M3 5h18v16H3z M7 3v4 M17 3v4 M3 10h18 M8 14h1 M12 14h1 M16 14h1 M8 18h1 M12 18h1',
 'wallet':'M3 6h18v14H3z M3 6l14-3v3 M15 11h6v5h-6z',
 'house':'M2 11l10-8 10 8 M5 10v11h14V10 M9 21v-7h6v7',
 'briefcase-business':'M3 7h18v14H3z M8 7V3h8v4 M3 12l9 3 9-3',
 'graduation-cap':'M2 9l10-5 10 5-10 5z M6 12v5q6 5 12 0v-5 M22 9v8',
 'book-open':'M12 5v16 M12 5Q6 1 2 4v15q5-3 10 2 5-5 10-2V4q-4-3-10 1',
 'history':'M3 12a9 9 0 1 0 3-7 M3 3v6h6 M12 7v6l4 2',
 'settings':'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M10 2h4l1 3 3 1 3 3-2 3 2 3-3 3-3 1-1 3h-4l-1-3-3-1-3-3 2-3-2-3 3-3 3-1z',
 'heart-pulse':'M3 12h5l2-4 4 8 2-4h5 M12 21S2 15 2 8c0-5 7-7 10-2 3-5 10-3 10 2 0 7-10 13-10 13',
 'shirt':'M8 3l4 3 4-3 6 4-3 5-3-2v11H8V10l-3 2-3-5z',
 'image':'M3 3h18v18H3z M7 8h.1 M3 17l6-6 4 4 3-3 5 5',
 'map':'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z M9 3v16 M15 5v16',
 'wand-sparkles':'M3 21l12-12 M11 5v4 M9 7h4 M19 2v6 M16 5h6 M21 13v4 M19 15h4',
 'file-text':'M5 2h9l5 5v15H5z M14 2v6h5 M8 12h8 M8 16h8',
 'target':'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M12 12h.1'
 };
 const aliases={'users-round':'users',contact:'user-round',network:'users',landmark:'house',hospital:'heart-pulse',store:'house',archive:'file-text','notebook-pen':'book-open',newspaper:'file-text',heart:'heart-pulse',brain:'user-round',sparkles:'wand-sparkles','circle-dashed':'target','flask-conical':'wand-sparkles',microscope:'wand-sparkles',leaf:'map','chart-no-axes-combined':'wallet'};
 const el=node('span','menu-glyph'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),p=document.createElementNS('http://www.w3.org/2000/svg','path');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');p.setAttribute('d',paths[name]||paths[aliases[name]]||paths['file-text']);svg.append(p);el.append(svg);return el;
}
function renderGameMenu(){
 const w=state.world,key=w.id+':'+w.active_branch_id;
 const saved=menuUiState.get(key)||{section:'dashboard',actor:'',offset:0,group:'quick'};menuUiState.set(key,saved);
 const box=node('section','native-game-menu'),header=node('div','menu-header'),nav=node('div','menu-directory'),groups=node('div','menu-group-tabs'),tiles=node('div','menu-tiles'),search=node('input','field menu-search'),output=node('div','menu-screen'),actor=node('select','field menu-actor'),status=node('div','menu-sync-status'),breadcrumb=node('div','menu-breadcrumb');
 search.type='search';search.placeholder='Найти раздел';search.setAttribute('aria-label','Найти раздел меню');actor.setAttribute('aria-label','Герой');
 nav.append(groups,search,tiles);
 const snap=menuSnapshotKey(w),cached=menuMemoryCache?.key===snap?menuMemoryCache:null;
 let scenes=cached?.scenes??state.scenes,complete=cached?.complete??state.historyComplete,projection=cached?.projection??replay(scenes),loadingMemory=false;
 const reviews=new Map(),reviewJobs=new Set();
 const alive=()=>box.isConnected&&state.screen==='world'&&state.tab==='menu'&&menuSnapshotKey(state.world)===snap;
 async function loadMemory(){
  if(loadingMemory)return;loadingMemory=true;status.replaceChildren(para('Загружаю полную память мира…'));
  try{
   if(menuMemoryJob?.key!==snap){const job={key:snap,promise:fullStructuredMemory(w)};menuMemoryJob=job;job.promise.finally(()=>{if(menuMemoryJob===job)menuMemoryJob=null;}).catch(()=>{});}
   const m=await menuMemoryJob.promise;
   if(!alive())return;
   scenes=m.scenes;complete=m.complete;projection=replay(scenes,[],{evidencePrevalidated:true});
   menuMemoryCache={key:snap,scenes,complete,projection};selectActor();show();
  }catch(e){if(alive())status.replaceChildren(para('Не удалось загрузить память: '+menuError(e)),button('Повторить',()=>void loadMemory(),'btn secondary'));}
  finally{loadingMemory=false;}
 }
 async function loadReviews(name){
  if(reviewJobs.has(name)||reviews.has(name))return;reviewJobs.add(name);
  const rows=[];let done=false,failed=false;
  try{for(let i=0;i<10;i++){const page=await readMemoryNotes(w,{actor:name,offset:i*20});if(!Array.isArray(page)||page.length>20)throw Error('Неверная страница памяти');rows.push(...page);if(page.length<20){done=true;break;}}}catch{failed=true;}
  finally{reviewJobs.delete(name);}
  if(!alive())return;
  reviews.set(name,{...reviewedMenuHistory(rows,scenes,name,{complete:done&&complete}),failed});
  if(saved.actor===name&&['goals','work','education','interests','health','calendar','inventory'].includes(saved.section))show();
 }
 const selectActor=()=>{
  const choice=(projection.worldFacts||[]).find(x=>x.dynamics_kind==='player_choice'&&x.status==='pending');
  const known=choice?[choice.actor]:recordedPlayerActors(projection);
  actor.replaceChildren();
  if(!known.length){const o=node('option','','Нет подтверждённого героя');o.value='';actor.append(o);saved.actor='';}
  else{for(const name of known){const o=node('option','',name);o.value=name;actor.append(o);}saved.actor=known.includes(saved.actor)?saved.actor:known[0];actor.value=saved.actor;}
  actor.disabled=known.length<2;
 };
 const savePreference=async(record)=>{
  const prefs=menuPreferences(state.directives,w.active_branch_id);if(!prefs.can_edit)throw Error('Конфликт настроек — проверь правила.');
  await rpc('nw_save_menu_preferences',{p_world_id:w.id,p_branch_id:w.active_branch_id,p_expected_head:w.head_scene_id,p_expected_version:w.directive_version,p_record:menuRecordFromInput(record,w.active_branch_id)});
  const [latest,rules]=await Promise.all([getWorld(w.id),listDirectives(w.id)]);
  if(state.world?.id!==w.id||state.world.active_branch_id!==w.active_branch_id)return;
  if(latest.active_branch_id!==w.active_branch_id)throw Error('Ветка изменилась. Синхронизируй мир.');
  Object.assign(state.world,{directive_version:latest.directive_version,auto_save:latest.auto_save,updated_at:latest.updated_at});state.directives=rules;
  toast('Настройки сохранены. Игровое время не изменилось.');if(alive())show();
 };
 function settingsView(prefs){
  const controls=node('div'),values={...prefs.settings};
  const options={pace:['Темп времени',{slow:'Медленный',normal:'Обычный',dynamic:'Динамичный',fast:'Быстрый'}],detail:['Подробность',{brief:'Кратко',normal:'Обычно',high:'Подробно',maximum:'Максимум'}],agency:['Самостоятельность NPC',{low:'Низкая',normal:'Обычная',high:'Высокая'}],events:['Плотность событий',{low:'Низкая',normal:'Обычная',high:'Высокая'}],choices:['Частота выбора',{frequent:'Часто',important:'Важные решения',free:'Свободный ввод'}],visibility:['Режим просмотра',{immersive:'Погружение',rpg:'RPG',director:'Режиссёр'}]};
  for(const [k,[label,items]] of Object.entries(options)){const sel=node('select','field');for(const [v,l] of Object.entries(items)){const o=node('option','',l);o.value=v;sel.append(o);}sel.value=values[k];sel.addEventListener('change',()=>values[k]=sel.value);const lab=node('label','input-label',label);lab.append(sel);controls.append(lab);}
  for(const [k,label] of [['hud','Показывать HUD'],['skip_routine','Сжимать рутину']]){const check=node('input');check.type='checkbox';check.checked=values[k];check.addEventListener('change',()=>values[k]=check.checked);controls.append(add(node('label','menu-check'),check,document.createTextNode(label)));}
  const save=button('Сохранить настройки',()=>busy(()=>savePreference({kind:'settings',settings:values})));save.disabled=!prefs.can_edit;
  const reset=button('Вернуть значения по умолчанию',()=>busy(()=>savePreference({kind:'settings',settings:{...DEFAULT_MENU_SETTINGS}})),'btn secondary');reset.disabled=!prefs.can_edit;
  controls.append(row(save,reset),title('Интерфейс на этом устройстве'));
  const uiOptions={theme:['Тема',{dark:'Тёмная',light:'Светлая',system:'Системная'}],density:['Размер элементов',{compact:'Компактный',normal:'Обычный',large:'Крупный'}],textScale:['Размер текста',{small:'Мелкий',normal:'Обычный',large:'Крупный'}]};
  for(const [k,[label,items]] of Object.entries(uiOptions)){const sel=node('select','field');for(const [v,l] of Object.entries(items)){const o=node('option','',l);o.value=v;sel.append(o);}sel.value=uiPrefs[k];sel.addEventListener('change',()=>updateUI({[k]:sel.value}));controls.append(add(node('label','input-label',label),sel));}
  controls.append(node('h3','','Показатели HUD'));for(const [k,label] of [['hunger','Голод'],['thirst','Жажда'],['energy','Энергия'],['hygiene','Гигиена'],['comfort','Комфорт'],['stress','Стресс']]){const ch=node('input');ch.type='checkbox';ch.checked=uiPrefs.hudFields.includes(k);ch.addEventListener('change',()=>updateUI({hudFields:ch.checked?[...uiPrefs.hudFields,k]:uiPrefs.hudFields.filter(x=>x!==k)}));controls.append(add(node('label','menu-check'),ch,document.createTextNode(label)));}for(const warning of prefs.warnings)controls.append(para(warning));return controls;
 }
 function taskTrackerView(tracker){
  const out=node('div','task-tracker');
  for(const [label,group] of [['Активные задания',tracker.active],['Архив заданий',tracker.finished]]){
   const section=node('details','menu-data-group');section.open=label==='Активные задания';section.append(node('summary','',label+' · '+group.total));
   if(!group.total)section.append(para('Пока нет подтверждённых заданий.'));
   for(const task of group.records){const card=node('article','menu-record task-card');card.append(node('strong','',task.title),node('span','task-status',menuValue(task.status,'status')));
    if(task.due_at)card.append(para('Срок: '+task.due_at+' · '+menuValue(task.timing,'status')));
    if(task.next_step)card.append(para('Следующий шаг: '+task.next_step));if(task.obstacle)card.append(para('Препятствие: '+task.obstacle));
    const h=task.progress;card.append(para('Зафиксировано изменений: '+h.confirmed_updates));
    if(h.history.records.length){const history=node('details','task-history');history.append(node('summary','','История выполнения'));for(const step of h.history.records){const line=node('div','rule');line.append(node('strong','',({start:'Задание принято',advance:'Продвижение',pause:'Пауза',resume:'Возобновлено',complete:'Выполнено',abandon:'Оставлено'})[step.action]||'Изменение'),para(step.description||'Описание не установлено'));if(step.source?.scene_id)line.append(sceneLink(w.id,step.source.scene_id,'Сцена'));history.append(line);}if(h.history.omitted)history.append(para('Более ранних записей: '+h.history.omitted));card.append(history);}
    if(!h.history_complete)card.append(para('История загружена не полностью.'));section.append(card);
   }if(group.omitted)section.append(para('Дополнительных заданий: '+group.omitted));out.append(section);
  }return out;
 }
 function priorityView(overview,prefs){
  const out=node('div'),selected=[...prefs.priorities],choices=node('div');
  const draw=()=>{choices.replaceChildren();for(const t of overview.tasks.records){
   const on=selected.includes(t.id),check=node('input');check.type='checkbox';check.checked=on;check.disabled=!on&&selected.length>=3;check.addEventListener('change',()=>{if(check.checked&&selected.length<3)selected.push(t.id);else if(!check.checked){const at=selected.indexOf(t.id);if(at>=0)selected.splice(at,1);}draw();});choices.append(add(node('label','menu-check'),check,document.createTextNode((on?selected.indexOf(t.id)+1+'. ':'')+t.title)));
  }for(const id of selected.filter(id=>!overview.tasks.records.some(x=>x.id===id)))choices.append(add(node('div','rule'),para('Ранее выбранное дело'),button('Убрать',()=>{selected.splice(selected.indexOf(id),1);draw();},'text-button')));};
  draw();out.append(node('h3','','Приоритеты (до трёх в порядке выбора)'),choices,row(button('Сохранить приоритеты',()=>busy(()=>savePreference({kind:'focus',priorities:selected}))),button('Очистить',()=>busy(()=>savePreference({kind:'focus',priorities:[]})),'btn secondary')));return out;
 }
 function personalActions(section,overview){
  const out=node('div'),sel=node('select','field'),record=node('select','field'),detail=field('Что именно хочет сделать герой?');detail.rows=3;
  const allowed=section.actions.filter(a=>Object.hasOwn(PERSONAL_ACTIONS,a));
  if(!allowed.length)return out;
  for(const a of allowed){const o=node('option','',PERSONAL_ACTIONS[a]);o.value=a;sel.append(o);}
  const draw=()=>{record.replaceChildren();const id=PERSONAL_ACTION_IDS[sel.value];record.hidden=!id;if(id){const page=id==='habit_id'?overview.personal_life.habits:id==='project_id'?overview.personal_life.projects:overview.personal_life.circles;for(const x of page.records){try{menuActionIntent({action:sel.value,detail:'Проверка',[id]:x.id},overview);}catch{continue;}const o=node('option','',x.title||x.id);o.value=x.id;record.append(o);}}};
  sel.addEventListener('change',draw);draw();
  out.append(node('h3','','Действие'),sel,record,detail,button('Скопировать действие в ChatGPT',()=>busy(async()=>{
   const id=PERSONAL_ACTION_IDS[sel.value],input={action:sel.value,detail:detail.value,...(id?{[id]:record.value}:{})};
   const intent=menuActionIntent(input,overview);
   await copy('В мире '+w.title+' ('+w.id+'), персонаж '+overview.actor+'. Проверь текущий head и validate_game_menu_action: '+JSON.stringify(input)+'. Моё намерение: '+intent.intent+'. Сыграй последствия, не считай действие уже выполненным.');
  })));return out;
 }
 function show(){
  delete box.dataset.syncDirty;
  output.replaceChildren();breadcrumb.replaceChildren();groups.replaceChildren();tiles.replaceChildren();
  const prefs=menuPreferences(state.directives,w.active_branch_id);
  const menu=gameMenuContext({world:w,directives:state.directives,context:{head_scene_id:w.head_scene_id,memory_complete:complete}});
  const sections=[{id:'dashboard',label:'Главное меню'},...menu.sections];
  saved.section=menuSectionTransition(sections,'dashboard',saved.section);
  const home=saved.section==='dashboard';
  nav.hidden=!home;
  const go=s=>{const next=menuSectionTransition(sections,saved.section,s?.id);if(next===saved.section)return;saved.section=next;saved.offset=0;updateUI({lastSection:next});show();box.scrollIntoView({block:'start',behavior:'instant'});};
  const back=button('‹ Главное меню',()=>go(sections[0]),'menu-back');
  if(!home){const current=sections.find(s=>s.id===saved.section);breadcrumb.append(back,node('span','menu-breadcrumb-label',current.label));}
  const drawNav=()=>{
   tiles.replaceChildren();
   const query=search.value.trim(),visible=directorySections(sections.map(s=>({...s,actions:(s.actions||[]).flatMap(a=>[a,MENU_ACTION_LABELS[a]||'Действие героя'])})),{group:saved.group||'quick',query,favorites:uiPrefs.favorites});
   for(const s of visible){
    const tile=node('div','menu-tile'),b=button('',()=>go(s),'menu-tile-button');b.append(menuGlyph(s.icon),add(node('span','menu-tile-text'),node('strong','',s.label),node('small','',MENU_DESCRIPTIONS[s.id]||'Открыть раздел')),node('span','menu-chevron','›'));
    const star=button(uiPrefs.favorites.includes(s.id)?'★':'☆',()=>{const on=uiPrefs.favorites.includes(s.id);if(!on&&uiPrefs.favorites.length>=8){toast('До восьми избранных разделов.',true);return;}updateUI({favorites:on?uiPrefs.favorites.filter(x=>x!==s.id):[...uiPrefs.favorites,s.id]});drawNav();},'menu-tile-star');star.setAttribute('aria-label','Избранное: '+s.label);star.setAttribute('aria-pressed',String(uiPrefs.favorites.includes(s.id)));tile.append(b,star);tiles.append(tile);
   }if(!visible.length)tiles.append(para('Разделы не найдены.'));
  };
  for(const g of MENU_GROUPS){const b=button(g.label,()=>{saved.group=g.id;search.value='';for(const other of groups.children)other.setAttribute('aria-pressed',String(other===b));drawNav();},'menu-group-tab');b.setAttribute('aria-pressed',String((saved.group||'quick')===g.id));groups.append(b);}
  search.oninput=drawNav;if(home)drawNav();
  if(complete)status.replaceChildren(node('span','menu-sync-dot'),document.createTextNode('Память загружена'));
  if(!complete&&!loadingMemory)status.replaceChildren(para('Загружена часть истории.'),button('Загрузить память',()=>void loadMemory(),'btn secondary'));
  try{showContent(menu,prefs,sections,go);}catch(e){output.replaceChildren(node('div','notice','Не удалось открыть этот раздел: '+menuError(e)),button('Повторить',show,'btn secondary'));console.error(e);}
 }
 function showContent(menu,prefs,sections,go){
  if(saved.section==='settings'){output.append(settingsView(prefs));return;}
  if(!complete){output.append(para('Данные раздела появятся после загрузки полной памяти.'));return;}
  if(!saved.actor){output.append(para('Герой определяется по сохранённому выбору игрока. Пока он не установлен, доступна настройка мира.'));return;}
  const overview=playerMenuOverview(projection,saved.actor,scenes.at(-1)?.world_time??null,{scenes,complete,reviewedHistory:reviews.get(saved.actor),offset:saved.offset||0,limit:24});
  if(saved.section==='dashboard'){
   const hud=node('div','menu-dashboard');hud.append(title(overview.actor),para([overview.clock,overview.dashboard.location?.value].filter(Boolean).join(' · ')||'Текущее состояние героя'));
   if(prefs.settings.hud)hud.append(hudView(overview));
   const counts=node('div','menu-counts');
   for(const [id,label,count] of [['inventory','Вещи',overview.dashboard.counts.inventory],['tasks','Дела',overview.dashboard.counts.tasks],['contacts','Знакомые',overview.dashboard.counts.contacts],['letters','Письма',overview.dashboard.counts.letters]]){
    const b=button('',()=>go(sections.find(s=>s.id===id)),'menu-count');b.append(node('strong','',String(count??0)),node('span','',label));counts.append(b);
   }
   hud.append(counts);if(overview.dashboard.notifications.records.length){hud.append(node('h3','','Уведомления'));for(const n of overview.dashboard.notifications.records){const s=sections.find(x=>x.id===n.section);if(s)hud.append(button(n.title||n.kind,()=>go(s),'menu-record-button'));}}
   output.append(hud);return;
  }
  const section=menu.sections.find(s=>s.id===saved.section);if(!section)return;
  output.append(add(node('div','menu-screen-heading'),menuGlyph(section.icon),title(section.label)));
  if(['goals','work','education','interests','health','calendar','inventory'].includes(section.id)){
   const review=reviews.get(saved.actor);if(!review){output.append(para('Проверяю ранее разобранные сцены…'));void loadReviews(saved.actor);}
   else if(!review.scan_complete)output.append(row(para('Исторические заметки загружены не полностью.'),button('Обновить заметки',()=>{reviews.delete(saved.actor);show();},'btn secondary')));
  }
  if(['illustrations','portraits'].includes(section.id)){output.append(visualLibrary(w,overview,section.id,saved.visualFocus));return;}
  if(['gallery','character','wardrobe','inventory','library','news','documents','places','property','magical_ecology','rituals'].includes(section.id)){const gallery=node('details','menu-data-group');gallery.append(node('summary','','Иллюстрации раздела'));let opened=false;gallery.addEventListener('toggle',()=>{if(gallery.open&&!opened){opened=true;gallery.append(visualLibrary(w,overview,section.id));}});output.append(gallery);}
  if(section.id==='journal'){output.append(menuJournal(w,scenes));return;}else if(section.id==='memories'){output.append(menuMemories(w,overview,projection));return;}else if(['library','documents','archives','publishing','letters','news','notebooks','catalogues','medical_records','bank_records','gallery'].includes(section.id)){
   output.append(readableMaterials(section.id,overview,documentIndex(scenes,projection,{complete}),w,saved.actor));
   if(section.id==='news')output.append(title('Известия и подписки'),renderMenuData({knowledge:overview.world_depth.news,...overview.advanced.channels}));
  }else if(section.id==='network')output.append(networkView(overview.world_depth.social,saved.actor));else if(section.id==='map')output.append(placesView(overview.world_depth.places),coordinateMap(overview.advanced.map_points));else if(section.id==='timeline')output.append(timelineView(overview.world_depth.timeline));else if(section.id==='property'){const {floorplans,...rest}=menuSection(overview,section.id).data;output.append(renderFloorplans(w,overview),renderMenuData(rest));}else {const data=menuSection(overview,section.id).data;if(section.id==='tasks'){output.append(taskTrackerView(data.task_tracker));delete data.task_tracker;data.current_tasks={...data.current_tasks,records:data.current_tasks.records.filter(x=>!x.id.startsWith('plan:'))};}if(!hasMenuRecords(data)&&!['character','health','psychology','calendar'].includes(section.id))output.append(para(EMPTY_SECTION_HINTS[section.id]||EMPTY_SECTION_HINTS.default));output.append(renderMenuData(data));if(section.id==='inventory'&&data.reviewed_inventory?.total)output.append(renderMenuData({reviewed_inventory:data.reviewed_inventory}));}
  if(['tasks','goals'].includes(section.id))output.append(priorityView(overview,prefs));
  const actionPanel=node('details','menu-action-panel');actionPanel.append(node('summary','','Действия героя в истории'),para('Просмотр данных работает здесь. Эти действия требуют сыгранной сцены в ChatGPT и сами не изменяют мир.'));
  let actionStart=output.childNodes.length;
  output.append(personalActions(section,overview));
  if(['circles','education'].includes(section.id)&&overview.community?.memory_complete){
   const choices=Object.entries(COMMUNITY_ACTIONS).filter(([a])=>communityTargets(a,overview.community).length);
   if(choices.length){
    const form=node('div','rule'),action=node('select','field'),record=node('select','field'),detail=field('Что герой намерен сделать?');
    for(const [value,label] of choices){const o=node('option','',label);o.value=value;action.append(o);}
    const draw=()=>{record.replaceChildren();for(const r of communityTargets(action.value,overview.community)){const o=node('option','',r.title||r.id);o.value=r.id;record.append(o);}};
    action.addEventListener('change',draw);draw();
    form.append(title('Мероприятия и клубы'),action,record,detail,button('Передать намерение в ChatGPT',()=>busy(async()=>{
     const input={action:action.value,community_record_id:record.value,detail:detail.value.trim()||COMMUNITY_ACTIONS[action.value]};
     menuActionIntent(input,overview);await copy('Мир '+w.title+' ('+w.id+'), герой '+overview.actor+'. Проверь актуальный head и validate_game_menu_action: '+JSON.stringify(input)+'. Это намерение, не выполненное действие.');
    }),'btn secondary'));output.append(form);
   }
  }
  if(section.id==='circles'&&overview.civic?.memory_complete){
   const actions=Object.entries(CIVIC_ACTIONS).filter(([action])=>civicActionTargets(action,overview.civic).length);
   if(actions.length){
    const form=node('div','rule'),action=node('select','field'),record=node('select','field'),vote=node('select','field'),detail=field('Опиши намерение, заявление или решение героя');
    for(const [value,label] of actions){const o=node('option','',label);o.value=value;action.append(o);}
    for(const [value,label] of [['yes','За'],['no','Против'],['abstain','Воздержаться']]){const o=node('option','',label);o.value=value;vote.append(o);}
    const draw=()=>{record.replaceChildren();for(const r of civicActionTargets(action.value,overview.civic)){const o=node('option','',r.title||r.role||r.id);o.value=r.id;record.append(o);}vote.hidden=action.value!=='civic_cast_ballot';};
    action.addEventListener('change',draw);draw();
    form.append(title('Общественное действие'),action,record,vote,detail,button('Передать намерение в ChatGPT',()=>busy(async()=>{
     const input={action:action.value,civic_record_id:record.value,detail:detail.value.trim()||CIVIC_ACTIONS[action.value],...(action.value==='civic_cast_ballot'?{civic_vote:vote.value}:{})};
     menuActionIntent(input,overview);
     await copy('Мир '+w.title+' ('+w.id+'), герой '+overview.actor+'. Проверь актуальный head и validate_game_menu_action: '+JSON.stringify(input)+'. Это намерение игрока, не выполненное действие. Сыграй и сохрани только подтверждённый результат.');
    }),'btn secondary'));output.append(form);
   }
  }
  const magical=section.actions.filter(a=>Object.hasOwn(MAGIC_ACTIONS,a)||Object.hasOwn(SOCIETY_ACTIONS,a));
  if(magical.length){
   const sel=node('select','field'),records=node('select','field'),detail=field('Что именно ты хочешь сделать?');detail.rows=3;
   for(const a of magical){const o=node('option','',MAGIC_ACTIONS[a]||SOCIETY_ACTIONS[a]);o.value=a;sel.append(o);}
   const redraw=()=>{const id=MAGIC_ACTION_IDS[sel.value]||SOCIETY_ACTION_IDS[sel.value];records.replaceChildren();records.hidden=!id;if(!id)return;
    for(const r of (Object.hasOwn(SOCIETY_ACTIONS,sel.value)?societyActionRows({action:sel.value},overview.magic_system):magicActionRows({action:sel.value},overview.magic_system))){try{menuActionIntent({action:sel.value,detail:'Проверка',[id]:r.id},overview);}catch{continue;}const o=node('option','',r.title||r.technique_id||r.description||r.id);o.value=r.id;records.append(o);}
   };sel.addEventListener('change',redraw);redraw();
   output.append(node('h3','','Магические действия'),sel,records,detail,button('Скопировать намерение в ChatGPT',()=>busy(async()=>{
    const id=MAGIC_ACTION_IDS[sel.value]||SOCIETY_ACTION_IDS[sel.value],input={action:sel.value,detail:detail.value,...(id?{[id]:records.value}:{})};
    const intent=menuActionIntent(input,overview);await copy('Мир '+w.title+' ('+w.id+'), герой '+saved.actor+'. Проверь актуальный head и validate_game_menu_action: '+JSON.stringify(input)+'. Намерение: '+intent.intent+'. Учитывай магические правила и реально сыграй результат.');
   })));
  }
  const advanced=section.actions.filter(a=>Object.hasOwn(ADVANCED_ACTIONS,a));
  if(advanced.length){
   const sel=node('select','field'),records=node('select','field'),detail=field('Уточни действие и условия');detail.rows=3;
   for(const a of advanced){const o=node('option','',ADVANCED_ACTIONS[a]);o.value=a;sel.append(o);}
   const redraw=()=>{const id=ADVANCED_ACTION_IDS[sel.value];records.replaceChildren();records.hidden=!id;if(!id)return;
    const a=overview.advanced,rows=id==='loan_id'?a.loans.records:id==='instrument_id'?a.investments.instruments.records:id==='lot_id'?a.investments.lots.records:id==='motive_id'?a.motives.records:id==='channel_id'?a.channels.channels.records:a.channels.subscriptions.records;
    for(const r of rows){try{menuActionIntent({action:sel.value,detail:'Проверка',[id]:r.id},overview);}catch{continue;}const o=node('option','',r.title||r.id);o.value=r.id;records.append(o);}
   };sel.addEventListener('change',redraw);redraw();
   output.append(node('h3','','Действия'),sel,records,detail,button('Скопировать намерение в ChatGPT',()=>busy(async()=>{
    const id=ADVANCED_ACTION_IDS[sel.value],input={action:sel.value,detail:detail.value,...(id?{[id]:records.value}:{})};
    const intent=menuActionIntent(input,overview);await copy('Мир '+w.title+' ('+w.id+'), герой '+saved.actor+'. Проверь актуальный head и validate_game_menu_action: '+JSON.stringify(input)+'. Намерение: '+intent.intent+'. Сыграй результат, не считай действие выполненным.');
   })));
  }
  if(['inheritance','treasury','library','documents','archives','publishing','letters','notebooks','catalogues','medical_records','bank_records','gallery','timeline','news','investments','psychology','map','magic','magical_medicine','rituals','alchemy','magical_ecology','magical_clinics','magical_science'].includes(section.id)){
   const data=menuSection(overview,section.id).data;
   const hasNext=v=>v&&typeof v==='object'&&(v.next_offset!=null||Object.values(v).some(x=>!Array.isArray(x)&&x&&typeof x==='object'&&hasNext(x)));
   const move=offset=>{const y=window.scrollY;saved.offset=offset;show();window.scrollTo({top:Math.min(y,output.getBoundingClientRect().top+window.scrollY),behavior:'instant'});};
   if(saved.offset>0||hasNext(data)){output.insertBefore(row(...(saved.offset>0?[button('← Предыдущие записи',()=>move(Math.max(0,saved.offset-24)),'btn secondary')]:[]),...(hasNext(data)?[button('Следующие записи →',()=>move((saved.offset||0)+24),'btn secondary')]:[])),output.childNodes[actionStart]??null);actionStart++;}
  }
  const docs=section.actions.filter(a=>Object.hasOwn(DOCUMENT_ACTIONS,a));
  if(docs.length){
   const sel=node('select','field'),record=node('select','field'),chapter=node('select','field'),detail=field('Что именно сделать?');detail.rows=3;
   for(const a of docs){const o=node('option','',DOCUMENT_ACTIONS[a]);o.value=a;sel.append(o);}
   const redrawChapter=()=>{chapter.replaceChildren();const need=['read_document','study_document','bookmark_document','remove_document_bookmark','write_document_note'].includes(sel.value);chapter.hidden=!need;if(!need)return;
    const r=documentActionRows({action:sel.value},overview).find(x=>x.id===record.value);for(const x of r?.contents||[]){if(sel.value==='write_document_note'&&!x.read)continue;const o=node('option','',x.title);o.value=x.id;chapter.append(o);}
   };
   const redraw=()=>{record.replaceChildren();record.hidden=!DOCUMENT_ACTION_IDS[sel.value];for(const r of documentActionRows({action:sel.value},overview)){const o=node('option','',r.title||r.subject||r.id);o.value=r.id;record.append(o);}redrawChapter();};
   sel.addEventListener('change',redraw);record.addEventListener('change',redrawChapter);redraw();
   output.append(title('Действия с материалами'),sel,record,chapter,detail,button('Скопировать намерение в ChatGPT',()=>busy(async()=>{
    const action=sel.value,id=DOCUMENT_ACTION_IDS[action],input={action,detail:detail.value,...(id?{[id]:record.value}:{}),...(!chapter.hidden?{chapter_id:chapter.value}:{})};
    menuActionIntent(input,overview);await copy('Мир '+w.title+' ('+w.id+'), герой '+saved.actor+'. Проверь актуальный head и validate_game_menu_action: '+JSON.stringify(input)+'. Сыграй только явное намерение.');
   })));
  }
  const legal=section.actions.filter(a=>Object.hasOwn(WEALTH_ACTIONS,a));
  if(legal.length){
   const sel=node('select','field'),record=node('select','field'),detail=field('Опиши решение или условия');
   for(const a of legal){const o=node('option','',WEALTH_ACTIONS[a]);o.value=a;sel.append(o);}
   const redraw=()=>{record.replaceChildren();const id=WEALTH_IDS[sel.value];record.hidden=!id;if(!id)return;
    for(const r of wealthActionRows({action:sel.value},overview)){try{menuActionIntent({action:sel.value,detail:'Проверка',[id]:r.id},overview);}catch{continue;}const o=node('option','',r.title||r.recipient||r.member||r.id);o.value=r.id;record.append(o);}
   };sel.addEventListener('change',redraw);redraw();
   output.append(title('Распоряжения'),sel,record,detail,button('Скопировать намерение в ChatGPT',()=>busy(async()=>{
    const id=WEALTH_IDS[sel.value],input={action:sel.value,detail:detail.value,...(id?{[id]:record.value}:{})};
    menuActionIntent(input,overview);await copy('Мир '+w.title+' ('+w.id+'), герой '+saved.actor+'. Проверь актуальное меню и validate_game_menu_action: '+JSON.stringify(input)+'. Не выполнять без сцены и согласия.');
   })));
  }
  const otherActions=section.actions.filter(a=>Object.hasOwn(MENU_ACTION_LABELS,a)&&!Object.hasOwn(PERSONAL_ACTIONS,a)&&!Object.hasOwn(ADVANCED_ACTIONS,a)&&!Object.hasOwn(MAGIC_ACTIONS,a)&&!Object.hasOwn(SOCIETY_ACTIONS,a)&&!Object.hasOwn(DOCUMENT_ACTIONS,a)&&!Object.hasOwn(WEALTH_ACTIONS,a)&&!Object.hasOwn(COMMUNITY_ACTIONS,a)&&!Object.hasOwn(CIVIC_ACTIONS,a)&&!Object.hasOwn(ROOM_ACTIONS,a)&&!['set_priority','clear_priority'].includes(a));
  if(otherActions.length){
   const actions=node('select','field'),detail=field('Что именно сделать, с кем или с каким предметом?');detail.rows=3;
   for(const a of otherActions){const o=node('option','',MENU_ACTION_LABELS[a]);o.value=a;actions.append(o);}
   output.append(node('h3','','Другие действия'),actions,detail,button('Скопировать намерение в ChatGPT',()=>busy(async()=>{
    const d=detail.value.trim();if(!d)throw Error('Опиши действие.');
    // The app cannot resolve an ambiguous object ID or execute the narrator.
    // ChatGPT must re-read the current pinned menu and resolve the exact visible record.
    await copy('Мир '+w.title+' ('+w.id+'), герой '+saved.actor+'. Намерение: '+MENU_ACTION_LABELS[actions.value]+' — '+d+'. Прочитай актуальный раздел '+section.id+', проверь необходимые ID и условия через validate_game_menu_action; если выбор неоднозначен, уточни. Не считай действие выполненным до сцены.');
   })));
  }
  // The read screen stays independent of the optional narrative controls.
  if(section.actions.length){while(output.childNodes.length>actionStart)actionPanel.append(output.childNodes[actionStart]);output.append(actionPanel);}
 }
 actor.addEventListener('change',()=>{saved.actor=actor.value;saved.offset=0;show();});
 selectActor();header.append(add(node('div',''),node('div','eyebrow','LIVING WORLD'),title('Игровое меню')),actor);
 box.append(header,status,breadcrumb,nav,output);root.append(box);show();if(!complete)queueMicrotask(()=>{if(alive())void loadMemory();});

}

function renderStory(){const w=state.world;
  add(root,panel(node('div','eyebrow','Игра в ChatGPT'),title('Продолжить историю'),para('История пишется в ChatGPT. После подключения нового MCP-моста сохранённые сцены будут появляться здесь автоматически. До этого доступен резервный импорт текста.'),row(button('Скопировать запрос для рассказчика',()=>busy(()=>copy(promptForNarrator({world:w,directives:state.directives,history:state.scenes.slice(-2),projection:state.historyComplete?replay(state.scenes,state.directives):{incomplete:true,reason:'Не вся история загружена. Понадобится восстановить её через историю и MCP.'}})))))));
  const last=state.scenes.at(-1),pending=last?.events?.at(-1);
  if(pending?.dynamics_kind==='player_choice'&&pending.status==='pending'){
   const choice=panel(title('Ожидается решение героя'),para(pending.actor+' · '+pending.question),para('Выбирай в ChatGPT. Здесь можно скопировать ответ; нажатие само по себе ничего не сохраняет.'));
   const message=(option,action)=>JSON.stringify({world_id:w.id,branch_id:w.active_branch_id,expected_head:last.id,expected_rules_version:w.directive_version,choice_id:pending.record_id,selected_option:option,...(action?{action_text:action}:{})});
   for(const option of pending.options||[])choice.append(button(option.text,()=>busy(()=>copy('Мой выбор героя: '+message(option.id))),'btn secondary'));
   const own=field('Свой поступок или реплика…','field');choice.append(own,button('Скопировать свой ответ',()=>busy(async()=>{if(!own.value.trim())throw Error('Введи действие.');await copy('Мой выбор героя: '+message('custom',own.value.trim()));}),'btn secondary'));root.append(choice);
  }
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
    const actions=add(node('div','scene-actions'),sceneLink(w.id,s.id),button('Ссылка на сцену',()=>busy(()=>copy(sceneReaderUrl(w.id,s.id))),'text-button'),button('На это: новая ветка',()=>{state.revision={scene_id:s.id,source_scene:s};renderWorld();document.querySelector('#sceneEditor')?.focus();},'text-button'));
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
       button('Открыть исходную сцену',()=>busy(async()=>{const scene=await getScene(w.id,hit.scene_id);body.textContent=scene.body;body.hidden=false;}),'btn secondary'),sceneLink(w.id,hit.scene_id),body);
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
 const showProfile=(p,complete,worldTime=state.scenes.at(-1)?.world_time,scenes=state.scenes)=>{
  profile.replaceChildren();
  const current=characterStateView(p,lastActor,{complete,worldTime,scenes});
  profile.append(title('Последнее известное состояние'));
  if(current.ambiguous_names.length)profile.append(para('Есть разные записанные имена: '+current.ambiguous_names.join(', ')+'. Уточни имя.'));
  if(!current.character?.state_fields.length)profile.append(para('Отдельные свойства ещё не записаны. Это не означает отсутствия места, травм или привычек.'));
  const age=current.character?.age;if(age?.status==='calendar_derived')profile.append(para('Возраст на '+age.as_of+': '+age.years+' (по дате рождения).'));else if(age?.status==='before_recorded_birth')profile.append(para('Игровое время раньше записанной даты рождения; проверь историю.'));
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
  profile.append(renderLongProfile(current,w));
  profile.append(para(complete?'Сведения отражают последнее записанное состояние, а не автоматически текущее.':'Показаны данные только загруженной части истории.'));
 };
 const fullProfile=button('Состояние по всей ветке',()=>busy(async()=>{
  if(!fieldName.value.trim())throw Error('Укажи имя персонажа.');
  lastActor=fieldName.value.trim();fullProfile.disabled=true;
  try{const memory=await fullStructuredMemory(w);showProfile(replay(memory.scenes,[],{evidencePrevalidated:true}),memory.complete,memory.scenes.at(-1)?.world_time,memory.scenes);}
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
 const personal=panel(title('История отношений и занятий'),para('Два направления отношений, личные привычки и совместные эпизоды. Совместная работа не означает примирения.'));
 const first=node('input','field'),second=node('input','field'),detail=node('div');first.placeholder='Имя героя';second.placeholder='Второй герой (необязательно)';first.maxLength=140;second.maxLength=140;
 let offsetRel=0,selectedActor='',selectedOther='',memory=null;
 const show=()=>{
  const p=replay(memory.scenes,[],{evidencePrevalidated:true});
  const r=relationshipHistory(memory.scenes,p,{actor:selectedActor,other:selectedOther,offset:offsetRel,complete:memory.complete});
  const a=activityView(p,{actor:selectedActor,offset:offsetRel,complete:memory.complete});
  const consequences=consequenceView(p,{actor:selectedActor,offset:offsetRel,complete:memory.complete});
  detail.replaceChildren(para(memory.complete?'Вся действующая ветка.':'Память загружена частично.'));
  const source=(card,s)=>{if(!s?.scene_id)return;const body=node('div','scene-body');body.hidden=true;card.append(button('Источник',()=>busy(async()=>{body.textContent=(await getScene(w.id,s.scene_id)).body;body.hidden=false;}),'text-button'),body);};
  detail.append(title('Текущие записанные отношения'));
  for(const x of r.current){const card=add(node('div','rule'),node('strong','',x.a+' → '+x.b),para(x.stance||'Общее отношение не установлено'));source(card,x.stance_source);
   for(const field of x.relationship_fields){const line=add(node('div','rule'),para(field.field+': '+field.value),para(field.evidence));source(line,field.source);card.append(line);}detail.append(card);}
  detail.append(title('История взаимодействия'));
  for(const x of r.history){const card=add(node('div','rule'),node('strong','',x.type==='interaction'?({date:'Свидание',romantic_milestone:'Романтическое событие',intimacy:'Интимная близость',separation:'Расставание'}[x.kind]||x.kind)+' · '+x.actors.join(', '):x.a+' → '+x.b),para(x.description||x.stance||''),para(x.outcome||''),para(x.evidence));source(card,x.source);detail.append(card);}
  detail.append(title('Привычки и занятия'));
  for(const x of [...a.habits,...a.activities]){const card=add(node('div','rule'),node('strong','',x.name+' · '+x.status),para(x.description),para(x.frequency||x.actors?.join(', ')||''));source(card,x.source);detail.append(card);}
  detail.append(title('Долговременные последствия'));
  for(const x of [...consequences.current,...consequences.resolved]){const card=add(node('div','rule'),node('strong','',x.actor+' · '+x.kind+' · '+x.status),para(x.description),para(x.cause||''),para(x.outcome||''));source(card,x.source);detail.append(card);}
  if(!r.total_history&&!r.total_relationships&&!a.counts.habits&&!a.counts.activities&&!consequences.counts.current&&!consequences.counts.resolved)detail.append(para('Нет записей по этому имени. Это не доказывает отсутствие отношений или занятий.'));
  if(offsetRel)detail.append(button('Назад',()=>{offsetRel=Math.max(0,offsetRel-20);show();},'btn secondary'));
  if(r.next_offset!==null||a.next_offset!==null||consequences.next_offset!==null)detail.append(button('Ещё',()=>{offsetRel+=20;show();},'btn secondary'));
 };
 add(personal,first,second,button('Читать по всей ветке',()=>busy(async()=>{
  selectedActor=first.value.trim();selectedOther=second.value.trim();if(!selectedActor)throw Error('Укажи имя героя.');
  offsetRel=0;memory=await fullStructuredMemory(w);show();
 })),detail);root.append(personal);
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
   else if(e.kind==='stock')add(card,node('strong','',e.holder+' · '+e.product_id),para(e.known?'Запас: '+e.quantity+' '+e.unit:'Неизвестный запас · изменение '+e.delta+' '+e.unit));
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
 root.append(panel(title('Деньги, имущество и запасы'),para('Учёт только подтверждённых событий. Неизвестный остаток не равен нулю. Предметы не появляются и не исчезают автоматически.'),actor,row(load),output));
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
  panel(title('Восстановленная память'),para('Отдельные предложения рассказчика по старым сценам. Не меняют канон. Хранилище заметок подключено в NEXT.'),button('Читать предложения',()=>busy(()=>getNotes(false)),'btn secondary'),notesOut,more));
 show();
}
function renderGrowth(){
 const w=state.world,out=node('div'),actor=node('input','field'),topic=node('input','field');
 actor.placeholder='Имя героя (необязательно)';topic.placeholder='Тема или ID записи';actor.maxLength=140;topic.maxLength=140;
 let scenes=state.scenes,complete=state.historyComplete,verified=false,offset=0;
 const show=()=>{
  const p=replay(scenes,[],{evidencePrevalidated:verified}),v=growthView(p,{actor:actor.value,topic:topic.value,complete,offset,limit:20});
  out.replaceChildren();
  for(const [heading,items] of [['Навыки и обучение',v.skills],['Личные проекты',v.projects],['Передача слухов',v.rumors],['Причинные связи',v.causes]]){
   out.append(title(heading));if(!items.length)out.append(para('Нет записей в этой выборке.'));
   for(const r of items){
    const label=r.name||r.title||(r.kind==='rumor'?r.sender+' → '+r.recipient:r.from_key+' → '+r.to_key);
    const card=add(node('div','rule'),node('strong','',label),para([r.actor,r.status,r.teacher].filter(Boolean).join(' · ')),para(r.description||r.claim||''),para([r.milestone,r.obstacle,r.next_step,r.outcome,r.channel,r.parent_rumor_id].filter(Boolean).join(' · ')),para(r.evidence));
    if(r.source?.scene_id){const body=node('div','scene-body');body.hidden=true;card.append(button('Источник',()=>busy(async()=>{body.textContent=(await getScene(w.id,r.source.scene_id)).body;body.hidden=false;}),'text-button'),body);}out.append(card);
   }
  }
  if(offset)out.append(button('Назад',()=>{offset=Math.max(0,offset-20);show();},'btn secondary'));
  if(v.next_offset!==null)out.append(button('Ещё',()=>{offset=v.next_offset;show();},'btn secondary'));
  if(!complete)out.append(node('div','notice','История загружена частично.'));
 };
 root.append(panel(title('Развитие героев и причинность'),para('Навыки, долгие личные проекты, цепочки слухов и явно установленные причины. Переданный слух не означает, что получатель ему поверил.'),actor,topic,row(button('Найти',()=>{offset=0;show();}),button('Прочитать всю ветку',()=>busy(async()=>{const m=await fullStructuredMemory(w);scenes=m.scenes;complete=m.complete;verified=true;offset=0;show();}),'btn secondary')),out));show();
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
 const turnPanel=panel(title('Следующий эпизод'),para('Общий обзор дел, конфликтов, распорядка, сроков и изменений мира. Просмотр не запускает события.'));
 const target=node('input','field'),focus=node('input','field'),place=node('input','field'),turnOut=node('div');
 target.placeholder='Целевая игровая дата (необязательно)';focus.placeholder='Имена через запятую (до 8)';place.placeholder='Место';
 let turnScenes=state.scenes,turnComplete=state.historyComplete,turnVerified=false,turnOffset=0,turnFilterKey='';
 const turnScope=node('select','field');for(const [value,label] of [['all','Все линии'],['focus','Выбранные герои и место'],['background','Независимые линии']]){const option=node('option','',label);option.value=value;turnScope.append(option);}
 const showTurn=()=>{
  const projection=replay(turnScenes,[],{evidencePrevalidated:turnVerified});
  const filters={branchId:w.active_branch_id,actors:focus.value.split(',').map(x=>x.trim()).filter(Boolean),place:place.value,target_time:target.value.trim()||null,complete:turnComplete,limit:20,scope:turnScope.value};
  const key=JSON.stringify([turnScenes.at(-1)?.id,filters]);if(key!==turnFilterKey){turnOffset=0;turnFilterKey=key;}
  const v=prepareStoryTurn(turnScenes,projection,state.directives,{...filters,offset:turnOffset});
  turnOut.replaceChildren(para('Игровое время: '+(v.clock||'не установлено')+(v.target_time?' → '+v.target_time:'')+(v.elapsed_story_minutes!==null?' · '+v.elapsed_story_minutes+' мин.':'')));
  if(v.world_chronicle?.records.length)turnOut.append(panel(title('Режиссёрская хроника мира'),timelineView(v.world_chronicle)));
  if(v.background_time_review)turnOut.append(panel(title('Ближайший этап перемотки'),renderMenuData(v.background_time_review)));
  if(v.npc_initiatives?.initiatives.length)turnOut.append(panel(title('Самостоятельные инициативы NPC'),renderMenuData(v.npc_initiatives.initiatives)));
  for(const warning of v.warnings)turnOut.append(node('div','notice',warning));
  const labels={intention:'Намерение',obligation:'Обязательство',routine:'Распорядок',thread:'Сюжетная линия',activity:'Занятие',consequence:'Последствие',project:'Проект',contest:'Конкуренция',institution:'Учреждение',development:'Изменение мира',strained_bond:'Напряжённая связь',personal_bond:'Личная связь',family_event:'Семейное событие',family_duty:'Семейная обязанность',life_transition:'Жизненный переход',age_milestone:'День рождения',goal_opportunity:'Личная цель — возможность инициативы',habit_opportunity:'Привычное занятие',shared_schedule:'Возможная встреча',group_opportunity:'Дела организации',mentorship_opportunity:'Учёба с наставником',employment:'Работа',market_offer:'Товар или услуга',economic_agreement:'Денежное соглашение',payment_schedule:'Периодическая оплата',enterprise:'Предприятие',production_order:'Производственный заказ'};
  for(const person of v.life_context||[])if(person.target_age?.status==='calendar_derived')turnOut.append(para(person.actor+' · возраст '+person.target_age.years+' на '+person.target_age.as_of));
   for(const r of v.candidates){
   const card=add(node('div','rule'),node('strong','',(labels[r.kind]||r.kind)+' · '+(r.title||r.key||'')),para([r.actors.join(', '),r.status,r.place,r.location_status].filter(Boolean).join(' · ')),para([r.next_step,r.obstacle,r.resource,r.amount!=null?String(r.amount)+' '+r.currency+(r.pay_period?' / '+r.pay_period:''):null,r.occurrences?('Не закрыто: '+(r.pending_occurrences??r.occurrences)+' из '+r.occurrences+' · '+r.first_due_on+' — '+r.last_due_on):null,r.age_years!=null?('Возраст: '+r.age_years):null].filter(Boolean).join(' · ')));
   const checkLabels={paused_intention:'Отложено — нужна причина возобновления',recorded_obstacle:'Препятствие',ambiguous_place:'Несколько записей места',place_access_unknown:'Доступ неизвестен',recorded_place_constraint:'Ограничение места',travel_requires_story:'Нужно показать перемещение',competing_schedule:'Возможный конфликт расписания',clock_unknown:'Время не установлено',insufficient_recorded_funds:'Записанных средств недостаточно',recorded_funds_cover_price:'Записанных средств достаточно',funds_unknown:'Средства неизвестны',offer_custody_unconfirmed:'Владение предметом не подтверждено',enterprise_not_operating:'Предприятие не работает',stock_unknown:'Запас неизвестен',stock_insufficient:'Недостаточно сырья',stock_available:'Сырьё есть'};
   for(const ch of r.checks||[])card.append(para([checkLabels[ch.kind]||ch.kind,ch.actor,ch.description,ch.from&&ch.to?ch.from+' → '+ch.to:ch.place,ch.status,ch.access,ch.product_id,ch.required!=null?('Нужно '+ch.required+' '+ch.unit+', имеется '+(ch.quantity??'неизвестно')):null,ch.other_places?.join(', ')].filter(Boolean).join(' · ')));
   if(r.participants_omitted)card.append(para('Других участников: '+r.participants_omitted));
   if(r.checks_omitted)card.append(para('Других условий: '+r.checks_omitted));
   if(r.source?.scene_id){const body=node('div','scene-body');body.hidden=true;card.append(button('Источник',()=>busy(async()=>{body.textContent=(await getScene(w.id,r.source.scene_id)).body;body.hidden=false;}),'text-button'),body);}turnOut.append(card);
  }
  for(const actor of v.actor_context||[]){
    const card=add(node('div','rule'),node('strong','','Контекст: '+actor.actor));
    for(const p of actor.intentions)card.append(para(p.goal+' · '+p.status+(p.next_step?' → '+p.next_step:'')));
    for(const f of actor.state_fields)card.append(para(f.field+': '+(f.value??'не установлено')));
    for(const k of actor.knowledge)card.append(para('Знание '+k.holder+' · '+k.status+': '+k.fact));
    for(const e of actor.recent_offscreen)card.append(para('За кадром: '+e.description));
    for(const r of actor.resources||[])card.append(para(r.kind==='balance'?'Средства · '+r.currency+': '+(r.known?r.balance:'неизвестно'):r.kind==='stock'?'Запас '+r.product_id+': '+(r.known?r.quantity:'неизвестно')+' '+r.unit:'Держит: '+(r.name||r.item_id)));
    for(const e of actor.experience||[])card.append(para([e.kind==='skill'?'Навык':'Привычка',e.name,e.status,e.frequency].filter(Boolean).join(' · ')));
    for(const r of actor.responsibilities||[])card.append(para(['Ответственность',r.title||r.description||r.bond_type||r.role||r.group_id,r.status,r.deadline].filter(Boolean).join(' · ')));
    for(const [k,label] of [['personality_history','Изменения личности'],['life_interests','Интересы'],['life_goals','Цели'],['life_threads','Сюжетные линии'],['life_circles','Социальные круги'],['life_experience','Опыт'],['life_causes','Причинные связи']])if(actor[k]?.length)card.append(node('h3','',label),renderMenuData(actor[k]));
    if(Object.keys(actor.omitted).length)card.append(para('Есть дополнительные записи; смотри карточку персонажа.'));
    turnOut.append(card);
   }
   turnOut.append(para('Всего: '+v.total_candidates+' · в фокусе: '+v.candidate_counts.focus+' · независимо: '+v.candidate_counts.background));
   if(v.candidates.length)turnOut.append(para('Показано '+(v.offset+1)+'–'+(v.offset+v.candidates.length)+' из '+v.total_candidates));
   const nav=row();if(v.offset)nav.append(button('Назад',()=>{turnOffset=Math.max(0,v.offset-20);showTurn();},'btn secondary'));if(v.next_offset!==null)nav.append(button('Далее',()=>{turnOffset=v.next_offset;showTurn();},'btn secondary'));turnOut.append(nav);
  if(!v.candidates.length)turnOut.append(para('Пока нет записанных кандидатов. Это не означает, что персонажи не могут действовать.'));
 };
 add(turnPanel,target,focus,place,turnScope,row(button('Подготовить эпизод',()=>busy(async()=>{turnOffset=0;showTurn();})),button('Вся память',()=>busy(async()=>{const m=await fullStructuredMemory(w);turnScenes=m.scenes;turnComplete=m.complete;turnVerified=true;turnOffset=0;showTurn();}),'btn secondary')),turnOut);root.append(turnPanel);showTurn();
 const dynamics=panel(title('Жизнь общества и мира'),para('Текущие связи, учреждения, конкурирующие интересы и изменения. Источник каждого состояния сохраняется.'));
 const dOut=node('div');let dOffset=0;
 const showDynamics=()=>{
  const v=dynamicsView(replay(turnScenes,[],{evidencePrevalidated:turnVerified}),{actor:focus.value.includes(',')?'':focus.value.trim(),place:place.value,complete:turnComplete,offset:dOffset,limit:15});
  dOut.replaceChildren();
  for(const [heading,rows] of [['Связи',v.bonds],['Учреждения',v.institutions],['Конкуренция',v.contests],['Изменения',v.developments],['Семейные события',v.family_events],['Семейные обязанности',v.family_duties],['Жизненные переходы',v.life_transitions],['Работа',v.employment],['Товары и услуги',v.market_offers],['Денежные соглашения',v.economic_agreements],['Расписание оплаты',v.payment_schedules],['Исполнение оплаты',v.payment_occurrences],['Предприятия',v.enterprises],['Производственные заказы',v.production_orders],['Операции с запасами',v.stock_operations]]){
   dOut.append(title(heading));if(!rows.length)dOut.append(para('Нет записей в выборке.'));
   for(const r of rows){const card=add(node('div','rule'),node('strong','',r.title||r.name||[r.actor,r.counterparty].join(' — ')),para([r.bond_type,r.transition_kind,r.offer_kind,r.agreement_kind,r.payment_kind,r.status,r.resource,r.place,r.amount!=null?String(r.amount)+' '+r.currency+(r.pay_period?' / '+r.pay_period:''):null,r.every_days?('Период (дней): '+r.every_days):null,r.starts_on,r.ends_on,r.scheduled_on].filter(Boolean).join(' · ')),para(r.description),para(r.stock_lines?.map(l=>l.product_id+': '+l.quantity+' '+l.unit).join('; ')||''),para(r.outcome||r.terms||''));
    if(r.source?.scene_id){const body=node('div','scene-body');body.hidden=true;card.append(button('Источник',()=>busy(async()=>{body.textContent=(await getScene(w.id,r.source.scene_id)).body;body.hidden=false;}),'text-button'),body);}dOut.append(card);}
  }
  if(dOffset)dOut.append(button('Назад',()=>{dOffset=Math.max(0,dOffset-15);showDynamics();},'btn secondary'));
  if(v.next_offset!==null)dOut.append(button('Ещё',()=>{dOffset=v.next_offset;showDynamics();},'btn secondary'));
 };
 add(dynamics,button('Обновить обзор',()=>busy(async()=>{const m=await fullStructuredMemory(w);turnScenes=m.scenes;turnComplete=m.complete;turnVerified=true;dOffset=0;showDynamics();}),'btn secondary'),dOut);root.append(dynamics);showDynamics();
 const drivers=storyDrivers(p,state.directives);
 const pressure=panel(title('Что движет персонажами'),para('Настоящие желания, обещания и конфликты из подтверждённых источников. Это подсказки для повествования, не произошедшие автоматически события.'));
 if(!drivers.length)pressure.append(para('Структурных мотивов пока нет. Это не значит, что герои лишены собственных целей: точные первоисточники доступны через поиск.'));
 for(const d of drivers){
  const source=d.source?.scene_id?' · источник: '+d.source.scene_id:'';
  const label=d.kind==='npc_intention'?d.actor+' — '+d.goal+' ('+d.status+')':
   d.kind==='recorded_commitment'?'Обязательство '+d.commitment_id+' ('+d.status+')':
   d.kind==='independent_thread'?'Сюжетная линия: '+d.title+' ('+d.status+')':
   d.kind==='shared_activity'?'Совместное занятие: '+d.title+' ('+d.status+')':
   d.kind==='lasting_consequence'?'Последствие: '+d.actor+' · '+d.description:
   d.kind==='personal_project'?'Проект: '+d.actor+' · '+d.title:
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
accountButton.addEventListener('click',()=>busy(async()=>{if(readSession()){menuMemoryCache=null;menuMemoryJob=null;menuUiState.clear();await signOut();showAuth();}else showAuth();}));
document.querySelector('#homeLink').addEventListener('click',e=>{e.preventDefault();busy(openWorlds);});
window.addEventListener('unhandledrejection',e=>{console.error(e.reason);toast('Ошибка подключения. Попробуй обновить страницу.',true);});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void checkCloudChanges();});
window.addEventListener('focus',()=>void checkCloudChanges());
// Poll owner metadata; only safe read-only menu screens refresh their snapshot automatically.
setInterval(()=>{if(document.visibilityState==='visible')void checkCloudChanges();},15000);
if(!(readSession()&&resumeOAuth()))void busy(openLanding);
window.addEventListener('hashchange',()=>{
 if(state.pending){toast('Дождись завершения операции и обнови страницу для открытия ссылки.',true);return;}
 if(!confirmLeaveDraft()){clearReaderHash();return;}
 void busy(openLanding);
});

if('serviceWorker' in navigator && window.isSecureContext)navigator.serviceWorker.register('/sw.js').catch(()=>{});
