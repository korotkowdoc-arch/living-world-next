import test from 'node:test';import assert from 'node:assert/strict';
import {assertAuthorizationId,safeChatGPTCallback,authorizationDetails,decideAuthorization} from '../public/lib/oauth-consent.mjs';
const id='12345678-1234-4234-8234-123456789012';const base={url:'https://myproject.supabase.co',key:'sb_publishable_test',token:'access',id};
test('consent allows only a valid authorization UUID',()=>{assert.equal(assertAuthorizationId(id),id);assert.throws(()=>assertAuthorizationId('../oauth'));});
test('OAuth callback cannot redirect to an attacker or HTTP',()=>{
 assert.equal(safeChatGPTCallback('https://chatgpt.com/connector/oauth/foo?code=abc'),'https://chatgpt.com/connector/oauth/foo?code=abc');
 assert.throws(()=>safeChatGPTCallback('https://chatgpt.com.evil.test/steal'));assert.throws(()=>safeChatGPTCallback('http://chatgpt.com/'));
});
test('get and approve use authenticated, correct Supabase consent endpoints',async()=>{
 const calls=[];const fetchImpl=async(url,options)=>{calls.push({url,options});return Response.json(calls.length===1?{authorization_id:id,client:{name:'ChatGPT'}}:{redirect_url:'https://chatgpt.com/connector/oauth/foo?code=secret'});};
 const details=await authorizationDetails({...base,fetchImpl});assert.equal(details.authorization_id,id);
 const callback=await decideAuthorization({...base,approved:true,fetchImpl});assert.ok(callback.startsWith('https://chatgpt.com/'));
 assert.ok(calls[0].url.endsWith('/oauth/authorizations/'+id));
 assert.ok(calls[1].url.endsWith('/oauth/authorizations/'+id+'/consent'));
 assert.deepEqual(JSON.parse(calls[1].options.body),{action:'approve'});
 assert.equal(calls[0].options.headers.authorization,'Bearer access');
});
