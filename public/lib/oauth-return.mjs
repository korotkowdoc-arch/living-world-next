import {isAuthorizationId} from './oauth-consent.mjs';
export function getReturnId(search){
 const params=typeof search==='string'?new URLSearchParams(search):search;
 const ids=params?.getAll?.('oauth_return')||[];
 return ids.length===1&&isAuthorizationId(ids[0])?ids[0]:null;
}
export function authReturnPath(id){
 if(!isAuthorizationId(id))throw Error('Неправильный OAuth-запрос');
 return '/?oauth_return='+encodeURIComponent(id);
}
export function consentPath(id){
 if(!isAuthorizationId(id))throw Error('Неправильный OAuth-запрос');
 return '/oauth/consent.html?authorization_id='+encodeURIComponent(id);
}
