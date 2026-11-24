import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/mcp.mjs';

const owner='11111111-1111-4111-8111-111111111111';
const wid='22222222-2222-4222-8222-222222222222';
const bid='33333333-3333-4333-8333-333333333333';
const oldest='44444444-4444-4444-8444-444444444444';
const head='55555555-5555-4555-8555-555555555555';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_test',
 MCP_PUBLIC_URL:'https://next.example/mcp',SUPABASE_OAUTH_CLIENT_ID:'next-client'};
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const jwt=[enc({alg:'RS256'}),enc({iss:env.SUPABASE_URL+'/auth/v1',sub:owner,
 role:'authenticated',aud:'authenticated',client_id:env.SUPABASE_OAUTH_CLIENT_ID,
 exp:Math.floor(Date.now()/1000)+3600}),'signature'].join('.');
const call=(name='get_world_agenda')=>new Request(env.MCP_PUBLIC_URL,{
 method:'POST',headers:{authorization:'Bearer '+jwt,'content-type':'application/json'},
 body:JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/call',
  params:{name,arguments:{world_id:wid}}})});
const records=[
 {id:head,parent_scene_id:oldest,world_time:'1991-09-02 10:00',events:[]},
 {id:oldest,parent_scene_id:null,world_time:'1991-09-01 08:00',events:[
  {id:'promise',type:'commitment',commitment_id:'letter',
   actor:'Гарри',description:'Передать письмо',status:'pending',
   due_at:'1991-09-01 12:00',evidence:'Я передам письмо в полдень.'}
 ]}
];
const mockFetch=(headChanges=false)=>{let checks=0;return async url=>{
 const p=new URL(url);
 if(p.pathname==='/auth/v1/user')return Response.json({id:owner});
 if(p.pathname==='/rest/v1/nw_worlds')
  return Response.json([{id:wid,active_branch_id:bid,seed:'Хогвартс 1991',directive_version:0,auto_save:true}]);
 if(p.pathname==='/rest/v1/nw_branches'){
  checks++;
  return Response.json([{id:bid,head_scene_id:headChanges&&checks>=3?null:head}]);
 }
 if(p.pathname==='/rest/v1/rpc/nw_active_memory_page')return Response.json(records);
 return Response.json({error:'Unexpected '+p.pathname},{status:404});
};};
test('MCP agenda reads authenticated active branch, marks past deadline unverified',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=mockFetch();
 try{
  const response=await worker.fetch(call(),env);
  assert.equal(response.status,200);
  const output=(await response.json()).result.structuredContent;
  assert.equal(output.latest_recorded_time,'1991-09-02 10:00');
  assert.equal(output.memory_complete,true);
  assert.equal(output.active_branch_id,bid);
  assert.equal(output.items.length,1);
  assert.equal(output.items[0].timing,'date_past_status_requires_verification');
  assert.equal(output.items[0].source.scene_id,oldest);
  assert.match(output.clock_policy,/no automatic deadline failure/i);
 }finally{globalThis.fetch=previous;}
});
test('MCP agenda never serves mixed-world memory after a concurrent branch head change',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=mockFetch(true);
 try{
  const response=await worker.fetch(call(),env);
  assert.equal(response.status,200);
  const output=(await response.json()).result;
  assert.equal(output.isError,true);
 }finally{globalThis.fetch=previous;}
});
