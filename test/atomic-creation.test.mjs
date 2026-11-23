import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import worker from '../worker/mcp.mjs';
const sql=readFileSync(new URL('../supabase/migrations/003_atomic_world_creation.sql',import.meta.url),'utf8');
const store=readFileSync(new URL('../public/lib/storage.mjs',import.meta.url),'utf8');
test('genesis is a single database transaction, including initial locks',()=>{
 assert.match(sql,/wid\s*:=\s*public\.nw_create_world/);
 assert.match(sql,/perform public\.nw_add_directive\(wid/);
 assert.match(sql,/security definer set search_path\s*=\s*''/);
 assert.match(sql,/grant execute on function public\.nw_create_world_v2/);
 assert.match(store,/return rpc\('nw_create_world_v2'/);
 assert.doesNotMatch(store,/if\(explicit\.relationship_locks\.length\)await addDirective/);
});
const user='11111111-1111-4111-8111-111111111111',world='22222222-2222-4222-8222-222222222222';
const env={SUPABASE_URL:'https://owner.supabase.co',SUPABASE_ANON_KEY:'public_fake',MCP_PUBLIC_URL:'https://next.example/mcp',SUPABASE_OAUTH_CLIENT_ID:'new-world-client'};
const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=[enc({alg:'RS256'}),enc({iss:'https://owner.supabase.co/auth/v1',sub:user,role:'authenticated',aud:'authenticated',client_id:'new-world-client',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)}),'signature'].join('.');
test('MCP genesis sends one RPC, preserving raw rule text with two relationship locks',async()=>{
 let calls=[];const old=globalThis.fetch;
 globalThis.fetch=async(url,options={})=>{
  const path=new URL(url).pathname;
  if(path==='/auth/v1/user')return Response.json({id:user});
  if(path==='/rest/v1/rpc/nw_create_world_v2'){
   calls.push(JSON.parse(options.body));return Response.json(world);
  }
  throw Error('Unexpected call: '+path);
 };
 try{
  const description='Гарри и Малфой — враги. Никакого примирения и уважения.';
  const request=new Request(env.MCP_PUBLIC_URL,{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'create_world',arguments:{description}}})});
  const res=await worker.fetch(request,env);const data=(await res.json()).result;
  assert.equal(data.isError,false);assert.equal(calls.length,1);
  assert.equal(calls[0].p_rule_text,description);
  assert.equal(calls[0].p_rule_metadata.relationship_locks[0].forbid_reconciliation,true);
  assert.equal(data.structuredContent.initial_rule_saved_atomically,true);
 }finally{globalThis.fetch=old;}
});
