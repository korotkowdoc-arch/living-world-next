import test from 'node:test';import assert from 'node:assert/strict';
import {isAuthorizationId,assertAuthorizationId,safeChatGPTCallback,authorizationDetails,decideAuthorization,assertNextAuthorization,NEXT_REDIRECT_URI,trustedOAuthRequest,TRUSTED_OAUTH_CLIENTS,BRIDGE_OAUTH_CLIENT_ID,BRIDGE_REDIRECT_URIS,verifyBridgeOwner,revokeNextGrant} from '../public/lib/oauth-consent.mjs';
const id='exampleauthrequest0123456789abcdef';const base={url:'https://myproject.supabase.co',key:'sb_publishable_test',token:'access',id};
test('consent accepts Supabase opaque authorization IDs, rejects unsafe path segments',()=>{
 assert.equal(assertAuthorizationId(id),id);
 assert.equal(isAuthorizationId(id),true);
 assert.equal(assertAuthorizationId('12345678-1234-4234-8234-123456789012'),'12345678-1234-4234-8234-123456789012');
 for(const value of ['../oauth','abc','a'.repeat(129),'token/1234567890123456','token%2F1234567890123',null])
  assert.throws(()=>assertAuthorizationId(value));
});
test('OAuth callback cannot redirect to an attacker or HTTP',()=>{
 assert.equal(safeChatGPTCallback(NEXT_REDIRECT_URI+'?code=abc'),NEXT_REDIRECT_URI+'?code=abc');
 assert.throws(()=>safeChatGPTCallback('https://chatgpt.com.evil.test/steal'));assert.throws(()=>safeChatGPTCallback('http://chatgpt.com/'));
 assert.throws(()=>safeChatGPTCallback('https://chatgpt.com/connector/oauth/other-client'));
 assert.throws(()=>safeChatGPTCallback(NEXT_REDIRECT_URI+'#fragment'));
});
test('get and approve use authenticated, correct Supabase consent endpoints',async()=>{
 const calls=[];const fetchImpl=async(url,options)=>{calls.push({url,options});return Response.json(calls.length===1?{authorization_id:id,client:{id:'9ec1beb6-e638-432b-93fe-405e0bd01e53',name:'LIVING WORLD NEXT'},redirect_uri:NEXT_REDIRECT_URI}:{redirect_url:NEXT_REDIRECT_URI+'?code=secret'});};
 const details=await authorizationDetails({...base,fetchImpl});assert.equal(details.authorization_id,id);
 const callback=await decideAuthorization({...base,approved:true,fetchImpl});assert.ok(callback.startsWith('https://chatgpt.com/'));
 assert.ok(calls[0].url.endsWith('/oauth/authorizations/'+id));
 assert.ok(calls[1].url.endsWith('/oauth/authorizations/'+id+'/consent'));
 assert.deepEqual(JSON.parse(calls[1].options.body),{action:'approve'});
 assert.equal(calls[0].options.headers.authorization,'Bearer access');
});

test('NEXT consent accepts its own registered OAuth client and rejects a legacy Bridge client',()=>{
 const good={authorization_id:id,client:{id:'9ec1beb6-e638-432b-93fe-405e0bd01e53'},redirect_uri:NEXT_REDIRECT_URI};
 assert.equal(assertNextAuthorization(good,id),good);
 assert.throws(()=>assertNextAuthorization({...good,client:{id:'f08a0ef2-bdfc-4d0d-b9ab-ce900c85e0d6'}},id),/не относится|Неизвестный/);
 assert.throws(()=>assertNextAuthorization({...good,redirect_uri:'https://chatgpt.com/connector/oauth/old'},id),/не относится|Неизвестный/);
 assert.throws(()=>assertNextAuthorization({...good,authorization_id:'12345678-1234-4234-8234-123456789013'},id),/не относится|Неизвестный/);
});

test('opaque authorization IDs survive consent details fetch and approval without rewriting',async()=>{
 const opaqueId='aBcDef0123456789gHIjklmNoPqrsTuv';
 const urls=[];
 const fetchImpl=async(url,options)=>{
  urls.push({url,options});
  return Response.json(urls.length===1?
    {authorization_id:opaqueId,client:{id:'9ec1beb6-e638-432b-93fe-405e0bd01e53'},redirect_uri:NEXT_REDIRECT_URI}:
    {redirect_url:NEXT_REDIRECT_URI+'?code=code123&state=state123'});
 };
 const baseOpaque={...base,id:opaqueId,fetchImpl};
 const data=await authorizationDetails(baseOpaque);
 assert.equal(assertNextAuthorization(data,opaqueId),data);
 assert.equal(await decideAuthorization({...baseOpaque,approved:true}),NEXT_REDIRECT_URI+'?code=code123&state=state123');
 assert.ok(urls[0].url.endsWith('/'+opaqueId));
 assert.ok(urls[1].url.endsWith('/'+opaqueId+'/consent'));
});

