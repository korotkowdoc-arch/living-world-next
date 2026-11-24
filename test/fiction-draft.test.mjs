import test from 'node:test';
import assert from 'node:assert/strict';
import {fictionDraft,validateDraftInput,MODELS} from '../worker/fiction-draft.mjs';
const env={SUPABASE_URL:'https://db.example',SUPABASE_ANON_KEY:'public-test-key'};
const origin='https://next.example';
const valid={model:MODELS[0],outline:'A detective interviews a witness.',key:'synthetic_test_key_only_123456789',freeProject:true,shareConsent:true};
const req=(body=valid,headers={})=>new Request(origin+'/api/fiction-draft',{method:'POST',headers:{origin,authorization:'Bearer a.b.c','content-type':'application/json',...headers},body:JSON.stringify(body)});
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
const okUser=()=>response({id:'owner'});
test('unknown model, missing consent and oversized input rejected',()=>{
 for(const x of [{model:'paid'},{shareConsent:false},{freeProject:false},{outline:'x'.repeat(12001)},{key:'invalid'}])assert.throws(()=>validateDraftInput({...valid,...x}));
});
test('origin and owner session gate provider calls',async()=>{
 let calls=0;const send=async()=>{calls++;return response({},401)};
 assert.equal((await fictionDraft(req(valid,{origin:'https://other.example'}),env,{send})).status,403);
 assert.equal(calls,0);
 assert.equal((await fictionDraft(req(),env,{send})).status,401);
 assert.equal(calls,1);
});
test('fixed provider receives only explicitly entered outline and no owner token',async()=>{
 let calls=0;
 const res=await fictionDraft(req({...valid,world_id:'not-sent',privateHistory:'not-sent'}),env,{send:async(url,opts)=>{
  if(++calls===1){assert.equal(url,env.SUPABASE_URL+'/auth/v1/user');return okUser();}
  assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/'+MODELS[0]+':generateContent');
  assert.equal(opts.headers['x-goog-api-key'],valid.key);assert.equal(opts.headers.authorization,undefined);
  const payload=JSON.parse(opts.body);
  assert.equal(payload.contents[0].parts[0].text,valid.outline);
  assert.equal(payload.generationConfig.maxOutputTokens,2048);
  assert.ok(payload.safetySettings.some(x=>x.category==='HARM_CATEGORY_SEXUALLY_EXPLICIT'&&x.threshold==='BLOCK_MEDIUM_AND_ABOVE'));
  assert.equal(payload.tools,undefined);assert.equal(JSON.stringify(payload).includes('not-sent'),false);
  return response({candidates:[{finishReason:'STOP',content:{parts:[{text:'The witness spoke.'}]}}]});
 }});
 assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');
 assert.deepEqual(await res.json(),{draft:'The witness spoke.',model:MODELS[0],canonical:false});assert.equal(calls,2);
});
test('quota exhaustion, provider block and failures do not retry or expose secrets',async()=>{
 for(const [provider,status] of [[response({},429),429],[response({promptFeedback:{blockReason:'SAFETY'} }),422],[response({error:valid.key},403),502]]){
  let calls=0;const res=await fictionDraft(req(),env,{send:async()=>++calls===1?okUser():provider});
  assert.equal(res.status,status);assert.equal(calls,2);assert.equal((await res.text()).includes(valid.key),false);
 }
});
