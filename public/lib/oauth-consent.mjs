/** OAuth consent REST calls, with the authenticated owner's Supabase session. */
export function assertAuthorizationId(id){
 if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
  throw Error('Некорректный идентификатор запроса авторизации.');
 return id;
}
export function safeChatGPTCallback(raw){
 const dest=new URL(raw);
 if(dest.protocol!=='https:'||dest.username||dest.password||dest.hostname!=='chatgpt.com')
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
