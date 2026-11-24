import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getReturnId,authReturnPath,consentPath} from '../public/lib/oauth-return.mjs';
const id='aBcDef0123456789gHIjklmNoPqrsTuv';
test('same origin OAuth return and resume',()=>{
 assert.equal(getReturnId('?oauth_return='+id),id);
 assert.equal(authReturnPath(id),'/?oauth_return='+id);
 assert.equal(consentPath(id),'/oauth/consent.html?authorization_id='+id);
});
test('invalid or duplicated OAuth IDs never form return destinations',()=>{
 for(const q of ['', '?oauth_return=abc', '?oauth_return=../../evil', '?oauth_return='+id+'&oauth_return='+id])
  assert.equal(getReturnId(q),null);
 assert.throws(()=>consentPath('https://evil.example'));
});
test('consent can exit failed login and return via existing NEXT session',()=>{
 const js=readFileSync(new URL('../public/oauth/consent.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/oauth/consent.html',import.meta.url),'utf8');
 assert.match(js,/Войти через главную страницу NEXT/);
 assert.match(html,/href="\/" class="text-button"/);
 assert.match(js,/password.value='';throw e;/);
});
test('main account redirects after login and PWA cache never stores OAuth params',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.match(app,/await signIn\(email.value,password.value\);password.value='';if\(!resumeOAuth\(\)\)await openLanding\(\)/);
 assert.match(app,/if\(!\(readSession\(\)&&resumeOAuth\(\)\)\)void busy\(openLanding\)/);
 assert.match(app,/return link\?openLinkedScene\(link\):openWorlds\(\)/);
 assert.match(sw,/if\(parsed.search\)return;/);
});
