import test from 'node:test';
import assert from 'node:assert/strict';
import {replay,validateStateAppend} from '../public/core/continuity.mjs';
import {marketHomeView,marketHomeTransition,marketHomeError} from '../public/core/market-home.mjs';
import {playerMenuOverview,menuSection,menuActionIntent} from '../public/core/game-menu.mjs';
import {visualSubjects} from '../public/core/visual-world.mjs';
const source={scene_id:'s',event_id:'e'};
const life=(kind,id,fields)=>({id:'ev_'+id,type:'world',player_life_version:1,life_kind:kind,record_id:id,key:'player-life:'+kind+':'+id,evidence:'Confirmed event.',...fields});
const estate=life('estate','house',{actor:'Hero',title:'House',place:'Lane',estate_kind:'house',status:'owned'});
const room=life('room','study',{actor:'Hero',home_kind:'estate',home_id:'house',area:'Study',label:'Study',purpose:'Research',description:'Quiet room',walls:'Green',flooring:'Wood',lighting:'Lamp',status:'active'});
const scene=(id,events)=>({id,events,body:'Confirmed event.',world_time:'2000-01-01 09:00'});
test('room is an accepted canonical observation and exposed through property menu and visual subjects',()=>{
 const history=[scene('s1',[estate]),scene('s2',[room])];
 assert.equal(validateStateAppend(history.slice(0,1),[room],'Confirmed event.').ok,true);
 const projection=replay(history);
 const overview=playerMenuOverview(projection,'Hero','2000-01-01 09:00',{scenes:history});
 assert.equal(menuSection(overview,'property').data.rooms.records[0].walls,'Green');
 assert.ok(visualSubjects(overview,'s2').some(r=>r.subject_id==='room:study'));
 assert.equal(menuActionIntent({action:'manage_property',estate_id:'house',detail:'Change the purpose'},overview).saved,false);
 assert.throws(()=>menuActionIntent({action:'manage_property',estate_id:'other',detail:'Change'},overview));
 assert.equal(marketHomeView(projection,'Other').rooms.total,0);
});
test('room identity, title revision, duplicate area and access are checked',()=>{
 const records=new Map([[estate.key,{...estate,source}],[room.key,{...room,source}]]);
 assert.ok(marketHomeError({...room,walls:[]}));assert.ok(marketHomeTransition(records,new Map(),{...room,area:'Kitchen'}));
 assert.ok(marketHomeTransition(records,new Map(),{...room,actor:'Other'}));
 assert.ok(marketHomeTransition(records,new Map(),{...room,key:'player-life:room:dup',record_id:'dup',area:'study'}));
 const sold={...estate,actor:'Buyer',last_sale_id:'sale',source};records.set(estate.key,sold);
 assert.equal(marketHomeView({worldFacts:[...records.values()]},'Hero').rooms.total,0);
 assert.equal(marketHomeView({worldFacts:[...records.values()]},'Buyer').rooms.total,0);
 assert.ok(marketHomeTransition(records,new Map(),{...room,actor:'Buyer'}));
 assert.equal(marketHomeTransition(records,new Map(),{...room,actor:'Buyer',title_revision:'sale'}),null);
});
test('room only includes currently placed owned items, room edits do not transfer or create property',()=>{
 const furniture=life('furnishing','f',{actor:'Hero',home_kind:'estate',home_id:'house',area:'Study',item_id:'chair',description:'Chair',status:'placed'});
 const projection={worldFacts:[estate,room,furniture].map(r=>({...r,source})),items:[{item_id:'chair',name:'Chair',holder:'Hero',custody_status:'held'}]};
 assert.equal(marketHomeView(projection,'Hero').rooms.records[0].furnishings.total,1);
 projection.items[0].holder='Other';assert.equal(marketHomeView(projection,'Hero').rooms.records[0].furnishings.total,0);
});
