import {dbRequest} from './session.mjs';
import {buildWorldDraft} from '../core/world.mjs';
import {classifyDirective} from '../core/directives.mjs';
const enc=encodeURIComponent;
export async function rpc(name,payload){return dbRequest(`/rest/v1/rpc/${name}`,{method:'POST',body:payload});}
export async function listWorlds(){return dbRequest('/rest/v1/nw_worlds?select=*&order=updated_at.desc');}
export async function getWorld(id){const rows=await dbRequest(`/rest/v1/nw_worlds?select=*&id=eq.${enc(id)}&limit=1`);if(!rows?.length)throw Error('Мир не найден.');return rows[0];}
export async function createWorld(text){
 const draft=buildWorldDraft(text);
 const id=await rpc('nw_create_world',{p_title:draft.title,p_seed:draft.seed,p_start_marker:draft.start_marker});
 const explicit=classifyDirective(draft.seed);
 if(explicit.relationship_lock){await addDirective(id,draft.seed);}
 return id;
}
export async function listDirectives(worldId){return dbRequest(`/rest/v1/nw_directives?select=*&world_id=eq.${enc(worldId)}&order=created_at.asc`);}
export async function addDirective(worldId,text){
 const directive=classifyDirective(text);
 return rpc('nw_add_directive',{p_world_id:worldId,p_text:directive.text,p_category:directive.category,p_metadata:{tags:directive.tags,relationship_lock:directive.relationship_lock}});
}
export async function listBranches(worldId){return dbRequest(`/rest/v1/nw_branches?select=*&world_id=eq.${enc(worldId)}&order=created_at.asc`);}
export async function activeHistory(worldId,{limit=200,offset=0}={}){
 return rpc('nw_active_history',{p_world_id:worldId,p_limit:limit,p_offset:offset});
}
export async function allActiveHistory(worldId,{limit=2000}={}){
 const newest=[];
 for(let offset=0;offset<limit;offset+=200){
  const page=await activeHistory(worldId,{limit:200,offset});
  newest.push(...page);
  if(page.length<200)return {scenes:newest.reverse(),complete:true};
 }
 return {scenes:newest.reverse(),complete:false};
}
export async function saveScene({world,body,worldTime=null,events=[],requestId=crypto.randomUUID()}){
 return rpc('nw_commit_scene', {p_world_id:world.id,p_branch_id:world.active_branch_id,p_expected_head:world.head_scene_id??null,p_request_id:requestId,p_body:body,p_world_time:worldTime,p_events:events,p_expected_rules_version:world.directive_version});
}
export async function forkBefore(worldId,sceneId,name){return rpc('nw_fork_before',{p_world_id:worldId,p_scene_id:sceneId,p_name:name||'Альтернативная линия'});}
export async function switchBranch(worldId,branchId){return rpc('nw_switch_branch',{p_world_id:worldId,p_branch_id:branchId});}
export async function setAutosave(worldId,enabled){return rpc('nw_set_autosave',{p_world_id:worldId,p_enabled:!!enabled});}
export async function deleteWorld(worldId){await dbRequest(`/rest/v1/nw_worlds?id=eq.${enc(worldId)}`,{method:'DELETE'});}
