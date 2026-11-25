import test from 'node:test';
import assert from 'node:assert/strict';
import {independentSocialOpportunities,npcInitiativeView,recordedHabitContext,recordedMarketOpportunities} from '../public/core/npc-initiatives.mjs';
import {prepareStoryTurn} from '../public/core/story-turn.mjs';
const source={scene_id:'s',event_id:'e'};
const dyn=(kind,id,extra)=>({dynamics_version:1,dynamics_kind:kind,record_id:id,key:'dynamics:'+kind+':'+id,source,...extra});
const social=(kind,id,extra)=>({social_record_version:1,social_kind:kind,record_id:id,key:'social:'+kind+':'+id,source,...extra});
const people=['Harry','Lia','Tom','Ada'].map(name=>({name,state_fields:[]}));
const records=[
 dyn('contest','seat',{title:'Committee seat',resource:'Seat',actors:['Harry','Lia','Tom'],status:'open'}),
 dyn('contest','closed',{title:'Ended',resource:'Other seat',actors:['Harry','Ada'],status:'decided'}),
 social('group','guild',{name:'Guild',purpose:'Practice',status:'active'}),
 social('membership','lia',{actor:'Lia',group_id:'guild',role:'member',status:'member'}),
 social('membership','tom',{actor:'Tom',group_id:'guild',status:'member'}),
 social('membership','ada',{actor:'Ada',group_id:'guild',status:'left'}),
 dyn('institution','guildhall',{group_id:'guild',place:'Town',status:'operating'}),
 dyn('enterprise','one',{actor:'Lia',title:'Bakery A',place:'Town',business_kind:'bakery',status:'operating'}),
 dyn('enterprise','two',{actor:'Tom',title:'Bakery B',place:'Town',business_kind:'bakery',status:'operating'}),
 dyn('enterprise','closed',{actor:'Ada',title:'Bakery C',place:'Town',business_kind:'bakery',status:'closed'}),
 dyn('employment','job',{actor:'Harry',counterparty:'Ada',title:'Job',status:'offered'}),
 dyn('economic_agreement','deal',{actor:'Harry',counterparty:'Tom',title:'Deal',status:'active',amount:10,currency:'gold'}),
 {growth_version:1,growth_kind:'skill',key:'skill:1',source,actor:'Harry',teacher:'Lia',name:'Craft',status:'learning'}
];
test('each recorded contender and active community member gets a distinct candidate with evidence',()=>{
 const before=JSON.stringify(records),rows=independentSocialOpportunities(records,people);
 const actors=kind=>rows.filter(x=>x.kind===kind).map(x=>x.row.actor).sort();
 assert.deepEqual(actors('contest_participant'),['Harry','Lia','Tom']);
 assert.deepEqual(actors('community_member'),['Lia','Tom']);
 assert.deepEqual(actors('market_peer'),['Lia','Tom']);
 assert.deepEqual(actors('employer_response'),['Ada']);
 assert.deepEqual(actors('mentor_response'),['Lia']);
 assert.deepEqual(actors('agreement_party'),['Tom']);
 assert.ok(rows.every(x=>x.row.source.scene_id==='s'&&x.info.record_key));
 assert.equal(new Set(rows.map(x=>x.row.key)).size,rows.length);
 assert.equal(JSON.stringify(records),before);
 assert.equal(independentSocialOpportunities([{...records[0],source:null}],people).length,0);
});
test('turn integration exposes candidates but no player initiative, no wrong-party funds check',()=>{
 const projection={worldFacts:records,people:[...people,{name:'Nia',state_fields:[{field:'habit',value:'Read after lunch',source}]}]};
 const before=JSON.stringify(projection);
 const turn=prepareStoryTurn([{id:'s',world_time:'1994-08-01 09:00'}],projection,[],{actors:['Harry'],limit:30});
 assert.ok(turn.candidates.some(x=>x.kind==='contest_participant'&&x.actors[0]==='Lia'));
 assert.ok(turn.candidates.some(x=>x.kind==='habit_opportunity'&&x.actors[0]==='Nia'));
 const agreement=turn.candidates.find(x=>x.kind==='agreement_party');
 assert.ok(agreement);
 assert.ok(!agreement.checks.some(x=>x.kind==='funds_unknown'));
 assert.ok(turn.npc_initiatives.initiatives.every(x=>x.actor!=='Harry'&&x.certainty==='candidate_only_not_performed'));
 assert.equal(JSON.stringify(projection),before);
 const incomplete=prepareStoryTurn([{id:'s',world_time:'1994-08-01 09:00'}],projection,[],{actors:['Harry'],complete:false});
 assert.deepEqual(incomplete.npc_initiatives.initiatives,[]);
});
test('urgent duties then actionable opportunities, deduplicated and player-safe',()=>{
 const c=(actor,key,kind='intention',checks=[],timing='unknown')=>({actors:[actor],key,kind,status:'active',checks,timing,source});
 const due=c('Ada','due','intention',[],'reached_requires_story');
 const next=c('Tom','ready');
 const optional=c('Lia','habit','habit_opportunity');
 const blocked=c('Bob','blocked','intention',[{kind:'funds_unknown'}]);
 const v=npcInitiativeView([blocked,optional,next,due,next,c('Harry','player')],{player:'Harry',settings:{agency:'high',events:'high'}});
 assert.deepEqual(v.initiatives.map(x=>x.key),['due','ready','habit','blocked']);
 assert.equal(v.omitted,0);
});
test('market opportunities grow linearly in large groups and never imply rivalry or price knowledge',()=>{
 const large=Array.from({length:1000},(_,i)=>dyn('enterprise','e'+i,{actor:'Owner '+i,title:'Shop '+i,place:'Town',business_kind:'retail',status:'operating'}));
 const result=independentSocialOpportunities(large);
 assert.equal(result.length,1000);
 assert.ok(result.every(x=>x.info.peer_count===999&&x.info.peers.length<=3&&x.info.peers.every(p=>p.actor!==x.row.actor)));
});

