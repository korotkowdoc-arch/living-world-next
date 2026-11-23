import test from 'node:test';import assert from 'node:assert/strict';import worker from '../worker/mcp.mjs';
const env={SUPABASE_URL:'https://owner.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_test',MCP_PUBLIC_URL:'https://next.example/mcp',SUPABASE_OAUTH_CLIENT_ID:'new-world-client'};
const user='11111111-1111-4111-8111-111111111111';
const worldId='22222222-2222-4222-8222-222222222222';
const branchId='33333333-3333-4333-8333-333333333333';
const sceneId='44444444-4444-4444-8444-444444444444';
const requestId='55555555-5555-4555-8555-555555555555';
const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const oauthToken=(client='new-world-client')=>[encoded({alg:'RS256',typ:'JWT'}),encoded({iss:'https://owner.supabase.co/auth/v1',sub:user,role:'authenticated',aud:'authenticated',client_id:client,exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)}),'fake-signature'].join('.');
const call=(token,name,args={})=>new Request(env.MCP_PUBLIC_URL,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name,arguments:args}})});
const mockFetch=handler=>async(url,options)=>{const p=new URL(url);return handler(p,options)||new Response(JSON.stringify({message:'Unexpected path: '+p.pathname}),{status:404,headers:{'content-type':'application/json'}});};
test('valid OAuth client-scoped token allows owner list; unregistered client blocked',async()=>{
 const original=globalThis.fetch;let userChecks=0;
 globalThis.fetch=mockFetch((p)=>{
  if(p.pathname==='/auth/v1/user'){userChecks++;return Response.json({id:user});}
  if(p.pathname==='/rest/v1/nw_worlds')return Response.json([{id:worldId,title:'Хогвартс'}]);
 });
 try{
  const bad=await worker.fetch(call(oauthToken('bad-client'),'list_worlds'),env);
  assert.equal(bad.status,401);assert.equal(userChecks,0);
  const good=await worker.fetch(call(oauthToken(),'list_worlds'),env);
  assert.equal(good.status,200);assert.equal((await good.json()).result.structuredContent[0].id,worldId);
  assert.equal(userChecks,1);
 }finally{globalThis.fetch=original;}
});
test('save retries use request_id, not a stale-head precheck in worker',async()=>{
 const original=globalThis.fetch;const invoked=[];
 globalThis.fetch=mockFetch((p,opt)=>{
  if(p.pathname==='/auth/v1/user')return Response.json({id:user});
  if(p.pathname==='/rest/v1/nw_worlds')return Response.json([{id:worldId,seed:'Хогвартс 1991',directive_version:2,auto_save:true,active_branch_id:branchId}]);
  if(p.pathname==='/rest/v1/nw_branches')return Response.json([{id:branchId,head_scene_id:sceneId}]);
  if(p.pathname==='/rest/v1/nw_directives')return Response.json([]);
  if(p.pathname==='/rest/v1/rpc/nw_commit_scene'){invoked.push(JSON.parse(opt.body));return Response.json(sceneId);}
 });
 try{
  const res=await worker.fetch(call(oauthToken(),'save_scene',{world_id:worldId,branch_id:branchId,expected_head:null,expected_rules_version:2,request_id:requestId,body:'Малфой ушёл, не произнеся ни слова.',events:[]}),env);
  assert.equal(res.status,200);assert.equal((await res.json()).result.structuredContent.scene_id,sceneId);
  assert.equal(invoked[0].p_expected_head,null);assert.equal(invoked[0].p_expected_rules_version,2);
 }finally{globalThis.fetch=original;}
});
