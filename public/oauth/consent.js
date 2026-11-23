import {readConfig,readSession,saveConfig,signIn,activeToken} from '../lib/session.mjs';
import {authorizationDetails,decideAuthorization,safeChatGPTCallback,assertNextAuthorization,isAuthorizationId} from '../lib/oauth-consent.mjs';
const mount=document.querySelector('#consent');
const id=new URL(location.href).searchParams.get('authorization_id');
const n=(tag,cls='',text='')=>{const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;};
const add=(parent,...parts)=>{parts.forEach(x=>parent.append(x));return parent;};
const entry=(type,placeholder,value='')=>{const input=n('input','field');input.type=type;input.placeholder=placeholder;input.value=value;return input;};
const btn=(text,action,cls='btn')=>{const b=n('button',cls,text);b.type='button';b.addEventListener('click',action);return b;};
const form=()=>n('section','panel');
let busy=false;
const run=async(fn)=>{if(busy)return;busy=true;try{await fn();}catch(e){mount.prepend(n('div','notice',e.message||'Ошибка авторизации.'));}finally{busy=false;}};
const redirect=link=>{location.assign(safeChatGPTCallback(link));};
function showSetup(){mount.replaceChildren();const c=readConfig();const url=entry('url','https://project.supabase.co',c?.url||'');const key=entry('password','Публичный anon/publishable key',c?.key||'');
 add(mount,n('div','eyebrow','Соединение с ChatGPT'),n('h1','hero-title','Подключить мир к ChatGPT'),add(form(),
  n('h2','','Настройки Supabase'),n('p','small','Этот экран нужен один раз. Не вводи service_role или секретные ключи.'),url,key,
  add(n('div','btn-row'),btn('Продолжить',()=>run(async()=>{saveConfig({url:url.value,key:key.value});showLogin();})))));
}
function showLogin(){mount.replaceChildren();const email=entry('email','Email');const password=entry('password','Пароль');
 add(mount,n('div','eyebrow','Подтверждение владельца'),n('h1','hero-title','Разрешить доступ к мирам?'),add(form(),
  n('p','small','Сначала войди в тот же Supabase-аккаунт, где созданы твои истории.'),email,password,
  add(n('div','btn-row'),btn('Войти и продолжить',()=>run(async()=>{await signIn(email.value,password.value);await showDetails();})))));
}
async function showDetails(){if(!readConfig())return showSetup();if(!readSession())return showLogin();mount.replaceChildren(n('div','loading','Проверяю запрос подключения…'));
 try{
  const token=await activeToken();const c=readConfig();const details=assertNextAuthorization(await authorizationDetails({...c,token,id}),id);
  if(details.redirect_url)return redirect(details.redirect_url);
  const client=details.client||{};const box=form();
  add(box,n('h2','',client.name||'ChatGPT'),n('p','small','Сервис запрашивает разрешение действовать от твоего имени. Прочитай адрес и права перед подтверждением.'),
     n('p','small','Адрес приложения: '+(client.uri||client.id||'не указан')),
     n('p','small','Разрешённый возврат: '+(details.redirect_uri||'не указан')),
     n('p','small','Запрошенные права: '+(details.scope||'не указаны')),
     n('div','notice','После подключения ChatGPT сможет читать миры и при включённом автосохранении записывать сыгранные сцены. Не подключай неизвестное приложение.'));
  const buttons=n('div','btn-row');add(buttons,btn('Разрешить',()=>run(async()=>{redirect(await decideAuthorization({...c,token:await activeToken(),id,approved:true}));})),
    btn('Отклонить',()=>run(async()=>{redirect(await decideAuthorization({...c,token:await activeToken(),id,approved:false}));}),'btn ghost'));
  box.append(buttons);mount.replaceChildren(n('div','eyebrow','OAuth 2.1 · разрешения'),n('h1','hero-title','Подтверждение доступа'),box);
 }catch(e){
  mount.replaceChildren(n('div','notice',e.message||'Ошибка'));
  if(e.code==='OAUTH_ORIGIN_NOT_ALLOWED'){
   const link=n('a','btn secondary','Открыть настройки Supabase');
   link.href='https://supabase.com/dashboard/project/bcwzlsljcxubqtvzsucz/auth/url-configuration';link.target='_blank';link.rel='noopener noreferrer';
   mount.append(link);
  }else mount.append(btn('Повторить',()=>run(showDetails),'btn secondary'));
 }
}
if(!isAuthorizationId(id))mount.replaceChildren(n('div','notice','Отсутствует корректный идентификатор запроса Supabase OAuth. Начни подключение заново в ChatGPT.'));
else showDetails();
