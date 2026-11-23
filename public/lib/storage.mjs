import {dbRequest} from './session.mjs';
import {buildWorldDraft} from '../core/world.mjs';
import {classifyDirective} from '../core/directives.mjs';
import {makeWorldArchive,sealArchive} from '../core/portable.mjs';
const enc=encodeURIComponent;
export async function rpc(name,payload){return dbRequest(`/rest/v1/rpc/${name}`,{method:'POST',body:payload});}
export async function listWorlds(){return dbRequest('/rest/v1/nw_worlds?select=*&order=updated_at.desc');}
export async function getWorld(id){const rows=await dbRequest(`/rest/v1/nw_worlds?select=*&id=eq.${enc(id)}&limit=1`);if(!rows?.length)throw Error('Мир не найден.');return rows[0];}
export async function createWorld(text){
 const draft=buildWorldDraft(text);
 const id=await rpc('nw_create_world',{p_title:draft.title,p_seed:draft.seed,p_start_marker:draft.start_marker});
 if(draft.seed.length<=5000){
  const explicit=classifyDirective(draft.seed);
  if(explicit.relationship_locks.length)await addDirective(id,draft.seed);
 }
 return id;
}
export async function listDirectives(worldId){return dbRequest(`/rest/v1/nw_directives?select=*&world_id=eq.${enc(worldId)}&order=created_at.asc`);}
export async function addDirective(worldId,text){
 const directive=classifyDirective(text);
 return rpc('nw_add_directive',{p_world_id:worldId,p_text:directive.text,p_category:directive.category,p_metadata:{tags:directive.tags,relationship_lock:directive.relationship_lock,relationship_locks:directive.relationship_locks}});
}
export async function editDirective(worldId,directiveId,text,version){
 const d=classifyDirective(text);return rpc('nw_edit_directive',{p_world_id:worldId,p_directive_id:directiveId,p_text:d.text,p_category:d.category,p_metadata:{tags:d.tags,relationship_lock:d.relationship_lock,relationship_locks:d.relationship_locks},p_expected_version:version});
}
export async function setDirectiveActive(worldId,directiveId,active,version){
 return rpc('nw_toggle_directive',{p_world_id:worldId,p_directive_id:directiveId,p_active:!!active,p_expected_version:version});
}
export async function directiveHistory(worldId){return dbRequest(`/rest/v1/nw_directive_edits?select=*&world_id=eq.${enc(worldId)}&order=created_at.desc&limit=100`);}
export async function reviseScene({world,sourceSceneId,prefix,continuation,events=[],requestId=crypto.randomUUID(),worldTime=null}){
 return rpc('nw_revise_scene',{p_world_id:world.id,p_source_scene_id:sourceSceneId,p_prefix:prefix,p_continuation:continuation,p_events:events,p_request_id:requestId,p_world_time:worldTime,p_expected_rules_version:world.directive_version});
}
export async function sceneReceipt(worldId,requestId){return rpc('nw_scene_receipt',{p_world_id:worldId,p_request_id:requestId});}
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


/** Read every saved scene across every branch, not just active ancestry. */
async function allRows(table,worldId,{pageSize=200,maxRows=50000}={}){
 const rows=[];
 for(let offset=0;offset<maxRows;offset+=pageSize){
  const page=await dbRequest(`/rest/v1/${table}?select=*&world_id=eq.${enc(worldId)}&order=created_at.asc&limit=${pageSize}&offset=${offset}`);
  if(!Array.isArray(page))throw Error(`Не удалось прочитать раздел ${table}.`);
  rows.push(...page);
  if(page.length<pageSize)return rows;
 }
 throw Error(`Архив превышает ${maxRows} записей. Нужен постраничный экспорт, сохранение отменено.`);
}

/** Search actual saved text in the active ancestry, not arbitrary unrelated branches. */
export async function searchActiveScenes(worldId,query,{limit=30,offset=0}={}){
 const search=String(query??'').trim();
 if(search.length<2||search.length>180)throw Error('Для поиска нужно от 2 до 180 символов.');
 return rpc('nw_search_history',{p_world_id:worldId,p_query:search,p_limit:limit,p_offset:offset});
}

/** Export is read-only; a second state check detects concurrently changed branch heads. */
export async function exportWorldArchive(worldId){
 const [before,branches,directives,directiveEdits,scenes,revisions]=await Promise.all([
   getWorld(worldId),listBranches(worldId),listDirectives(worldId),
   allRows('nw_directive_edits',worldId),allRows('nw_scenes',worldId),allRows('nw_revisions',worldId)
 ]);
 const [after,branchesAfter]=await Promise.all([getWorld(worldId),listBranches(worldId)]);
 const signature=(world,list)=>JSON.stringify({head:world.active_branch_id,rules:world.directive_version,updated:world.updated_at,
   branches:list.map(b=>[b.id,b.head_scene_id]).sort((a,b)=>a[0].localeCompare(b[0]))});
 if(signature(before,branches)!==signature(after,branchesAfter))throw Error('Мир изменился во время выгрузки. Повтори экспорт, чтобы не получить неполную копию.');
 const archive=makeWorldArchive({world:after,branches:branchesAfter,directives,directiveEdits,scenes,revisions});
 return sealArchive(archive);
}

export async function actorHistory(worldId,name,{limit=40,offset=0}={}){
 const actor=String(name||'').trim();if(!actor||actor.length>140)throw Error('Выбери персонажа.');
 return rpc('nw_actor_history',{p_world_id:worldId,p_actor:actor,p_limit:limit,p_offset:offset});
}

export async function getScene(worldId,sceneId){
 const rows=await dbRequest(`/rest/v1/nw_scenes?select=id,world_id,branch_id,parent_scene_id,body,events,world_time,created_at&world_id=eq.${enc(worldId)}&id=eq.${enc(sceneId)}&limit=1`);
 if(!rows?.length)throw Error('Сцена не найдена или недоступна.');
 return rows[0];
}
