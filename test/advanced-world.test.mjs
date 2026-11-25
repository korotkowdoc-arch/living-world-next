import test from 'node:test';
import assert from 'node:assert/strict';
import {advancedIndex,advancedShapeError} from '../public/core/advanced-world.mjs';
import {replay,validateStateAppend,needsStatePreflight} from '../public/core/continuity.mjs';
import {playerMenuOverview,menuActionIntent,menuSection} from '../public/core/game-menu.mjs';
import {worldDepthIndex} from '../public/core/world-depth.mjs';
const adv=(kind,record_id,patch)=>({id:'e_'+record_id,type:'world',key:'advanced:'+kind+':'+record_id,advanced_version:1,advanced_kind:kind,record_id,evidence:'Confirmed event.',...patch});
const money=(id,actor,counterparty,amount)=>({id,type:'money',actor,counterparty,currency:'GBP',operation:'transfer',delta:-amount,evidence:'Confirmed event.'});
const scene=(id,events)=>({id,events,body:'Confirmed event. All occurred.',world_time:'2000-01-01 09:00'});
const instrument=adv('instrument','bond',{actor:'Bank',title:'Bond',instrument_kind:'bond',status:'open',currency:'GBP',total_units:3,unit_price:100});
const lot=adv('lot','one',{actor:'Hero',instrument_id:'bond',units:2,amount:200,currency:'GBP',transfer_event_id:'buy',status:'held'});
const quote={id:'quote',type:'knowledge',actor:'Hero',topic_id:'instrument_bond',knowledge_version:1,status:'knows',fact:'Bond, 100 GBP per unit',channel:'Bank',evidence:'Confirmed event.'};
const motive=adv('motive','fear',{actor:'Hero',title:'Fear of heights',description:'Avoids tall bridges',motive_kind:'fear',intensity:'high',status:'active'});
const channel=adv('channel','paper',{actor:'Editor',title:'Gazette',channel_kind:'newspaper',status:'active'});
const edition=adv('edition','first',{channel_id:'paper',topic_id:'gazette_first',title:'Secret headline',description:'Unseen text',status:'published'});
const map=adv('map_point','home',{actor:'Hero',map_id:'town',title:'Home',x:12,y:8,status:'recorded'});
const all=[scene('s1',[instrument,quote,motive,channel,edition,map]),scene('s2',[money('buy','Hero','Bank',200),lot])];
test('investment lot ownership, issued units and known quote require accepted prior transfer',()=>{
 const p=replay(all),idx=advancedIndex(all,p),hero=idx.view('Hero'),bank=idx.view('Bank');
 assert.deepEqual(idx.warnings,[]);
 assert.equal(hero.investments.lots.records[0].purchase_amount,200);
 assert.equal(hero.investments.lots.records[0].known_value,'200');
 assert.equal(bank.investments.instruments.records[0].issued_units,2);
 assert.equal(idx.view('Other').investments.lots.total,0);
 assert.ok(needsStatePreflight([lot]));
 const second={...lot,id:'e_two',record_id:'two',key:'advanced:lot:two'};
 assert.equal(validateStateAppend(all,[money('buy','Hero','Bank',200),second],'Confirmed event.').ok,false);
 assert.equal(validateStateAppend(all,[{...lot,id:'e_bad',record_id:'bad',key:'advanced:lot:bad',units:1,amount:100,transfer_event_id:'missing'}],'Confirmed event.').ok,false);
 const pay=adv('distribution','income',{actor:'Hero',lot_id:'one',amount:10,currency:'GBP',transfer_event_id:'pay',status:'paid'});
 const sale={...lot,id:'sold',status:'sold',transfer_event_id:'sell',amount:240};
 const history=[...all,scene('s3',[money('pay','Bank','Hero',10),pay]),scene('s4',[{...instrument,id:'reprice',unit_price:120},money('sell','Bank','Hero',240),sale])];
 const after=advancedIndex(history,replay(history));assert.equal(after.warnings.length,0);
 assert.equal(after.view('Hero').investments.lots.records[0].realized_result,'50');
 assert.equal(after.view('Bank').investments.instruments.records[0].issued_units,0);
 assert.equal(after.view('Hero').investments.instruments.records[0].unit_price,null);
});
test('duplicate, wrong-direction, and rejected transfers never mint investment lots',()=>{
 const second={...lot,id:'e_two',record_id:'two',key:'advanced:lot:two',units:1,amount:100};
 for(const events of [[money('buy','Bank','Hero',100),second],[money('buy','Hero','Bank',100),{...second,transfer_event_id:'missing'}],[money('buy','Hero','Bank',100),{...second,transfer_event_id:'buy'},{...second,id:'e_three',key:'advanced:lot:three',record_id:'three'}]]){
  const history=[scene('s1',[instrument]),scene('s2',events)],idx=advancedIndex(history,replay(history));
  assert.ok(idx.warnings.length);
  assert.ok(idx.view('Hero').investments.lots.total<=1);
 }
 const bad=advancedIndex(all,{...replay(all),validation_warnings:[{scene_id:'s2',event_id:'buy'}]});
 assert.equal(bad.view('Hero').investments.lots.total,0);
});
test('motives, map observations and knowledge of publications are actor-specific',()=>{
 const p=replay(all),v=advancedIndex(all,p).view('Hero');
 assert.equal(v.motives.records[0].title,'Fear of heights');
 assert.equal(v.map_points.records[0].x,12);
 assert.equal(v.channels.editions.total,0);
 assert.equal(advancedIndex(all,p).view('Other').motives.total,0);
 const learned={id:'read',type:'knowledge',knowledge_version:1,actor:'Hero',topic_id:'gazette_first',status:'knows',fact:'Read actual public report',channel:'Gazette',evidence:'Confirmed event.'};
 const next=[...all,scene('s3',[learned])],after=advancedIndex(next,replay(next)).view('Hero');
 assert.equal(after.channels.editions.records[0].title,'Read actual public report');
 assert.equal(after.channels.editions.records[0].source.scene_id,'s3');
 assert.doesNotMatch(JSON.stringify(after),/Unseen text|Secret headline/);
 const overview=playerMenuOverview(p,'Hero',null,{scenes:all});
 assert.equal(menuActionIntent({action:'sell_investment',lot_id:'one',detail:'Sell'},overview).saved,false);
 assert.throws(()=>menuActionIntent({action:'edit_motive',motive_id:'missing',detail:'Edit'},overview));
 assert.ok(menuSection(overview,'investments').data);
 assert.ok(advancedShapeError({...map,x:Infinity}));
 assert.ok(advancedIndex(all,p,{complete:false}).view('Hero').memory_complete===false);
});
test('timeline pagination returns distinct pages and exact totals',()=>{
 const history=Array.from({length:55},(_,i)=>scene('p'+i,[{id:'x'+i,type:'character',name:'Hero',state_patch:{location:'Place '+i},evidence:'Confirmed event.'}]));
 const index=worldDepthIndex(history,replay(history));
 const first=index.view('Hero',{limit:24}).timeline,second=index.view('Hero',{offset:24,limit:24}).timeline;
 assert.equal(first.total,55);assert.equal(first.next_offset,24);assert.equal(second.next_offset,48);
 assert.notEqual(first.records[0].value,second.records[0].value);
});

test('an active news subscription motivates reception but never reveals unseen edition to player',()=>{
 const subscription=adv('subscription','sub',{actor:'Hero',channel_id:'paper',status:'active'});
 const history=[scene('s1',[channel,edition,subscription])],p=replay(history);
 const idx=advancedIndex(history,p),candidate=idx.opportunities().find(x=>x.kind==='news_subscription_review');
 assert.equal(candidate.row.actor,'Hero');assert.equal(candidate.info.news_subscription.edition_id,'first');
 assert.equal(idx.view('Hero').channels.editions.total,0);
 assert.doesNotMatch(JSON.stringify(idx.view('Hero')),/Secret headline|Unseen text/);
 const learned={id:'read',type:'knowledge',knowledge_version:1,actor:'Hero',topic_id:'gazette_first',status:'knows',fact:'Read actual report',channel:'Gazette',evidence:'Confirmed event.'};
 const next=[...history,scene('s2',[learned])];
 assert.equal(advancedIndex(next,replay(next)).opportunities().filter(x=>x.kind==='news_subscription_review').length,0);
});
