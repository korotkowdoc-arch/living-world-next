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

/** Two registered OAuth clients, with exact, non-interchangeable redirect URIs. */
export const BRIDGE_OAUTH_CLIENT_ID='f08a0ef2-bdfc-4d0d-b9ab-ce900c85e0d6';
export const BRIDGE_OWNER_USER_ID='0a3fbf41-c3c6-4743-a88c-f9a7870fd244';
export const BRIDGE_REDIRECT_URIS=Object.freeze([
 'https://chatgpt.com/connector/oauth/HxIGFsGIWFrG',
 'https://chatgpt.com/connector/oauth/3f5za3GcoasC'
]);
export const TRUSTED_OAUTH_CLIENTS=Object.freeze([
 Object.freeze({id:PUBLIC_OAUTH_CLIENT_ID,name:'LIVING WORLD NEXT',kind:'next',redirects:Object.freeze([NEXT_REDIRECT_URI])}),
 Object.freeze({id:BRIDGE_OAUTH_CLIENT_ID,name:'LIVING WORLD Bridge',kind:'bridge',redirects:BRIDGE_REDIRECT_URIS})
]);
function callbackMatches(target,uri){
 const expected=new URL(uri);
 return target.origin===expected.origin&&target.pathname===expected.pathname;
}
export function safeChatGPTCallback(raw){
 let target;try{target=new URL(raw);}catch{throw Error('Некорректная ссылка OAuth.');}
 if(target.protocol!=='https:'||target.username||target.password||target.hash||
    !TRUSTED_OAUTH_CLIENTS.some(c=>c.redirects.some(uri=>callbackMatches(target,uri)))||
    !(target.searchParams.has('code')||target.searchParams.has('error')))
  throw Error('Неизвестный адрес возврата OAuth. Переход заблокирован.');
 return target.href;
}
export function trustedOAuthRequest(details,id){
 assertAuthorizationId(id);
 // Supabase returns a single-use completion URL immediately when consent already exists.
 if(details?.redirect_url&&!details.authorization_id){
  const destination=safeChatGPTCallback(details.redirect_url);
  const url=new URL(destination);
  const client=TRUSTED_OAUTH_CLIENTS.find(c=>c.redirects.some(uri=>callbackMatches(url,uri)));
  if(!client)throw Error('Неизвестный OAuth-клиент.');
  return {client,redirect_url:destination};
 }
 if(details?.authorization_id!==id)throw Error('Неизвестный идентификатор OAuth-запроса.');
 const client=TRUSTED_OAUTH_CLIENTS.find(c=>c.id===details.client?.id&&c.redirects.includes(details.redirect_uri));
 if(!client)throw Error('Неизвестный OAuth-клиент или адрес возврата.');
 return {client,redirect_url:null};
}
export function assertNextAuthorization(details,id){
 const match=trustedOAuthRequest(details,id);
 if(match.client.kind!=='next')throw Error('OAuth-запрос не относится к клиенту LIVING WORLD NEXT.');
 return details;
}
export async function verifyBridgeOwner({url,key,token,fetchImpl=fetch}){
 const res=await fetchImpl(url+'/auth/v1/user',{headers:{apikey:key,authorization:'Bearer '+token},cache:'no-store'});
 if(!res.ok)throw Error('Не удалось подтвердить владельца старого Bridge.');
 const user=await res.json().catch(()=>({}));
 if(user?.id!==BRIDGE_OWNER_USER_ID)throw Error('Этот аккаунт не является владельцем старого LIVING WORLD Bridge.');
 return true;
}
/** Classify OAuth failures without lying about missing/expired requests.
 * Supabase Auth validates Origin against Site URL and Additional Redirect URLs.
 */
export function explainOAuthError(data,status){
 const raw=[data?.msg,data?.error_description,data?.message,data?.error,data?.code].filter(x=>typeof x==='string').join(' ');
 if(/unauthorized request origin/i.test(raw))
  return Object.assign(new Error('Supabase отклонил сайт NEXT (unauthorized request origin). Открой Supabase → Authentication → URL Configuration → Redirect URLs и добавь точный адрес https://living-world-next.pages.dev. Старый Site URL не меняй.'),{code:'OAUTH_ORIGIN_NOT_ALLOWED'});
 if(/authorization request cannot be processed|authorization request is no longer pending/i.test(raw))
  return Object.assign(new Error('Этот OAuth-запрос уже обработан. Повторное чтение или нажатие «Повторить» не помогут. Начни новое подключение в ChatGPT.'),{code:'OAUTH_ALREADY_PROCESSED'});
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
