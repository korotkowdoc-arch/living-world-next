/** Keep the navigation anchor, not the previous section's arbitrary scroll depth. */
export function sectionScrollTarget(scrollY,navDocumentTop){
 const y=Math.max(0,Number.isFinite(scrollY)?scrollY:0);
 const top=Math.max(0,Number.isFinite(navDocumentTop)?navDocumentTop:0);
 return Math.min(y,top);
}
export const WORLD_TABS=[['story','История'],['menu','Игровое меню'],['search','Поиск'],['people','Персонажи'],['directives','Настройки словами'],['branches','Ветки'],['agenda','Время'],['life','Мир'],['social','Общество'],['growth','Развитие'],['economy','Имущество'],['archive','Архив'],['director','Режиссёр']];
