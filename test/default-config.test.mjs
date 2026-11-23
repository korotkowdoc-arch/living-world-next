import test from 'node:test';
import assert from 'node:assert/strict';
import {PUBLIC_SUPABASE_CONFIG} from '../public/lib/public-config.mjs';
import {readConfig} from '../public/lib/session.mjs';

test('iPhone app starts with a publishable Supabase project config without pasted credentials',()=>{
 const old=globalThis.window;
 try{
  globalThis.window={localStorage:{getItem:()=>null}};
  const config=readConfig();
  assert.equal(config.url,'https://bcwzlsljcxubqtvzsucz.supabase.co');
  assert.deepEqual(config,PUBLIC_SUPABASE_CONFIG);
  assert.match(config.key,/^sb_publishable_[a-zA-Z0-9_-]+$/);
  assert.doesNotMatch(config.key,/service_role|sb_secret_/);
 }finally{if(old===undefined)delete globalThis.window;else globalThis.window=old;}
});
