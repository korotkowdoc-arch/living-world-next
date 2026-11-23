import test from 'node:test';import assert from 'node:assert/strict';
import {isAuthorizationId,assertAuthorizationId,safeChatGPTCallback,authorizationDetails,decideAuthorization,assertNextAuthorization,NEXT_REDIRECT_URI} from '../public/lib/oauth-consent.mjs';
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
 assert.throws(()=>assertNextAuthorization({...good,client:{id:'f08a0ef2-bdfc-4d0d-b9ab-ce900c85e0d6'}},id),/не относится/);
 assert.throws(()=>assertNextAuthorization({...good,redirect_uri:'https://chatgpt.com/connector/oauth/old'},id),/не относится/);
 assert.throws(()=>assertNextAuthorization({...good,authorization_id:'12345678-1234-4234-8234-123456789013'},id),/не относится/);
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
