import test from 'node:test';
import assert from 'node:assert/strict';
import {handoffConsentUrl} from '../public/lib/oauth-handoff.mjs';
const id='testopaqueauthrequest0123456789abc';
test('legacy OAuth URL continues same authorization ID on NEXT without approval',()=>{
 assert.equal(handoffConsentUrl('https://living-world-a3c.pages.dev/oauth/consent?authorization_id='+id),
 'https://living-world-next.pages.dev/oauth/consent.html?authorization_id='+id);
});
test('malformed or wrong-origin OAuth URLs are never forwarded',()=>{
 const invalid=['https://living-world-a3c.pages.dev/login?authorization_id='+id,
 'https://living-world-a3c.pages.dev/oauth/consent?authorization_id=bad',
 'https://living-world-a3c.pages.dev/oauth/consent',
 'https://living-world-a3c.pages.dev.evil.example/oauth/consent?authorization_id='+id,
 'https://user:pass@living-world-a3c.pages.dev/oauth/consent?authorization_id='+id,
 'https://living-world-a3c.pages.dev/oauth/consent?authorization_id='+id+'#bad',
 'https://living-world-a3c.pages.dev/oauth/consent?authorization_id='+id+'&authorization_id='+id,
 'https://living-world-a3c.pages.dev/oauth/consent?authorization_id=../../private',
 'https://living-world-a3c.pages.dev/oauth/consent?authorization_id=%2Fsecret%2Fpath'];
 for(const url of invalid)assert.throws(()=>handoffConsentUrl(url),url);
});

test('Supabase 32-character opaque IDs transfer unchanged instead of being rejected as non-UUID',()=>{
 const id='aBcDef0123456789gHIjklmNoPqrsTuv';
 assert.equal(id.length,32);
 const result=handoffConsentUrl('https://living-world-a3c.pages.dev/oauth/consent?authorization_id='+id);
 assert.equal(new URL(result).searchParams.get('authorization_id'),id);
});
