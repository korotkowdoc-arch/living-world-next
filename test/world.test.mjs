import test from 'node:test';import assert from 'node:assert/strict';
import {FOUNDATIONS,buildWorldDraft,promptForNarrator} from '../public/core/world.mjs';
import {classifyDirective,extractLocks,pairKey} from '../public/core/directives.mjs';

test('one sentence creates playable seed with optional time and no invented calendar day',()=>{
 const w=buildWorldDraft('Гарри Поттер, 1991 год. Начинаем с Хогвартса.');
 assert.match(w.title,/Гарри/);assert.equal(w.start_marker,'1991 год (точная дата не установлена)');assert.deepEqual(w.directives,[]);
 assert.equal(w.seed,'Гарри Поттер, 1991 год. Начинаем с Хогвартса.');
});
test('world creation does not demand character forms or long descriptions',()=>{
 const w=buildWorldDraft('Космическая колония');assert.ok(w.title);assert.equal(w.foundations.length,5);
 assert.throws(()=>buildWorldDraft(''),/Опиши мир/);
});
test('all psychological principles are in every narrator prompt',()=>{
 const prompt=promptForNarrator({world:{seed:'Гарри Поттер, 1991 год'},directives:[{text:'Гарри и Малфой — враги, никакого примирения.'}]});
 assert.ok(prompt.includes('не стремись')||prompt.includes('Не стремись'));
 assert.match(prompt,/инициатив/i);assert.match(prompt,/Никаких|никакого/);assert.equal(FOUNDATIONS.length,5);
});
test('natural-language rule stores exact text, no positive rewrites',()=>{
 const t='Гарри и Малфой — враги. Никакого примирения и уважения!';const d=classifyDirective(t);
 assert.equal(d.text,t);assert.equal(d.category,'relations');
 assert.deepEqual(d.relationship_lock,{a:'Гарри',b:'Малфой',forbid_reconciliation:true,forbid_respect:true});
 assert.equal(extractLocks([{metadata:{relationship_lock:d.relationship_lock}}]).length,1);
 assert.equal(pairKey('Малфой','ГАРРИ'),pairKey('гарри','МАЛФОЙ'));
});
test('ambiguous instructions remain as text, not invented structured relationships',()=>{
 const d=classifyDirective('Все меня ненавидят, но я не скажу кто');assert.equal(d.relationship_lock,null);
 assert.equal(d.text,'Все меня ненавидят, но я не скажу кто');
});
test('explicit anti-respect condition protects a different axis from friendship',()=>{
 const rule=classifyDirective('Гарри и Малфой — враги. Никакого уважения.');
 assert.equal(rule.relationship_lock.forbid_respect,true);
 assert.equal(rule.relationship_lock.forbid_reconciliation,false);
});
test('several pairs do not inherit the ban from an unrelated pair',()=>{
 const rule=classifyDirective('Гарри и Малфой — враги. Никакого примирения. Рон и Невилл — соперники.');
 assert.equal(rule.relationship_locks.length,1);
 assert.equal(rule.relationship_locks[0].a,'Гарри');
});
test('an archived directive stops blocking new scenes but remains available for audit',()=>{
 const lock={active:false,metadata:{relationship_lock:{a:'Гарри',b:'Малфой',forbid_reconciliation:true}}};
 assert.deepEqual(extractLocks([lock]),[]);
});
