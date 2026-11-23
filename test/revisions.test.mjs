import test from 'node:test';import assert from 'node:assert/strict';
import {prepareRevision} from '../public/core/revisions.mjs';
const old={body:'Гарри открыл дверь.\n\nМалфой ушёл.\n\nГарри вернулся домой.',events:[
  {id:'x',type:'world',key:'door',evidence:'открыл дверь'},
  {id:'y',type:'relationship',a:'Гарри',b:'Малфой',evidence:'Малфой ушёл.'}
]};
test('preserve exact scene prefix and only events literally inside it',()=>{
 const r=prepareRevision(old,{lastKeptQuote:'Малфой ушёл.',newContinuation:'Малфой остался в замке.'});
 assert.ok(r.body.startsWith('Гарри открыл дверь.\n\nМалфой ушёл.'));
 assert.equal(r.preservedEvents.length,2);
 assert.equal(r.droppedEvents,0);
 assert.equal(r.body.includes('Гарри вернулся домой.'),false);
});
test('replacement from start does not import events from cancelled scene',()=>{
 const r=prepareRevision(old,{newContinuation:'Это было совсем другое начало.'});
 assert.equal(r.prefix,'');assert.equal(r.preservedEvents.length,0);assert.equal(r.droppedEvents,2);
});
test('original scene is unchanged and ambiguous anchor is rejected',()=>{
 const snapshot=JSON.stringify(old);
 assert.throws(()=>prepareRevision({body:'Ход событий. Ход событий.'},{lastKeptQuote:'Ход событий.',newContinuation:'Позже всё изменилось.'}),/повторяется/);
 assert.throws(()=>prepareRevision(old,{lastKeptQuote:'Несуществующая фраза',newContinuation:'Новое'}),/отсутствует/);
 assert.equal(JSON.stringify(old),snapshot);
});
