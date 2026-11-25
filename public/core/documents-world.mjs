/** Branch-local persistent fictional documents. Text is written once, never
 * generated on a read. Access, reading, knowledge, and rights are distinct. */
const kinds=['document','edition','chapter','access','reading','bookmark','note','review','royalty','link'];
const categories=['textbook','research','grimoire','medical','history','fiction','diary','newspaper','contract','will','law','certificate','report','lecture','assignment','catalogue','statement','photo','letter','other'];
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,60}$/.test(x);
const text=(x,n=140)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
const one=(v,a)=>a.includes(v);
const positive=x=>Number.isSafeInteger(x)&&x>0;
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const key=(...x)=>JSON.stringify(x);
const source=(s,e)=>({scene_id:s.id,event_id:e.id,world_time:s.world_time??null});
const page=(rows,offset=0,limit=24)=>({records:rows.slice(offset,offset+limit),total:rows.length,omitted:Math.max(0,rows.length-offset-limit),next_offset:offset+limit<rows.length?offset+limit:null});
const uniq=(rows,f)=>new Set(rows.map(f)).size===rows.length;
const safeLinks=['technique','tradition','research','formula','condition','therapy','ritual','patent','task','appointment','invitation','employment','instrument','loan','estate','service','letter','topic','place','other'];
export const isDocument=e=>e?.document_version!==undefined||typeof e?.key==='string'&&e.key.startsWith('document:');
export function documentShapeError(e){
 if(!isDocument(e))return null;
 const k=e.document_kind;
 if(e.type!=='world'||e.document_version!==1||!kinds.includes(k)||!id(e.record_id)||e.key!=='document:'+k+':'+e.record_id||!text(e.actor)||!text(e.evidence,12000))return 'Invalid document envelope';
 if(['magic_version','magic_society_version','advanced_version','world_record_version','social_record_version','interaction_version','activity_version','consequence_version','growth_version','dynamics_version','player_life_version'].some(v=>e[v]!==undefined))return 'Document must be a separate record';
 if(k==='document'&&(!text(e.title,240)||!one(e.category,categories)||!text(e.summary,1000)||!one(e.status,['active','archived'])||!one(e.visibility,['private','public'])||e.channel_id!=null&&!id(e.channel_id)))return 'Invalid document';
 if(k==='edition'&&(!id(e.document_id)||!positive(e.number)||!text(e.title,240)||!one(e.status,['draft','published','withdrawn'])||!Array.isArray(e.contents)||!e.contents.length||e.contents.length>100||!e.contents.every(c=>c&&id(c.id)&&text(c.title,240))||!uniq(e.contents,c=>c.id)||e.previous_id!=null&&!id(e.previous_id)))return 'Invalid edition manifest';
 if(k==='chapter'&&(!id(e.edition_id)||!id(e.chapter_id)||!text(e.title,240)||!text(e.body,16000)||e.status!=='recorded'))return 'Invalid persistent chapter';
 if(k==='access'&&(!id(e.edition_id)||!text(e.reader)||!one(e.status,['granted','revoked'])||!text(e.basis,600)))return 'Invalid access record';
 if(k==='reading'&&(!id(e.edition_id)||!id(e.chapter_id)||!one(e.status,['started','read','studied'])||!text(e.summary,1000)||e.reaction!=null&&!text(e.reaction,600)))return 'Invalid reading episode';
 if(k==='bookmark'&&(!id(e.edition_id)||!id(e.chapter_id)||!one(e.status,['saved','removed'])))return 'Invalid bookmark';
 if(k==='note'&&(!id(e.edition_id)||!id(e.chapter_id)||!text(e.body,4000)||!one(e.status,['active','archived'])))return 'Invalid personal note';
 if(k==='review'&&(!id(e.edition_id)||!text(e.title,240)||!text(e.body,4000)||!one(e.status,['private','published'])))return 'Invalid review';
 if(k==='royalty'&&(!id(e.edition_id)||!text(e.recipient)||e.actor===e.recipient||!positive(e.amount)||!text(e.currency,40)||!text(e.transfer_event_id,180)||e.status!=='paid'))return 'Invalid royalty';
 if(k==='link'&&(!id(e.edition_id)||!id(e.chapter_id)||!one(e.target_kind,safeLinks)||!text(e.target_id,180)||!text(e.label,240)||e.status!=='recorded'))return 'Invalid document link';
 return null;
}
export function documentIndex(scenes=[],projection={}, {complete=true}={}){
 const records=new Map(),warnings=[],manifests=new Map(),chapters=new Map(),accesses=new Map(),readings=new Map(),bookmarks=new Map(),latestEdition=new Map();
 const badScenes=new Set(),badEvents=new Set();
 for(const w of projection.validation_warnings||[]){if(w.event_id==null)badScenes.add(w.scene_id);else badEvents.add(key(w.scene_id,w.event_id));}
 const get=(k,i)=>records.get('document:'+k+':'+i);
 const editionOwner=e=>get('document',e?.document_id)?.actor;
 const can=(e,actor)=>!!e&&(editionOwner(e)===actor||accesses.get(key(e.record_id,actor))?.status==='granted');
 const chapter=(ed,c)=>chapters.get(key(ed,c));
 const completedRead=(ed,c,actor)=>['read','studied'].includes(readings.get(key(ed.record_id,c,actor))?.status);
 const hadRead=(ed,actor)=>ed.contents.some(c=>completedRead(ed,c.id,actor));
 if(complete)for(const s of scenes){
  if(badScenes.has(s.id))continue;
  const money=new Map(),used=new Set();
  for(const e of s.events||[])if(!isDocument(e)&&e?.transfer_event_id)used.add(e.transfer_event_id);
  for(const e of s.events||[]){
   if(badEvents.has(key(s.id,e.id)))continue;
   if(e.type==='money'&&e.operation==='transfer')money.set(e.id,e);
   if(!isDocument(e))continue;
   let err=documentShapeError(e);const k=e.document_kind,old=records.get(e.key);
   const same=fields=>!old||fields.every(f=>JSON.stringify(old[f])===JSON.stringify(e[f]));
   const ed=get('edition',e.edition_id),d=ed&&get('document',ed.document_id);
   if(!err&&k==='document'&&!same(['actor','title','category','visibility','channel_id']))err='Document identity cannot change';
   if(!err&&k==='edition'){
    const doc=get('document',e.document_id),prev=latestEdition.get(e.document_id);
    if(!doc||doc.actor!==e.actor||!same(['actor','document_id','number','title','contents','previous_id'])||!old&&(e.number!==(prev?.number??0)+1||e.previous_id!==(prev?.record_id??undefined)&&!(prev==null&&e.previous_id==null))||!old&&e.status==='withdrawn'||old?.status==='withdrawn'&&e.status!=='withdrawn'||old?.status==='published'&&e.status==='draft')err='Edition must be consecutive and immutable; new version uses new ID';
   }
   if(!err&&k==='chapter'){
    const entry=ed?.contents.find(c=>c.id===e.chapter_id);
    if(old||!ed||editionOwner(ed)!==e.actor||!entry||entry.title!==e.title||chapter(e.edition_id,e.chapter_id))err='Chapter requires unique immutable text and manifest entry';
   }
   if(!err&&k==='access'){
    const prior=accesses.get(key(e.edition_id,e.reader));
    if(!ed||editionOwner(ed)!==e.actor||e.reader===e.actor||!same(['actor','edition_id','reader'])||prior&&prior.record_id!==e.record_id||!old&&e.status!=='granted'||e.status==='granted'&&ed.status==='withdrawn')err='Access requires owner and stable recipient/edition ID';
   }
   if(!err&&k==='reading'){
    const prior=readings.get(key(e.edition_id,e.chapter_id,e.actor)),order=['started','read','studied'];
    if(!ed||!can(ed,e.actor)||!chapter(e.edition_id,e.chapter_id)||!same(['actor','edition_id','chapter_id'])||prior&&prior.record_id!==e.record_id||old&&order.indexOf(e.status)<order.indexOf(old.status))err='Reading requires granted access and recorded chapter; progress cannot regress';
   }
   if(!err&&k==='bookmark'){
    const prior=bookmarks.get(key(e.edition_id,e.chapter_id,e.actor));
    if(!ed||!can(ed,e.actor)||!ed.contents.some(c=>c.id===e.chapter_id)||!same(['actor','edition_id','chapter_id'])||prior&&prior.record_id!==e.record_id||!old&&e.status!=='saved')err='Bookmark requires accessible manifest entry';
   }
   if(!err&&k==='note'&&(!ed||!can(ed,e.actor)||!chapter(e.edition_id,e.chapter_id)||!same(['actor','edition_id','chapter_id'])))err='Personal note requires accessible chapter';
   if(!err&&k==='review'){
    if(!ed||!can(ed,e.actor)||!same(['actor','edition_id','title'])||old&&(old.status==='published'||e.status!=='published'||old.body!==e.body)||!ed.contents.some(c=>['read','studied'].includes(readings.get(key(ed.record_id,c.id,e.actor))?.status)))err='Review requires actual reading and unique review ID';
   }
   if(!err&&k==='royalty'){
    const t=money.get(e.transfer_event_id);
    if(old||!ed||ed.status!=='published'||editionOwner(ed)!==e.recipient||!t||used.has(e.transfer_event_id)||t.actor!==e.actor||t.counterparty!==e.recipient||t.currency!==e.currency||t.delta!==-e.amount)err='Royalty needs published edition and distinct accepted exact payment';
    if(!err)used.add(e.transfer_event_id);
   }
   if(!err&&k==='link'&&(old||!ed||editionOwner(ed)!==e.actor||!chapter(e.edition_id,e.chapter_id)))err='Link requires author and recorded chapter';
   if(err){warnings.push({scene_id:s.id,event_id:e.id,errors:[err]});continue;}
   const r={...e,source:source(s,e)};records.set(e.key,r);
   if(k==='edition'){manifests.set(e.record_id,r);if(!old||latestEdition.get(e.document_id)?.record_id===e.record_id)latestEdition.set(e.document_id,r);}
   if(k==='chapter')chapters.set(key(e.edition_id,e.chapter_id),r);
   if(k==='access')accesses.set(key(e.edition_id,e.reader),r);
   if(k==='reading')readings.set(key(e.edition_id,e.chapter_id,e.actor),r);
   if(k==='bookmark')bookmarks.set(key(e.edition_id,e.chapter_id,e.actor),r);
  }
 }
 const rows=[...records.values()],byKind=k=>rows.filter(r=>r.document_kind===k);
 const compact=r=>{const {id,key,type,document_version,document_kind,record_id,evidence,...rest}=r;return {id:record_id,kind:document_kind,...rest};};
 const isRead=(ed,c,actor)=>editionOwner(ed)===actor||['read','studied'].includes(readings.get(key(ed.record_id,c,actor))?.status);
 function view(actor,{offset=0,limit=24}={}){
  if(!complete)return {memory_complete:false};
  const editions=byKind('edition').filter(e=>can(e,actor)||hadRead(e,actor));
  const visibleIds=new Set(editions.map(e=>e.record_id)),visible=e=>visibleIds.has(e.edition_id);
  const catalogue=editions.map(e=>{
   const d=get('document',e.document_id),own=d.actor===actor,active=can(e,actor);
   const contents=e.contents.filter(c=>active||completedRead(e,c.id,actor)).map(c=>{const r=readings.get(key(e.record_id,c.id,actor)),ch=chapter(e.record_id,c.id);return {id:c.id,title:c.title,text_available:!!ch,read:!!ch&&(own||['read','studied'].includes(r?.status)),progress:own?'author':r?.status??'unread',source:isRead(e,c.id,actor)&&ch?ch.source:null,bookmark:bookmarks.get(key(e.record_id,c.id,actor))?.status==='saved'};});
   const readCount=contents.filter(c=>c.read).length;
   return {id:e.record_id,document_id:e.document_id,title:e.title,author:d.actor,category:d.category,number:e.number,status:e.status,document_status:d.status,summary:active?d.summary:null,access:active?'available':'previously_read',channel_id:d.channel_id??null,source:e.source,contents,total_chapters:contents.length,read_chapters:readCount,progress_percent:Math.round(readCount*100/contents.length),own};
  });
  const group=ks=>page(catalogue.filter(r=>ks.includes(r.category)).sort((a,b)=>String(b.source?.world_time||'').localeCompare(String(a.source?.world_time||''))||b.number-a.number),offset,limit);
  const list=(k,filter)=>page(byKind(k).filter(filter).map(compact),offset,limit);
  return {memory_complete:true,library:group(['textbook','research','grimoire','medical','history','fiction']),newspapers:group(['newspaper']),documents:group(['contract','will','law','certificate','report','lecture','assignment','catalogue','statement','letter','other']),archives:group(['diary','photo']),notebooks:group(['lecture','assignment','diary','research']),catalogues:group(['catalogue']),medical_records:group(['medical']),bank_records:group(['statement']),gallery:group(['photo']),authored:page(catalogue.filter(x=>x.own),offset,limit),bookmarks:list('bookmark',r=>r.actor===actor&&visible(r)&&r.status==='saved'),notes:list('note',r=>r.actor===actor&&visible(r)&&r.status==='active'),reading:list('reading',r=>r.actor===actor&&visible(r)),reviews:list('review',r=>visible(r)&&(r.actor===actor||r.status==='published'&&get('edition',r.edition_id).contents.some(c=>isRead(get('edition',r.edition_id),c.id,actor)))),royalties:list('royalty',r=>r.actor===actor||r.recipient===actor),access:list('access',r=>r.reader===actor||r.actor===actor),policy:'Catalogues show only author-owned or explicitly granted editions. Reading text requires recorded read or author. Viewing does not change time, knowledge, progress, consent or save.'};
 }
 function read(actor,editionId,chapterId){
  if(!complete)throw Error('Complete history required');
  const ed=get('edition',editionId);if(!ed||!can(ed,actor)&&!completedRead(ed,chapterId,actor))throw Error('Edition is not accessible');
  const entry=ed.contents.find(c=>c.id===chapterId);if(!entry)throw Error('Unknown chapter');
  const ch=chapter(editionId,chapterId),r=readings.get(key(editionId,chapterId,actor)),allowed=isRead(ed,chapterId,actor);
  return {edition_id:editionId,chapter_id:chapterId,title:entry.title,edition_title:ed.title,author:editionOwner(ed),number:ed.number,text_available:!!ch,access:can(ed,actor)?'available':'previously_read',can_read:allowed,body:allowed?ch?.body??null:null,source:allowed?ch?.source??null:null,progress:r?.status??(editionOwner(ed)===actor?'author':'unread'),summary:r?.summary??null,reaction:r?.reaction??null,links:allowed?byKind('link').filter(x=>x.edition_id===editionId&&x.chapter_id===chapterId).map(compact):[],notes:byKind('note').filter(x=>x.actor===actor&&x.edition_id===editionId&&x.chapter_id===chapterId&&x.status==='active').map(compact)};
 }
 /** Separate narrator-only exact retrieval before first reading. No learning,
  * no scene mutation and no exposure in player-facing read(). */
 function authoring(actor,editionId,chapterId){
  if(!complete)throw Error('Complete history required');
  const ed=get('edition',editionId);if(!can(ed,actor))throw Error('Edition is not accessible');
  const entry=ed.contents.find(c=>c.id===chapterId);if(!entry)throw Error('Unknown chapter');
  const ch=chapter(editionId,chapterId);
  return {edition_id:editionId,chapter_id:chapterId,title:entry.title,edition_title:ed.title,author:editionOwner(ed),number:ed.number,text_available:!!ch,body:ch?.body??null,source:ch?.source??null,requires_authoring:!ch,policy:'Narrator only. Use exact stored body; if missing author once and save chapter before recording reading. Never display before chosen reading.'};
 }
 function opportunities(){
  const out=[],seen=new Set();
  for(const e of byKind('access'))if(e.status==='granted'&&!seen.has(e.reader)){
   const ed=get('edition',e.edition_id);if(!ed||ed.status==='withdrawn')continue;
   const next=ed.contents.find(c=>!isRead(ed,c.id,e.reader));if(!next)continue;
   seen.add(e.reader);out.push({kind:'reading_opportunity',row:{actor:e.reader,key:e.key,title:ed.title,status:'unread',source:e.source},info:{record_key:e.key,timing:'requires_character_choice',document_context:{edition_id:ed.record_id,chapter_id:next.id,title:next.title},guidance:'Actual reading and resulting knowledge require narrated evidence. No automatic access, learning or progress.'}});
  }
  return out;
 }
 return {view,read,authoring,opportunities,warnings};
}
export const DOCUMENT_ACTIONS=Object.freeze({read_document:'Прочитать главу или документ',study_document:'Изучить материал',bookmark_document:'Поставить закладку',remove_document_bookmark:'Убрать закладку',write_document_note:'Записать заметку',write_document:'Начать книгу или документ',continue_document:'Продолжить рукопись',publish_document:'Опубликовать издание',share_document:'Передать доступ к изданию',review_document:'Написать рецензию',reply_letter:'Ответить на письмо'});
export const DOCUMENT_ACTION_IDS=Object.freeze({read_document:'edition_id',study_document:'edition_id',bookmark_document:'edition_id',remove_document_bookmark:'edition_id',write_document_note:'edition_id',continue_document:'edition_id',publish_document:'edition_id',share_document:'edition_id',review_document:'edition_id',reply_letter:'letter_id'});
export function documentActionRows(input,overview){
 if(input.action==='reply_letter')return (overview.life?.letters?.incoming.records||[]).filter(r=>r.status==='read');
 const d=overview.documents;if(!d?.memory_complete)return [];
 const xs=[...d.library.records,...d.newspapers.records,...d.documents.records,...d.archives.records,...d.authored.records];
 return [...new Map(xs.map(r=>[r.id,r])).values()].filter(r=>!['continue_document','publish_document','share_document'].includes(input.action)||r.own);
}
export function validateDocumentAction(input,overview){
 const f=DOCUMENT_ACTION_IDS[input.action];if(!f)return;
 const r=documentActionRows(input,overview).find(x=>x.id===input[f]);if(!r)throw Error('Document or letter is not accessible');
 if(r.access==='previously_read')throw Error('Current access required for new action');
 if(['read_document','study_document','bookmark_document','remove_document_bookmark','write_document_note'].includes(input.action)){
  const c=r.contents?.find(x=>x.id===input.chapter_id);if(!c)throw Error('Select a chapter from the manifest');
  if(input.action==='remove_document_bookmark'&&!c.bookmark)throw Error('No bookmark to remove');
  if(input.action==='write_document_note'&&!c.read)throw Error('Read chapter first');
 }
 if(input.action==='publish_document'&&r.status!=='draft'||input.action==='share_document'&&r.status==='withdrawn'||input.action==='review_document'&&r.read_chapters===0)throw Error('Document status does not permit this action');
}
export const DOCUMENT_GUIDANCE='ЧИТАЕМЫЕ МАТЕРИАЛЫ: /меню библиотека, письма, газеты, документы, архив; кратко содержание и реакция героя в сцене, полный художественный текст письма в player-life letter.message, а главы/договоры/статьи в document chapter.body. Не пересказывай вместо полного текста при запросе открыть уже прочитанное. Сохраняй точный полный текст при первом создании или реально сыгранном чтении, не переписывай при повторном просмотре, не выдумывай ранее существовавший текст. Если глава ещё не материализована, предложи намерение прочитать и создай её в следующей подтверждённой сцене; не меняй текущий выбор ради просмотра. События type=world,document_version=1,document_kind,record_id,key=document:<kind>:<ID>,actor,evidence (дословная цитата сцены о документе/чтении, не весь текст). document:title,category textbook/research/grimoire/medical/history/fiction/diary/newspaper/contract/will/law/certificate/report/lecture/assignment/catalogue/statement/photo/letter/other,summary,visibility private/public,status active/archived,channel_id необязателен. edition:document_id,number (1,2...),previous_id для нового издания,title,contents:[{id,title}] (оглавление до 100 глав),status draft/published/withdrawn. chapter:edition_id,chapter_id,title,body (полный текст до 16000 символов),status recorded; автор документа actor; неизменно. Длинные главы дели заранее по оглавлению. access:edition_id,reader,basis,status granted/revoked,actor автор; приобретение/передача/разрешение только по сцене, даже публичность не означает знание. reading:edition_id,chapter_id,summary,reaction,status started/read/studied,actor читатель, один ID на главу/читателя; отдельные knowledge события только при фактическом изучении, не все теории истинны. bookmark:edition_id,chapter_id,status saved/removed, note:edition_id,chapter_id,body,status active/archived. review:edition_id,title,body,status private/published, после чтения. royalty:edition_id,recipient,amount,currency,transfer_event_id,status paid,actor плательщик, только отдельный принятый перевод автору. link:edition_id,chapter_id,target_kind,target_id,label,status recorded; это указатель, не действие и не знание. В чат выводи меню с кнопками, которые отправляют явное намерение, а не совершают действие; просмотр уже прочитанного без времени. Перед реально выбранным первым чтением или написанием главы используй get_document_authoring с edition_id/chapter_id: если текст есть, бери его без изменений; если отсутствует, создай один раз. Для первого чтения доставленного письма этот же инструмент принимает letter_id. Не показывай результат narrator-only до выбранного действия. При отозванном доступе ранее прочитанные главы можно повторно просмотреть, но нельзя читать новые или делать новые действия. Для точного чтения get_world_document, если инструмент не доступен в текущем подключении, используй видимый source.scene_id и get_story_scene, извлекай только разрешённую главу из события; не показывай неизвестные главы, личные заметки или чужую почту.';
