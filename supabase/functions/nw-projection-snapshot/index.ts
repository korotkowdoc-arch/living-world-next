// Supabase Edge runtime. This module is deployed with a pinned source bundle.
import {createSnapshotHandler} from '../../../public/core/snapshot-handler.mjs';
const url=(Deno.env.get('SUPABASE_URL')||'').replace(/\/$/,'');
const anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const uuid=(x:unknown)=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
async function authenticate(token:string){
 if(!url||!anon||!service)throw Error('Snapshot configuration unavailable');
 const r=await fetch(url+'/auth/v1/user',{headers:{apikey:anon,authorization:'Bearer '+token},signal:AbortSignal.timeout(3000)});
 if(r.status===401||r.status===403)return null;
 if(!r.ok)throw Error('Auth unavailable');
 const user=await r.json();return uuid(user.id)?user.id:null;
}
async function rpc(name:string,args:Record<string,unknown>){
 const r=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:service,authorization:'Bearer '+service,'content-type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(6000)});
 if(!r.ok)throw Error('Snapshot store unavailable');
 return await r.json();
}
const params=(owner:string,a:{world_id:string,branch_id:string,head:string,engine_id:string})=>({p_owner:owner,p_world:a.world_id,p_branch:a.branch_id,p_head:a.head,p_engine:a.engine_id});
Deno.serve(createSnapshotHandler({
 authenticate,
 readInput:(owner:string,args:{world_id:string,branch_id:string,head:string,engine_id:string})=>rpc('nw_projection_snapshot_input',params(owner,args)),
 putSnapshot:(owner:string,args:{world_id:string,branch_id:string,head:string,engine_id:string},checkpoint:unknown)=>rpc('nw_projection_snapshot_put',{...params(owner,args),p_payload:checkpoint})
}));
