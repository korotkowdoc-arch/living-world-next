import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneMemoryError,sceneSaveAudit,sceneMemoryRecall,memoryCoverageSummary,eventRoute,legacySourceRecall} from '../public/core/scene-memory-routing.mjs';
import {validateScene,replay,validateStateAppend} from '../public/core/continuity.mjs';
import {reviewSceneDraft} from '../public/core/scene-draft.mjs';
import {prepareStoryTurn} from '../public/core/story-turn.mjs';
const body='Анна сказала, что завтра намерена отправиться в Лондон. Борис купил книгу.';
const n={id:'n',type:'world',scene_memory_version:1,memory_kind:'intention',domain:'travel',actors:['Анна'],actor:'Анна',summary:'Намерена поехать в Лондон',topics:['Лондон'],evidence:'Анна сказала, что завтра намерена отправиться в Лондон.'};
const scene=(id,events,b=body)=>({id,events,body:b,world_time:'2000-01-01 09:00'});
test('isolated memory is valid but cannot create knowledge, funds, plans or state',()=>{
 assert.equal(sceneMemoryError(n),null);assert.equal(validateScene({body,events:[n]}).ok,true);
 const p=replay([scene('s',[n])]);assert.equal(p.worldFacts.length,0);assert.equal(p.knowledge.length,0);assert.equal(p.plans.length,0);assert.equal(p.balances.length,0);
 assert.equal(validateScene({body,events:[{...n,key:'player-life:journey:fake'}]}).ok,false);
 assert.equal(validateScene({body,events:[n,{...n,id:'dup'}]}).ok,false);
 assert.equal(validateScene({body,events:[{...n,actor:undefined}]}).ok,false);
 const plan={id:'p',type:'plan',actor:'Анна',plan_id:'travel',action:'complete',performed_event_id:'n',evidence:n.evidence};
 assert.equal(validateScene({body,events:[n,plan]}).ok,false);
});
test('routing labels intended state destinations, prompts for potentially omitted facts, never creates them',()=>{
 const e={id:'item',type:'item',evidence:'Борис купил книгу.'};
 const a=sceneSaveAudit(body,[n,e]);
 assert.equal(a.interpretive_memory_count,1);assert.equal(a.routes[0].domain,'inventory');
 assert.ok(a.review_cues.some(x=>x.domain==='finance'));assert.ok(a.review_cues.every(x=>x.kind==='review_cue_not_a_fact'));
 assert.equal(eventRoute({type:'world',player_life_version:1,life_kind:'room_layout'}).domain,'property');
 assert.equal(eventRoute({type:'world',player_life_version:1,life_kind:'community_event'}).domain,'community');
 assert.equal(eventRoute({type:'world',document_version:1,document_kind:'chapter'}).domain,'documents');
});
test('recall retrieves actual source by exact actor or topic, not unrelated actors; no rejected notes',()=>{
 const h=[scene('s1',[n]),scene('s2',[{...n,id:'bad',actor:'Other'}])],p=replay(h);
 const r=sceneMemoryRecall(h,p,{actors:['Анна']});assert.equal(r.notes.length,1);assert.equal(r.notes[0].source.scene_id,'s1');assert.equal(r.notes[0].memory_kind,'intention');
 assert.equal(sceneMemoryRecall(h,p,{actors:['Борис']}).notes.length,0);
 assert.equal(sceneMemoryRecall(h,p,{queries:['Лондон']}).notes.length,1);
 const turn=prepareStoryTurn(h,p,[],{actors:['Анна'],scope:'focus'});assert.equal(turn.scene_memory_recall.notes[0].source.scene_id,'s1');
 assert.equal(memoryCoverageSummary(h).counts.with_supplemental_memory,1);
});
test('draft includes routing before commit; existing pending choice must remain last',()=>{
 const r=reviewSceneDraft({complete:true,scenes:[]},{body,events:[n]});
 assert.equal(r.ok,true);assert.equal(r.saved,false);assert.equal(r.extraction_routing.interpretive_memory_count,1);
 assert.equal(validateStateAppend([], [n], body).ok,true);
 const pending={id:'p',type:'world',dynamics_version:1,dynamics_kind:'player_choice',record_id:'p',key:'dynamics:player_choice:p',actor:'Анна',status:'pending',description:'Choose',question:'Что делать?',options:[{id:'a',text:'A'},{id:'b',text:'B'}],evidence:'Что делать?'};
 assert.equal(validateScene({body:body+' Что делать?',events:[pending,n]}).ok,false);
});

test('local evidence in one passage does not suppress review of a later passage in the same domain',()=>{
 const body='Анна заплатила за книгу.\n\n'+'Описание. '.repeat(180)+'\n\nБорис купил новый котёл.';
 const a=sceneSaveAudit(body,[{id:'m',type:'money',evidence:'Анна заплатила за книгу.'}]);
 assert.ok(a.source_segments>1);assert.ok(a.review_cues.some(x=>x.domain==='finance'&&x.excerpt.includes('Борис купил')));
 for(const c of a.review_cues)assert.equal(body.slice(c.start,c.end),c.excerpt);
});
test('recall ranks old exact actor plus topic matches above newer weak matches even when one domain is crowded',()=>{
 const old={...n,id:'old',summary:'Лондон и особый архив',topics:['архив']};
 const h=[scene('old',[old]),...Array.from({length:40},(_,i)=>scene('recent-'+i,[{...n,id:'r'+i,summary:'План '+i,topics:['поездка']}]))];
 const p=replay(h),r=sceneMemoryRecall(h,p,{actors:['Анна'],queries:['архив'],maxNotes:1});
 assert.equal(r.notes[0].source.scene_id,'old');
});

test('legacy generic records are retrievable as literal source hints without changing typed state',()=>{
 const old={id:'old',type:'world',key:'old-room',description:'Анна узнала о комнате и возможной аренде.',evidence:'Анна узнала о комнате и возможной аренде.'};
 const h=[scene('s1',[old],old.evidence)],p=replay(h);
 const found=legacySourceRecall(h,p,{actors:['Анна']});
 assert.equal(found.canonical,false);assert.equal(found.records[0].source.scene_id,'s1');assert.equal(found.records[0].kind,'legacy_literal_source_hint');
 assert.ok(found.records[0].possible_domains.includes('property'));
 assert.equal(legacySourceRecall(h,p,{actors:['Борис']}).records.length,0);
 assert.equal(sceneMemoryRecall(h,p,{actors:['Анна']}).legacy_source_hints.records.length,1);
 assert.equal(memoryCoverageSummary(h).counts.legacy_generic_records,1);
 assert.equal(p.balances.length,0);assert.equal(p.items.length,0);assert.equal(p.knowledge.length,0);
});
