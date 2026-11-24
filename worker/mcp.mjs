/**
 * First transport slice: Streamable HTTP MCP, Supabase owner-token validation.
 * Supabase Auth acts as the OAuth 2.1 authorization server; this Worker exposes
 * protected resource metadata and validates OAuth client-bound user tokens.
 * Client registration, consent URLs and end-to-end ChatGPT setup require deployment.
 */
import {buildNextContext,validateScene,replay,validateEconomyAppend} from '../public/core/continuity.mjs';
import {recordedWorldAgenda} from '../public/core/world-time.mjs';
import {livingWorldView} from '../public/core/living-world.mjs';
import {annotationPassages} from '../public/core/annotation-passages.mjs';
import {economyView} from '../public/core/economy.mjs';
import {characterStateView} from '../public/core/character-state.mjs';
import {sceneFocusInput,focusedSceneContext,literalFocusHits} from '../public/core/scene-context.mjs';
import {promptForNarrator} from '../public/core/world.mjs';
import {limitedNarratorMemory,boundedMcpScene} from '../public/core/narration-budget.mjs';
import {actorMemoryEvidence} from '../public/core/actor-memory.mjs';
import {classifyDirective,extractLocks} from '../public/core/directives.mjs';

const version='2025-06-18';
const toolsList=[
  {name:'list_worlds',description:'List the authenticated owner’s worlds.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'get_world_context',description:'Read authoritative world seed, directives, active branch, structured evidence, recent scenes, and narration guidance. Reports incomplete history.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'}},required:['world_id']}},
  {name:'search_story_memories',description:'Search the ENTIRE active branch by exact text substring, including scenes older than 1000. Returns scene IDs and evidence excerpts, never other branches.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},query:{type:'string',minLength:2,maxLength:180},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:40}},required:['world_id','query']}},
  {name:'get_story_scene',description:'Retrieve exact original text of a saved scene by ID, annotated whether it belongs to CURRENT active ancestry. Inactive alternatives are NOT canonical facts.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},scene_id:{type:'string',format:'uuid'}},required:['world_id','scene_id']}},
  {name:'get_scene_context',description:'Retrieve a focused sample for the next scene: selected characters, directed relationships, their knowledge, goals, commitments, property and relevant literal source hits. Search terms are clues, not facts. Use before important callbacks in long stories.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actors:{type:'array',maxItems:8,items:{type:'string',minLength:1,maxLength:140}},queries:{type:'array',maxItems:4,items:{type:'string',minLength:2,maxLength:140}}},required:['world_id'],additionalProperties:false}},
  {name:'get_character_state',description:'Read last explicit character field observations with per-field source scenes, directed relationships, known facts, plans and commitments. Does not infer unrecorded traits, consent, emotions or current whereabouts.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',minLength:1,maxLength:140},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},required:['world_id','actor']}},
  {name:'get_actor_memory',description:'Recall a character from the entire played active branch WITHOUT manual annotation: separately return proven structured events and raw literal mentions with exact source scene IDs. Text mentions are clues, not confirmed facts.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',minLength:2,maxLength:140},limit:{type:'integer',minimum:1,maximum:40},event_offset:{type:'integer',minimum:0},mention_offset:{type:'integer',minimum:0}},required:['world_id','actor']}},
  {name:'get_actor_history',description:'Read an individual character’s proven events with source scene IDs in current valid branch. Long histories can be paged; the output does not prove lack of unmarked events.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',minLength:1,maxLength:140},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},required:['world_id','actor']}},
  {name:'get_branch_history',description:'Read exact saved scenes of active branch, newest first, in pages, without other branches.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},required:['world_id']}},
  {name:'get_world_economy',description:'Read recorded balances and unique item custody in the current branch, optionally by actor. Unknown balances and ownership remain unknown. Paginated evidence with scene IDs.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},required:['world_id']}},
  {name:'get_living_world',description:'Read recorded places, access/status, NPC routine windows, last known locations and recorded offscreen events in the active branch. Schedule is not actual presence.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140},place:{type:'string',maxLength:140},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:40}},required:['world_id']}},
  {name:'get_annotation_passages',description:'Read exact paged passages of a canonical saved scene for narrator-assisted memory extraction. Returns literal source offsets and existing event IDs, NOT extracted facts; no writes.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},scene_id:{type:'string',format:'uuid'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:8}},required:['world_id','scene_id']}},
  {name:'get_world_agenda',description:'Read fictional time anchors, dated unresolved commitments and NPC intentions from confirmed active-branch scenes; no real-time progression or automatic offscreen actions.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'}},required:['world_id']}},
  {name:'get_npc_agency',description:'Read evidence-backed independent NPC plans and their statuses across all annotated active-branch scenes. A plan is not a completed action and there is no hidden background simulation.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},actor:{type:'string',maxLength:140}},required:['world_id']}},
  {name:'create_world',description:'Create a world from one natural-language premise. No advance NPC forms. Returns new world ID.',inputSchema:{type:'object',properties:{description:{type:'string',minLength:8,maxLength:12000},title:{type:'string'},start_marker:{type:'string'}},required:['description']}},
  {name:'add_world_directive',description:'Save the owner’s plain-language world rule verbatim. Never rewrite it to sound more conciliatory.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},text:{type:'string'}},required:['world_id','text']}},
  {name:'save_scene',description:'Atomically save an already narrated scene on the currently selected branch using expected_head and request_id; requires owner opt-in auto_save. Events must have literal evidence.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},branch_id:{type:'string',format:'uuid'},expected_head:{type:['string','null']},expected_rules_version:{type:'integer',minimum:0},request_id:{type:'string',format:'uuid'},body:{type:'string'},world_time:{type:['string','null']},events:{type:'array',items:{type:'object'}}},required:['world_id','branch_id','expected_head','expected_rules_version','request_id','body']}},
  {name:'fork_before_scene',description:'Create a new active alternative branch before the given scene; does not delete older history.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},scene_id:{type:'string',format:'uuid'},name:{type:'string'}},required:['world_id','scene_id']}},
  {name:'get_scene_receipt',description:'Check whether a request_id has already saved a scene, especially after a lost network response; never retry with a NEW id blindly.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},request_id:{type:'string',format:'uuid'}},required:['world_id','request_id']}},
  {name:'revise_scene',description:'Atomically replace a scene in a new branch, retaining an EXACT text prefix and its evidence-backed events. Do not re-use old ending. Old branch is preserved.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},source_scene_id:{type:'string',format:'uuid'},prefix:{type:'string'},continuation:{type:'string'},events:{type:'array',items:{type:'object'}},request_id:{type:'string',format:'uuid'},world_time:{type:['string','null']},expected_rules_version:{type:'integer',minimum:0}},required:['world_id','source_scene_id','prefix','continuation','request_id','expected_rules_version']}},
  {name:'edit_world_directive',description:'Edit an owner-authored natural-language rule in place with persistent before/after audit log and rules-version check.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},directive_id:{type:'string',format:'uuid'},text:{type:'string'},expected_rules_version:{type:'integer'}},required:['world_id','directive_id','text','expected_rules_version']}},
  {name:'toggle_world_directive',description:'Disable or enable an existing world rule with an audit log; old scenes remain unchanged.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},directive_id:{type:'string',format:'uuid'},active:{type:'boolean'},expected_rules_version:{type:'integer'}},required:['world_id','directive_id','active','expected_rules_version']}},
  {name:'switch_branch',description:'Switch active branch to an existing owner branch without copying invalid scenes.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},branch_id:{type:'string',format:'uuid'}},required:['world_id','branch_id']}}
].map(t=>({...t,securitySchemes:[{type:'oauth2',scopes:['openid','email','offline_access']}],_meta:{securitySchemes:[{type:'oauth2',scopes:['openid','email','offline_access']}]}}));

function result(value){return {resultType:'complete',content:[{type:'text',text:JSON.stringify(value,null,2)}],structuredContent:value,isError:false};}
function fail(message){return {resultType:'complete',content:[{type:'text',text:message}],isError:true};}
const error=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
const done=(id,result)=>({jsonrpc:'2.0',id,result});
function mcpResource(env) {
 const url=new URL(env.MCP_PUBLIC_URL);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/mcp')
  throw Error('MCP_PUBLIC_URL must be a public https://.../mcp endpoint');
 return url.toString();
}
function authServer(env){const u=new URL(env.SUPABASE_URL);if(u.protocol!=='https:')throw Error('Invalid Supabase URL');return u.origin+'/auth/v1';}
function resourceMetadata(env){return {resource:mcpResource(env),authorization_servers:[authServer(env)],scopes_supported:['openid','email','offline_access']};}
function challenge(env){return `Bearer resource_metadata="${new URL(mcpResource(env)).origin}/.well-known/oauth-protected-resource", scope="openid email offline_access", error="invalid_token"`;}
function jwtClaims(token) {
 try {
  if(typeof token!=='string'||token.length>16000)throw Error();
  const parts=token.split('.');if(parts.length!==3)throw Error();
  const base64url=s=>atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'='));
  const header=JSON.parse(base64url(parts[0]));
  if(!['RS256','ES256','HS256'].includes(header.alg))throw Error();
  return JSON.parse(base64url(parts[1]));
 }catch{throw Error('Invalid OAuth JWT');}
}
async function verifyOAuthUser(env,token){
 const claims=jwtClaims(token);const now=Math.floor(Date.now()/1000);
 if(!env.SUPABASE_OAUTH_CLIENT_ID||claims.client_id!==env.SUPABASE_OAUTH_CLIENT_ID ||
    claims.iss!==authServer(env)||claims.role!=='authenticated'||
    !Number.isInteger(claims.exp)||claims.exp<=now||!claims.sub)throw Error('OAuth issuer or client mismatch');
 const aud=Array.isArray(claims.aud)?claims.aud:[claims.aud];
 if(!aud.includes('authenticated')&&!aud.includes(mcpResource(env)))throw Error('Invalid OAuth audience');
 // Never rely on decoded JWT alone: Supabase Auth checks signature/session validity.
 const user=await supabase(env,token,'/auth/v1/user');
 if(user?.id!==claims.sub)throw Error('Invalid Supabase session owner');
 return user;
}
const isUuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
function assertUuid(x){if(!isUuid(x))throw Error('Invalid UUID');return x;}

async function supabase(env,token,path,options={}) {
 const base=new URL(env.SUPABASE_URL);
 if(base.protocol!=='https:')throw Error('SUPABASE_URL must use HTTPS');
 const key=env.SUPABASE_ANON_KEY;
 if(!key)throw Error('Missing SUPABASE_ANON_KEY');
 const response=await fetch(new URL(path,base).toString(),{
   method:options.method||'GET',
   headers:{apikey:key,authorization:`Bearer ${token}`,'content-type':'application/json',...(options.headers||{})},
   body:options.body===undefined?undefined:JSON.stringify(options.body),redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(12000)
 });
 const data=await response.text();let parsed;
 try{parsed=data?JSON.parse(data):null;}catch{parsed=data;}
 if(!response.ok)throw Error(parsed?.message||parsed?.error_description||parsed?.error||`Supabase HTTP ${response.status}`);
 return parsed;
}
const ep=encodeURIComponent;
const rest=(env,token,path)=>supabase(env,token,`/rest/v1/${path}`);
const rpc=(env,token,name,args)=>supabase(env,token,`/rest/v1/rpc/${name}`,{method:'POST',body:args});
async function ownerWorld(env,token,id){const rows=await rest(env,token,`nw_worlds?select=*&id=eq.${ep(assertUuid(id))}&limit=1`);if(!rows?.[0])throw Error('World not found');return rows[0];}
async function directives(env,token,id){return rest(env,token,`nw_directives?select=*&world_id=eq.${ep(id)}&order=created_at.asc`);}
async function branch(env,token,world){const rows=await rest(env,token,`nw_branches?select=*&id=eq.${ep(world.active_branch_id)}&world_id=eq.${ep(world.id)}&limit=1`);if(!rows?.[0])throw Error('Active branch not found');return rows[0];}
async function readHistory(env,token,id,limit=100,offset=0){return rpc(env,token,'nw_active_history',{p_world_id:id,p_limit:Math.min(200,limit),p_offset:offset});}
/** Stream ONLY committed structured events from all active ancestors, with a pinned head.
 * Full source text remains available through get_branch_history/get_story_scene/search.
 * Never present a capped projection as complete; a write during pagination aborts the read.
 */
async function readStructuredMemory(env,token,world,head,{maxScenes=50000}={}) {
 if(head==null)return {scenes:[],complete:true};
 const out=[];
 for(let offset=0;offset<maxScenes;offset+=200){
  const page=await rpc(env,token,'nw_active_memory_page',{
   p_world_id:world.id,p_expected_head:head,p_limit:200,p_offset:offset
  });
  if(!Array.isArray(page))throw Error('Invalid structured memory page');
  out.push(...page);
  if(page.length<200){
   const current=await ownerWorld(env,token,world.id);
   if(current.active_branch_id!==world.active_branch_id)throw Error('Active branch changed during memory read');
   const currentBranch=await branch(env,token,current);
   if(currentBranch.head_scene_id!==head)throw Error('History changed during memory read; retry');
   return {scenes:out.reverse(),complete:true};
  }
 }
 return {scenes:out.reverse(),complete:false};
}
async function callTool(name,args,env,token){
 switch(name){
  case 'list_worlds':return await rest(env,token,'nw_worlds?select=id,title,seed,start_marker,active_branch_id,auto_save,updated_at&order=updated_at.desc');
  case 'get_world_context':{
   const world=await ownerWorld(env,token,args.world_id);
   const [rules,active]=await Promise.all([directives(env,token,world.id),branch(env,token,world)]);
   const [history,lastScenes]=await Promise.all([
    readStructuredMemory(env,token,world,active.head_scene_id),
    readHistory(env,token,world.id,3,0)
   ]);
   if((lastScenes[0]?.id??null)!==active.head_scene_id)throw Error('Scene head changed while reading recent history; retry');
   const ctx=buildNextContext({world,directives:rules,scenes:history.scenes,evidencePrevalidated:true,historyComplete:history.complete});
   const compactMemory=limitedNarratorMemory(ctx.memory,{maxChars:18000,maxEntriesPerCategory:12});
   return {...ctx,memory:compactMemory,memory_is_sample:true,
    memory_retrieval_tools:['get_scene_context','get_character_state','get_actor_memory','get_actor_history','get_branch_history','search_story_memories','get_story_scene','get_world_agenda','get_world_economy','get_living_world','get_annotation_passages'],
    head_scene_id:active.head_scene_id,directive_version:world.directive_version,auto_save:world.auto_save,relationship_locks:extractLocks(rules),history_complete:history.complete,
    recent_scenes:lastScenes.slice().reverse().map(s=>boundedMcpScene(s)),
    narration_guidance:promptForNarrator({world,directives:rules,history:lastScenes.slice().reverse().slice(-2),projection:ctx.memory,timeContext:ctx.recorded_agenda}),
    warning:history.complete?ctx.memory_warning:'Structured memory reached the 50,000-scene safety cap; partial data cannot justify facts about earlier history.'};
  }
  case 'search_story_memories':{
   await ownerWorld(env,token,args.world_id);
   const query=String(args.query??'').trim();
   if(query.length<2||query.length>180)throw Error('Query must be 2-180 characters');
   const rows=await rpc(env,token,'nw_search_history',{p_world_id:args.world_id,p_query:query,p_limit:Math.max(1,Math.min(40,Number(args.limit)||25)),p_offset:Math.max(0,Math.floor(Number(args.offset)||0))});
   return {match_type:'literal_substring',world_id:args.world_id,active_branch_only:true,results:rows,more_may_exist:rows.length===Math.max(1,Math.min(40,Number(args.limit)||25))};
  }
  case 'get_story_scene':{
   await ownerWorld(env,token,args.world_id);
   const rows=await rest(env,token,`nw_scenes?select=id,world_id,branch_id,parent_scene_id,body,world_time,events,created_at&world_id=eq.${ep(args.world_id)}&id=eq.${ep(assertUuid(args.scene_id))}&limit=1`);
   if(!rows?.[0])throw Error('Scene not found');
   const active=await rpc(env,token,'nw_scene_in_active_branch',{p_world_id:args.world_id,p_scene_id:args.scene_id});
   return {...rows[0],in_active_branch:active===true,
    memory_policy:active===true?'Confirmed scene in current ancestry':'An alternate/discarded branch: not evidence for CURRENT story'};
  }
  case 'get_scene_context':{
   const focus=sceneFocusInput(args);
   const world=await ownerWorld(env,token,args.world_id);
   const active=await branch(env,token,world);
   const [memory,hits]=await Promise.all([
    readStructuredMemory(env,token,world,active.head_scene_id),
    Promise.all(focus.queries.map(query=>rpc(env,token,'nw_search_history',{p_world_id:world.id,p_query:query,p_limit:8,p_offset:0})))
   ]);
   const projection=replay(memory.scenes,[],{evidencePrevalidated:true});
   const current=await ownerWorld(env,token,world.id),after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==active.head_scene_id)
    throw Error('Story changed while building focused scene context; retry.');
   return {world_id:world.id,active_branch_id:world.active_branch_id,head_scene_id:active.head_scene_id,
    ...focusedSceneContext(projection,focus,{complete:memory.complete,maxChars:18000}),
    literal_hits:focus.queries.map((query,i)=>literalFocusHits(query,hits[i]))};
  }
  case 'get_character_state':{
   const actor=String(args.actor??'').trim();
   if(!actor||actor.length>140)throw Error('Invalid character name');
   const world=await ownerWorld(env,token,args.world_id);
   const active=await branch(env,token,world);
   const memory=await readStructuredMemory(env,token,world,active.head_scene_id);
   const projection=replay(memory.scenes,[],{evidencePrevalidated:true});
   const current=await ownerWorld(env,token,world.id),after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==active.head_scene_id)
    throw Error('Story changed while reading character state; retry.');
   return {world_id:world.id,active_branch_id:world.active_branch_id,head_scene_id:active.head_scene_id,
    ...characterStateView(projection,actor,{complete:memory.complete,offset:args.offset,limit:args.limit})};
  }
  case 'get_actor_memory':{
   const world=await ownerWorld(env,token,args.world_id);
   const before=await branch(env,token,world);
   const actor=String(args.actor??'').trim();
   if(actor.length<2||actor.length>140)throw Error('Actor name must be 2-140 characters');
   const limit=Math.max(1,Math.min(40,Math.floor(Number(args.limit)||20)));
   const eventOffset=Math.max(0,Math.floor(Number(args.event_offset)||0));
   const mentionOffset=Math.max(0,Math.floor(Number(args.mention_offset)||0));
   const [confirmed,mentions]=await Promise.all([
    rpc(env,token,'nw_actor_history',{p_world_id:world.id,p_actor:actor,p_limit:limit,p_offset:eventOffset}),
    rpc(env,token,'nw_search_history',{p_world_id:world.id,p_query:actor,p_limit:limit,p_offset:mentionOffset})
   ]);
   const afterWorld=await ownerWorld(env,token,world.id);
   const after=await branch(env,token,afterWorld);
   if(afterWorld.active_branch_id!==world.active_branch_id||after.head_scene_id!==before.head_scene_id)
    throw Error('Active branch changed while collecting actor memory; retry');
   return {...actorMemoryEvidence({actor,confirmedEvents:confirmed,textMentions:mentions,headSceneId:before.head_scene_id}),
    next_event_offset:eventOffset+confirmed.length,next_mention_offset:mentionOffset+mentions.length,
    more_confirmed_may_exist:confirmed.length===limit,more_mentions_may_exist:mentions.length===limit,
    matches_are_literal:true,active_branch_only:true};
  }
  case 'get_actor_history':{
   await ownerWorld(env,token,args.world_id);
   const actor=String(args.actor??'').trim();
   if(actor.length<1||actor.length>140)throw Error('Invalid character name');
   const limit=Math.max(1,Math.min(100,Number(args.limit)||40));
   const rows=await rpc(env,token,'nw_actor_history',{p_world_id:args.world_id,p_actor:actor,p_limit:limit,p_offset:Math.max(0,Math.floor(Number(args.offset)||0))});
   return {actor,events:rows,more_may_exist:rows.length===limit,source:'confirmed structured events in active ancestry',unannotated_scenes:'not indexed: use search_story_memories or get_branch_history'};
  }
  case 'get_world_economy':{
   const world=await ownerWorld(env,token,args.world_id);
   const active=await branch(env,token,world);
   const memory=await readStructuredMemory(env,token,world,active.head_scene_id);
   const projection=replay(memory.scenes,[],{evidencePrevalidated:true});
   const current=await ownerWorld(env,token,world.id);
   const after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==active.head_scene_id)
    throw Error('Story changed during economy read; retry.');
   return {world_id:world.id,active_branch_id:world.active_branch_id,head_scene_id:active.head_scene_id,
    ...economyView(projection,{actor:args.actor,offset:args.offset,limit:args.limit,complete:memory.complete})};
  }
  case 'get_living_world':{
   const world=await ownerWorld(env,token,args.world_id),active=await branch(env,token,world);
   const memory=await readStructuredMemory(env,token,world,active.head_scene_id);
   const projection=replay(memory.scenes,[],{evidencePrevalidated:true});
   const current=await ownerWorld(env,token,world.id),after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==active.head_scene_id)
    throw Error('Story changed while reading living world; retry.');
   return {world_id:world.id,active_branch_id:world.active_branch_id,head_scene_id:active.head_scene_id,
    ...livingWorldView(memory.scenes,projection,{actor:args.actor,place:args.place,offset:args.offset,limit:args.limit,complete:memory.complete})};
  }
  case 'get_annotation_passages':{
   const world=await ownerWorld(env,token,args.world_id),active=await branch(env,token,world);
   const sceneId=assertUuid(args.scene_id);
   const inBranch=await rpc(env,token,'nw_scene_in_active_branch',{p_world_id:world.id,p_scene_id:sceneId});
   if(inBranch!==true)throw Error('Only current canonical scenes may be reviewed for memory.');
   const rows=await rest(env,token,`nw_scenes?select=id,body,events,world_time&world_id=eq.${ep(world.id)}&id=eq.${ep(sceneId)}&limit=1`);
   if(!rows?.[0])throw Error('Scene not found');
   const current=await ownerWorld(env,token,world.id),after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==active.head_scene_id)
    throw Error('Story changed while reading source passages; retry.');
   return {world_id:world.id,head_scene_id:active.head_scene_id,...annotationPassages(rows[0],{offset:args.offset,limit:args.limit})};
  }
  case 'get_world_agenda':{
   const world=await ownerWorld(env,token,args.world_id);
   const before=await branch(env,token,world);
   const memory=await readStructuredMemory(env,token,world,before.head_scene_id);
   const projection=replay(memory.scenes,[],{evidencePrevalidated:true});
   const agenda=recordedWorldAgenda(memory.scenes,projection,{maxEntries:100});
   const current=await ownerWorld(env,token,world.id);
   const after=await branch(env,token,current);
   if(current.active_branch_id!==world.active_branch_id||after.head_scene_id!==before.head_scene_id)
    throw Error('Story changed while reading the agenda; retry.');
   return {world_id:world.id,active_branch_id:world.active_branch_id,head_scene_id:before.head_scene_id,
    memory_complete:memory.complete,...agenda,interpretation:'Recorded commitments and dates are not simulated in the background. The current fictional time may be unknown if recent scenes have no date.'};
  }
  case 'get_npc_agency':{
   const world=await ownerWorld(env,token,args.world_id);
   const active=await branch(env,token,world);
   const memory=await readStructuredMemory(env,token,world,active.head_scene_id);
   const projection=buildNextContext({world,scenes:memory.scenes,evidencePrevalidated:true,historyComplete:memory.complete}).memory;
   const actor=String(args.actor||'').trim().toLocaleLowerCase('ru');
   const plans=projection.plans.filter(p=>!actor||String(p.actor).toLocaleLowerCase('ru')===actor);
   return {world_id:world.id,actor:actor||null,plans,complete:memory.complete,
    interpretation:'Plans are intentions, not facts of completion. No offscreen action runs while ChatGPT is idle.',
    warnings:projection.validation_warnings};
  }
  case 'get_branch_history':{
   await ownerWorld(env,token,args.world_id);
   return await readHistory(env,token,args.world_id,Math.max(1,Math.min(100,Number(args.limit)||25)),Math.max(0,Math.floor(Number(args.offset)||0)));
  }
  case 'create_world':{
   const {buildWorldDraft}=await import('../public/core/world.mjs');const draft=buildWorldDraft(args.description);
   const seedRule=draft.seed.length<=5000?classifyDirective(draft.seed):null;
   const rule=seedRule?.relationship_locks.length?seedRule:null;
   const id=await rpc(env,token,'nw_create_world_v2',{p_title:String(args.title||draft.title).slice(0,100),p_seed:draft.seed,p_start_marker:String(args.start_marker||draft.start_marker),
     p_rule_text:rule?.text??null,p_rule_category:rule?.category??'general',
     p_rule_metadata:rule?{relationship_lock:rule.relationship_lock,relationship_locks:rule.relationship_locks,tags:rule.tags}:{} });
   return {world_id:id,initial_description:draft.seed,initial_rule_saved_atomically:!!rule};
  }
  case 'add_world_directive':{
   const world=await ownerWorld(env,token,args.world_id);const directive=classifyDirective(args.text);
   const directiveId=await rpc(env,token,'nw_add_directive',{p_world_id:world.id,p_text:directive.text,p_category:directive.category,p_metadata:{tags:directive.tags,relationship_lock:directive.relationship_lock,relationship_locks:directive.relationship_locks}});
   return {directive_id:directiveId,stored_verbatim:true,classification:directive.category};
  }
  case 'save_scene':{
   const world=await ownerWorld(env,token,args.world_id);
   assertUuid(args.request_id);assertUuid(args.branch_id);
   if(args.expected_head!==null)assertUuid(args.expected_head);
   const receipt=await rpc(env,token,'nw_scene_receipt',{p_world_id:world.id,p_request_id:args.request_id});
   // Previously accepted data can be retried even if active branch, rules or autosave changed.
   // NEVER trust a receipt alone: the SQL RPC verifies all original payload fields.
   if(!receipt?.saved){
    if(!world.auto_save)throw Error('Owner disabled MCP autosave for this world');
    if(world.active_branch_id!==args.branch_id)throw Error('Not the active branch');
    if(world.directive_version!==args.expected_rules_version)throw Error('Rules changed; fetch world context again');
    const rules=await directives(env,token,world.id);
    const validation=validateScene({body:args.body,events:args.events||[],directives:rules});
    if(!validation.ok)throw Error(validation.errors.join(' '));
    if((args.events||[]).some(e=>e.type==='money'||e.type==='item')){
     const active=await branch(env,token,world);
     if(active.head_scene_id!==args.expected_head)throw Error('Head changed: refresh story before committing');
     const memory=await readStructuredMemory(env,token,world,active.head_scene_id);
     if(!memory.complete)throw Error('Economy preflight requires complete structured history; retrieve and verify sources before saving.');
     const checked=validateEconomyAppend(memory.scenes,args.events,args.body);
     if(!checked.ok)throw Error(checked.errors.join(' '));
    }
   }
   const sceneId=await rpc(env,token,'nw_commit_scene',{
      p_world_id:world.id,p_branch_id:args.branch_id,p_expected_head:args.expected_head,
      p_request_id:args.request_id,p_body:args.body,p_world_time:args.world_time??null,p_events:args.events||[],p_expected_rules_version:args.expected_rules_version
   });
   return {saved:true,reused:!!receipt?.saved,scene_id:sceneId,request_id:args.request_id};
  }
  case 'fork_before_scene':{
   const world=await ownerWorld(env,token,args.world_id);
   const id=await rpc(env,token,'nw_fork_before',{p_world_id:world.id,p_scene_id:assertUuid(args.scene_id),p_name:args.name||'Альтернативная линия'});
   return {new_branch_id:id,old_branch_preserved:true};
  }
  case 'get_scene_receipt':{
   await ownerWorld(env,token,args.world_id);
   return await rpc(env,token,'nw_scene_receipt',{p_world_id:args.world_id,p_request_id:assertUuid(args.request_id)});
  }
  case 'edit_world_directive':{
   await ownerWorld(env,token,args.world_id);
   const rule=classifyDirective(args.text);
   await rpc(env,token,'nw_edit_directive',{p_world_id:args.world_id,p_directive_id:assertUuid(args.directive_id),p_text:rule.text,p_category:rule.category,
    p_metadata:{tags:rule.tags,relationship_lock:rule.relationship_lock,relationship_locks:rule.relationship_locks},p_expected_version:args.expected_rules_version});
   return {updated:true,stored_verbatim:true,requires_context_refresh:true};
  }
  case 'toggle_world_directive':{
   await ownerWorld(env,token,args.world_id);
   if(typeof args.active!=='boolean')throw Error('Explicit active boolean required');
   await rpc(env,token,'nw_toggle_directive',{p_world_id:args.world_id,p_directive_id:assertUuid(args.directive_id),p_active:args.active,p_expected_version:args.expected_rules_version});
   return {active:args.active,requires_context_refresh:true};
  }
  case 'revise_scene':{
   const world=await ownerWorld(env,token,args.world_id);
   assertUuid(args.request_id);assertUuid(args.source_scene_id);
   // An already committed revision can be replayed after autosave or rule changes.
   // The SQL RPC validates original request content before returning its receipt.
   const previous=await rest(env,token,`nw_revisions?select=request_id&world_id=eq.${ep(world.id)}&request_id=eq.${ep(args.request_id)}&limit=1`);
   if(previous?.length){
    const receipt=await rpc(env,token,'nw_revise_scene',{p_world_id:world.id,p_source_scene_id:args.source_scene_id,
     p_prefix:args.prefix,p_continuation:args.continuation,p_events:args.events||[],p_request_id:args.request_id,
     p_world_time:args.world_time??null,p_expected_rules_version:args.expected_rules_version});
    return {...receipt,saved:true,old_branch_preserved:true,request_id:args.request_id};
   }
   if(!world.auto_save)throw Error('Owner disabled MCP autosave');
   if(world.directive_version!==args.expected_rules_version)throw Error('Rules changed; fetch world context again');
   const rows=await rest(env,token,`nw_scenes?select=id,body,events,world_time&world_id=eq.${ep(world.id)}&id=eq.${ep(args.source_scene_id)}&limit=1`);
   const original=rows?.[0];if(!original)throw Error('Source scene not found');
   if(typeof args.prefix!=='string'||!original.body.startsWith(args.prefix))throw Error('Prefix does not match original scene');
   if(typeof args.continuation!=='string')throw Error('Missing continuation');
   const preserved=(Array.isArray(original.events)?original.events:[]).filter(e=>e&&typeof e.evidence==='string'&&e.evidence.trim()&&args.prefix.includes(e.evidence));
   const all=[...preserved,...(args.events||[])];
   const rules=await directives(env,token,world.id);
   const checked=validateScene({body:args.prefix+args.continuation,events:all,directives:rules});
   if(!checked.ok)throw Error(checked.errors.join(' '));
   const receipt=await rpc(env,token,'nw_revise_scene',{p_world_id:world.id,p_source_scene_id:args.source_scene_id,
      p_prefix:args.prefix,p_continuation:args.continuation,p_events:args.events||[],p_request_id:args.request_id,
      p_world_time:args.world_time??null,p_expected_rules_version:args.expected_rules_version});
   return {...receipt,saved:true,old_branch_preserved:true,request_id:args.request_id};
  }
  case 'switch_branch':{
   const world=await ownerWorld(env,token,args.world_id);
   await rpc(env,token,'nw_switch_branch',{p_world_id:world.id,p_branch_id:assertUuid(args.branch_id)});
   return {active_branch_id:args.branch_id};
  }
  default:throw Error('Unknown MCP tool '+name);
 }
}
function response(body,status=200,extra={}){return new Response(body,{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health')return response(JSON.stringify({service:'LIVING WORLD NEXT MCP',running:true,
     oauth_metadata_ready:!!(env.MCP_PUBLIC_URL&&env.SUPABASE_OAUTH_CLIENT_ID&&env.SUPABASE_URL&&env.SUPABASE_ANON_KEY&&
       !env.MCP_PUBLIC_URL.includes('YOUR-')&&!env.SUPABASE_OAUTH_CLIENT_ID.includes('YOUR-')&&!env.SUPABASE_URL.includes('YOUR-')), 
     oauth_e2e_verified:false}));
  if(request.method==='GET' && (url.pathname==='/.well-known/oauth-protected-resource'||url.pathname==='/.well-known/oauth-protected-resource/mcp')){
    try{return response(JSON.stringify(resourceMetadata(env)));}catch{return response(JSON.stringify({error:'OAuth server configuration incomplete'}),503);}
  }
  if(url.pathname!=='/mcp')return response(JSON.stringify({error:'Not found'}),404);
  if(request.method!=='POST')return response(JSON.stringify({error:'Use POST'}),405,{'allow':'POST'});
  const declaredLength=Number(request.headers.get('content-length')||0);
  if(declaredLength>1000000)return response(JSON.stringify({error:'Request too large'}),413);
  let msg;try{const raw=await request.text();if(raw.length>1000000)return response(JSON.stringify({error:'Request too large'}),413);msg=JSON.parse(raw);}catch{return response(JSON.stringify(error(null,-32700,'Parse error')),400);}
  if(!msg||msg.jsonrpc!=='2.0'||typeof msg.method!=='string')return response(JSON.stringify(error(msg?.id??null,-32600,'Invalid JSON-RPC request')),400);
  // All protected MCP methods demand OAuth, including the initial handshake and tool scan.
  // Public discovery and health remain available to ChatGPT before the user signs in.
  if(msg.id===undefined||msg.method==='notifications/initialized')return new Response(null,{status:202});
  if(msg.method==='server/discover')return response(JSON.stringify(done(msg.id,{resultType:'complete',supportedVersions:['2026-07-28',version],capabilities:{tools:{}},ttlMs:0,cacheScope:'public'})));
  if(['initialize','ping','tools/list','tools/call'].includes(msg.method)){
   let token;
   try{
    const raw=request.headers.get('authorization')||'';
    if(!/^Bearer [A-Za-z0-9._~-]+$/.test(raw))throw Error('Missing token');
    token=raw.slice(7);
    await verifyOAuthUser(env,token);
   }catch{
    let hint='Bearer';try{hint=challenge(env);}catch{}
    return response(JSON.stringify({jsonrpc:'2.0',id:msg.id,result:fail('Требуется авторизация через Supabase OAuth.')}),401,{'www-authenticate':hint});
   }
   if(msg.method==='initialize')return response(JSON.stringify(done(msg.id,{protocolVersion:msg.params?.protocolVersion||version,capabilities:{tools:{listChanged:false}},serverInfo:{name:'living-world-next',version:'0.6.0'}})));
   if(msg.method==='ping')return response(JSON.stringify(done(msg.id,{})));
   if(msg.method==='tools/list')return response(JSON.stringify(done(msg.id,{resultType:'complete',ttlMs:0,cacheScope:'public',tools:toolsList})));
   const name=msg.params?.name;
   if(typeof name!=='string')return response(JSON.stringify(error(msg.id,-32602,'Missing tool name')),400);
   try{return response(JSON.stringify(done(msg.id,result(await callTool(name,msg.params?.arguments||{},env,token)))));}
   catch(e){return response(JSON.stringify(done(msg.id,fail(e.message||'Tool failed'))));}
  }
  return response(JSON.stringify(error(msg.id,-32601,'Method not found')),404);
 }
};
