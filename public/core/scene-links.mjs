// Private reader links contain only opaque IDs in the URL fragment.
// A link is not an authorization token; all reads still use the owner's session.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const origin='https://living-world-next.pages.dev';
export function sceneReaderUrl(worldId,sceneId){
 if(typeof worldId!=='string'||typeof sceneId!=='string'||!uuid.test(worldId)||!uuid.test(sceneId))throw Error('Invalid reader IDs');
 return origin+'/#world='+worldId.toLowerCase()+'&scene='+sceneId.toLowerCase();
}
export function parseSceneReaderHash(hash){
 if(!hash||hash==='#')return null;
 const p=new URLSearchParams(hash.startsWith('#')?hash.slice(1):hash);
 if(!p.has('world')&&!p.has('scene'))return null;
 const world=p.get('world'),scene=p.get('scene');
 if([...p].length!==2||p.getAll('world').length!==1||p.getAll('scene').length!==1||!uuid.test(world||'')||!uuid.test(scene||''))throw Error('Некорректная ссылка на сцену.');
 return {worldId:world.toLowerCase(),sceneId:scene.toLowerCase()};
}
export async function readLinkedScene({worldId,sceneId},{getWorld,getScene,rpc}){
 const world=await getWorld(worldId);
 const scene=await getScene(worldId,sceneId);
 if(world.id!==worldId||scene.world_id!==worldId||scene.id!==sceneId)throw Error('Сцена не соответствует ссылке.');
 const active=await rpc('nw_scene_in_active_branch',{p_world_id:worldId,p_scene_id:sceneId});
 if(typeof active!=='boolean')throw Error('Не удалось проверить принадлежность сцены к текущей ветке.');
 return {world,scene,inActiveBranch:active};
}
