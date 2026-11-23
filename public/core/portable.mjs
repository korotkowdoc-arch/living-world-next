/** Offline, owner-triggered JSON backup of one world. Never serialize auth tokens or API keys. */
const uuid = value => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
const sortedById = rows => [...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id)));

export function makeWorldArchive({world,branches,directives,directiveEdits=[],scenes,revisions=[]},createdAt=new Date().toISOString()) {
  if(!uuid(world?.id))throw Error('Некорректный мир для резервной копии.');
  for(const [label,rows] of Object.entries({branches,directives,directiveEdits,scenes,revisions})){
    if(!Array.isArray(rows))throw Error(`Неполный раздел резервной копии: ${label}`);
    if(rows.some(r=>!r||r.world_id!==world.id))throw Error(`Чужие данные в разделе ${label}`);
  }
  const sceneIds=new Set();
  for(const scene of scenes){
    if(!uuid(scene.id)||sceneIds.has(scene.id))throw Error('Некорректный или повторный ID сцены.');
    sceneIds.add(scene.id);
    if(!Array.isArray(scene.events))throw Error('У сцены нет корректного журнала событий.');
  }
  const branchIds=new Set(branches.map(b=>b.id));
  if(branchIds.size!==branches.length||!branchIds.has(world.active_branch_id))throw Error('Неверные ветки мира.');
  for(const b of branches)if(b.head_scene_id&&!sceneIds.has(b.head_scene_id))throw Error('Не все сцены веток выгружены.');
  for(const s of scenes){
    if(!branchIds.has(s.branch_id)||s.parent_scene_id&&!sceneIds.has(s.parent_scene_id))throw Error('Неполная цепочка сцен.');
  }
  return {
    format:'living-world-next-archive',version:1,created_at:createdAt,
    scope:'all-branches-and-scenes',
    world:{...world},branches:sortedById(branches),directives:sortedById(directives),
    directive_edits:sortedById(directiveEdits),scenes:sortedById(scenes),revisions:sortedById(revisions),
    counts:{branches:branches.length,directives:directives.length,scenes:scenes.length,revisions:revisions.length}
  };
}

async function digest(content,cryptoProvider=globalThis.crypto){
 if(!cryptoProvider?.subtle)throw Error('Нужен HTTPS для проверки целостности резервной копии.');
 const bytes=new TextEncoder().encode(content);
 const hash=await cryptoProvider.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

export async function sealArchive(archive,cryptoProvider){
 const raw=JSON.stringify(archive);
 return {archive_sha256:await digest(raw,cryptoProvider),archive};
}
export async function inspectArchive(data,cryptoProvider){
 if(typeof data==='string')data=JSON.parse(data);
 if(!data||typeof data!=='object'||typeof data.archive_sha256!=='string'||!data.archive)throw Error('Не похоже на резервную копию LIVING WORLD NEXT.');
 const actual=await digest(JSON.stringify(data.archive),cryptoProvider);
 if(actual!==data.archive_sha256)throw Error('Контрольная сумма не совпадает. Файл повреждён или изменён.');
 const a=data.archive;
 if(a.format!=='living-world-next-archive'||a.version!==1)throw Error('Неподдерживаемый формат резервной копии.');
 makeWorldArchive({world:a.world,branches:a.branches,directives:a.directives,directiveEdits:a.directive_edits,scenes:a.scenes,revisions:a.revisions},a.created_at);
 if(a.counts?.scenes!==a.scenes.length)throw Error('Неверное количество сцен в архиве.');
 return {title:a.world.title,scene_count:a.scenes.length,branch_count:a.branches.length,created_at:a.created_at};
}
