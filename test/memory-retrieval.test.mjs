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
test('MCP exposes deep memory retrieval only to an authenticated OAuth client',async()=>{
 const env={MCP_PUBLIC_URL:'https://worker.example/mcp',SUPABASE_URL:'https://example.supabase.co',SUPABASE_OAUTH_CLIENT_ID:'test-memory-client',SUPABASE_ANON_KEY:'sb_publishable_test'};
 const user='11111111-1111-4111-8111-111111111111';
 const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const token=[b64({alg:'RS256'}),b64({iss:'https://example.supabase.co/auth/v1',role:'authenticated',aud:'authenticated',client_id:'test-memory-client',sub:user,exp:Math.floor(Date.now()/1000)+3600}),'signature'].join('.');
 const req=(name,params={},access=null)=>new Request('https://worker.example/mcp',{method:'POST',headers:{'content-type':'application/json',...(access?{authorization:'Bearer '+access}:{})},body:JSON.stringify({jsonrpc:'2.0',id:4,method:name,params})});
 const unauth=await worker.fetch(req('tools/list'),env);
 assert.equal(unauth.status,401);
 assert.match(unauth.headers.get('www-authenticate'),/oauth-protected-resource/);
 const fetchBefore=globalThis.fetch;
 globalThis.fetch=async(url)=>new URL(url).pathname==='/auth/v1/user'?Response.json({id:user}):Response.json({message:'Unexpected URL'},{status:404});
 try{
  const r=await worker.fetch(req('tools/list',{},token),env);
  assert.equal(r.status,200);
  const list=(await r.json()).result.tools.map(x=>x.name);
  for(const name of ['search_story_memories','get_story_scene','get_actor_history'])assert.ok(list.includes(name));
 }finally{globalThis.fetch=fetchBefore;}
 const denied=await worker.fetch(req('tools/call',{name:'search_story_memories',arguments:{world_id:user,query:'Секрет'}}),env);
 assert.equal(denied.status,401);
});
test('offline app shell never caches consent screens or Supabase data',()=>{
 const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.match(sw,/if\(!SHELL\.includes\(path\)\)return/);
 assert.doesNotMatch(sw,/oauth\/consent\.html/);
});
