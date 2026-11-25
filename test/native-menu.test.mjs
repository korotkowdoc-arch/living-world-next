import test from 'node:test';
import assert from 'node:assert/strict';
import {directorySections,menuSnapshotKey,menuSectionTransition,MENU_GROUPS} from '../public/core/native-menu.mjs';
import {gameMenuContext} from '../public/core/game-menu.mjs';
const world={id:'w',active_branch_id:'b',head_scene_id:'h',directive_version:1};
const sections=gameMenuContext({world,context:{head_scene_id:'h',memory_complete:true}}).sections;
test('directory exposes every actual menu section by category, search and favorites',()=>{
 const ids=MENU_GROUPS.filter(g=>g.id!=='quick').flatMap(g=>directorySections(sections,{group:g.id}).map(s=>s.id));
 assert.equal(ids.length,47);assert.equal(new Set(ids).size,47);
 assert.equal(directorySections(sections,{group:'hero',query:'письма'})[0].id,'letters');
 assert.equal(directorySections(sections,{favorites:['rituals','character','rituals']})[0].id,'rituals');
 assert.equal(directorySections(sections,{query:'nonexistent'}).length,0);
});
test('navigation is a pure local selection and snapshot keys isolate branch and head',()=>{
 const before=JSON.stringify(world);
 assert.equal(menuSectionTransition(sections,'dashboard','letters'),'letters');
 assert.equal(menuSectionTransition(sections,'letters','dashboard'),'dashboard');
 assert.equal(menuSectionTransition(sections,'letters','unknown'),'letters');
 assert.notEqual(menuSnapshotKey(world),menuSnapshotKey({...world,head_scene_id:'new'}));
 assert.notEqual(menuSnapshotKey(world),menuSnapshotKey({...world,active_branch_id:'other'}));
 assert.equal(JSON.stringify(world),before);
});
