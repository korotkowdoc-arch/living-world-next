/** Durable snapshots are derived only by an authenticated server from the
 * actual immutable ancestor chain. Client requests never contain a state. */
import {replayWithCheckpoint} from './continuity.mjs';
export const PROJECTION_ENGINE_ID='nw-js-0.48.0';
export const SNAPSHOT_INTERVAL=64;
export const MIN_SNAPSHOT_SCENES=16;
export const MAX_SNAPSHOT_BYTES=4*1024*1024;
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const validMap=x=>Array.isArray(x)&&x.every(v=>Array.isArray(v)&&v.length===2&&typeof v[0]==='string');
export function validDurableCheckpoint(cp){
 if(cp?.version!==1||cp.evidence_prevalidated!==true||!Number.isSafeInteger(cp.scene_count)||cp.scene_count<1||cp.scene_count>50000||!uuid(cp.head_scene_id)||!cp.state||typeof cp.state!=='object')return false;
 const s=cp.state;
 if(!['people','relationships','knowledge','balances','items','stock','obligations','worldFacts','plans','outfits','budgetFlows'].every(k=>validMap(s[k])))return false;
 if(!['offscreen','relationshipHistory','failures'].every(k=>Array.isArray(s[k]))||!Number.isSafeInteger(s.eventCount)||s.eventCount<0||s.budgetFlows.some(([,v])=>!v||typeof v.income!=='string'||typeof v.expense!=='string'||!/^\d+$/.test(v.income)||!/^\d+$/.test(v.expense)))return false;
 return true;
}
export function validateSnapshotRequest(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==4||!uuid(input.world_id)||!uuid(input.branch_id)||!uuid(input.head)||input.engine_id!==PROJECTION_ENGINE_ID)throw Error('Unsupported snapshot request');
 return {world_id:input.world_id,branch_id:input.branch_id,head:input.head,engine_id:input.engine_id};
}
/** Server response to the Edge Function. The SQL walk stops at the first
 * compatible checkpoint on the actual parent chain. Validate it again here. */
export function buildDurableProjection(input,expectedHead){
 if(input?.status!=='ready'||input.engine_id!==PROJECTION_ENGINE_ID||input.head!==expectedHead||!uuid(expectedHead)||!Array.isArray(input.suffix)||input.suffix.length>5000)return null;
 const checkpoint=input.checkpoint??null;
 if(checkpoint&&!validDurableCheckpoint(checkpoint))return null;
 let previous=checkpoint?.head_scene_id??null;
 const ids=new Set(previous?[previous]:[]);
 for(const row of input.suffix){
  if(!uuid(row?.id)||row.parent_scene_id!==previous||ids.has(row.id)||!Array.isArray(row.events)||row.events.length>100)return null;
  ids.add(row.id);previous=row.id;
 }
 const count=(checkpoint?.scene_count??0)+input.suffix.length;
 if(previous!==expectedHead||count<MIN_SNAPSHOT_SCENES||count>50000)return null;
 // A nearby stored boundary is sufficient; the Worker already has the
 // independently validated suffix. Avoid rewriting a snapshot every scene.
 if(checkpoint&&input.suffix.length<SNAPSHOT_INTERVAL)return {checkpoint,persist:false,replayed_scenes:0};
 const prefix=checkpoint?Array(checkpoint.scene_count):[];
 if(checkpoint)prefix[prefix.length-1]={id:checkpoint.head_scene_id};
 const history=prefix.concat(input.suffix);
 const result=replayWithCheckpoint(history,{evidencePrevalidated:true,checkpoint});
 if(!validDurableCheckpoint(result.checkpoint)||new TextEncoder().encode(JSON.stringify(result.checkpoint)).length>MAX_SNAPSHOT_BYTES)return checkpoint?{checkpoint,persist:false,replayed_scenes:0}:null;
 return {checkpoint:result.checkpoint,persist:true,replayed_scenes:result.replayed_scenes};
}
/** The Worker has its own verified complete ancestry before trusting any
 * durable boundary. Never attach a mismatched checkpoint or engine version. */
export function checkpointForHistory(response,history){
 if(response?.status!=='ready'||response.engine_id!==PROJECTION_ENGINE_ID||!history?.complete||!Array.isArray(history.scenes)||!validDurableCheckpoint(response.checkpoint))return null;
 const cp=response.checkpoint;
 return cp.scene_count<=history.scenes.length&&history.scenes[cp.scene_count-1]?.id===cp.head_scene_id?cp:null;
}
export async function loadDurableCheckpoint({url,anonKey,token,world,branch,head,history,fetcher=fetch,timeoutMs=3500}){
 if(!history?.complete||history.scenes.length<MIN_SNAPSHOT_SCENES||!uuid(world)||!uuid(branch)||!uuid(head)||history.scenes.at(-1)?.id!==head||!url||!anonKey||!token)return null;
 try{
  const response=await fetcher(url.replace(/\/$/,'')+'/functions/v1/nw-projection-snapshot',{method:'POST',headers:{authorization:'Bearer '+token,apikey:anonKey,'content-type':'application/json'},body:JSON.stringify({world_id:world,branch_id:branch,head,engine_id:PROJECTION_ENGINE_ID}),signal:AbortSignal.timeout(timeoutMs)});
  if(!response.ok)return null;
  // The trusted server caps snapshots at 4 MiB; cap wire response as well.
  const size=Number(response.headers.get('content-length'));
  if(size>MAX_SNAPSHOT_BYTES+65536)return null;
  const raw=await response.text();
  if(raw.length>MAX_SNAPSHOT_BYTES+65536)return null;
  return checkpointForHistory(JSON.parse(raw),history);
 }catch{return null;}
}
