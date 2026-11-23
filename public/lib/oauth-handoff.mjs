/** Transfer only the authorization ID from the shared legacy OAuth screen to NEXT.
 * This runs locally in the browser. It never approves an OAuth request or sends the URL anywhere.
 */
import {isAuthorizationId} from './oauth-consent.mjs';
const LEGACY='https://living-world-a3c.pages.dev';
const NEXT='https://living-world-next.pages.dev/oauth/consent.html';
export function handoffConsentUrl(input){
 let url;try{url=new URL(String(input||'').trim())}catch{throw Error('Вставь полный адрес старой страницы авторизации.');}
 if(url.origin!==LEGACY||!['/oauth/consent','/oauth/consent/'].includes(url.pathname)||url.username||url.password||url.hash)
  throw Error('Указан не адрес старого экрана авторизации.');
 const ids=url.searchParams.getAll('authorization_id');
 if(ids.length!==1||!isAuthorizationId(ids[0]))
  throw Error('Не найден корректный идентификатор OAuth-запроса. Начни подключение заново в ChatGPT.'); 
 const id=ids[0];
 const next=new URL(NEXT);next.searchParams.set('authorization_id',id);
 return next.href;
}
