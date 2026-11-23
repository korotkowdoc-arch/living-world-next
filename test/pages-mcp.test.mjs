import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onRequest,MCP_BASE} from '../functions/[[path]].js';
import {PUBLIC_SUPABASE_CONFIG} from '../public/lib/public-config.mjs';
const routeJson=JSON.parse(readFileSync(new URL('../public/_routes.json',import.meta.url),'utf8'));
const env={SUPABASE_OAUTH_CLIENT_ID:'next-chatgpt-client'};
const req=(path,method='GET',body=null)=>new Request('https://living-world-next.pages.dev'+path,{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
const handle=async(request,next=()=>{throw Error('Static passthrough unexpected')},environment=env)=>onRequest({request,env:environment,next});

test('Cloudflare Pages deploy exposes MCP and discovery but never invokes Functions on static pages',async()=>{
 assert.deepEqual(routeJson.include,['/mcp','/health','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp']);
 assert.deepEqual(routeJson.exclude,[]);
 let passed=false;
 const staticRes=await handle(req('/index.html'),()=>{passed=true;return new Response('static');});
 assert.equal(passed,true);assert.equal(await staticRes.text(),'static');
 const health=await handle(req('/health'));
 assert.equal(health.status,200);
 const status=await health.json();
 assert.equal(status.running,true);
 assert.equal(status.oauth_metadata_ready,true);
 assert.equal(status.oauth_e2e_verified,false);
});

test('MCP protected resource and unauthenticated tool call use the canonical Pages URL',async()=>{
 assert.equal(MCP_BASE,'https://living-world-next.pages.dev/mcp');
 const meta=await handle(req('/.well-known/oauth-protected-resource'));
 assert.equal(meta.status,200);
 const doc=await meta.json();
 assert.equal(doc.resource,MCP_BASE);
 assert.deepEqual(doc.authorization_servers,[PUBLIC_SUPABASE_CONFIG.url+'/auth/v1']);
 assert.deepEqual(doc.scopes_supported,['openid','email','offline_access']);
 const nested=await handle(req('/.well-known/oauth-protected-resource/mcp'));
 assert.equal(nested.status,200);
 assert.equal((await nested.json()).resource,MCP_BASE);
 const call=await handle(req('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_worlds',arguments:{}}}));
 assert.equal(call.status,401);
 assert.match(call.headers.get('www-authenticate'),/oauth-protected-resource/);
 const initialize=await handle(req('/mcp','POST',{jsonrpc:'2.0',id:2,method:'initialize',params:{protocolVersion:'2025-06-18'}}));
 assert.equal(initialize.status,401);
 assert.match(initialize.headers.get('www-authenticate'),/oauth-protected-resource/);
});

test('missing OAuth client binding fails closed for user data',async()=>{
 const health=await handle(req('/health'),undefined,{});
 assert.equal((await health.json()).oauth_metadata_ready,false);
 const call=await handle(req('/mcp','POST',{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'list_worlds',arguments:{}}}),undefined,{});
 assert.equal(call.status,401);
});

test('routing configuration does not consume normal iPhone static requests',()=>{
 for(const p of ['/','/index.html','/style.css','/app.js','/oauth/consent.html','/manifest.webmanifest'])
   assert.ok(!routeJson.include.includes(p),p);
});
