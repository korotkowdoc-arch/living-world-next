import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {makeWorldArchive,sealArchive,inspectArchive} from '../public/core/portable.mjs';
const world={id:'11111111-1111-4111-8111-111111111111',title:'Тест',active_branch_id:'22222222-2222-4222-8222-222222222222'};
const branches=[{id:world.active_branch_id,world_id:world.id,head_scene_id:'33333333-3333-4333-8333-333333333333'}];
const scenes=[{id:'33333333-3333-4333-8333-333333333333',world_id:world.id,branch_id:world.active_branch_id,parent_scene_id:null,body:'Тестовая сцена',events:[]}];
const payload={world,branches,scenes,directives:[]};
test('archive includes all expected divisions and validates SHA-256',async()=>{
 const archive=makeWorldArchive(payload,'2026-11-23T00:00:00Z');
 assert.equal(archive.counts.scenes,1);
 const sealed=await sealArchive(archive,webcrypto);
 assert.equal(sealed.archive_sha256.length,64);
 assert.deepEqual(await inspectArchive(JSON.stringify(sealed),webcrypto),{
   title:'Тест',scene_count:1,branch_count:1,created_at:'2026-11-23T00:00:00Z'});
 sealed.archive.scenes[0].body='Подмена сцены';
 await assert.rejects(inspectArchive(sealed,webcrypto),/Контрольная сумма/);
});
test('never export incomplete branch ancestry, unknown branch, foreign world or duplicated scene',()=>{
 assert.throws(()=>makeWorldArchive({...payload,scenes:[]}),/Не все сцены/);
 assert.throws(()=>makeWorldArchive({...payload,scenes:[{...scenes[0],parent_scene_id:'44444444-4444-4444-8444-444444444444'}]}),/Неполная цепочка/);
 assert.throws(()=>makeWorldArchive({...payload,scenes:[...scenes,scenes[0]]}),/повторный ID/);
 assert.throws(()=>makeWorldArchive({...payload,scenes:[{...scenes[0],world_id:'55555555-5555-4555-8555-555555555555'}]}),/Чужие данные/);
});
test('archive does not insert credentials or mutate original inputs',()=>{
 const before=JSON.stringify(payload);
 const archive=makeWorldArchive(payload);
 assert.equal(JSON.stringify(payload),before);
 assert.equal(JSON.stringify(archive).includes('access_token'),false);
});
