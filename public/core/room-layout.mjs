/** Room geometry is confirmed evidence, not a procedural map generator.
 * All dimensions are centimetres. Ownership epochs prevent inherited private layouts. */
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const txt=x=>typeof x==='string'&&x.trim()===x&&x.length>0&&x.length<=140;
const one=(x,v)=>v.includes(x);
const int=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const same=(a,b,ks)=>ks.every(k=>(a[k]??null)===(b[k]??null));
const homeFields=['home_kind','home_id','title_revision'];
const geometry=['floor','x_cm','y_cm','width_cm','height_cm'];
const get=(r,k,i)=>r.get('player-life:'+k+':'+i);
const page=(records,limit=40)=>({records:records.slice(0,limit),total:records.length,omitted:Math.max(0,records.length-limit)});
export const ROOM_LAYOUT_KINDS=['room_layout','room_connection'];
const validGeometry=e=>int(e.floor,-5,100)&&int(e.x_cm,0,50000)&&int(e.y_cm,0,50000)&&int(e.width_cm,1,20000)&&int(e.height_cm,1,20000)&&e.x_cm+e.width_cm<=50000&&e.y_cm+e.height_cm<=50000;
export function roomLayoutError(e){
 if(!txt(e.actor)||!one(e.home_kind,['estate','lease'])||!id(e.home_id)||!id(e.room_id)||e.title_revision!=null&&(e.home_kind!=='estate'||!id(e.title_revision)))return 'Invalid room layout identity';
 if(e.life_kind==='room_layout'&&(!validGeometry(e)||!one(e.status,['recorded','withdrawn'])))return 'Invalid measured room geometry';
 if(e.life_kind==='room_connection'&&(!id(e.other_room_id)||e.other_room_id===e.room_id||!one(e.connection_kind,['doorway','passage','stairs'])||!one(e.status,['open','closed','removed'])))return 'Invalid observed connection';
 return null;
}
function visibleRoom(r,e,roomId=e.room_id){
 const room=get(r,'room',roomId),home=get(r,e.home_kind,e.home_id);
 if(!room||room.status!=='active'||room.actor!==e.actor||!same(room,e,homeFields)||home?.actor!==e.actor)return null;
 if(e.home_kind==='estate'&&(home.status!=='owned'||(home.last_sale_id??null)!==(e.title_revision??null)))return null;
 if(e.home_kind==='lease'&&home.status!=='active')return null;
 return room;
}
const activeLayout=(r,e)=>e.life_kind==='room_layout'&&e.status==='recorded'&&validGeometry(e)&&!!visibleRoom(r,e);
const activeLink=(r,e)=>e.life_kind==='room_connection'&&one(e.status,['open','closed'])&&!!visibleRoom(r,e)&&!!visibleRoom(r,e,e.other_room_id);
const overlap=(a,b)=>a.floor===b.floor&&a.x_cm<b.x_cm+b.width_cm&&b.x_cm<a.x_cm+a.width_cm&&a.y_cm<b.y_cm+b.height_cm&&b.y_cm<a.y_cm+a.height_cm;
const compatible=(kind,a,b)=>!a||!b||(kind==='stairs'?a.floor!==b.floor:a.floor===b.floor);
export function roomLayoutTransition(r,e){
 const err=roomLayoutError(e);if(err)return err;
 const old=r.get(e.key),rows=[...r.values()];
 if(!visibleRoom(r,e))return 'Room requires current observed title and access';
 if(e.life_kind==='room_layout'){
  if(old&&!same(old,e,['home_kind','home_id','room_id']))return 'Layout identity fixed';
  if(e.status==='withdrawn')return old&&old.status==='recorded'&&same(old,e,['actor',...homeFields,...geometry])?null:'Withdrawal requires current measurement';
  const layouts=rows.filter(x=>x.key!==e.key&&activeLayout(r,x)&&same(x,e,['actor',...homeFields]));
  if(layouts.some(x=>x.room_id===e.room_id||overlap(x,e)))return 'Duplicate measurement or overlapping rooms';
  for(const link of rows.filter(x=>activeLink(r,x)&&same(x,e,['actor',...homeFields])&&(x.room_id===e.room_id||x.other_room_id===e.room_id))){
   const other=link.room_id===e.room_id?link.other_room_id:link.room_id;
   if(!compatible(link.connection_kind,e,layouts.find(x=>x.room_id===other)))return 'Update incompatible room connection first';
  }
 }else{
  if(!visibleRoom(r,e,e.other_room_id))return 'Both rooms must be confirmed in the same home';
  if(old&&!same(old,e,['home_kind','home_id','room_id','other_room_id','connection_kind']))return 'Connection identity fixed';
  if(e.status==='removed')return old&&one(old.status,['open','closed'])&&same(old,e,['actor',...homeFields])?null:'Removal requires current connection';
  if(rows.some(x=>x.key!==e.key&&activeLink(r,x)&&same(x,e,['actor',...homeFields])&&((x.room_id===e.room_id&&x.other_room_id===e.other_room_id)||(x.room_id===e.other_room_id&&x.other_room_id===e.room_id))))return 'Duplicate room connection';
  const layouts=rows.filter(x=>activeLayout(r,x)&&same(x,e,['actor',...homeFields]));
  if(!compatible(e.connection_kind,layouts.find(x=>x.room_id===e.room_id),layouts.find(x=>x.room_id===e.other_room_id)))return 'Connection kind incompatible with recorded floors';
 }
 return null;
}
export function roomLayoutView(projection={},actor){
 const rows=projection.worldFacts||[],r=new Map(rows.map(x=>[x.key,x])),groups=new Map();
 const layouts=new Map(rows.filter(e=>e.actor===actor&&activeLayout(r,e)).map(e=>[e.room_id,e]));
 for(const e of rows.filter(x=>x.life_kind==='room'&&x.actor===actor&&visibleRoom(r,{...x,room_id:x.record_id}))){
  const k=JSON.stringify([e.home_kind,e.home_id,e.title_revision??null]);
  if(!groups.has(k))groups.set(k,{home_id:e.home_id,home_kind:e.home_kind,title:get(r,e.home_kind,e.home_id)?.title??e.home_id,rooms:[],links:[],epoch:e.title_revision??null});
  const l=layouts.get(e.record_id);
  groups.get(k).rooms.push({id:e.record_id,label:e.label,area:e.area,purpose:e.purpose,source:e.source,geometry:l?{...Object.fromEntries(geometry.map(k=>[k,l[k]])),source:l.source}:null});
 }
 for(const e of rows.filter(x=>x.actor===actor&&activeLink(r,x))){
  const g=groups.get(JSON.stringify([e.home_kind,e.home_id,e.title_revision??null]));
  if(!g)continue;
  const a=g.rooms.find(x=>x.id===e.room_id),b=g.rooms.find(x=>x.id===e.other_room_id);
  if(a&&b&&compatible(e.connection_kind,a.geometry,b.geometry))g.links.push({id:e.record_id,room_id:e.room_id,other_room_id:e.other_room_id,from:a.label,to:b.label,kind:e.connection_kind,status:e.status,source:e.source});
 }
 const homes=[...groups.values()].map(g=>{
  const floors=new Map();
  for(const x of g.rooms.filter(x=>x.geometry)){
   const f=x.geometry.floor;if(!floors.has(f))floors.set(f,[]);floors.get(f).push(x);
  }
  return {home_id:g.home_id,home_kind:g.home_kind,title:g.title,room_count:g.rooms.length,measured_rooms:g.rooms.filter(x=>x.geometry).length,floors:page([...floors].sort((a,b)=>a[0]-b[0]).map(([floor,rooms])=>({floor,rooms:page(rooms)})),15),unknown_rooms:page(g.rooms.filter(x=>!x.geometry)),connections:page(g.links)};
 });
 return {...page(homes,12),policy:'Only recorded room rectangles and links in current access epoch. Unknown room positions remain unmeasured; links show connectivity, not exact doorway positions or a complete architectural survey.'};
}
export const ROOM_ACTIONS=Object.freeze({room_inspect:'Осмотреть комнату',room_measure:'Уточнить размеры и планировку',room_redecorate:'Обсудить отделку комнаты',room_arrange:'Обустроить комнату',room_connect:'Уточнить связь между комнатами'});
export function validateRoomAction(input,overview){
 if(!Object.hasOwn(ROOM_ACTIONS,input.action))return;
 const rooms=overview.market_home?.rooms?.records||[],a=rooms.find(x=>x.id===input.room_id);
 if(!id(input.room_id)||!a)throw Error('Room unavailable in current player view');
 if(input.action==='room_connect'){
  const b=rooms.find(x=>x.id===input.other_room_id);
  if(!id(input.other_room_id)||!b||a.id===b.id||!same(a,b,['home_kind','home_id']))throw Error('Choose two distinct rooms in the same accessible home');
 }else if(input.other_room_id!=null)throw Error('Second room is only valid for a connection intent');
}
export const ROOM_LAYOUT_GUIDANCE='ПЛАНИРОВКА: room_layout (player_life_version=1, record_id, key=player-life:room_layout:<ID>, evidence), actor=владелец/арендатор,home_kind,home_id,title_revision (estate),room_id=текущий room,floor (-5..100),x_cm,y_cm (0..50000),width_cm,height_cm (1..20000; пределы 50000),status=recorded/withdrawn. Размеры только после установленного измерения/описания, не выдумывай план; комнаты одного этажа не пересекаются. room_connection: те же actor/home/epoch/room_id,other_room_id,connection_kind=doorway/passage/stairs,status=open/closed/removed. Связь подтверждается отдельно, этажи совместимы; не выводи дверь из соседства. После смены титула заново подтверждай комнаты и геометрию. Размеры не означают разрешения на строительные работы; для аренды проверяй согласие владельца, расходы и изменения — отдельные сыгранные события.';
