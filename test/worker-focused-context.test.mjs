import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/mcp.mjs';
const owner='11111111-1111-4111-8111-111111111111',wid='22222222-2222-4222-8222-222222222222',bid='33333333-3333-4333-8333-333333333333',head='44444444-4444-4444-8444-444444444444';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_test',MCP_PUBLIC_URL:'https://next.example/mcp',SUPABASE_OAUTH_CLIENT_ID:'next-client'};
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const jwt=[enc({alg:'RS256'}),enc({iss:env.SUPABASE_URL+'/auth/v1',sub:owner,role:'authenticated',aud:'authenticated',client_id:env.SUPABASE_OAUTH_CLIENT_ID,exp:Math.floor(Date.now()/1000)+3600}),'signature'].join('.');
const call=(name,args)=>new Request(env.MCP_PUBLIC_URL,{method:'POST',headers:{authorization:'Bearer '+jwt},body:JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/call',params:{name,arguments:{world_id:wid,...args}}})});
function mock(change=false){let branchReads=0;return async url=>{
 const p=new URL(url);
 if(p.pathname==='/auth/v1/user')return Response.json({id:owner});
 if(p.pathname==='/rest/v1/nw_worlds')return Response.json([{id:wid,active_branch_id:bid}]);
 if(p.pathname==='/rest/v1/nw_branches')return Response.json([{id:bid,head_scene_id:change&&++branchReads>1?null:head}]);
 if(p.pathname==='/rest/v1/rpc/nw_active_memory_page')return Response.json([{id:head,parent_scene_id:null,events:[
  {id:'a',type:'character',name:'А',state_patch:{injury:'Ушиб'},evidence:'Ушиб'},
  {id:'k',type:'knowledge',actor:'Б',fact:'тайное письмо',channel:'heard',evidence:'тайное письмо'}]}]);
 if(p.pathname==='/rest/v1/rpc/nw_search_history')return Response.json([{scene_id:head,snippet:'тайное письмо'}]);
 return Response.json({error:'unexpected '+p.pathname},{status:404});
};}
test('focused context is authenticated, pins branch and exposes separate literal evidence',async()=>{
 const old=globalThis.fetch;globalThis.fetch=mock();
 try{
  const result=(await (await worker.fetch(call('get_scene_context',{actors:['А'],queries:['письмо']}),env)).json()).result.structuredContent;
  assert.equal(result.head_scene_id,head);
  assert.equal(result.memory.records.people[0].state_fields[0].value,'Ушиб');
  assert.equal(result.memory.records.knowledge[0].actor,'Б');
  assert.equal(result.literal_hits[0].kind,'literal_text_only');
  assert.equal(result.literal_hits[0].hits[0].scene_id,head);
  const profile=(await (await worker.fetch(call('get_character_state',{actor:'А'}),env)).json()).result.structuredContent;
  assert.equal(profile.character.state_fields[0].value,'Ушиб');
 }finally{globalThis.fetch=old;}
});
test('focus refuses concurrent branch head change',async()=>{
 const old=globalThis.fetch;globalThis.fetch=mock(true);
 try{
  const result=(await (await worker.fetch(call('get_scene_context',{actors:['А']}),env)).json()).result;
  assert.equal(result.isError,true);
 }finally{globalThis.fetch=old;}
});