test('Supabase rejects unlisted NEXT Origin with an actionable error, not false expiry',async()=>{
 const fetchImpl=async()=>Response.json({code:'validation_failed',msg:'unauthorized request origin'},{status:400});
 await assert.rejects(authorizationDetails({...base,fetchImpl}),e=>e.code==='OAUTH_ORIGIN_NOT_ALLOWED'&&/URL Configuration/.test(e.message));
 await assert.rejects(decideAuthorization({...base,approved:true,fetchImpl}),e=>e.code==='OAUTH_ORIGIN_NOT_ALLOWED'&&/NEXT/.test(e.message));
});
test('a genuinely expired OAuth request is distinguished from an invalid Origin',async()=>{
 const fetchImpl=async()=>Response.json({code:'oauth_authorization_not_found',msg:'authorization not found'},{status:404});
 await assert.rejects(authorizationDetails({...base,fetchImpl}),e=>e.code==='OAUTH_REQUEST_NOT_FOUND');
});
test('a different Supabase HTTP failure is never masked as expiration',async()=>{
 const fetchImpl=async()=>Response.json({msg:'invalid arbitrary configuration'},{status:400});
 await assert.rejects(authorizationDetails({...base,fetchImpl}),e=>e.code==='OAUTH_RESPONSE_ERROR'&&/HTTP 400/.test(e.message));
});

test('shared OAuth screen accepts two specific clients but rejects swapped redirect URIs',()=>{
 assert.equal(TRUSTED_OAUTH_CLIENTS.length,2);
 const next={authorization_id:id,client:{id:'9ec1beb6-e638-432b-93fe-405e0bd01e53'},redirect_uri:NEXT_REDIRECT_URI};
 const bridge={authorization_id:id,client:{id:BRIDGE_OAUTH_CLIENT_ID},redirect_uri:BRIDGE_REDIRECT_URIS[0]};
 assert.equal(trustedOAuthRequest(next,id).client.kind,'next');
 assert.equal(trustedOAuthRequest(bridge,id).client.kind,'bridge');
 assert.throws(()=>assertNextAuthorization(bridge,id));
 assert.throws(()=>trustedOAuthRequest({...next,redirect_uri:BRIDGE_REDIRECT_URIS[0]},id));
 assert.throws(()=>trustedOAuthRequest({...bridge,redirect_uri:NEXT_REDIRECT_URI},id));
 assert.throws(()=>trustedOAuthRequest({...bridge,client:{id:'unknown'}},id));
});
test('previously granted OAuth goes directly to its exactly registered ChatGPT callback',()=>{
 for(const callback of [NEXT_REDIRECT_URI,...BRIDGE_REDIRECT_URIS]){
  const redirect_url=callback+'?code=approved&state=unchanged';
  const route=trustedOAuthRequest({redirect_url},id);
  assert.equal(route.redirect_url,redirect_url);
 }
 for(const target of [
  'https://attacker.test/callback?code=x',
  NEXT_REDIRECT_URI+'#fragment',
  NEXT_REDIRECT_URI,
  BRIDGE_REDIRECT_URIS[0]+'?token=untrusted'
 ])assert.throws(()=>safeChatGPTCallback(target));
});
test('old Bridge consent requires server-confirmed owner, not locally stored user metadata',async()=>{
 const opts={url:'https://example.supabase.co',key:'sb_publishable_test',token:'session-token'};
 const valid=await verifyBridgeOwner({...opts,fetchImpl:async(_url,req)=>{
  assert.equal(req.headers.authorization,'Bearer session-token');
  return Response.json({id:'0a3fbf41-c3c6-4743-a88c-f9a7870fd244'});
 }});
 assert.equal(valid,true);
 await assert.rejects(verifyBridgeOwner({...opts,fetchImpl:async()=>Response.json({id:'someone-else'})}),/не является владельцем/);
});
test('already processed OAuth ID is recognized without an endless retry button',async()=>{
 const fetchImpl=async()=>Response.json({msg:'authorization request cannot be processed'},{status:400});
 await assert.rejects(authorizationDetails({...base,fetchImpl}),e=>e.code==='OAUTH_ALREADY_PROCESSED');
});

test('grant recovery is explicitly scoped ONLY to NEXT client, not the old Bridge',async()=>{
 const log=[];
 const result=await revokeNextGrant({
  url:'https://myproject.supabase.co',key:'sb_publishable_test',token:'user-token',
  fetchImpl:async(url,opts)=>{log.push({url,opts});return new Response(null,{status:204});}
 });
 assert.equal(result.revoked_client_id,'9ec1beb6-e638-432b-93fe-405e0bd01e53');
 assert.equal(log.length,1);
 assert.equal(log[0].opts.method,'DELETE');
 assert.equal(log[0].opts.headers.authorization,'Bearer user-token');
 assert.equal(new URL(log[0].url).pathname,'/auth/v1/user/oauth/grants');
 assert.equal(new URL(log[0].url).searchParams.get('client_id'),'9ec1beb6-e638-432b-93fe-405e0bd01e53');
 assert.notEqual(new URL(log[0].url).searchParams.get('client_id'),BRIDGE_OAUTH_CLIENT_ID);
});
test('revoking a grant fails closed if there is no authenticated NEXT session',async()=>{
 await assert.rejects(revokeNextGrant({url:'https://myproject.supabase.co',key:'sb_publishable_test',token:''}),/войди/);
});
