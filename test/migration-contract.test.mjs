import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/001_story_controls.sql',import.meta.url),'utf8');
test('migration adds isolated rule history with owner-only RLS',()=>{
 assert.match(migration,/create table if not exists public\.nw_directive_edits/);
 assert.match(migration,/enable row level security/i);
 assert.match(migration,/before_state jsonb not null/);
 assert.match(migration,/p_expected_version integer/);
});
test('scene revision is atomic, idempotent and copies only prefix-supported evidence',()=>{
 assert.match(migration,/create or replace function public\.nw_revise_scene/);
 assert.match(migration,/new_branch:=public\.nw_fork_before/);
 assert.match(migration,/new_scene:=public\.nw_commit_scene/);
 assert.match(migration,/position\(e\.value->>'evidence' in coalesce\(p_prefix,''\)\)>0/);
 assert.match(migration,/Idempotency key reused for different revision/);
});
test('database rejects relationship respect and reconciliation independently',()=>{
 assert.match(migration,/forbid_reconciliation/);
 assert.match(migration,/forbid_respect/);
 assert.match(migration,/d\.active=true/);
});
