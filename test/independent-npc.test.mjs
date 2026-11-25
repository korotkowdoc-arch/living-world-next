import test from 'node:test';
import assert from 'node:assert/strict';
import {independentSocialOpportunities,npcInitiativeView} from '../public/core/npc-initiatives.mjs';
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
