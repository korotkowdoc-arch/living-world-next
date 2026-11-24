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
