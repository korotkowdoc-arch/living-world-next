import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {detectWorldChange,canAutoSyncMenu} from '../public/core/cloud-sync.mjs';

const snapshot={id:'world-1',active_branch_id:'branch-A',head_scene_id:'head-1',directive_version:3,auto_save:true,updated_at:'2026-11-23T00:00:00Z'};
test('cloud check identifies brand-new saved story without downloading any scene bodies',()=>{
 const latest={...snapshot,updated_at:'2026-11-23T01:00:00Z'};
 assert.equal(detectWorldChange(snapshot,latest,'head-2').kind,'story');
 assert.equal(detectWorldChange(snapshot,latest,'head-2').message.includes('продолжение'),true);
});
test('branch switches take priority over head changes and do not conflate old and new memories',()=>{
 const latest={...snapshot,active_branch_id:'branch-B',updated_at:'2026-11-23T01:00:00Z'};
 assert.equal(detectWorldChange(snapshot,latest,'head-B').kind,'branch');
});
test('rules and settings changes are handled without assuming a new scene',()=>{
 assert.equal(detectWorldChange(snapshot,{...snapshot,directive_version:4},snapshot.head_scene_id).kind,'rules');
 assert.equal(detectWorldChange(snapshot,{...snapshot,auto_save:false},snapshot.head_scene_id).kind,'settings');
 assert.equal(detectWorldChange(snapshot,{...snapshot,updated_at:'later'},snapshot.head_scene_id).kind,'world');
 assert.equal(detectWorldChange(snapshot,{...snapshot},snapshot.head_scene_id),null);
});
test('cross-world comparisons are forbidden',()=>{
 assert.throws(()=>detectWorldChange(snapshot,{...snapshot,id:'world-2'},'head-1'),/разные миры/);
});
test('iPhone sync uses a non-disruptive opt-in banner and checks only while visible',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/id='cloud-change-banner'/);
 assert.match(app,/↻ Синхронизировать/);
 assert.match(app,/visibilitychange/);
 assert.match(app,/document.visibilityState==='visible'/);
 assert.match(app,/if\(!confirmLeaveDraft\(\)\)return/);
 const check=app.slice(app.indexOf('async function checkCloudChanges(){'),app.indexOf('function renderWorld(){'));
 assert.match(check,/autoSafe\(\)&&await reloadWorld\(snapshot.id,\{accept:autoSafe\}\)/);
 assert.doesNotMatch(check,/activeHistory\(/);
});

test('automatic synchronization only refreshes safe menu sections after a scene change',()=>{
 const c={kind:'story'};assert.equal(canAutoSyncMenu(c,{section:'tasks'}),true);assert.equal(canAutoSyncMenu(c,{section:'health'}),true);
 for(const section of ['settings','journal','memories','illustrations','portraits','gallery'])assert.equal(canAutoSyncMenu(c,{section}),false);
 assert.equal(canAutoSyncMenu(c,{section:'tasks',dirty:true}),false);assert.equal(canAutoSyncMenu(c,{section:'tasks',blocked:true}),false);assert.equal(canAutoSyncMenu({kind:'branch'},{section:'tasks'}),false);
});
