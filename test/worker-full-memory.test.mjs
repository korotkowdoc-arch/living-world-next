import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/mcp.mjs';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_key',MCP_PUBLIC_URL:'https://worker.example/mcp',SUPABASE_OAUTH_CLIENT_ID:'next-client'};
const u='11111111-1111-4111-8111-111111111111',w='22222222-2222-4222-8222-222222222222';
const b='33333333-3333-4333-8333-333333333333',head='44444444-4444-4444-8444-444444444444';
const reqId='55555555-5555-4555-8555-555555555555';
const encoded=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=[encoded({alg:'RS256'}),encoded({iss:'https://example.supabase.co/auth/v1',sub:u,role:'authenticated',client_id:'next-client',aud:'authenticated',exp:Math.floor(Date.now()/1000)+5000,iat:Math.floor(Date.now()/1000)}),'signature'].join('.');
const call=(name,args)=>new Request(env.MCP_PUBLIC_URL,{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
const requestHandler=handler=>async(url,options={})=>handler(new URL(url),options)||Response.json({message:'Unmatched URL: '+url},{status:404});
const world={id:w,title:'История',seed:'Мир в Хогвартсе',directive_version:3,auto_save:true,active_branch_id:b};
const smallHistory=[{id:head,parent_scene_id:null,body:'Гарри повернул за угол.',world_time:'1991',events:[]}];
test('MCP reads more than 1000 annotated scenes without large literary bodies',async()=>{
 const old=globalThis.fetch;let pages=0;
 const length=1201,events=Array.from({length},(_,i)=>({id:i===0?head:'memory-'+i,parent_scene_id:i===length-1?null:'memory-'+(i+1),events:i===length-1?[{id:'plan1',type:'plan',actor:'Драко',plan_id:'strategy',action:'start',goal:'Одержать победу',evidence:'Драко решил победить'}]:[],world_time:'1991'}));
 globalThis.fetch=requestHandler((p,opt)=>{
  if(p.pathname==='/auth/v1/user')return Response.json({id:u});
  if(p.pathname==='/rest/v1/nw_worlds')return Response.json([world]);
  if(p.pathname==='/rest/v1/nw_branches')return Response.json([{id:b,head_scene_id:head}]);
  if(p.pathname==='/rest/v1/nw_directives')return Response.json([]);
  if(p.pathname==='/rest/v1/rpc/nw_active_memory_page'){
   pages++;const args=JSON.parse(opt.body);assert.equal(args.p_expected_head,head);
   return Response.json(events.slice(args.p_offset,args.p_offset+args.p_limit));
  }
  if(p.pathname==='/rest/v1/rpc/nw_active_history')return Response.json(smallHistory);
 });
 try{
  const res=await worker.fetch(call('get_world_context',{world_id:w}),env);
  const obj=(await res.json()).result;
  assert.equal(obj.isError,false);assert.ok(pages>=7);
  assert.equal(obj.structuredContent.confirmed_scene_count,length);
  assert.equal(obj.structuredContent.memory_complete,true);
  assert.equal(obj.structuredContent.memory.records.plans[0].goal,'Одержать победу');
  assert.equal(obj.structuredContent.memory_is_sample,true);
  assert.equal(obj.structuredContent.memory.counts.plans,1);
  assert.ok(obj.structuredContent.memory_retrieval_tools.includes('get_actor_history'));
  assert.ok(!obj.structuredContent.warning.includes('Only latest 1000'));
  const agency=await worker.fetch(call('get_npc_agency',{world_id:w,actor:'Драко'}),env);
  assert.equal((await agency.json()).result.structuredContent.plans.length,1);
 }finally{globalThis.fetch=old;}
});
test('existing request_id can be safely retried after active branch and rules change',async()=>{
 const old=globalThis.fetch;let rpcCalls=0;
 globalThis.fetch=requestHandler((p,opt)=>{
  if(p.pathname==='/auth/v1/user')return Response.json({id:u});
  if(p.pathname==='/rest/v1/nw_worlds')return Response.json([{...world,active_branch_id:'different-branch',directive_version:5,auto_save:false}]);
  if(p.pathname==='/rest/v1/rpc/nw_scene_receipt')return Response.json({saved:true,scene_id:head,branch_id:b});
  if(p.pathname==='/rest/v1/rpc/nw_commit_scene'){rpcCalls++;return Response.json(head);}
 });
 try{
  const res=await worker.fetch(call('save_scene',{world_id:w,branch_id:b,expected_head:null,expected_rules_version:3,request_id:reqId,body:'Гарри закончил этот эпизод.',events:[]}),env);
  const data=(await res.json()).result;
  assert.equal(data.isError,false);assert.equal(data.structuredContent.reused,true);assert.equal(rpcCalls,1);
 }finally{globalThis.fetch=old;}
});
test('a truly NEW write still cannot bypass autosave, active-branch or rules protection',async()=>{
 const old=globalThis.fetch;let commitCalls=0;
 globalThis.fetch=requestHandler((p,opt)=>{
  if(p.pathname==='/auth/v1/user')return Response.json({id:u});
  if(p.pathname==='/rest/v1/nw_worlds')return Response.json([{...world,auto_save:false}]);
  if(p.pathname==='/rest/v1/rpc/nw_scene_receipt')return Response.json({saved:false});
  if(p.pathname==='/rest/v1/rpc/nw_commit_scene'){commitCalls++;return Response.json(head);}
 });
 try{
  const res=await worker.fetch(call('save_scene',{world_id:w,branch_id:b,expected_head:null,expected_rules_version:3,request_id:reqId,body:'Это ещё не подтверждено.',events:[]}),env);
  assert.equal((await res.json()).result.isError,true);assert.equal(commitCalls,0);
 }finally{globalThis.fetch=old;}
});
test('exact scene lookup labels an inactive alternative, preventing cross-branch memory leakage',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=requestHandler((p,opt)=>{
  if(p.pathname==='/auth/v1/user')return Response.json({id:u});
  if(p.pathname==='/rest/v1/nw_worlds')return Response.json([world]);
  if(p.pathname==='/rest/v1/nw_scenes')return Response.json([{id:head,world_id:w,body:'В отменённой ветке враги вдруг стали друзьями.',events:[]}]);
  if(p.pathname==='/rest/v1/rpc/nw_scene_in_active_branch')return Response.json(false);
 });
 try{
  const res=await worker.fetch(call('get_story_scene',{world_id:w,scene_id:head}),env);
  const body=(await res.json()).result.structuredContent;
  assert.equal(body.in_active_branch,false);assert.match(body.memory_policy,/not evidence/);
 }finally{globalThis.fetch=old;}
});

test('focused recall uses old source hits to retrieve historical notes beyond the recent scan cap',async()=>{
 const old=globalThis.fetch,older='66666666-6666-4666-8666-666666666666';
 const recent={id:head,parent_scene_id:older,world_time:'1994-09-05T17:08',events:[]};
 const past={id:older,parent_scene_id:null,world_time:'1994-08-13T19:32',events:[]};
 let targeted=0;
 const note=(scene_id,note_key,summary)=>({scene_id,note_key,note:{kind:'other',summary,quote:summary,actors:['Hero']}});
 globalThis.fetch=requestHandler((p,opt)=>{
  if(p.pathname==='/auth/v1/user')return Response.json({id:u});
  if(p.pathname==='/rest/v1/nw_worlds')return Response.json([world]);
  if(p.pathname==='/rest/v1/nw_branches')return Response.json([{id:b,head_scene_id:head}]);
  if(p.pathname==='/rest/v1/rpc/nw_active_memory_page'){const a=JSON.parse(opt.body);return Response.json([recent,past].slice(a.p_offset,a.p_offset+a.p_limit));}
  if(p.pathname==='/rest/v1/rpc/nw_search_history')return Response.json([{scene_id:older,snippet:'Редкие очки',world_time:past.world_time}]);
  if(p.pathname==='/rest/v1/rpc/nw_read_memory_notes'){
   const a=JSON.parse(opt.body);if(a.p_scene_id===older){targeted++;return Response.json([note(older,'old-glasses','Редкие очки')]);}
   if(a.p_actor)return Response.json([]);
   return Response.json(Array.from({length:40},(_,i)=>note(head,'recent-'+(a.p_offset+i),'Недавняя заметка')));
  }
 });
 try{
  const res=await worker.fetch(call('get_scene_context',{world_id:w,actors:['Hero'],queries:['очки']}),env);
  const data=(await res.json()).result;assert.equal(data.isError,false);
  const h=data.structuredContent.historical_index;assert.equal(targeted,1);assert.equal(h.notes[0].scene_id,older);
  assert.equal(h.scan_complete,false);assert.equal(h.targeted_source_lookup.loaded,1);
 }finally{globalThis.fetch=old;}
});
