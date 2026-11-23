import {FOUNDATIONS,buildWorldDraft,promptForNarrator} from './core/world.mjs';
import {replay,validateScene} from './core/continuity.mjs';
import {readConfig,readSession,saveConfig,signIn,signUp,signOut} from './lib/session.mjs';
import {listWorlds,getWorld,createWorld,listDirectives,addDirective,listBranches,activeHistory,allActiveHistory,saveScene,forkBefore,switchBranch,setAutosave,deleteWorld} from './lib/storage.mjs';

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
let toastTimer;
function toast(message,error=false){const n=document.querySelector('#toast');n.textContent=message;n.className='toast visible';n.style.borderColor=error?'#a86d85':'';clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.className='toast',4500);}
function clear(){root.replaceChildren();window.scrollTo({top:0});accountButton.textContent=readSession()?'Выйти':'Аккаунт';}
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
  const tabs=node('div','tabs');for(const [id,name] of [['story','История'],['directives','Настройки словами'],['branches','Ветки'],['director','Режиссёр']])tabs.append(button(name,()=>{state.tab=id;renderWorld();},'tab'+(state.tab===id?' active':'')));
  root.append(tabs);
  if(state.tab==='story')renderStory();if(state.tab==='directives')renderDirectives();if(state.tab==='branches')renderBranches();if(state.tab==='director')renderDirector();
}
function renderStory(){const w=state.world;
  add(root,panel(node('div','eyebrow','Игра в ChatGPT'),title('Продолжить историю'),para('История пишется в ChatGPT. После подключения нового MCP-моста сохранённые сцены будут появляться здесь автоматически. До этого доступен резервный импорт текста.'),row(button('Скопировать запрос для рассказчика',()=>busy(()=>copy(promptForNarrator({world:w,directives:state.directives,history:state.scenes.slice(-2),projection:state.historyComplete?replay(state.scenes,state.directives):{incomplete:true,reason:'Не вся история загружена. Понадобится восстановить её через историю и MCP.'}})))))));
  const heading=node('div','section-head');add(heading,title('Хроника'),node('span','count',state.scenes.length+' загружено'));root.append(heading);
  if(state.hasOlder){root.append(panel(para('Есть более ранние сцены.'),row(button('Загрузить историю полностью',()=>busy(async()=>{const r=await allActiveHistory(w.id);state.scenes=r.scenes;state.hasOlder=!r.complete;state.historyComplete=r.complete;renderWorld();}),'btn secondary'))));}
  if(!state.scenes.length)root.append(node('div','empty','История ещё не началась. Первый эпизод можно сыграть в ChatGPT и затем сохранить.'));
  const container=node('div','story');state.scenes.forEach((s,i)=>{
    const card=node('article','scene');const chapter=node('h3','',`Сцена ${i+1}${s.world_time?' · '+s.world_time:''}`);const details=node('details','scene-details');if(i===state.scenes.length-1)details.open=true;
    const summary=node('summary','',details.open?'Текст сцены':'Читать сцену');const body=node('div','scene-body',s.body);add(details,summary,body);
    const actions=add(node('div','scene-actions'),button('На это: новая ветка',()=>{state.revision={scene_id:s.id};renderWorld();document.querySelector('#sceneEditor')?.focus();},'text-button'));
    add(card,chapter,details,actions);container.append(card);
  });root.append(container);
  const p=panel(node('div','eyebrow',state.revision?'Режим альтернативной истории':'Резервное сохранение'),title(state.revision?'Перепиши выбранную сцену':'Добавить сцену вручную'));
  if(state.revision)p.append(node('div','notice','Будет создана новая ветка ДО выбранной сцены. Прежний вариант останется доступным. Введи полный заменяющий текст сцены.'));
  const editor=field('Текст новой сцены…','field large-field');editor.id='sceneEditor';editor.rows=8;const worldTime=node('input','field');worldTime.placeholder='Время сцены (если известно), например: 1991-09-01 10:00';worldTime.type='text';
  add(p,editor,para('Время не будет придумано автоматически.'),worldTime,row(button(state.revision?'Создать ветку и сохранить':'Сохранить сцену',()=>busy(async()=>{
    const body=editor.value.trim();const check=validateScene({body,events:[],directives:state.directives});if(!check.ok)throw Error(check.errors.join(' '));
    if(state.revision){await forkBefore(w.id,state.revision.scene_id);state.revision=null;await reloadWorld(w.id);}
    await saveScene({world:state.world,body,worldTime:worldTime.value.trim()||null});
    await reloadWorld(w.id);toast('Сцена сохранена.');renderWorld();
  })),...(state.revision?[button('Отменить',()=>{state.revision=null;renderWorld();},'btn ghost')]:[])));
  root.append(p);
}
function renderDirectives(){const w=state.world;add(root,panel(node('div','eyebrow','Никаких длинных форм'),title('Измени мир обычными словами'),para('Например: «Гарри и Малфой — враги. Они никогда не помирятся». Условие сохранится отдельно от будущих сцен.'),(()=>{
  const text=field('Что должно измениться или оставаться неизменным?','field large-field');const c=node('div');add(c,text,row(button('Запомнить условие',()=>busy(async()=>{await addDirective(w.id,text.value);state.directives=await listDirectives(w.id);toast('Условие сохранено.');renderWorld();}))));return c;
})()));
 add(root,panel(title('Твои условия'),...(state.directives.length?state.directives.map(d=>{const p=node('div','rule user');add(p,node('strong','',d.category),para(d.text));return p;}):[para('Пока нет дополнительных условий. Основа мира и постоянные принципы уже действуют.')])));
 const f=panel(title('Постоянные принципы рассказчика'));for(const rule of FOUNDATIONS){const item=node('div','rule');add(item,node('strong','',rule.name),para(rule.text));f.append(item);}root.append(f);
}
function renderBranches(){const w=state.world;add(root,panel(title('Альтернативные линии'),para('«На это» создаёт новую ветку от состояния перед выбранной сценой. История старой ветки не удаляется.')));
 const list=panel();state.branches.forEach(b=>{const active=b.id===w.active_branch_id;const card=node('div','branch-card');add(card,node('span','',b.name+(active?' · текущая':'')),button(active?'Открыта':'Перейти',()=>busy(async()=>{if(active)return;await switchBranch(w.id,b.id);await reloadWorld(w.id);renderWorld();}),'btn secondary'));list.append(card);});root.append(list);
}
function renderDirector(){const w=state.world;add(root,panel(title('Состояние памяти'),para('Режиссёрская информация отделена от художественного текста.'),node('div','rule',`Загружено сцен: ${state.scenes.length}${state.hasOlder?' (есть ещё)': ''}`),node('div','rule',`Текущая ветка: ${w.active_branch_id}`)));
 const p=replay(state.scenes,state.directives);const stats=panel(title('Подтверждённые события'),para(`Записанных изменений: ${p.events_replayed}. Неотмеченные сцены не означают отсутствия событий.`));
 for(const [name,arr] of [['Персонажи',p.people],['Отношения',p.relationships],['Знания',p.knowledge],['Финансы',p.balances],['Вещи',p.items],['Обязательства',p.obligations],['События вне кадра',p.offscreen]])stats.append(para(`${name}: ${arr.length}`));
 if(!state.historyComplete)stats.append(node('div','notice','Загружена только часть истории. Проекция не полная. Нельзя делать выводы о старых событиях.'));
 if(p.validation_warnings.length)stats.append(node('div','notice',`Некоторые события отклонены: ${p.validation_warnings.length}.`));root.append(stats);
 add(root,panel(title('Автосохранение через MCP'),para('После публикации и подключения OAuth-моста ChatGPT сможет сохранять сцены при включённом разрешении. Эта настройка не запускает модель в фоне.'),row(button(w.auto_save?'Автосохранение включено':'Автосохранение выключено',()=>busy(async()=>{await setAutosave(w.id,!w.auto_save);await reloadWorld(w.id);renderWorld();}),'btn secondary'))));
 add(root,panel(title('Удалить мир'),para('Удаление безвозвратное. Старый LIVING WORLD не затрагивается.'),row(button('Удалить этот мир',()=>busy(async()=>{if(!confirm(`Удалить мир «${w.title}» вместе с его ветками?`))return;await deleteWorld(w.id);await openWorlds();toast('Мир удалён.');}),'btn danger'))));
}
accountButton.addEventListener('click',()=>busy(async()=>{if(readSession()){await signOut();showAuth();}else showAuth();}));
document.querySelector('#homeLink').addEventListener('click',e=>{e.preventDefault();busy(openWorlds);});
window.addEventListener('unhandledrejection',e=>{console.error(e.reason);toast('Ошибка подключения. Попробуй обновить страницу.',true);});
openWorlds();
