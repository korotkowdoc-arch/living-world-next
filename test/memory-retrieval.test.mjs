import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker/mcp.mjs';
const migration=readFileSync(new URL('../supabase/migrations/002_memory_retrieval.sql',import.meta.url),'utf8');
test('search and actor memories are owner scoped and use only active chain',()=>{
 for(const fn of ['nw_search_history','nw_actor_history'])assert.match(migration,new RegExp(fn));
 assert.match(migration,/w\.owner_id=auth\.uid\(\)/);
 assert.match(migration,/b\.id=w\.active_branch_id/);
 assert.match(migration,/a\.parent_scene_id/);
 assert.match(migration,/e\.value->>'actor'/);
 assert.match(migration,/grant execute on function public\.nw_search_history/);
});
test('MCP exposes deep memory retrieval methods without public data',async()=>{
 const env={MCP_PUBLIC_URL:'https://worker.example/mcp',SUPABASE_URL:'https://example.supabase.co'};
 const req=(name,params={})=>new Request('https://worker.example/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:4,method:name,params})});
 const r=await worker.fetch(req('tools/list'),env);
 const list=(await r.json()).result.tools.map(x=>x.name);
 for(const name of ['search_story_memories','get_story_scene','get_actor_history'])assert.ok(list.includes(name));
 const unauth=await worker.fetch(req('tools/call',{name:'search_story_memories',arguments:{world_id:'11111111-1111-4111-8111-111111111111',query:'Секрет'}}),env);
 assert.equal(unauth.status,401);
});
test('offline app shell never caches consent screens or Supabase data',()=>{
 const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.match(sw,/if\(!SHELL\.includes\(path\)\)return/);
 assert.doesNotMatch(sw,/oauth\/consent\.html/);
});