test('habit evidence matches exact actor and activity name, and suppresses duplicate active plans',()=>{
 const scenes=[{id:'a',world_time:'1994-08-01 09:00'},{id:'b',world_time:'1994-08-02 10:00'}];
 const activity=(id,name,actors,status,scene_id)=>({activity_version:1,activity_kind:'activity',record_id:id,key:'activity:activity:'+id,name,actors,status,source:{scene_id,event_id:id}});
 const habit={activity_version:1,activity_kind:'habit',record_id:'read',key:'activity:habit:read',name:'Read',actor:'Lia',status:'active',source:{scene_id:'a',event_id:'read'}};
 const rows=[habit,activity('done','Read',['Lia'],'completed','b'),activity('other','Read',['Tom'],'completed','a'),activity('wrong','Reading',['Lia'],'completed','a'),activity('noncanonical','Read',['Lia'],'completed','missing')];
 const context=recordedHabitContext(rows,scenes,scenes[1].world_time);
 assert.equal(context('Lia','Read').matching_completed,1);
 assert.equal(context('Lia','Read').calendar_days_since_match,0);
 assert.equal(context('Tom','Read').calendar_days_since_match,1);
 assert.equal(context('Harry','Read'),null);
 const turn=prepareStoryTurn(scenes,{worldFacts:rows,people},[],{actors:['Harry'],limit:30});
 assert.ok(turn.candidates.some(x=>x.kind==='habit_opportunity'&&x.habit_history?.matching_completed===1));
 const active=activity('plan','Read',['Lia'],'planned','b');
 const second=prepareStoryTurn(scenes,{worldFacts:[...rows,active],people},[],{actors:['Harry'],limit:30});
 assert.ok(!second.candidates.some(x=>x.kind==='habit_opportunity'&&x.actors.includes('Lia')));
});
test('market review counts current pending and recent terminal order states only; no private menu or inferred demand',()=>{
 const scenes=[{id:'a',world_time:'1994-07-20 09:00'},{id:'b',world_time:'1994-08-01 09:00'},{id:'c',world_time:'1994-08-02 10:00'},{id:'d',world_time:null}];
 const life=(kind,id,extra)=>({player_life_version:1,life_kind:kind,record_id:id,key:'player-life:'+kind+':'+id,...extra});
 const service=life('venue_service','tea',{actor:'Lia',title:'Tea',place:'Town',status:'available',source:{scene_id:'a',event_id:'tea'}});
 const visit=(id,status,scene_id,provider='Lia')=>life('service_visit',id,{actor:'Tom',provider,service_id:'tea',status,title:'Tea',source:{scene_id,event_id:id}});
 const recipe=life('service_recipe','tea-recipe',{actor:'Lia',service_id:'tea',status:'active',stock_lines:[{product_id:'leaf',unit:'g',quantity:-10}],source:{scene_id:'a',event_id:'recipe'}});
 const rows=[service,recipe,visit('old','completed','a'),visit('done','completed','b'),visit('cancel','cancelled','c'),visit('open','requested','a'),visit('accepted','accepted','c'),visit('unknown','completed','d'),visit('wrong','completed','c','Ada'),visit('outside','completed','missing')];
 const out=recordedMarketOpportunities(rows,scenes,'1994-08-02 10:00');
 assert.equal(out.length,1);
 const stats=out[0].info.market_activity;
 assert.deepEqual([stats.requested,stats.accepted,stats.completed_recent,stats.cancelled_recent,stats.terminal_date_unknown],[1,1,1,1,1]);
 assert.equal(stats.as_of,'1994-08-02 10:00');
 assert.ok(stats.sources.length<=3);
 const complete=prepareStoryTurn(scenes.slice(0,3),{people,worldFacts:rows,stock:[{holder:'Lia',product_id:'leaf',unit:'g',known:true,quantity:2}]},[],{actors:['Harry'],limit:30,target_time:'1994-08-30 09:00'});
 const review=complete.candidates.find(x=>x.kind==='market_review');
 assert.ok(review);assert.equal(review.market_activity.as_of,'1994-08-02 10:00');
 assert.ok(review.checks.some(x=>x.kind==='stock_insufficient'));
 assert.equal(recordedMarketOpportunities([{...service,status:'retired'},...rows.slice(1)],scenes,'1994-08-02').length,0);
 const incomplete=prepareStoryTurn(scenes.slice(0,3),{people,worldFacts:rows},[],{actors:['Harry'],limit:30,complete:false});
 assert.ok(!incomplete.candidates.some(x=>x.kind==='market_review'));
});
