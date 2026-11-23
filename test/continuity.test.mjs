import test from 'node:test';import assert from 'node:assert/strict';
import {branchAncestry,replay,validateScene,buildNextContext} from '../public/core/continuity.mjs';
const e=(id,type,evidence,rest={})=>({id,type,evidence,...rest});
const s=(id,parent_scene_id,body,events=[])=>({id,parent_scene_id,body,world_time:'1991',events});
const lock={text:'Гарри и Малфой — враги. Никакого примирения.',metadata:{relationship_lock:{a:'Гарри',b:'Малфой',forbid_reconciliation:true}}};
test('explicit no-reconciliation lock blocks automatic friendship in recorded relations',()=>{
 const body='Гарри и Малфой внезапно стали друзьями.';
 const ev=e('r1','relationship',body,{a:'Гарри',b:'Малфой',stance:'friends'});
 assert.equal(validateScene({body,events:[ev],directives:[lock]}).ok,false);
 assert.equal(validateScene({body,events:[ev],directives:[]}).ok,true);
});
test('enmity does not imply automatic mutual respect or symmetric relationship',()=>{
 const body='Гарри ненавидел Малфоя.';
 const result=replay([s('1',null,body,[e('r1','relationship',body,{a:'Гарри',b:'Малфой',stance:'hatred'})])],[lock]);
 assert.equal(result.relationships.length,1);
 assert.equal(result.relationships[0].a,'Гарри');assert.equal(result.relationships[0].stance,'hatred');
});
test('assert literal evidence and distinct ids, not plausible paraphrase',()=>{
 const body='Джинни взяла книгу с полки.';
 assert.equal(validateScene({body,events:[e('1','item','Джинни получила книгу',{item_id:'book',action:'acquire'})]}).ok,false);
 assert.equal(validateScene({body,events:[e('1','item','Джинни взяла книгу',{item_id:'book',action:'acquire'}),e('1','item','с полки',{item_id:'book',action:'hold'})]}).ok,false);
});
test('branch ancestry excludes invalidated alternate tail',()=>{
 const all=[s('a',null,'Начальная общая сцена.'),s('b','a','Они помирились в ветке А.'),s('c','b','Ветки А дальнейшее развитие.'),s('d','a','В ветке Б они остались врагами.'),s('e','d','Ещё одна сцена ветки Б.')];
 assert.deepEqual(branchAncestry(all,'e').map(x=>x.id),['a','d','e']);
 assert.deepEqual(branchAncestry(all,'c').map(x=>x.id),['a','b','c']);
});
test('detect missing ancestor and scene cycles',()=>{
 assert.throws(()=>branchAncestry([s('a','missing','Some scene body')],'a'),/отсутствует/);
 assert.throws(()=>branchAncestry([s('a','a','Some scene body')],'a'),/цикл/);
});
test('unknown money is not zero; verified balances cannot be overspent',()=>{
 const first=s('1',null,'Гарри получил пять монет.',[e('money1','money','получил пять монет',{actor:'Гарри',currency:'galleon',delta:5})]);
 const unknown=replay([first]);assert.equal(unknown.balances[0].known,false);assert.equal(unknown.balances[0].delta,5);
 const reconcile=s('2','1','Сверка показала десять монет.',[e('money2','money','десять монет',{actor:'Гарри',currency:'galleon',delta:0,balance:10,operation:'reconcile'})]);
 const overspend=s('3','2','Гарри потратил двенадцать монет.',[e('money3','money','двенадцать монет',{actor:'Гарри',currency:'galleon',delta:-12})]);
 const projected=replay([first,reconcile,overspend]);assert.equal(projected.balances[0].balance,10);assert.equal(projected.validation_warnings.length,1);
});
test('knowledge needs explicit holder, fact and channel',()=>{
 const body='Гарри подслушал пароль в коридоре.';
 assert.equal(validateScene({body,events:[e('k','knowledge','подслушал пароль',{actor:'Гарри',fact:'пароль',channel:'overheard'})]}).ok,true);
 assert.equal(validateScene({body,events:[e('k','knowledge','подслушал пароль',{actor:'Гарри',fact:'пароль'})]}).ok,false);
});
test('context does not imply unannotated scenes contain no activity',()=>{
 const world={id:'1',seed:'Мир в Хогвартсе',title:'Хогвартс',active_branch_id:'b'};
 const context=buildNextContext({world,scenes:[s('s',null,'Жизнь продолжается, но события ещё не размечены.') ]});
 assert.match(context.memory_warning,/Неразмеченные/);assert.equal(context.confirmed_scene_count,1);
});
