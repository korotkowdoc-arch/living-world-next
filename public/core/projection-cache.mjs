import {replayWithCheckpoint,replay} from './continuity.mjs';
/** Trusted process-local cache of complete projection checkpoints. Not an
 * authorization mechanism; caller MUST validate the world and ancestry first. */
export function createProjectionCache({maxEntries=4,maxBytes=12*1024*1024,ttlMs=120000,now=()=>Date.now()}={}){
 if(!Number.isInteger(maxEntries)||maxEntries<1||!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isFinite(ttlMs)||ttlMs<1)throw Error('Invalid projection cache limits');
 const rows=new Map();let bytes=0;
 const remove=k=>{const e=rows.get(k);if(e){rows.delete(k);bytes-=e.size;}};
 const expire=()=>{for(const [k,e] of rows)if(now()>=e.expires)remove(k);};
 const reusable=(scope,world,branch,scenes)=>[...rows.values()].reverse().find(entry=>entry.scope===scope&&entry.world===world&&entry.branch===branch&&scenes[entry.count-1]?.id===entry.head);
 return {
  hasReusable(scope,world,branch,history){expire();return !!(scope&&history?.complete&&reusable(scope,world,branch,history.scenes));},
  project(scope,world,branch,history,externalCheckpoint=null){
   const scenes=history.scenes;
   if(!scope||!world||!branch||!history.complete||!scenes.length)return {projection:replay(scenes,[],{evidencePrevalidated:true}),checkpoint:null,reused_scenes:0,replayed_scenes:scenes.length,cache_source:'replay'};
   expire();
   const head=scenes.at(-1).id,key=JSON.stringify([scope,world,branch,head]);
   let prior=rows.get(key);
   if(!prior){
    prior=reusable(scope,world,branch,scenes);
   }
   const local=prior?JSON.parse(prior.payload):null;
   const external=externalCheckpoint&&externalCheckpoint.scene_count<=scenes.length&&scenes[externalCheckpoint.scene_count-1]?.id===externalCheckpoint.head_scene_id?externalCheckpoint:null;
   const useExternal=!!external&&(!local||external.scene_count>local.scene_count);
   const result=replayWithCheckpoint(scenes,{evidencePrevalidated:true,checkpoint:useExternal?external:local});
   result.cache_source=result.reused_scenes?(useExternal?'durable':'process'):'replay';
   if(rows.has(key)){const e=rows.get(key);rows.delete(key);rows.set(key,e);return result;}
   const payload=JSON.stringify(result.checkpoint),size=payload.length*2;
   if(size<=maxBytes){
    while(rows.size>=maxEntries||bytes+size>maxBytes)remove(rows.keys().next().value);
    rows.set(key,{scope,world,branch,head,count:scenes.length,payload,size,expires:now()+ttlMs});bytes+=size;
   }
   return result;
  },
  stats(){expire();return {entries:rows.size,bytes};}
 };
}
