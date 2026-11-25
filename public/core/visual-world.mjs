/** Illustrations are optional, owner-controlled metadata, never canonical story evidence. */
export const VISUAL_KINDS=Object.freeze({portrait:'Портрет',scene:'Сцена',location:'Место',artifact:'Предмет',cover:'Обложка',illustration:'Иллюстрация',photo:'Фотография',diagram:'Схема',outfit:'Наряд',creature:'Существо'});
export const VISUAL_FREQUENCIES=Object.freeze({off:'Отключено',request:'Только по запросу',significant:'Значимые события',first_seen:'Новые объекты',frequent:'Частые иллюстрации'});
export const VISUAL_SUBJECTS=Object.freeze({character:'Персонаж',scene:'Сцена',place:'Место',item:'Предмет',document:'Издание',chapter:'Глава',creature:'Существо',ritual:'Ритуал',outfit:'Комплект одежды',photo:'Фотоальбом',other:'Другой объект'});
export const DEFAULT_VISUAL_PREFS=Object.freeze({frequency:'request',style:''});
export const VISUAL_LIMIT=8388608;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text=(s,n)=>typeof s==='string'&&s.trim()&&s.length<=n;
export function visualPreferences(v={}){
 return {frequency:Object.hasOwn(VISUAL_FREQUENCIES,v?.frequency)?v.frequency:'request',style:typeof v?.style==='string'?v.style.slice(0,1000):''};
}
export function visualRequest(v){
 if(!Object.hasOwn(VISUAL_SUBJECTS,v?.subject_kind)||!Object.hasOwn(VISUAL_KINDS,v?.kind)||!text(v.subject_id,180)||!text(v.title,240)||!text(v.prompt,8000)||typeof (v.identity_notes??'')!=='string'||(v.identity_notes??'').length>4000)throw Error('Invalid visual request');
 const refs=v.reference_asset_ids??[];
 if(!Array.isArray(refs)||refs.length>8||new Set(refs).size!==refs.length||refs.some(x=>!uuid.test(x)))throw Error('Invalid visual references');
 return {subject_kind:v.subject_kind,subject_id:v.subject_id.trim(),kind:v.kind,title:v.title.trim(),prompt:v.prompt.trim(),identity_notes:v.identity_notes??'',reference_asset_ids:refs};
}
export function visualSubjects(overview,sceneId){
 const rows=[],seen=new Set();const add=(kind,id,label,detail='')=>{if(!text(id,180)||!text(label,240)||seen.has(kind+'|'+id))return;seen.add(kind+'|'+id);rows.push({subject_kind:kind,subject_id:id,title:label,detail:String(detail||'').slice(0,1000)});};
 const actor=overview.actor;
 add('character',actor,actor,overview.character?.fields?.filter(f=>f.field==='appearance'||f.field==='age').map(f=>f.value||f.description||'').join('; '));
 for(const c of overview.contacts?.records||[])add('character',c.name,c.name);
 for(const x of overview.inventory?.records||[])add('item',x.id,x.name||x.id);
 for(const x of overview.property_systems?.estates?.records||[])add('place',x.id,x.title);
 for(const x of overview.world_depth?.places?.places?.records||[])add('place',x.id||x.place||x.name,x.title||x.place||x.name);
 for(const k of ['library','newspapers','documents','archives','authored','notebooks','catalogues','medical_records','bank_records','gallery'])for(const x of overview.documents?.[k]?.records||[]){add('document',x.id,x.title,x.summary);for(const ch of x.contents||[])if(ch.read)add('chapter',x.id+':'+ch.id,x.title+' — '+ch.title);}
 for(const x of overview.magic_system?.society?.ecology?.species?.records||[])add('creature',x.id,x.title||x.name,x.description);
 for(const x of overview.magic_system?.society?.rituals?.protocols?.records||[])add('ritual',x.id,x.title,x.description);
 for(const x of overview.life?.presets?.records||[])add('outfit',x.id,x.title||x.name||x.id);
 if(sceneId)add('scene',sceneId,'Текущая сохранённая сцена');
 add('photo',actor,'Фотоальбом '+actor);
 return rows.slice(0,200);
}
export function visualReferences(assets,subject){
 return assets.filter(a=>a.status==='ready'&&a.subject_kind===subject.subject_kind&&a.subject_id===subject.subject_id).slice(0,8);
}
export function visualPrompt(subject,description,references=[],prefs={}){
 const identity=references[0]?.identity_notes||subject.detail||'';
 return ['Иллюстрация вымышленного мира: '+subject.title,description,identity?'Сохраняй подтверждённые признаки: '+identity:null,references.length?'Используй сохранённые изображения как референсы внешности и формы, если они доступны генератору. Не меняй узнаваемые черты без основания.':null,prefs.style?'Стиль: '+prefs.style:null,'Не добавляй неизвестные герою факты. Иллюстрация не является новым событием истории.'].filter(Boolean).join('\n').slice(0,8000);
}
export function visibleVisuals(assets,subjects,section='illustrations'){
 const known=new Set(subjects.map(x=>x.subject_kind+'|'+x.subject_id));
 const filters={portraits:['character'],gallery:['photo','scene'],character:['character'],wardrobe:['outfit','character'],inventory:['item'],library:['document','chapter'],news:['document','chapter'],documents:['document','chapter'],places:['place'],property:['place'],magical_ecology:['creature'],rituals:['ritual']};
 return (assets||[]).filter(a=>a.status!=='archived'&&(section==='illustrations'||(filters[section]||[]).includes(a.subject_kind))&&(a.subject_kind==='scene'||a.subject_kind==='photo'||known.has(a.subject_kind+'|'+a.subject_id)||section==='illustrations'));
}
export function imageFileError(file){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||!Number.isSafeInteger(file.size)||file.size<1||file.size>VISUAL_LIMIT)return 'Выбери PNG, JPEG или WebP до 8 МБ.';
 return null;
}
export function visualUploadHash(worldId,assetId){if(!uuid.test(worldId)||!uuid.test(assetId))throw Error('Invalid visual link');return '#visual='+worldId+'/'+assetId;}
export function parseVisualHash(hash){const m=/^#visual=([^/]+)\/([^/]+)$/.exec(hash||'');return m&&uuid.test(m[1])&&uuid.test(m[2])?{worldId:m[1],assetId:m[2]}:null;}
export const VISUAL_GUIDANCE='ВИЗУАЛЬНЫЙ МИР: /иллюстрация, /портрет, /фотоальбом и просьбы показать внешность, место, книгу или предмет не двигают время и не отвечают за героя. Получи list_world_illustrations и get_visual_profile, сначала переиспользуй подходящую готовую картинку. Для нового изображения request_world_illustration создаёт сохранённую заявку с референсами и ссылкой загрузки, НЕ изображение. Если доступна генерация изображений в ChatGPT, вызови её с подготовленным промптом и доступными референсами. После генерации вызови save_chatgpt_illustration с реальным файлом из ответа/Library (официальный fileParams), если хост предоставляет его. Не придумывай download_url или file_id. Если хост не передал файл, попроси выбрать именно созданное изображение из Library и сохрани его в ту же заявку; крайний вариант — PWA. Для повторного просмотра или референса вызови read_world_illustration_image: возвращает сами пиксели. Не утверждай, что сохранено, пока status ready. Никаких платных API, обходов закрытых endpoint или фоновых генераторов. Если генератор недоступен, не выдумывай результат. Иллюстрации создаются на основании подтверждённых сведений, без спойлеров и изменения канона. frequency определяет частоту предложений: off — не предлагать, request — только явно, significant — значимые сцены, first_seen — новые объекты, frequent — чаще. Не генерируй автоматически без доступного инструмента и не обещай фоновую работу. ';
