import {replayWithCheckpoint,replay} from './continuity.mjs';
/** Trusted process-local cache of complete projection checkpoints. Not an
 * authorization mechanism; caller MUST validate the world and ancestry first. */
export function createProjectionCache({maxEntries=4,maxBytes=12*1024*1024,ttlMs=120000,now=()=>Date.now()}={}){
 if(!Number.isInteger(maxEntries)||maxEntries<1||!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isFinite(ttlMs)||ttlMs<1)throw Error('Invalid projection cache limits');
 const rows=new Map();let bytes=0;
 const remove=k=>{const e=rows.get(k);if(e){rows.delete(k);bytes-=e.size;}};
 const expire=()=>{for(const [k,e] of rows)if(now()>=e.expires)remove(k);};
 return {
  project(scope,world,branch,history){
   const scenes=history.scenes;
   if(!scope||!world||!branch||!history.complete||!scenes.length)return {projection:replay(scenes,[],{evidencePrevalidated:true}),checkpoint:null,reused_scenes:0,replayed_scenes:scenes.length};
   expire();
   const head=scenes.at(-1).id,key=JSON.stringify([scope,world,branch,head]);
   let prior=rows.get(key);
   if(!prior){
    for(const entry of [...rows.values()].reverse())if(entry.scope===scope&&entry.world===world&&entry.branch===branch&&scenes[entry.count-1]?.id===entry.head){prior=entry;break;}
   }
   const result=replayWithCheckpoint(scenes,{evidencePrevalidated:true,checkpoint:prior?JSON.parse(prior.payload):null});
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
