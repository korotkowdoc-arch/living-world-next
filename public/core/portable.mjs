/** Offline, owner-triggered JSON backup of one world. Never serialize auth tokens or API keys. */
const uuid = value => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
const sortedById = rows => [...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id)));

/** Structural validation shared by export and import. SHA-256 prevents accidental
 * corruption; the graph validator also prevents broken or cyclic ancestry.
 */
export function validateArchiveGraph(a){
 if(!a||typeof a!=='object'||!uuid(a.world?.id))throw Error('Некорректный мир в архиве.');
 const rows={branches:a.branches,directives:a.directives,directive_edits:a.directive_edits,scenes:a.scenes,revisions:a.revisions};
 for(const [name,list] of Object.entries(rows)){
  if(!Array.isArray(list))throw Error('Отсутствует раздел архива: '+name);
  const ids=new Set();
  for(const r of list){
   if(!r||!uuid(r.id)||ids.has(r.id)||r.world_id!==a.world.id)
    throw Error('Повтор, неверный ID или чужой мир в разделе '+name);
   ids.add(r.id);
  }
 }
 const branches=new Set(a.branches.map(b=>b.id));
 const scenes=new Map(a.scenes.map(s=>[s.id,s]));
 const directives=new Set(a.directives.map(d=>d.id));
 if(!branches.has(a.world.active_branch_id))throw Error('В архиве отсутствует активная ветка.');
 for(const b of a.branches){
  if((b.head_scene_id&&!scenes.has(b.head_scene_id))||(b.fork_scene_id&&!scenes.has(b.fork_scene_id)))
   throw Error('Ветка ссылается на отсутствующую сцену.');
 }
 for(const s of a.scenes){
  if(!branches.has(s.branch_id)||(s.parent_scene_id&&!scenes.has(s.parent_scene_id))||!Array.isArray(s.events))
   throw Error('Неполная сцена, ветка или цепочка предков.');
  if(typeof s.body!=='string'||s.body.length<10||s.body.length>200000)
   throw Error('Неверный размер текста сцены.');
 }
 // Parent pointers are a DAG even when several branches share earlier scenes.
 const state=new Map();
 for(const s of a.scenes){
  const path=[];let item=s;
  while(item&&!state.has(item.id)){
   state.set(item.id,'visiting');path.push(item.id);
   item=item.parent_scene_id?scenes.get(item.parent_scene_id):null;
  }
  if(item&&state.get(item.id)==='visiting')throw Error('Цикл в цепочке сцен.');
  for(const id of path)state.set(id,'checked');
 }
 for(const e of a.directive_edits)if(!directives.has(e.directive_id))
  throw Error('Журнал правил ссылается на отсутствующее правило.');
 const requestIds=new Set();
 for(const s of a.scenes){
  if(!uuid(s.request_id)||requestIds.has(s.request_id))
   throw Error('Повторный ключ сохранения сцены в архиве.');
  requestIds.add(s.request_id);
 }
 const revisionRequests=new Set();
 for(const rev of a.revisions){
  if(!scenes.has(rev.source_scene_id)||!scenes.has(rev.new_scene_id)||
    !branches.has(rev.branch_id)||!uuid(rev.request_id)||revisionRequests.has(rev.request_id)||
    !Array.isArray(rev.new_events))
   throw Error('Нарушена связь между ревизией, веткой и исходной сценой.');
  revisionRequests.add(rev.request_id);
 }
 const counts=a.counts||{};
 for(const name of ['branches','directives','scenes','revisions']){
  if(counts[name]!==undefined&&counts[name]!==a[name].length)
   throw Error('Не совпадает количество в разделе '+name);
 }
 if(counts.directive_edits!==undefined&&counts.directive_edits!==a.directive_edits.length)
  throw Error('Не совпадает число изменений правил.');
 return a;
}

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
  return validateArchiveGraph({
    format:'living-world-next-archive',version:1,created_at:createdAt,
    scope:'all-branches-and-scenes',
    world:{...world},branches:sortedById(branches),directives:sortedById(directives),
    directive_edits:sortedById(directiveEdits),scenes:sortedById(scenes),revisions:sortedById(revisions),
    counts:{branches:branches.length,directives:directives.length,scenes:scenes.length,revisions:revisions.length,directive_edits:directiveEdits.length}
  });
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
/** Check both integrity and referential completeness before any server upload. */
export async function readVerifiedArchive(data,cryptoProvider){
 if(typeof data==='string')data=JSON.parse(data);
 if(!data||typeof data!=='object'||typeof data.archive_sha256!=='string'||!data.archive)
  throw Error('Не похоже на резервную копию LIVING WORLD NEXT.');
 const actual=await digest(JSON.stringify(data.archive),cryptoProvider);
 if(actual!==data.archive_sha256)throw Error('Контрольная сумма не совпадает. Файл повреждён или изменён.');
 const a=data.archive;
 if(a.format!=='living-world-next-archive'||a.version!==1)throw Error('Неподдерживаемый формат резервной копии.');
 return validateArchiveGraph(a);
}
export async function inspectArchive(data,cryptoProvider){
 const a=await readVerifiedArchive(data,cryptoProvider);
 return {title:a.world.title,scene_count:a.scenes.length,branch_count:a.branches.length,created_at:a.created_at};
}
