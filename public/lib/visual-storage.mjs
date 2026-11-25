import {dbRequest,activeToken,readConfig} from './session.mjs';
import {visualRequest,imageFileError,visualPreferences} from '../core/visual-world.mjs';
const rpc=(name,body)=>dbRequest('/rest/v1/rpc/'+name,{method:'POST',body});
const single=v=>Array.isArray(v)?v[0]:v;
const enc=encodeURIComponent;
const bucket='nw-world-visuals';
export async function listVisualAssets(worldId,offset=0,limit=40){return await rpc('nw_list_visual_assets',{p_world_id:worldId,p_limit:limit,p_offset:offset})||[];}
export async function getVisualPreferences(worldId){return visualPreferences((await dbRequest('/rest/v1/nw_visual_preferences?world_id=eq.'+enc(worldId)+'&select=frequency,style'))?.[0]);}
export async function saveVisualPreferences(worldId,prefs){
 const v=visualPreferences(prefs);await dbRequest('/rest/v1/nw_visual_preferences?on_conflict=world_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:{world_id:worldId,...v}});return v;
}
export async function prepareVisual(world,request){
 const v=visualRequest(request);
 return single(await rpc('nw_prepare_visual',{p_world_id:world.id,p_branch_id:world.active_branch_id,p_expected_head:world.head_scene_id??null,p_subject_kind:v.subject_kind,p_subject_id:v.subject_id,p_kind:v.kind,p_title:v.title,p_prompt:v.prompt,p_identity_notes:v.identity_notes,p_references:v.reference_asset_ids}));
}
export async function finishVisual(id){return single(await rpc('nw_finish_visual',{p_asset_id:id}));}
const path=a=>{if(typeof a?.storage_path!=='string'||!/^([0-9a-f-]{36}\/){2}[0-9a-f-]{36}$/i.test(a.storage_path))throw Error('Invalid private image path');return a.storage_path.split('/').map(enc).join('/');};
async function storageFetch(a,{download=false,method='GET',body,headers={}}={}){
 const c=readConfig(),token=await activeToken();
 const res=await fetch(c.url+'/storage/v1/object/'+(download?'authenticated/':'')+bucket+'/'+path(a),{method,body,cache:'no-store',headers:{apikey:c.key,authorization:'Bearer '+token,...headers}});
 if(!res.ok){const e=await res.json().catch(()=>({}));throw Error(e.message||e.error||'Storage HTTP '+res.status);}return res;
}
export async function validateImageBytes(file){
 const err=imageFileError(file);if(err)throw Error(err);
 const b=new Uint8Array(await file.slice(0,16).arrayBuffer());
 const match=file.type==='image/png'?b.length>=8&&[137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x):file.type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:b.length>=12&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
 if(!match)throw Error('Содержимое файла не соответствует формату изображения.');
}
export async function uploadVisual(a,file){
 if(a?.status!=='pending')throw Error('Only pending visuals accept a file');
 await validateImageBytes(file);
 try{await storageFetch(a,{method:'POST',body:file,headers:{'content-type':file.type,'cache-control':'no-cache, no-store, max-age=0','x-upsert':'false'}});}
 catch(e){try{return await finishVisual(a.id);}catch{throw e;}}
 return finishVisual(a.id);
}
export async function loadVisualBlob(a){if(a?.status!=='ready')throw Error('Visual is not ready');return (await storageFetch(a,{download:true})).blob();}
export async function archiveVisual(a){
 // Archive first: ready assets are immutable, archived bytes can be cleaned by their owner.
 await rpc('nw_archive_visual',{p_asset_id:a.id});
 try{await storageFetch(a,{method:'DELETE'});}catch{/* archive remains effective even if cleanup needs retry */}
}
