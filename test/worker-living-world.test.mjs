import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/mcp.mjs';
const owner='11111111-1111-4111-8111-111111111111',wid='22222222-2222-4222-8222-222222222222',bid='33333333-3333-4333-8333-333333333333',head='44444444-4444-4444-8444-444444444444';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_test',MCP_PUBLIC_URL:'https://next.example/mcp',SUPABASE_OAUTH_CLIENT_ID:'next-client'};
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const jwt=[enc({alg:'RS256'}),enc({iss:env.SUPABASE_URL+'/auth/v1',sub:owner,role:'authenticated',aud:'authenticated',client_id:env.SUPABASE_OAUTH_CLIENT_ID,exp:Math.floor(Date.now()/1000)+3600}),'signature'].join('.');
const call=(name,args)=>new Request(env.MCP_PUBLIC_URL,{method:'POST',headers:{authorization:'Bearer '+jwt},body:JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/call',params:{name,arguments:{world_id:wid,...args}}})});
test('MCP source review requires active ancestry and reads exact source only',async()=>{
 const old=globalThis.fetch;let canonical=true;
 globalThis.fetch=async url=>{
  const p=new URL(url);
  if(p.pathname==='/auth/v1/user')return Response.json({id:owner});
  if(p.pathname==='/rest/v1/nw_worlds')return Response.json([{id:wid,active_branch_id:bid}]);
  if(p.pathname==='/rest/v1/nw_branches')return Response.json([{id:bid,head_scene_id:head}]);
  if(p.pathname==='/rest/v1/rpc/nw_scene_in_active_branch')return Response.json(canonical);
  if(p.pathname==='/rest/v1/nw_scenes')return Response.json([{id:head,body:'Точный текст старой сцены.',events:[]}]);
  if(p.pathname==='/rest/v1/rpc/nw_active_memory_page')return Response.json([{id:head,world_time:'1991-09-02 22:00',events:[]}]);
  return Response.json({error:'unexpected '+p.pathname},{status:404});
 };
 try{
  const r=await (await worker.fetch(call('get_annotation_passages',{scene_id:head}),env)).json();
  assert.equal(r.result.structuredContent.passages[0].quote,'Точный текст старой сцены.');
  const life=await (await worker.fetch(call('get_living_world',{}),env)).json();
  assert.equal(life.result.structuredContent.clock,'1991-09-02 22:00');
  canonical=false;
  const denied=await (await worker.fetch(call('get_annotation_passages',{scene_id:head}),env)).json();
  assert.equal(denied.result.isError,true);
 }finally{globalThis.fetch=old;}
});
