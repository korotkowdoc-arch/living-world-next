import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/mcp.mjs';
import {actorMemoryEvidence} from '../public/core/actor-memory.mjs';

const owner='11111111-1111-4111-8111-111111111111';
const wid='22222222-2222-4222-8222-222222222222';
const bid='33333333-3333-4333-8333-333333333333';
const sid='44444444-4444-4444-8444-444444444444';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_test',MCP_PUBLIC_URL:'https://next.example/mcp',SUPABASE_OAUTH_CLIENT_ID:'next-client'};
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const jwt=[enc({alg:'RS256'}),enc({iss:env.SUPABASE_URL+'/auth/v1',sub:owner,role:'authenticated',aud:'authenticated',client_id:env.SUPABASE_OAUTH_CLIENT_ID,exp:Math.floor(Date.now()/1000)+3600}),'signature'].join('.');
const call=args=>new Request(env.MCP_PUBLIC_URL,{method:'POST',headers:{authorization:'Bearer '+jwt},body:JSON.stringify({jsonrpc:'2.0',id:15,method:'tools/call',params:{name:'get_actor_memory',arguments:args}})});

test('textual mentions are explicitly unproven, never silently promoted to relationship facts',()=>{
 const result=actorMemoryEvidence({actor:'Малфой',headSceneId:sid,
  confirmedEvents:[{scene_id:sid,event:{type:'character',evidence:'Малфой ушёл.'}}],
  textMentions:[{scene_id:sid,snippet:'Малфой сказал: я не буду с ним мириться.'}]});
 assert.equal(result.confirmed_events[0].confidence,'structured_confirmed');
 assert.equal(result.literal_mentions[0].confidence,'literal_text_only');
 assert.match(result.reliability,/not proof/);
 assert.equal(result.literal_mentions[0].event,undefined);
});
test('authenticated MCP reads archived mentions and structured NPC events on one active head',async()=>{
 const original=globalThis.fetch;
 let readWorlds=0,readBranches=0;
 globalThis.fetch=async (url,opts)=>{
  const p=new URL(url);
  if(p.pathname==='/auth/v1/user')return Response.json({id:owner});
  if(p.pathname==='/rest/v1/nw_worlds'){readWorlds++;return Response.json([{id:wid,active_branch_id:bid}]);}
  if(p.pathname==='/rest/v1/nw_branches'){readBranches++;return Response.json([{id:bid,head_scene_id:sid}]);}
  if(p.pathname==='/rest/v1/rpc/nw_actor_history')return Response.json([{scene_id:sid,event:{type:'relationship',evidence:'Малфой покачал головой.'}}]);
  if(p.pathname==='/rest/v1/rpc/nw_search_history')return Response.json([{scene_id:sid,snippet:'Малфой не хотел даже говорить с Гарри.'}]);
  if(p.pathname==='/rest/v1/rpc/nw_active_memory_page')return Response.json([{id:sid,parent_scene_id:null,world_time:null,events:[{id:'note',type:'world',scene_memory_version:1,memory_kind:'claim',domain:'relationships',actors:['Малфой'],actor:'Малфой',summary:'Он заявил, что не хочет разговаривать.',evidence:'Малфой не хотел даже говорить с Гарри.'}]}]);
  return Response.json({error:'unexpected '+p.pathname},{status:404});
 };
 try{
  const response=await worker.fetch(call({world_id:wid,actor:'Малфой',limit:20}),env);
  assert.equal(response.status,200);
  const content=(await response.json()).result.structuredContent;
  assert.equal(content.actor,'Малфой');
  assert.equal(content.active_branch_only,true);
  assert.equal(content.confirmed_events.length,1);
  assert.equal(content.literal_mentions.length,1);
  assert.equal(content.literal_mentions[0].confidence,'literal_text_only');
  assert.equal(content.active_head_scene_id,sid);
  assert.equal(content.scene_memory_recall.notes[0].memory_kind,'claim');
  assert.equal(content.scene_memory_recall.canonical,false);
  assert.equal(readWorlds,3);assert.equal(readBranches,3);
 }finally{globalThis.fetch=original;}
});
test('MCP actor recall refuses mismatched branch or changed ancestry',async()=>{
 const old=globalThis.fetch;let count=0;
 globalThis.fetch=async url=>{
  const p=new URL(url);
  if(p.pathname==='/auth/v1/user')return Response.json({id:owner});
  if(p.pathname==='/rest/v1/nw_worlds')return Response.json([{id:wid,active_branch_id:bid}]);
  if(p.pathname==='/rest/v1/nw_branches')return Response.json([{id:bid,head_scene_id:++count===1?sid:null}]);
  if(p.pathname.startsWith('/rest/v1/rpc/'))return Response.json([]);
  return Response.json({error:'unexpected'},{status:404});
 };
 try{
  const res=await worker.fetch(call({world_id:wid,actor:'Малфой'}),env);
  assert.equal(res.status,200);
  assert.equal((await res.json()).result.isError,true);
 }finally{globalThis.fetch=old;}
});
