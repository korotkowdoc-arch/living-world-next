import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {requestIdentity} from '../public/core/request-identity.mjs';
test('browser request identity is deterministic for the SAME draft, branch and expected head',async()=>{
 const draft={p_world_id:'world',p_expected_head:'head',p_body:'Герой нашёл письмо.',p_events:[]};
 const a=await requestIdentity('scene',draft,webcrypto);
 const b=await requestIdentity('scene',{...draft},webcrypto);
 assert.equal(a,b);assert.match(a,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.notEqual(a,await requestIdentity('scene',{...draft,p_expected_head:'next-head'},webcrypto));
 assert.notEqual(a,await requestIdentity('scene',{...draft,p_body:'Другое продолжение.'},webcrypto));
 assert.notEqual(a,await requestIdentity('revision',draft,webcrypto));
});
test('request identity rejects unavailable cryptography rather than claiming safe retry',async()=>{
 await assert.rejects(requestIdentity('scene',{a:1},{}),/HTTPS/);
});
