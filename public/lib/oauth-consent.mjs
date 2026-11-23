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
/** Classify OAuth failures without lying about missing/expired requests.
 * Supabase Auth validates Origin against Site URL and Additional Redirect URLs.
 */
export function explainOAuthError(data,status){
 const raw=[data?.msg,data?.error_description,data?.message,data?.error,data?.code].filter(x=>typeof x==='string').join(' ');
 if(/unauthorized request origin/i.test(raw))
  return Object.assign(new Error('Supabase отклонил сайт NEXT (unauthorized request origin). Открой Supabase → Authentication → URL Configuration → Redirect URLs и добавь точный адрес https://living-world-next.pages.dev. Старый Site URL не меняй.'),{code:'OAUTH_ORIGIN_NOT_ALLOWED'});
 if(status===401||status===403)
  return Object.assign(new Error('Supabase отклонил авторизацию аккаунта. Войди заново в тот же аккаунт, где сохранён мир.'),{code:'OAUTH_USER_AUTH'});
 if(status===404)return Object.assign(new Error('Запрос авторизации не найден или уже истёк. Начни новое подключение в ChatGPT.'),{code:'OAUTH_REQUEST_NOT_FOUND'});
 const detail=raw.replace(/[\r\n]/g,' ').slice(0,180);
 return Object.assign(new Error('Supabase OAuth: HTTP '+status+(detail?' — '+detail:'')),{code:'OAUTH_RESPONSE_ERROR'});
}

export async function authorizationDetails({url,key,token,id,fetchImpl=fetch}){
 assertAuthorizationId(id);
 const r=await fetchImpl(`${url}/auth/v1/oauth/authorizations/${id}`,{headers:{apikey:key,authorization:`Bearer ${token}`},cache:'no-store'});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw explainOAuthError(data,r.status);return data;
}
export async function decideAuthorization({url,key,token,id,approved,fetchImpl=fetch}){
 assertAuthorizationId(id);
 const r=await fetchImpl(`${url}/auth/v1/oauth/authorizations/${id}/consent`,{
  method:'POST',headers:{apikey:key,authorization:`Bearer ${token}`,'content-type':'application/json'},
  body:JSON.stringify({action:approved?'approve':'deny'}),cache:'no-store'
 });
 const data=await r.json().catch(()=>({}));if(!r.ok)throw explainOAuthError(data,r.status);
 if(!data.redirect_url)throw Error('Supabase не вернул ссылку перехода.');
 return safeChatGPTCallback(data.redirect_url);
}
