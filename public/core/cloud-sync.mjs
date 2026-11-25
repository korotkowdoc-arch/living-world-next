/** Compare owner-scoped cloud snapshots, never mutate local history automatically. */
export function detectWorldChange(current,latest,latestHead){
 if(!current||!latest||current.id!==latest.id)throw Error('Нельзя сравнивать разные миры.');
 if(current.active_branch_id!==latest.active_branch_id)
  return {kind:'branch',message:'В ChatGPT или на другом устройстве переключили сюжетную ветку.'};
 if((current.head_scene_id??null)!==(latestHead??null))
  return {kind:'story',message:'В действующей ветке есть новое продолжение или изменена сцена.'};
 if(current.directive_version!==latest.directive_version)
  return {kind:'rules',message:'Условия мира были изменены.'};
 if(current.auto_save!==latest.auto_save)
  return {kind:'settings',message:'Настройки автосохранения были изменены.'};
 if(current.updated_at!==latest.updated_at)
  return {kind:'world',message:'Данные мира изменились на сервере.'};
 return null;
}

/** Do not discard form state, settings, open dialogs or deliberate branch changes. */
export function canAutoSyncMenu(change,{section,dirty=false,blocked=false}={}){
 return change?.kind==='story'&&!dirty&&!blocked&&typeof section==='string'&&!['settings','journal','memories','illustrations','portraits','gallery'].includes(section);
}
