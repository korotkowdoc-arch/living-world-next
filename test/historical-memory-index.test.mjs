import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalNoteIndex} from '../public/core/memory-notes.mjs';
const scenes=[{id:'a'},{id:'b'},{id:'c'}];
const row=(scene_id,note_key,summary,actors)=>({scene_id,note_key,note:{kind:'other',summary,quote:summary,actors}});
test('thematic historical retrieval finds an old source without an actor match',()=>{
 const r=historicalNoteIndex([row('b','recent','Работа',['Гарри']),row('a','old','Шоколадный торт',['Лия'])],scenes,{queries:['ТОРТ'],actors:['Гарри'],complete:true,historyComplete:true});
 assert.equal(r.notes[0].scene_id,'a');assert.equal(r.total_matching,1);assert.equal(r.scenes_with_historical_notes,2);assert.equal(r.scenes_without_notes_in_scan,1);assert.equal(r.scan_complete,true);assert.equal(r.canonical,false);
});
test('deduplicates, rejects non-ancestry rows and does not silently merge actor names',()=>{
 const old=row('a','old','Пётр помнит дом',['Пётр']);
 const r=historicalNoteIndex([old,old,row('foreign','x','Пётр',['Пётр'])],scenes,{queries:['петр'],actors:['Пётр Иванов'],complete:true,historyComplete:true});
 assert.equal(r.scanned_notes,1);assert.equal(r.invalid_records,1);assert.equal(r.scan_complete,false);assert.equal(r.notes.length,1);assert.deepEqual(r.possible_actor_aliases,[{actor:'Пётр Иванов',alias:'Пётр',verified:false}]);
});
test('partial scan reports incomplete and respects note limit',()=>{
 const r=historicalNoteIndex([row('a','a','книга',['Лия']),row('b','b','книга',['Лия'])],scenes,{queries:['книга'],maxNotes:1});
 assert.equal(r.scan_complete,false);assert.equal(r.omitted,1);assert.equal(r.notes[0].scene_id,'b');
});

test('group identical evidence while retaining alternate interpretations and actor boundaries',()=>{const a=row('a','one','Книга',['Лия']),b={...row('a','two','Другая версия книги',['Лия']),note:{...a.note,summary:'Другая версия книги'}},c=row('b','three','Книга',['Лия']),d=row('a','four','Книга',['Гарри']);const h=historicalNoteIndex([a,b,c,d],scenes,{queries:['книга']});assert.equal(h.matching_note_count,4);assert.equal(h.total_matching,3);assert.equal(h.grouped_duplicate_count,1);assert.equal(h.notes.find(x=>x.scene_id==='a'&&x.actors.includes('Лия')).alternative_count,1);});
