import test from 'node:test';import assert from 'node:assert/strict';import worker from '../worker/mcp.mjs';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_test',MCP_PUBLIC_URL:'https://worker.example/mcp',SUPABASE_OAUTH_CLIENT_ID:'oauth-client'};
test('health reports OAuth metadata config, not claimed e2e verification',async()=>{
 const r=await worker.fetch(new Request('https://host/health'),env);assert.equal(r.status,200);assert.equal((await r.json()).oauth_e2e_verified,false);
});
test('unauthorized MCP requests trigger OAuth before tool discovery',async()=>{
 const base={method:'POST',headers:{'content-type':'application/json'}};
 const request=(method,params)=>new Request('https://host/mcp',{...base,body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 const init=await worker.fetch(request('initialize',{protocolVersion:'2025-06-18'}),env);assert.equal(init.status,401);
 assert.match(init.headers.get('www-authenticate'),/oauth-protected-resource/);
 const list=await worker.fetch(request('tools/list'),env);assert.equal(list.status,401);
 const call=await worker.fetch(request('tools/call',{name:'list_worlds',arguments:{}}),env);assert.equal(call.status,401);
 assert.match(call.headers.get('www-authenticate'),/oauth-protected-resource/);
});
test('MCP advertises Supabase OAuth resource with HTTPS',async()=>{
 const r=await worker.fetch(new Request('https://host/.well-known/oauth-protected-resource'),env);
 assert.equal(r.status,200);const data=await r.json();assert.equal(data.resource,env.MCP_PUBLIC_URL);
 assert.deepEqual(data.authorization_servers,['https://example.supabase.co/auth/v1']);
});
test('unsupported endpoints remain closed',async()=>{
 const r=await worker.fetch(new Request('https://host/private'),env);assert.equal(r.status,404);
});
