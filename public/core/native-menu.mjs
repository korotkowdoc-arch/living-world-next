/** Presentation only: section changes never write world data or navigate the document. */
export const MENU_GROUPS=Object.freeze([
 {id:'quick',label:'Главное',description:'Самое нужное во время игры'},
 {id:'hero',label:'Герой',description:'Состояние, вещи и способности'},
 {id:'social',label:'Общение',description:'Люди, письма и сообщества'},
 {id:'life',label:'Жизнь',description:'Работа, учёба, имущество и деньги'},
 {id:'world',label:'Мир',description:'События, места и планы'},
 {id:'story',label:'История',description:'Хроника, воспоминания и настройки'}
]);
export const QUICK_SECTIONS=['character','inventory','relationships','letters','tasks','calendar','finances','property','work','education','library','memories','settings'];
export const MENU_DESCRIPTIONS=Object.freeze({character:'Состояние и внешность',inventory:'Вещи героя',relationships:'Связи и отношения',letters:'Входящие и отправленные',tasks:'Цели и приоритеты',calendar:'Встречи и сроки',finances:'Деньги и расходы',property:'Жильё и комнаты',work:'Работа и заработок',education:'Учёба и занятия',library:'Книги и учебники',memories:'Сохранённые воспоминания',settings:'Темп, NPC и интерфейс',health:'Самочувствие и забота',wardrobe:'Одежда и комплекты',journal:'Сыгранные сцены',illustrations:'Галерея изображений',portraits:'Образы персонажей',contacts:'Знакомые героя',magic:'Знания и техники',map:'Известные места',news:'Газеты и сведения',circles:'Клубы и организации',goals:'Жизненные планы'});
export function directorySections(sections,{group='quick',query='',favorites=[]}={}){
 const q=String(query).trim().normalize('NFKC').toLocaleLowerCase('ru');
 const rows=sections.filter(s=>s.id!=='dashboard');
 if(q)return rows.filter(s=>[s.id,s.label,MENU_DESCRIPTIONS[s.id],...(s.actions||[])].some(v=>String(v??'').normalize('NFKC').toLocaleLowerCase('ru').includes(q)));
 if(group==='quick'){const ids=[...new Set([...favorites,...QUICK_SECTIONS])];return ids.map(id=>rows.find(s=>s.id===id)).filter(Boolean);}
 return rows.filter(s=>s.group===group);
}
export function menuSnapshotKey(w){return JSON.stringify([w?.id??null,w?.active_branch_id??null,w?.head_scene_id??null]);}
export function menuSectionTransition(sections,current,target){
 if(target!=='dashboard'&&!sections.some(s=>s.id===target))return current;
 return target;
}
