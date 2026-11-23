import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_READER,normalizeReaderPrefs,readReaderPrefs,saveReaderPrefs,prependHistoryPage} from '../public/core/reader.mjs';

const a={id:'a',parent_scene_id:null},b={id:'b',parent_scene_id:'a'},
 c={id:'c',parent_scene_id:'b'},d={id:'d',parent_scene_id:'c'};
test('reader preferences persist without auth tokens or story contents',()=>{
 const map=new Map();
 const storage={getItem:key=>map.get(key),setItem:(key,val)=>map.set(key,val)};
 assert.deepEqual(readReaderPrefs(storage),DEFAULT_READER);
 assert.deepEqual(saveReaderPrefs(storage,{fontSize:21,lineHeight:1.9}),{fontSize:21,lineHeight:1.9});
 assert.deepEqual(readReaderPrefs(storage),{fontSize:21,lineHeight:1.9});
 assert.equal(map.size,1);
 assert.equal(JSON.stringify([...map]).includes('token'),false);
});
test('reader typography is clamped to useful iPhone values and never crashes with blocked storage',()=>{
 assert.deepEqual(normalizeReaderPrefs({fontSize:1000,lineHeight:9}),{fontSize:30,lineHeight:2.3});
 assert.deepEqual(normalizeReaderPrefs({fontSize:-8,lineHeight:-1}),{fontSize:15,lineHeight:1.35});
 assert.deepEqual(readReaderPrefs({getItem:()=>{throw Error('private browsing')}}),DEFAULT_READER);
 assert.deepEqual(saveReaderPrefs({setItem:()=>{throw Error('private browsing')}},{fontSize:24,lineHeight:1.8}),{fontSize:24,lineHeight:1.8});
});
test('paginated history reconstructs exact oldest-to-newest ancestry',()=>{
 const merged=prependHistoryPage([c,d],[b,a],{expectedHead:'d'});
 assert.deepEqual(merged.map(s=>s.id),['a','b','c','d']);
});
test('mixed or duplicated history pages are rejected instead of silently corrupting context',()=>{
 assert.throws(()=>prependHistoryPage([c,d],[b,a],{expectedHead:'other'}),/изменилась/);
 assert.throws(()=>prependHistoryPage([c,d],[c],{expectedHead:'d'}),/повтор/);
 assert.throws(()=>prependHistoryPage([c,d],[a],{expectedHead:'d'}),/разрыв/);
 assert.throws(()=>prependHistoryPage([c,d],[b,d],{expectedHead:'d'}),/повтор/);
});
