import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/007_economy_commit_guard.sql',import.meta.url),'utf8');
const rev=readFileSync(new URL('../supabase/migrations/001_story_controls.sql',import.meta.url),'utf8');
test('SQL guard is internal and called after existing lock/receipt checks but before insertion',()=>{
 const commit=sql.slice(sql.indexOf('create or replace function public.nw_commit_scene('));
 const guard=commit.indexOf('perform public.nw_assert_economy_append');
 assert.ok(guard>commit.indexOf('current_head is distinct from p_expected_head'));
 assert.ok(guard<commit.indexOf('insert into public.nw_scenes'));
 assert.match(sql,/revoke all on function public\.nw_economy_step\(jsonb,jsonb\) from public,anon,authenticated/);
 assert.match(sql,/revoke all on function public\.nw_assert_economy_append\(uuid,uuid,jsonb\) from public,anon,authenticated/);
 assert.match(rev,/new_scene:=public\.nw_commit_scene\(/);
});
test('SQL guard traverses same owner and world, checks full ancestry, and handles explicit transfer and take',()=>{
 assert.match(sql,/s\.world_id=p_world and s\.owner_id=u/);
 assert.match(sql,/Incomplete or cyclic economy ancestry/);
 assert.match(sql,/Economy ancestry exceeds safety cap/);
 assert.match(sql,/Recipient balance overflow/);
 assert.match(sql,/Item not held by the named prior holder/);
});

test('SQL story shape guard covers recent personal systems inside commit and protects its helpers',()=>{
 const commit=sql.slice(sql.indexOf('create or replace function public.nw_commit_scene('));
 assert.ok(commit.indexOf('perform public.nw_assert_story_event_shape(e)')>commit.indexOf('current_head is distinct from p_expected_head'));
 assert.ok(commit.indexOf('perform public.nw_assert_story_event_shape(e)')<commit.indexOf('insert into public.nw_scenes'));
 assert.match(sql,/nw_assert_story_event_shape\(jsonb\) from public,anon,authenticated/);
 for(const k of ['birth_date','life_stage','education','career_goal','family_duty','life_transition','interaction_version','relationship_patch'])assert.ok(sql.includes(k));
 assert.match(commit,/relationship_patch'->>'affection'='affectionate'/);
 assert.match(commit,/relationship_patch'->>'respect'='respected'/);
});

test('SQL transition fold is private, ancestry-bound and runs before insert',()=>{
 const commit=sql.slice(sql.indexOf('create or replace function public.nw_commit_scene('));
 assert.ok(commit.indexOf('perform public.nw_assert_story_transitions')>commit.indexOf('current_head is distinct from p_expected_head'));
 assert.ok(commit.indexOf('perform public.nw_assert_story_transitions')<commit.indexOf('insert into public.nw_scenes'));
 assert.match(sql,/nw_story_transition_step\(jsonb,jsonb\) from public,anon,authenticated/);
 assert.match(sql,/nw_assert_story_transitions\(uuid,uuid,jsonb\) from public,anon,authenticated/);
 for(const m of ['Incomplete story transition ancestry','Terminal dynamics requires new ID','Established causal cycle','Invalid parent rumor','Invalid plan transition'])assert.ok(sql.includes(m));
});
