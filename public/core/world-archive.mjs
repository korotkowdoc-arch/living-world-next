/** Canonical in-world publications and private records. Text is authored once,
 * then retrieved verbatim from the actual branch. No generation on read. */
const kinds=['book','textbook','grimoire','paper','newspaper','contract','will','law','certificate','medical','lecture','research','diary','catalogue','statement','album','letter','other'];
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,65}$/.test(x);
const str=(x,n=140)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
const int=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const key=(...x)=>JSON.stringify(x);
const src=(s,e)=>({scene_id:s.id,event_id:e.id,world_time:s.world_time??null});
const page=(rows,offset=0,limit=24)=>({records:rows.slice(offset,offset+limit),total:rows.length,omitted:Math.max(0,rows.length-offset-limit),next_offset:offset+limit<rows.length?offset+limit:null});
const groups={library:['book','textbook','grimoire','paper'],documents:['contract','will','law','certificate','other','letter'],notebooks:['lecture','research','diary'],gallery:['album'],catalogues:['catalogue'],newspapers:['newspaper'],medical_records:['medical'],bank_records:['statement']};
export const ARCHIVE_SECTIONS=Object.keys(groups);
export const isArchive=e=>e?.archive_version!==undefined||typeof e?.key==='string'&&e.key.startsWith('archive:');
const recordKinds=['document','part','access','reading','note','bookmark','review','publication'];
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function archiveShapeError(e){
 if(!isArchive(e))return null;
 const k=e.archive_kind;
 if(e.type!=='world'||e.archive_version!==1||!recordKinds.includes(k)||!id(e.record_id)||e.key!=='archive:'+k+':'+e.record_id||!str(e.actor)||!str(e.evidence,12000))return 'Invalid archive record identity';
 if(['magic_version','magic_society_version','advanced_version','world_record_version','social_record_version','interaction_version','activity_version','consequence_version','growth_version','dynamics_version','player_life_version'].some(v=>e[v]!==undefined))return 'Archive record must be separate';
 if(k==='document'&&(!kinds.includes(e.document_kind)||!str(e.title,240)||!str(e.author,240)||!str(e.summary,1000)||!str(e.edition,140)||!['private','circulated','published'].includes(e.status)||e.previous_id!=null&&!id(e.previous_id)||!Array.isArray(e.contents)||e.contents.length<1||e.contents.length>100||e.contents.some(x=>!x||!id(x.id)||!str(x.title,240))||new Set(e.contents.map(x=>x.id)).size!==e.contents.length))return 'Invalid publication metadata or table of contents';
 if(k==='part'&&(!id(e.document_id)||!id(e.part_id)||!str(e.text,16000)||e.summary!=null&&!str(e.summary,1000)||e.status!=='recorded'))return 'Invalid immutable publication part';
 if(k==='access'&&(!id(e.document_id)||!str(e.reader)||!['granted','revoked'].includes(e.status)||!str(e.basis,300)))return 'Invalid document access';
 if(k==='reading'&&(!id(e.document_id)||!id(e.part_id)||!['read','studied'].includes(e.status)||!str(e.reflection,1000)))return 'Invalid reading record';
 if(k==='note'&&(!id(e.document_id)||e.part_id!=null&&!id(e.part_id)||!str(e.text,4000)||!['active','archived'].includes(e.status)))return 'Invalid private note';
 if(k==='bookmark'&&(!id(e.document_id)||!id(e.part_id)||!['active','removed'].includes(e.status)))return 'Invalid bookmark';
 if(k==='review'&&(!id(e.document_id)||!str(e.text,4000)||!['private','shared'].includes(e.status)))return 'Invalid review';
 if(k==='publication'&&(!id(e.document_id)||!str(e.publisher)||!str(e.channel,200)||!['proposed','accepted','published','rejected'].includes(e.status)))return 'Invalid publication agreement';
 return null;
}
export function archiveIndex(scenes=[],projection={}, {complete=true}={}){
 const records=new Map(),docs=new Map(),parts=new Map(),access=new Map(),reading=new Map(),bookmarks=new Map(),reviews=new Map(),publications=new Map(),warnings=[];
 const badScenes=new Set(),badEvents=new Set();
 for(const w of projection.validation_warnings||[]){if(w.event_id==null)badScenes.add(w.scene_id);else badEvents.add(key(w.scene_id,w.event_id));}
 const get=(k,i)=>records.get('archive:'+k+':'+i);
 const known=(doc,actor)=>doc.actor===actor||access.get(key(doc.record_id,actor))?.status==='granted';
 const canRead=(doc,actor)=>known(doc,actor)||reading.has(key(doc.record_id,actor));
 const err=(s,e,message)=>warnings.push({scene_id:s.id,event_id:e.id,errors:[message]});
 if(complete)for(const s of scenes){
  if(badScenes.has(s.id))continue;
  for(const e of s.events||[]){
   if(!isArchive(e)||badEvents.has(key(s.id,e.id)))continue;
   let error=archiveShapeError(e);const k=e.archive_kind,old=records.get(e.key),doc=docs.get(e.document_id);
   const same=fields=>!old||fields.every(f=>equal(old[f],e[f]));
   const part=doc?.contents.find(p=>p.id===e.part_id);
   if(!error&&k==='document'){
    const prev=docs.get(e.previous_id);
    if(old||e.previous_id&&(!prev||prev.actor!==e.actor||prev.document_kind!==e.document_kind))error='Document metadata is immutable; create a separate edition';
   }
   if(!error&&k==='part'){
    if(old||!doc||doc.actor!==e.actor||!part||parts.has(key(e.document_id,e.part_id)))error='Part requires unique declared ID, owner and immutable text';
   }
   if(!error&&k==='access'){
    const prior=access.get(key(e.document_id,e.reader));
    if(!doc||doc.actor!==e.actor||e.reader===e.actor||!same(['actor','document_id','reader'])||prior&&prior.record_id!==e.record_id||!old&&e.status!=='granted'||e.status==='revoked'&&old?.status!=='granted')error='Access requires owner and stable grant';
   }
   if(!error&&k==='reading'){
    const prior=reading.get(key(e.document_id,e.actor))?.get(e.part_id);
    if(!doc||!part||!parts.has(key(e.document_id,e.part_id))||!known(doc,e.actor)||!same(['actor','document_id','part_id'])||prior&&prior.record_id!==e.record_id||old?.status==='studied'&&e.status!=='studied')error='Reading needs accessible saved text; study cannot regress';
   }
   if(!error&&k==='note'){
    if(!doc||!known(doc,e.actor)||e.part_id!=null&&(!part||!parts.has(key(e.document_id,e.part_id)))||!same(['actor','document_id','part_id'])||!old&&e.status!=='active')error='Note requires accessible document';
   }
   if(!error&&k==='bookmark'){
    const prior=bookmarks.get(key(e.document_id,e.actor,e.part_id));
    if(!doc||!known(doc,e.actor)||!part||!same(['actor','document_id','part_id'])||prior&&prior.record_id!==e.record_id||!old&&e.status!=='active'||e.status==='removed'&&old?.status!=='active')error='Bookmark requires access and stable part';
   }
   if(!error&&k==='review'){
    const prior=reviews.get(key(e.document_id,e.actor));
    if(!doc||!known(doc,e.actor)||!reading.get(key(e.document_id,e.actor))?.size||!same(['actor','document_id'])||prior&&prior.record_id!==e.record_id||old?.status==='shared')error='Review requires a recorded reading; shared review is immutable';
   }
   if(!error&&k==='publication'){
    const prior=publications.get(e.document_id);
    if(!doc||doc.actor!==e.actor||!same(['actor','document_id','publisher','channel'])||prior&&prior.record_id!==e.record_id||!old&&e.status!=='proposed'||['published','rejected'].includes(old?.status)||e.status==='accepted'&&old?.status!=='proposed'||e.status==='published'&&(old?.status!=='accepted'||doc.contents.some(p=>!parts.has(key(doc.record_id,p.id))))||e.status==='rejected'&&!['proposed','accepted'].includes(old?.status))error='Publication requires agreement and all declared text';
   }
   if(error){err(s,e,error);continue;}
   const r={...e,source:src(s,e)};records.set(e.key,r);
   if(k==='document')docs.set(e.record_id,r);
   if(k==='part')parts.set(key(e.document_id,e.part_id),r);
   if(k==='access')access.set(key(e.document_id,e.reader),r);
   if(k==='reading'){const k2=key(e.document_id,e.actor);if(!reading.has(k2))reading.set(k2,new Map());reading.get(k2).set(e.part_id,r);}
   if(k==='bookmark')bookmarks.set(key(e.document_id,e.actor,e.part_id),r);
   if(k==='review')reviews.set(key(e.document_id,e.actor),r);
   if(k==='publication')publications.set(e.document_id,r);
  }
 }
 const rows=[...records.values()];
 function card(doc,actor){
  const readings=reading.get(key(doc.record_id,actor))||new Map(),active=known(doc,actor);
  return {id:doc.record_id,kind:doc.document_kind,title:doc.title,author:doc.author,edition:doc.edition,summary:active?doc.summary:null,previous_id:doc.previous_id??null,status:publications.get(doc.record_id)?.status==='published'?'published':doc.status,access:active?'available':'previously_read',part_count:active?doc.contents.length:readings.size,read_count:readings.size,studied_count:[...readings.values()].filter(x=>x.status==='studied').length,source:doc.source};
 }
 function view(actor,{offset=0,limit=24}={}){
  if(!complete)return {memory_complete:false};
  const available=[...docs.values()].filter(d=>canRead(d,actor)).reverse();
  const result={memory_complete:true,policy:'Only saved material. Open previously read text without time change; first reading, study and access are recorded in a played scene.'};
  for(const [g,types] of Object.entries(groups))result[g]=page(available.filter(d=>types.includes(d.document_kind)).map(d=>card(d,actor)),offset,limit);
  return result;
 }
 function open(actor,documentId,partId=null){
  if(!complete)throw Error('Complete archive history required');
  const d=docs.get(documentId);if(!d||!canRead(d,actor))throw Error('Document not available');
  const r=reading.get(key(documentId,actor))||new Map(),active=known(d,actor);
  const contents=d.contents.filter(p=>active||r.has(p.id)).map(p=>({id:p.id,title:p.title,materialized:parts.has(key(documentId,p.id)),status:r.get(p.id)?.status??'unread',bookmarked:bookmarks.get(key(documentId,actor,p.id))?.status==='active'}));
  const result={...card(d,actor),contents,notes:rows.filter(x=>x.archive_kind==='note'&&x.actor===actor&&x.document_id===documentId&&x.status==='active').map(x=>({id:x.record_id,part_id:x.part_id??null,text:x.text,source:x.source})),reviews:rows.filter(x=>x.archive_kind==='review'&&x.document_id===documentId&&(x.actor===actor||active&&x.status==='shared')).map(x=>({id:x.record_id,actor:x.actor,text:x.text,status:x.status,source:x.source})),publication:publications.get(documentId)?.actor===actor?publications.get(documentId):null};
  if(partId!=null){
   const p=contents.find(x=>x.id===partId);if(!p)throw Error('Part not available');
   const part=parts.get(key(documentId,partId)),allowed=d.actor===actor||r.has(partId);
   result.part={...p,text:allowed?part?.text??null:null,summary:allowed?part?.summary??null:null,reflection:r.get(partId)?.reflection??null,source:allowed?part?.source??null:null,requires_first_read:!allowed,requires_authoring:!part};
  }
  return result;
 }
 // Authoring-only lookup for the narrator, never used for player menu display.
 function authoring(actor,documentId,partId){
  if(!complete)throw Error('Complete archive history required');
  const d=docs.get(documentId);if(!d||!known(d,actor))throw Error('No current access');
  const p=d.contents.find(x=>x.id===partId);if(!p)throw Error('Part not declared');
  const r=parts.get(key(documentId,partId));
  return {document:card(d,actor),part:{id:p.id,title:p.title,text:r?.text??null,summary:r?.summary??null,source:r?.source??null},owner:d.actor,requires_authoring:!r,policy:'Narrator-only. Do not reveal before the player chooses to read; if missing, author once with owner as actor, save part and reading in actual scene.'};
 }
 return {view,open,authoring,owns:(actor,documentId)=>complete&&docs.get(documentId)?.actor===actor,warnings};
}
export const ARCHIVE_ACTIONS=Object.freeze({read_document:'Прочитать материал',study_document:'Изучить материал',write_document:'Написать книгу или документ',write_document_part:'Написать следующую часть',annotate_document:'Сделать заметку',bookmark_document:'Поставить закладку',remove_document_bookmark:'Убрать закладку',review_document:'Написать рецензию',publish_document:'Предложить публикацию',request_document_access:'Запросить доступ'});
export function validateArchiveAction(input,overview){
 if(!Object.hasOwn(ARCHIVE_ACTIONS,input.action)||['write_document','request_document_access'].includes(input.action))return;
 const reader=overview.archive_reader;
 if(typeof reader!=='function')throw Error('Archive reader unavailable');
 const withPart=['read_document','study_document','write_document_part','bookmark_document','remove_document_bookmark'].includes(input.action);
 if(withPart&&!id(input.part_id))throw Error('Select a declared part');
 const d=reader(input.document_id,withPart||input.part_id!=null?input.part_id:null);
 if(d.access!=='available')throw Error('Current document access required');
 if(['write_document_part','publish_document'].includes(input.action)&&!overview.archive_owner(input.document_id))throw Error('Only document owner can author or publish');
 if(input.action==='write_document_part'&&d.part?.materialized)throw Error('Existing part is immutable');
 if(input.action==='remove_document_bookmark'&&!d.part?.bookmarked)throw Error('No bookmark to remove');
 if(input.action==='review_document'&&!d.read_count)throw Error('Read material before reviewing');
}
export const ARCHIVE_GUIDANCE=`ИНТЕРАКТИВНЫЕ МАТЕРИАЛЫ: текст документов, писем, газет и книг сохраняй отдельно от художественного повествования, в сцене оставляй содержание, реакцию, результат. При появлении книги/документа создай metadata и доступ; главы можно писать лениво, но каждую созданную часть сохраняй ровно один раз. Никогда не переписывай уже сохранённый текст. При новом издании новый document ID и previous_id. Сначала get_game_menu section=library/documents/notebooks/gallery/catalogues/newspapers/medical_records/bank_records. Для оглавления get_game_menu document_id, для ранее прочитанной части также part_id. Первое чтение — явный выбор героя, затем get_archive_authoring (только рассказчику, уже выбранная книга/часть), существующий текст используй дословно или если отсутствует создай и сохрани; запиши reading с реальной реакцией в сцене. Не выдавай непрочитанное содержание, не приписывай мысли/эмоции героя против решения игрока, не начисляй навыки автоматически. Повторный просмотр не меняет сцену/время. Письма используют существующий player-life letter: message — полный текст, subject и sender; при первом прочтении status read; не дублируй в archive. Газеты/договоры/законы/конспекты/медицинские карты могут хранить полный текст здесь, но юридические/денежные/медицинские последствия — отдельные действительные записи. Архив: type=world,archive_version=1,archive_kind,record_id,key=archive:<kind>:<ID>,actor,evidence (дословное подтверждение из сцены, не обязательно полный текст материала). document: actor=владелец/правообладатель (автор может отличаться), document_kind book/textbook/grimoire/paper/newspaper/contract/will/law/certificate/medical/lecture/research/diary/catalogue/statement/album/letter/other,title,author,edition,summary,contents:[{id,title}] 1–100, status private/circulated/published,previous_id optional. part: actor=владелец,document_id,part_id,text (до 16000 символов, длинные главы дели на заранее заявленные части),summary optional,status recorded. access: actor=владелец,document_id,reader,basis,status granted/revoked, стабильный ID. Публикация не даёт доступ автоматически. reading: actor=читатель,document_id,part_id,reflection,status read/studied; текущий доступ, часть уже сохранена, один стабильный ID. note: actor=читатель,document_id,part_id optional,text,status active/archived. bookmark: actor=читатель,document_id,part_id,status active/removed. review: actor=читатель,document_id,text,status private/shared. publication: actor=владелец,document_id,publisher,channel,status proposed/accepted/published/rejected; публиковать только все заполненные части после согласования; платежи и права отдельно. Авторские взгляды и вымысел в документе не равны фактам мира. Знания сохраняй отдельным knowledge после прочтения; формальные открытия и квалификации через существующие системы. При запросе лишь меню не создавай запись, не двигай время и не отвечай за героя.`;
