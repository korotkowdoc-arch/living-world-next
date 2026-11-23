import test from 'node:test';import assert from 'node:assert/strict';import worker from '../worker/mcp.mjs';
const env={SUPABASE_URL:'https://owner.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_test',MCP_PUBLIC_URL:'https://next.example/mcp',SUPABASE_OAUTH_CLIENT_ID:'new-world-client'};
const u='11111111-1111-4111-8111-111111111111', w='22222222-2222-4222-8222-222222222222';
const b='33333333-3333-4333-8333-333333333333', s='44444444-4444-4444-8444-444444444444', r='55555555-5555-4555-8555-555555555555';
const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=[enc({alg:'RS256'}),enc({iss:'https://owner.supabase.co/auth/v1',sub:u,role:'authenticated',aud:'authenticated',client_id:'new-world-client',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)}),'signature'].join('.');
function call(name,args){return new Request(env.MCP_PUBLIC_URL,{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});}
function stub(handler){return async(url,opt={})=>{
 const p=new URL(url);const data=handler(p,opt);
 return data??Response.json({message:'Unexpected '+p.pathname},{status:404});
};}
const world={id:w,seed:'Хогвартс 1991',title:'Хогвартс',directive_version:1,auto_save:true,active_branch_id:b};
const original='Гарри открыл дверь. Малфой ушёл и не вернулся.';
const ev={id:'old',type:'world',key:'door',evidence:'открыл дверь'};
test('new tools advertised for owner read, rule edits and atomic revisions',async()=>{
 const prev=globalThis.fetch;
 globalThis.fetch=stub(p=>p.pathname==='/auth/v1/user'?Response.json({id:u}):null);
 try{
  const request=new Request(env.MCP_PUBLIC_URL,{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
  const res=await worker.fetch(request,env);
  const names=(await res.json()).result.tools.map(x=>x.name);
  for(const name of ['get_scene_receipt','revise_scene','edit_world_directive','toggle_world_directive'])assert.ok(names.includes(name),name);
 }finally{globalThis.fetch=prev;}
});
test('revise_scene forwards one transaction with unchanged prefix and only new events',async()=>{
 const old=globalThis.fetch;let rpcBody;
 globalThis.fetch=stub((p,opt)=>{
  if(p.pathname==='/auth/v1/user')return Response.json({id:u});
  if(p.pathname==='/rest/v1/nw_worlds')return Response.json([world]);
  if(p.pathname==='/rest/v1/nw_scenes')return Response.json([{id:s,body:original,world_time:'1991',events:[ev]}]);
  if(p.pathname==='/rest/v1/nw_directives')return Response.json([]);
  if(p.pathname==='/rest/v1/rpc/nw_revise_scene'){rpcBody=JSON.parse(opt.body);return Response.json({scene_id:r,branch_id:b,reused:false,kept_events:1});}
 });
 try{
  const result=await worker.fetch(call('revise_scene',{world_id:w,source_scene_id:s,prefix:'Гарри открыл дверь.',continuation:'\n\nМалфой остался.',request_id:r,expected_rules_version:1,events:[]}),env);
  const content=(await result.json()).result;
  assert.equal(content.isError,false);assert.equal(content.structuredContent.saved,true);
  assert.equal(rpcBody.p_prefix,'Гарри открыл дверь.');assert.equal(rpcBody.p_source_scene_id,s);
  assert.deepEqual(rpcBody.p_events,[]);assert.equal(rpcBody.p_request_id,r);
 }finally{globalThis.fetch=old;}
});
test('mismatched revision prefix prevents branch creation altogether',async()=>{
 const old=globalThis.fetch;let count=0;
 globalThis.fetch=stub((p)=>{
  if(p.pathname==='/auth/v1/user')return Response.json({id:u});
  if(p.pathname==='/rest/v1/nw_worlds')return Response.json([world]);
  if(p.pathname==='/rest/v1/nw_scenes')return Response.json([{id:s,body:original,events:[ev]}]);
  if(p.pathname.includes('/rpc/')){count++;return Response.json('unsafe');}
 });
 try{
  const out=await worker.fetch(call('revise_scene',{world_id:w,source_scene_id:s,prefix:'Несуществующее начало',continuation:'Другое развитие.',request_id:r,expected_rules_version:1}),env);
  assert.equal((await out.json()).result.isError,true);assert.equal(count,0);
 }finally{globalThis.fetch=old;}
});
test('rule updates are versioned and receipt supports lost-response recovery',async()=>{
 const old=globalThis.fetch;const calls=[];
 globalThis.fetch=stub((p,opt)=>{
  if(p.pathname==='/auth/v1/user')return Response.json({id:u});
  if(p.pathname==='/rest/v1/nw_worlds')return Response.json([world]);
  if(p.pathname.startsWith('/rest/v1/rpc/')){
   calls.push({path:p.pathname,data:JSON.parse(opt.body)});
   return Response.json(p.pathname.endsWith('nw_scene_receipt')?{saved:true,scene_id:s}:true);
  }
 });
 try{
  let response=await worker.fetch(call('edit_world_directive',{world_id:w,directive_id:s,text:'Гарри и Малфой — враги. Никакого примирения и уважения.',expected_rules_version:1}),env);
  assert.equal((await response.json()).result.isError,false);
  const payload=calls[0].data;assert.equal(payload.p_expected_version,1);assert.equal(payload.p_metadata.relationship_locks[0].forbid_respect,true);
  response=await worker.fetch(call('get_scene_receipt',{world_id:w,request_id:r}),env);
  assert.equal((await response.json()).result.structuredContent.saved,true);
 }finally{globalThis.fetch=old;}
});

test('revision retry remains valid after autosave and rule version change',async()=>{
 const old=globalThis.fetch;let called=0;
 globalThis.fetch=stub((p,opt)=>{
  if(p.pathname==='/auth/v1/user')return Response.json({id:u});
  if(p.pathname==='/rest/v1/nw_worlds')return Response.json([{...world,auto_save:false,directive_version:9}]);
  if(p.pathname==='/rest/v1/nw_revisions')return Response.json([{request_id:r}]);
  if(p.pathname==='/rest/v1/rpc/nw_revise_scene'){called++;return Response.json({scene_id:s,branch_id:b,reused:true});}
 });
 try{
  const response=await worker.fetch(call('revise_scene',{world_id:w,source_scene_id:s,prefix:'Гарри открыл дверь.',continuation:' Другой исход.',request_id:r,expected_rules_version:1,events:[]}),env);
  assert.equal((await response.json()).result.structuredContent.reused,true);
  assert.equal(called,1);
 }finally{globalThis.fetch=old;}
});
