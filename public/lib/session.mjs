const CONFIG_KEY='lw-next-config-v1';
const SESSION_KEY='lw-next-session-v1';
const storage=()=>window.localStorage;
let configCache=null, sessionCache=null;
function safeJson(raw){try{return JSON.parse(raw);}catch{return null;}}
export function readConfig(){return configCache||(configCache=safeJson(storage().getItem(CONFIG_KEY))||null);}
export function readSession(){return sessionCache||(sessionCache=safeJson(storage().getItem(SESSION_KEY))||null);}
export function saveConfig({url,key}){
  const origin=new URL(String(url).trim());
  if(origin.protocol!=='https:' || origin.username || origin.password || origin.search || origin.hash)throw Error('Нужен HTTPS URL проекта Supabase.');
  const publishable=String(key||'').trim();
  if(publishable.length<20)throw Error('Укажи публичный anon/publishable key Supabase.');
  configCache={url:origin.origin,key:publishable};
  storage().setItem(CONFIG_KEY,JSON.stringify(configCache));
  return configCache;
}
export function clearSession(){sessionCache=null;storage().removeItem(SESSION_KEY);}
function saveSession(s){sessionCache=s;storage().setItem(SESSION_KEY,JSON.stringify(s));return s;}
function cfg(){const c=readConfig();if(!c)throw Error('Сначала подключи Supabase.');return c;}
async function parseResponse(res){const data=await res.json().catch(()=>({}));if(!res.ok){throw Error(data.msg||data.error_description||data.message||data.error||`HTTP ${res.status}`);}return data;}
export async function signIn(email,password){
  const {url,key}=cfg();
  const res=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:key,'content-type':'application/json'},body:JSON.stringify({email,password})});
  const data=await parseResponse(res);
  return saveSession({...data,expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600)});
}
export async function signUp(email,password){
  const {url,key}=cfg();
  const res=await fetch(`${url}/auth/v1/signup`,{method:'POST',headers:{apikey:key,'content-type':'application/json'},body:JSON.stringify({email,password})});
  return parseResponse(res);
}
export async function activeToken(){
  const session=readSession(); if(!session?.access_token)throw Error('Нужно войти в аккаунт.');
  if(session.expires_at>Date.now()/1000+60)return session.access_token;
  if(!session.refresh_token){clearSession();throw Error('Сессия истекла. Войди заново.');}
  const {url,key}=cfg();
  try{
    const res=await fetch(`${url}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:key,'content-type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
    const data=await parseResponse(res);
    return saveSession({...data,expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600)}).access_token;
  }catch(e){clearSession();throw Error('Не удалось обновить сессию. Войди снова. '+e.message);}
}
export async function dbRequest(path,{method='GET',body,headers={}}={}){
  const {url,key}=cfg(); const token=await activeToken();
  const res=await fetch(`${url}${path}`,{method,headers:{apikey:key,authorization:`Bearer ${token}`,'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const raw=await res.text();const data=raw?safeJson(raw):null;
  if(!res.ok)throw Error(data?.message||data?.hint||data?.error||`Ошибка Supabase: ${res.status}`);
  return data;
}
export async function signOut(){
  const conf=readConfig(), s=readSession();
  if(conf&&s?.access_token){try{await fetch(`${conf.url}/auth/v1/logout`,{method:'POST',headers:{apikey:conf.key,authorization:`Bearer ${s.access_token}`}});}catch{/* logout local anyway */}}
  clearSession();
}
