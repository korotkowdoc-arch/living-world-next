import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const sw=read('../public/sw.js');
const app=read('../public/app.js');
test('every static ES import required by iPhone app is in offline shell',()=>{
 const imports=[...app.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)].map(x=>x[1].slice(1));
 for(const source of imports)assert.ok(sw.includes("'"+source+"'"),`Missing from offline shell: ${source}`);
});
test('PWA shell never fetch-caches OAuth pages or cross-origin user data',()=>{
 assert.match(sw,/new URL\(request.url\).origin!==self.location.origin/);
 assert.match(sw,/if\(!SHELL.includes\(path\)\)return/);
 assert.doesNotMatch(sw,/['"]\/oauth\/consent\.html['"]/);
});

test('missing offline JS never falls back to index HTML as a module',()=>{
 assert.match(sw,/request.mode==='navigate'/);
 assert.match(sw,/Offline asset unavailable/);
 assert.doesNotMatch(sw,/caches.match\(request\)\|\|await caches.match\('\/index.html'\)/);
});
