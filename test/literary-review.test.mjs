import test from 'node:test';import assert from 'node:assert/strict';
import {literaryReview} from '../public/core/literary-review.mjs';
test('reviews repetitious bland consent and reconciliation tics without rewriting original story',()=>{
 const scenes=[{id:'one',body:'Он не хотел решать за неё. Только если ты хочешь, сказал он. Можно я тебя поцелую? Она ответила, что ненавидит его.'},
 {id:'two',body:'Они наконец нашли общий язык. Начали понимать друг друга. Ненависть уступила место уважению.'}];
 const original=JSON.stringify(scenes);const report=literaryReview(scenes);
 assert.equal(report.counts['permission-loop'],3);
 assert.equal(report.counts['forced-reconciliation'],3);
 assert.equal(report.repeated.length,2);
 assert.equal(JSON.stringify(scenes),original);
 assert.match(report.note,/не цензура/);
});
test('zero hits are not proof of psychological correctness',()=>{
 const r=literaryReview([{id:'x',body:'Малфой ненавидел Гарри. Он не искал примирения.'}]);
 assert.equal(r.samples.length,0);
 assert.equal(r.scanned_scenes,1);
});

test('exact repeated endings are review cues, not automatic rewrites',()=>{
 const ending='Они продолжали смотреть друг на друга, не зная, что сказать.';
 const report=literaryReview([{id:'a',body:'Первая сцена.\n'+ending},{id:'b',body:'Вторая сцена.\n'+ending}]);
 assert.equal(report.repeated_endings[0].count,2);
 assert.deepEqual(report.repeated_endings[0].scene_ids,['a','b']);
});
