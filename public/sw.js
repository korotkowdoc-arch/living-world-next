/** Offline app shell only. NEVER cache Supabase, MCP, responses, or personal story data. */
const CACHE='living-world-next-shell-v7';
const SHELL=['/','/index.html','/style.css','/app.js','/manifest.webmanifest','/icon.svg',
 '/core/world.mjs','/core/continuity.mjs','/core/revisions.mjs','/core/directives.mjs','/core/portable.mjs','/core/literary-review.mjs','/core/request-identity.mjs',
 '/lib/session.mjs','/lib/storage.mjs','/lib/public-config.mjs','/lib/oauth-consent.mjs','/lib/oauth-return.mjs'];
self.addEventListener('install',e=>{
 e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
 e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('living-world-next-shell-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
 const request=e.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 const parsed=new URL(request.url);
 if(parsed.search)return; // OAuth IDs in query strings cannot be cached.
 const path=parsed.pathname;
 if(!SHELL.includes(path))return; // Never cache OAuth consent, API routes or personal data.
 e.respondWith(fetch(request).then(response=>{
   if(response.ok && response.type==='basic'){
     const clone=response.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(request,clone)));
   }
   return response;
 }).catch(async()=>await caches.match(request)||await caches.match('/index.html')));
});
