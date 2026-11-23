-- LIVING WORLD NEXT: performance indexes for deep ancestry and owner-scoped cascading FKs.
-- Safe to apply to an empty or already-populated NW namespace. No changes to lw_*.
create index if not exists nw_scenes_parent_idx on public.nw_scenes(parent_scene_id) where parent_scene_id is not null;
create index if not exists nw_scenes_branch_idx on public.nw_scenes(branch_id, created_at desc);
create index if not exists nw_scenes_owner_idx on public.nw_scenes(owner_id);
create index if not exists nw_branches_owner_idx on public.nw_branches(owner_id);
create index if not exists nw_directives_owner_idx on public.nw_directives(owner_id);
create index if not exists nw_directive_edits_directive_idx on public.nw_directive_edits(directive_id);
create index if not exists nw_directive_edits_owner_idx on public.nw_directive_edits(owner_id);
create index if not exists nw_revisions_branch_idx on public.nw_revisions(branch_id);
create index if not exists nw_revisions_source_idx on public.nw_revisions(source_scene_id);
create index if not exists nw_revisions_scene_idx on public.nw_revisions(new_scene_id);
create index if not exists nw_revisions_owner_idx on public.nw_revisions(owner_id);
