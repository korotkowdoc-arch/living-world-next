/** OAuth consent REST calls, with the authenticated owner's Supabase session. */
/** Supabase OAuth issues opaque authorization IDs (e.g. 32-character base64url strings),
 * NOT necessarily PostgreSQL UUIDs. Treat them as untrusted path segments.
 */
export function isAuthorizationId(id){
 return typeof id==='string'&&/^[A-Za-z0-9_-]{16,128}$/.test(id);
}
export function assertAuthorizationId(id){
 if(!isAuthorizationId(id))throw Error('Некорректный идентификатор запроса авторизации.');
 return id;
}
import {PUBLIC_OAUTH_CLIENT_ID} from './public-config.mjs';

export const NEXT_REDIRECT_URI='https://chatgpt.com/connector/oauth/vcwt3WXJ1Lt0';

/** Only this registered NEXT client and its exact ChatGPT callback can approve worlds. */
export function assertNextAuthorization(details,id){
 assertAuthorizationId(id);
 if(details?.redirect_url){
  safeChatGPTCallback(details.redirect_url);
  return details;
 }
 if(details?.authorization_id!==id||details?.client?.id!==PUBLIC_OAUTH_CLIENT_ID||
    details?.redirect_uri!==NEXT_REDIRECT_URI)
  throw Error('OAuth-запрос не относится к клиенту LIVING WORLD NEXT. Проверь подключение.');
 return details;
}
export function safeChatGPTCallback(raw){
 let dest;try{dest=new URL(raw);}catch{throw Error('Некорректная ссылка OAuth.');}
 const expected=new URL(NEXT_REDIRECT_URI);
 if(dest.protocol!=='https:'||dest.username||dest.password||dest.hash||
    dest.origin!==expected.origin||dest.pathname!==expected.pathname)
  throw Error('Сервер вернул неожиданную ссылку подтверждения. Переход остановлен.');
 return dest.href;
}
export async function authorizationDetails({url,key,token,id,fetchImpl=fetch}){
 assertAuthorizationId(id);
 const r=await fetchImpl(`${url}/auth/v1/oauth/authorizations/${id}`,{headers:{apikey:key,authorization:`Bearer ${token}`},cache:'no-store'});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.message||data.error||'Запрос авторизации не найден или истёк.');return data;
}
export async function decideAuthorization({url,key,token,id,approved,fetchImpl=fetch}){
 assertAuthorizationId(id);
 const r=await fetchImpl(`${url}/auth/v1/oauth/authorizations/${id}/consent`,{
  method:'POST',headers:{apikey:key,authorization:`Bearer ${token}`,'content-type':'application/json'},
  body:JSON.stringify({action:approved?'approve':'deny'}),cache:'no-store'
 });
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.message||data.error||'Не удалось подтвердить подключение.');
 if(!data.redirect_url)throw Error('Supabase не вернул ссылку перехода.');
 return safeChatGPTCallback(data.redirect_url);
}
