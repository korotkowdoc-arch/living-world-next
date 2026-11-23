/**
 * First transport slice: Streamable HTTP MCP, Supabase owner-token validation.
 * Supabase Auth acts as the OAuth 2.1 authorization server; this Worker exposes
 * protected resource metadata and validates OAuth client-bound user tokens.
 * Client registration, consent URLs and end-to-end ChatGPT setup require deployment.
 */
import {buildNextContext,validateScene} from '../public/core/continuity.mjs';
import {promptForNarrator} from '../public/core/world.mjs';
import {classifyDirective} from '../public/core/directives.mjs';

const version='2025-06-18';
const toolsList=[
  {name:'list_worlds',description:'List the authenticated owner’s worlds.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'get_world_context',description:'Read authoritative world seed, directives, active branch, structured evidence, recent scenes, and narration guidance. Reports incomplete history.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'}},required:['world_id']}},
  {name:'get_branch_history',description:'Read exact saved scenes of active branch, newest first, in pages, without other branches.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},required:['world_id']}},
  {name:'create_world',description:'Create a world from one natural-language premise. No advance NPC forms. Returns new world ID.',inputSchema:{type:'object',properties:{description:{type:'string',minLength:8,maxLength:12000},title:{type:'string'},start_marker:{type:'string'}},required:['description']}},
  {name:'add_world_directive',description:'Save the owner’s plain-language world rule verbatim. Never rewrite it to sound more conciliatory.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},text:{type:'string'}},required:['world_id','text']}},
  {name:'save_scene',description:'Atomically save an already narrated scene on the currently selected branch using expected_head and request_id; requires owner opt-in auto_save. Events must have literal evidence.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},branch_id:{type:'string',format:'uuid'},expected_head:{type:['string','null']},expected_rules_version:{type:'integer',minimum:0},request_id:{type:'string',format:'uuid'},body:{type:'string'},world_time:{type:['string','null']},events:{type:'array',items:{type:'object'}}},required:['world_id','branch_id','expected_head','expected_rules_version','request_id','body']}},
  {name:'fork_before_scene',description:'Create a new active alternative branch before the given scene; does not delete older history.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},scene_id:{type:'string',format:'uuid'},name:{type:'string'}},required:['world_id','scene_id']}},
  {name:'switch_branch',description:'Switch active branch to an existing owner branch without copying invalid scenes.',inputSchema:{type:'object',properties:{world_id:{type:'string',format:'uuid'},branch_id:{type:'string',format:'uuid'}},required:['world_id','branch_id']}}
].map(t=>({...t,securitySchemes:[{type:'oauth2',scopes:['email']}],_meta:{securitySchemes:[{type:'oauth2',scopes:['email']}]}}));

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
function resourceMetadata(env){return {resource:mcpResource(env),authorization_servers:[authServer(env)],scopes_supported:['email']};}
function challenge(env){return `Bearer resource_metadata="${new URL(mcpResource(env)).origin}/.well-known/oauth-protected-resource", scope="email", error="invalid_token"`;}
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
   body:options.body===undefined?undefined:JSON.stringify(options.body)
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
async function getAllHistory(env,token,id,max=1000){const out=[];for(let i=0;i<max;i+=200){const page=await readHistory(env,token,id,200,i);out.push(...page);if(page.length<200)return {scenes:out.reverse(),complete:true};}return {scenes:out.reverse(),complete:false};}
async function callTool(name,args,env,token){
 switch(name){
  case 'list_worlds':return await rest(env,token,'nw_worlds?select=id,title,seed,start_marker,active_branch_id,auto_save,updated_at&order=updated_at.desc');
  case 'get_world_context':{
   const world=await ownerWorld(env,token,args.world_id);
   const [rules,active,history]=await Promise.all([directives(env,token,world.id),branch(env,token,world),getAllHistory(env,token,world.id)]);
   const ctx=buildNextContext({world,directives:rules,scenes:history.scenes});
   return {...ctx,head_scene_id:active.head_scene_id,history_complete:history.complete,
    narration_guidance:promptForNarrator({world,directives:rules,history:history.scenes.slice(-2),projection:ctx.memory}),
    warning:history.complete?ctx.memory_warning:'Only latest 1000 scenes were replayed: fetch older pages; DO NOT infer missing facts.'};
  }
  case 'get_branch_history':{
   await ownerWorld(env,token,args.world_id);
   return await readHistory(env,token,args.world_id,Math.max(1,Math.min(100,Number(args.limit)||25)),Math.max(0,Math.floor(Number(args.offset)||0)));
  }
  case 'create_world':{
   const {buildWorldDraft}=await import('../public/core/world.mjs');const draft=buildWorldDraft(args.description);
   const id=await rpc(env,token,'nw_create_world',{p_title:String(args.title||draft.title).slice(0,100),p_seed:draft.seed,p_start_marker:String(args.start_marker||draft.start_marker)});
   const seedRule=classifyDirective(draft.seed);
   if(seedRule.relationship_lock)await rpc(env,token,'nw_add_directive',{p_world_id:id,p_text:seedRule.text,p_category:seedRule.category,p_metadata:{relationship_lock:seedRule.relationship_lock,tags:seedRule.tags}});
   return {world_id:id,initial_description:draft.seed};
  }
  case 'add_world_directive':{
   const world=await ownerWorld(env,token,args.world_id);const directive=classifyDirective(args.text);
   const directiveId=await rpc(env,token,'nw_add_directive',{p_world_id:world.id,p_text:directive.text,p_category:directive.category,p_metadata:{tags:directive.tags,relationship_lock:directive.relationship_lock}});
   return {directive_id:directiveId,stored_verbatim:true,classification:directive.category};
  }
  case 'save_scene':{
   const world=await ownerWorld(env,token,args.world_id);
   if(!world.auto_save)throw Error('Owner disabled MCP autosave for this world');
   if(world.active_branch_id!==args.branch_id)throw Error('Not the active branch');
   if(world.directive_version!==args.expected_rules_version)throw Error('Rules changed; fetch world context again');
   assertUuid(args.request_id);const active=await branch(env,token,world);
   // The SQL function checks expected_head AFTER idempotency replay: retries must work.
   const rules=await directives(env,token,world.id);
   const validation=validateScene({body:args.body,events:args.events||[],directives:rules});
   if(!validation.ok)throw Error(validation.errors.join(' '));
   const sceneId=await rpc(env,token,'nw_commit_scene',{
      p_world_id:world.id,p_branch_id:active.id,p_expected_head:args.expected_head,
      p_request_id:args.request_id,p_body:args.body,p_world_time:args.world_time??null,p_events:args.events||[],p_expected_rules_version:args.expected_rules_version
   });
   return {saved:true,scene_id:sceneId,request_id:args.request_id};
  }
  case 'fork_before_scene':{
   const world=await ownerWorld(env,token,args.world_id);
   const id=await rpc(env,token,'nw_fork_before',{p_world_id:world.id,p_scene_id:assertUuid(args.scene_id),p_name:args.name||'Альтернативная линия'});
   return {new_branch_id:id,old_branch_preserved:true};
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
  if(msg.id===undefined||msg.method==='notifications/initialized')return new Response(null,{status:202});
  if(msg.method==='initialize')return response(JSON.stringify(done(msg.id,{protocolVersion:msg.params?.protocolVersion||version,capabilities:{tools:{listChanged:false}},serverInfo:{name:'living-world-next',version:'0.1.0'}})));
  if(msg.method==='ping')return response(JSON.stringify(done(msg.id,{})));
  if(msg.method==='tools/list')return response(JSON.stringify(done(msg.id,{resultType:'complete',ttlMs:0,cacheScope:'public',tools:toolsList})));
  if(msg.method==='server/discover')return response(JSON.stringify(done(msg.id,{resultType:'complete',supportedVersions:['2026-07-28',version],capabilities:{tools:{}},ttlMs:0,cacheScope:'public'})));
  if(msg.method==='tools/call'){
   const name=msg.params?.name;
   if(typeof name!=='string')return response(JSON.stringify(error(msg.id,-32602,'Missing tool name')),400);
   let token;try{
     const raw=request.headers.get('authorization')||'';
     if(!/^Bearer [A-Za-z0-9._~-]+$/.test(raw))throw Error('Missing token');
     token=raw.slice(7);
     await verifyOAuthUser(env,token);
   }catch{
     let hint='Bearer';try{hint=challenge(env);}catch{}
     return response(JSON.stringify({jsonrpc:'2.0',id:msg.id,result:fail('Требуется авторизация через Supabase OAuth.')}),401,{'www-authenticate':hint});
   }
   try{return response(JSON.stringify(done(msg.id,result(await callTool(name,msg.params?.arguments||{},env,token)))));}
   catch(e){return response(JSON.stringify(done(msg.id,fail(e.message||'Tool failed'))));}
  }
  return response(JSON.stringify(error(msg.id,-32601,'Method not found')),404);
 }
};
