import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/004_agency_and_memory.sql',import.meta.url),'utf8');
test('migration 004 preserves legacy worlds and requires same-payload scene retries',()=>{
 assert.doesNotMatch(sql,/\blw_(?:worlds|scenes|branches|characters)\b/);
 assert.match(sql,/rules_version_at_commit/);
 assert.match(sql,/existing\.parent_scene_id is not distinct from p_expected_head/);
 assert.match(sql,/existing\.world_time is not distinct from/);
 assert.match(sql,/existing\.events=coalesce\(p_events/);
 assert.match(sql,/if p_expected_rules_version is null or/);
});
test('migration 004 pins all structured-memory pages to the same active head',()=>{
 assert.match(sql,/create or replace function public\.nw_active_memory_page/);
 assert.match(sql,/current_head is distinct from p_expected_head/);
 assert.match(sql,/join ancestry a on s.id=a.parent_scene_id/);
 assert.match(sql,/order by a\.depth asc/);
 assert.match(sql,/grant execute on function public\.nw_active_memory_page/);
});
test('NPC plan completion requires an event in the same scene',()=>{
 assert.match(sql,/e->>'type'='plan'/);
 assert.match(sql,/e->>'action'='complete'/);
 assert.match(sql,/a\.value->>'id'=e->>'performed_event_id'/);
 assert.match(sql,/a\.value->>'type' in \('world','offscreen'\)/);
});
test('exact scene lineage is checked before a historical source influences current memory',()=>{
 assert.match(sql,/create or replace function public\.nw_scene_in_active_branch/);
 assert.match(sql,/s\.owner_id=auth\.uid\(\)/);
 assert.match(sql,/where id=p_scene_id/);
});
