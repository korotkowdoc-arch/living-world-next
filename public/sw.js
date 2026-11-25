/** Offline app shell only. NEVER cache Supabase, MCP, responses, or personal story data. */
const CACHE='living-world-next-shell-v81';
const SHELL=['/','/index.html','/style.css','/app.js','/manifest.webmanifest','/icon.svg',
 '/core/durable-projection.mjs','/core/snapshot-handler.mjs','/core/family-goals.mjs','/core/expense-care.mjs','/core/duty-career.mjs','/core/households-careers.mjs','/core/curriculum-supply.mjs','/core/prepaid-travel.mjs','/core/projection-cache.mjs','/core/room-layout.mjs','/core/market-home.mjs','/core/property-lessons.mjs','/core/social-dashboard.mjs','/core/ancestry-cache.mjs','/core/home-systems.mjs','/core/work-systems.mjs','/core/npc-initiatives.mjs','/core/npc-life.mjs','/core/npc-long-life.mjs','/core/travel-services.mjs','/core/player-opportunities.mjs','/core/life-calendar.mjs','/core/player-life.mjs','/core/menu-history.mjs','/core/task-tracker.mjs','/core/state-delta.mjs','/core/causal-memory.mjs','/core/individual-memory.mjs','/core/personality-evolution.mjs','/core/game-menu.mjs','/core/personal-menu.mjs','/core/menu-ru.mjs','/core/native-menu.mjs','/core/section-navigation.mjs','/core/world-depth.mjs','/core/advanced-world.mjs','/core/visual-world.mjs','/core/wealth-world.mjs','/core/documents-world.mjs','/core/magic-world.mjs','/core/magic-society.mjs','/core/magic-seeds.mjs','/core/ui-preferences.mjs','/core/narration-budget.mjs','/core/cloud-sync.mjs','/core/reader.mjs','/core/scene-links.mjs','/core/actor-memory.mjs','/core/story-drivers.mjs','/core/world-time.mjs','/core/economy.mjs','/core/character-state.mjs','/core/scene-context.mjs','/core/living-world.mjs','/core/annotation-passages.mjs','/core/staged-import.mjs','/core/social-world.mjs','/core/knowledge.mjs','/core/memory-notes.mjs','/core/relationship-memory.mjs','/core/activities.mjs','/core/consequences.mjs','/core/growth.mjs','/core/world-dynamics.mjs','/core/community-life.mjs','/core/civic-life.mjs','/core/operational-life.mjs','/core/civilization-review.mjs','/core/story-turn.mjs','/core/ancestry-reader.mjs','/core/scene-memory-routing.mjs','/core/scene-draft.mjs','/core/world.mjs','/core/continuity.mjs','/core/revisions.mjs','/core/directives.mjs','/core/portable.mjs','/core/literary-review.mjs','/core/request-identity.mjs',
 '/lib/visual-storage.mjs','/lib/session.mjs','/lib/storage.mjs','/lib/public-config.mjs','/lib/oauth-consent.mjs','/lib/oauth-return.mjs'];
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
 }).catch(async()=>{
  const cached=await caches.match(request);
  if(cached)return cached;
  if(request.mode==='navigate')return await caches.match('/index.html')||
    new Response('Offline page unavailable',{status:503,headers:{'content-type':'text/plain'}});
  // An HTML document is NOT a valid JS module, stylesheet, or manifest.
  return new Response('Offline asset unavailable',{status:503,headers:{'content-type':'text/plain'}});
 }));
});
