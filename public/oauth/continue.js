import {handoffConsentUrl} from '../lib/oauth-handoff.mjs';
const form=document.querySelector('#handoff'), status=document.querySelector('#status');
form.addEventListener('submit',event=>{
 event.preventDefault();
 try{location.assign(handoffConsentUrl(form.elements.namedItem('old-url').value));}
 catch(e){status.textContent=e.message||'Не удалось проверить ссылку.';}
});
