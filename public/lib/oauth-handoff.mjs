/** Transfer only the authorization ID from the shared legacy OAuth screen to NEXT.
 * This runs locally in the browser. It never approves an OAuth request or sends the URL anywhere.
 */
const LEGACY='https://living-world-a3c.pages.dev';
const NEXT='https://living-world-next.pages.dev/oauth/consent.html';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function handoffConsentUrl(input){
 let url;try{url=new URL(String(input||'').trim())}catch{throw Error('Вставь полный адрес старой страницы авторизации.');}
 if(url.origin!==LEGACY||!['/oauth/consent','/oauth/consent/'].includes(url.pathname)||url.username||url.password||url.hash)
  throw Error('Указан не адрес старого экрана авторизации.');
 const id=url.searchParams.get('authorization_id');
 if(!UUID.test(id||''))throw Error('Не найден действительный идентификатор OAuth-запроса.');
 const next=new URL(NEXT);next.searchParams.set('authorization_id',id);
 return next.href;
}
