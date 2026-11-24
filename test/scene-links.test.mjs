import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sceneReaderUrl,parseSceneReaderHash,readLinkedScene} from '../public/core/scene-links.mjs';
const worldId='11111111-1111-4111-8111-111111111111';
const sceneId='22222222-2222-4222-8222-222222222222';
const link={worldId,sceneId};
test('private link round trips without query, credentials or prose',()=>{
 const url=new URL(sceneReaderUrl(worldId,sceneId));
 assert.equal(url.origin,'https://living-world-next.pages.dev');
 assert.equal(url.search,'');assert.equal(url.username,'');assert.equal(url.password,'');
 assert.deepEqual(parseSceneReaderHash(url.hash),link);
 assert.equal(parseSceneReaderHash(''),null);assert.equal(parseSceneReaderHash('#'),null);
});
test('malformed, partial, duplicate and unexpected route fields rejected',()=>{
 for(const hash of ['#world='+worldId,'#scene='+sceneId,'#world=x&scene='+sceneId,
 '#world='+worldId+'&scene='+sceneId+'&scene='+sceneId,
 '#world='+worldId+'&scene='+sceneId+'&token=x']){
  assert.throws(()=>parseSceneReaderHash(hash));
 }
 assert.throws(()=>sceneReaderUrl(worldId,'https://elsewhere.invalid'));
});
test('read-only lookup verifies world and scene IDs and current ancestry',async()=>{
 for(const active of [true,false]){
  const calls=[];
  const result=await readLinkedScene(link,{
   getWorld:async id=>{calls.push(['world',id]);return {id};},
   getScene:async (w,s)=>{calls.push(['scene',w,s]);return {world_id:w,id:s,body:'Episode'};},
   rpc:async (name,args)=>{calls.push([name,args]);return active;}
  });
  assert.equal(result.inActiveBranch,active);assert.equal(result.scene.body,'Episode');
  assert.deepEqual(calls,[['world',worldId],['scene',worldId,sceneId],['nw_scene_in_active_branch',{p_world_id:worldId,p_scene_id:sceneId}]]);
 }
});
test('denied and mismatched records fail closed',async()=>{
 let accessed=false;
 await assert.rejects(readLinkedScene(link,{
  getWorld:async()=>{throw Error('Denied');},getScene:async()=>{accessed=true;},rpc:async()=>{accessed=true;}
 }),/Denied/);assert.equal(accessed,false);
 await assert.rejects(readLinkedScene(link,{
  getWorld:async()=>({id:worldId}),getScene:async()=>({id:sceneId,world_id:sceneId}),rpc:async()=>{accessed=true;}
 }));assert.equal(accessed,false);
 await assert.rejects(readLinkedScene(link,{
  getWorld:async()=>({id:worldId}),getScene:async()=>({id:sceneId,world_id:worldId}),rpc:async()=>null
 }));
});
