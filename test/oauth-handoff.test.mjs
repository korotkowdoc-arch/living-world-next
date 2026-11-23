import test from 'node:test';
import assert from 'node:assert/strict';
import {handoffConsentUrl} from '../public/lib/oauth-handoff.mjs';
const id='12345678-1234-4234-8234-123456789012';
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
 'https://living-world-a3c.pages.dev/oauth/consent?authorization_id='+id+'#bad'];
 for(const url of invalid)assert.throws(()=>handoffConsentUrl(url),url);
});
