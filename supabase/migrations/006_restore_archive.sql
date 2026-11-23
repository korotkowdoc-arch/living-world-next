-- LIVING WORLD NEXT v0.8: atomic owner-scoped restoration of a verified archive to a NEW world.
-- This does not touch any existing nw_* row, and never touches legacy lw_*.
-- The browser must verify SHA-256 and graph integrity before invoking this RPC.
-- PostgreSQL independently validates owner-independent links; SHA-256 is integrity, not a signature.
create or replace function public.nw_restore_archive(p_archive jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  wid uuid := gen_random_uuid();
  original_id uuid;
  old_id text;
  parent_id text;
  d_id uuid;
  r jsonb;
  ev jsonb;
  a_world jsonb;
  branch_rows jsonb;
  scene_rows jsonb;
  directive_rows jsonb;
  edit_rows jsonb;
  revision_rows jsonb;
  branch_map jsonb := '{}'::jsonb;
  scene_map jsonb := '{}'::jsonb;
  directive_map jsonb := '{}'::jsonb;
  request_keys jsonb := '{}'::jsonb;
  revision_keys jsonb := '{}'::jsonb;
  inserted_scenes jsonb := '{}'::jsonb;
  total_scenes integer;
  done_scenes integer := 0;
  progress integer;
  active_old text;
  requested_count integer;
  new_snapshot_before jsonb;
  new_snapshot_after jsonb;
begin
  if u is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_archive)<>'object' or p_archive->>'format'<>'living-world-next-archive'
     or p_archive->>'version'<>'1' then
    raise exception 'Unsupported archive format';
  end if;
  if octet_length(p_archive::text)>33554432 then
    raise exception 'Archive exceeds 32 MiB single-transaction limit: use a smaller backup';
  end if;
  a_world := p_archive->'world';
  if jsonb_typeof(a_world)<>'object' then raise exception 'Invalid world in archive'; end if;
  original_id := (a_world->>'id')::uuid;
  if char_length(btrim(coalesce(a_world->>'title',''))) not between 1 and 100
     or char_length(btrim(coalesce(a_world->>'seed',''))) not between 8 and 12000
     or coalesce((a_world->>'directive_version')::integer,0)<0
     then raise exception 'Invalid archived world'; end if;
  branch_rows := p_archive->'branches';
  scene_rows := p_archive->'scenes';
  directive_rows := p_archive->'directives';
  edit_rows := p_archive->'directive_edits';
  revision_rows := p_archive->'revisions';
  if jsonb_typeof(branch_rows)<>'array' or jsonb_typeof(scene_rows)<>'array'
     or jsonb_typeof(directive_rows)<>'array' or jsonb_typeof(edit_rows)<>'array'
     or jsonb_typeof(revision_rows)<>'array' then
    raise exception 'Incomplete archive sections';
  end if;
  total_scenes := jsonb_array_length(scene_rows);
  if total_scenes>5000 then
    raise exception 'Archive has more than 5000 scenes: a paged importer is required';
  end if;
  if jsonb_array_length(branch_rows)=0 then raise exception 'Missing branches'; end if;
  for r in select value from jsonb_array_elements(branch_rows) loop
    old_id := (r->>'id')::uuid::text;
    if r->>'world_id'<>original_id::text or branch_map ? old_id
       then raise exception 'Invalid or duplicate archived branch'; end if;
    branch_map := branch_map || jsonb_build_object(old_id,gen_random_uuid()::text);
  end loop;
  active_old := (a_world->>'active_branch_id')::uuid::text;
  if not branch_map ? active_old then raise exception 'Active branch not in archive'; end if;
  for r in select value from jsonb_array_elements(scene_rows) loop
    old_id := (r->>'id')::uuid::text;
    if r->>'world_id'<>original_id::text or scene_map ? old_id
       or not branch_map ? ((r->>'branch_id')::uuid::text)
       then raise exception 'Invalid or duplicate archived scene'; end if;
    if char_length(r->>'body') not between 10 and 200000
       or jsonb_typeof(r->'events')<>'array' then raise exception 'Invalid scene text or events'; end if;
    if request_keys ? ((r->>'request_id')::uuid::text) then raise exception 'Duplicate scene request ID'; end if;
    request_keys := request_keys || jsonb_build_object((r->>'request_id')::uuid::text,true);
    scene_map := scene_map || jsonb_build_object(old_id,gen_random_uuid()::text);
    for ev in select value from jsonb_array_elements(r->'events') loop
      if jsonb_typeof(ev)<>'object' or coalesce(ev->>'evidence','')=''
         or strpos(r->>'body',ev->>'evidence')=0 then
        raise exception 'Scene event has no textual evidence';
      end if;
    end loop;
  end loop;
  for r in select value from jsonb_array_elements(scene_rows) loop
    if r->>'parent_scene_id' is not null
       and not scene_map ? ((r->>'parent_scene_id')::uuid::text)
       then raise exception 'Orphaned parent scene'; end if;
  end loop;
  for r in select value from jsonb_array_elements(branch_rows) loop
    if r->>'head_scene_id' is not null and not scene_map ? ((r->>'head_scene_id')::uuid::text)
       then raise exception 'Missing branch head'; end if;
    if r->>'fork_scene_id' is not null and not scene_map ? ((r->>'fork_scene_id')::uuid::text)
       then raise exception 'Missing branch fork'; end if;
  end loop;
  for r in select value from jsonb_array_elements(directive_rows) loop
    old_id := (r->>'id')::uuid::text;
    if r->>'world_id'<>original_id::text or directive_map ? old_id
       then raise exception 'Invalid or duplicate directive'; end if;
    directive_map := directive_map || jsonb_build_object(old_id,gen_random_uuid()::text);
  end loop;
  for r in select value from jsonb_array_elements(edit_rows) loop
    if r->>'world_id'<>original_id::text
       or not directive_map ? ((r->>'directive_id')::uuid::text)
       or jsonb_typeof(r->'before_state')<>'object' or jsonb_typeof(r->'after_state')<>'object'
       then raise exception 'Invalid directive edit'; end if;
  end loop;
  for r in select value from jsonb_array_elements(revision_rows) loop
    if r->>'world_id'<>original_id::text or
       not branch_map ? ((r->>'branch_id')::uuid::text) or
       not scene_map ? ((r->>'source_scene_id')::uuid::text) or
       not scene_map ? ((r->>'new_scene_id')::uuid::text) or
       jsonb_typeof(r->'new_events')<>'array' then
      raise exception 'Invalid revision links'; end if;
    old_id := (r->>'request_id')::uuid::text;
    if revision_keys ? old_id then raise exception 'Duplicate revision request ID'; end if;
    revision_keys := revision_keys || jsonb_build_object(old_id,true);
  end loop;
  -- Cross-check the counts even when a caller bypasses the browser SHA-256 validator.
  if jsonb_typeof(p_archive->'counts')<>'object' then
    raise exception 'Missing archive counts'; end if;
  for old_id,requested_count in
    select k, case k
     when 'branches' then jsonb_array_length(branch_rows)
     when 'scenes' then total_scenes
     when 'directives' then jsonb_array_length(directive_rows)
     when 'revisions' then jsonb_array_length(revision_rows)
     else jsonb_array_length(edit_rows) end
    from unnest(array['branches','scenes','directives','revisions','directive_edits']) as k
  loop
    if p_archive->'counts' ? old_id and (p_archive->'counts'->>old_id)::integer<>requested_count
       then raise exception 'Archive counts mismatch: %',old_id; end if;
  end loop;

  insert into public.nw_worlds
    (id,owner_id,title,seed,start_marker,active_branch_id,auto_save,directive_version,created_at,updated_at)
  values(wid,u,a_world->>'title',a_world->>'seed',
    coalesce(nullif(a_world->>'start_marker',''),'Время ещё не установлено'),
    null,coalesce((a_world->>'auto_save')::boolean,true),
    coalesce((a_world->>'directive_version')::integer,0),
    coalesce((a_world->>'created_at')::timestamptz,now()),
    coalesce((a_world->>'updated_at')::timestamptz,now()));
  for r in select value from jsonb_array_elements(branch_rows) loop
    insert into public.nw_branches(id,world_id,owner_id,name,created_at)
    values((branch_map->>((r->>'id')::uuid::text))::uuid,wid,u,
      coalesce(nullif(r->>'name',''),'Основная линия'),
      coalesce((r->>'created_at')::timestamptz,now()));
  end loop;

  -- Only insert children after their mapped parent exists. If there is a cycle,
  -- the loop makes no progress and the entire import rolls back.
  while done_scenes<total_scenes loop
    progress:=0;
    for r in select value from jsonb_array_elements(scene_rows) loop
      old_id := (r->>'id')::uuid::text;
      if inserted_scenes ? old_id then continue; end if;
      parent_id := case when r->>'parent_scene_id' is null then null else (r->>'parent_scene_id')::uuid::text end;
      if parent_id is not null and not inserted_scenes ? parent_id then continue; end if;
      insert into public.nw_scenes(id,world_id,owner_id,branch_id,parent_scene_id,request_id,
        body,world_time,events,created_at,rules_version_at_commit)
      values((scene_map->>old_id)::uuid,wid,u,(branch_map->>((r->>'branch_id')::uuid::text))::uuid,
        case when parent_id is null then null else (scene_map->>parent_id)::uuid end,
        gen_random_uuid(),r->>'body',r->>'world_time',r->'events',
        coalesce((r->>'created_at')::timestamptz,now()),
        (r->>'rules_version_at_commit')::integer);
      inserted_scenes:=inserted_scenes||jsonb_build_object(old_id,true);
      done_scenes:=done_scenes+1;
      progress:=progress+1;
    end loop;
    if progress=0 then raise exception 'Cyclic or disconnected scene ancestry'; end if;
  end loop;
  for r in select value from jsonb_array_elements(branch_rows) loop
    update public.nw_branches set
      head_scene_id=case when r->>'head_scene_id' is null then null else
        (scene_map->>((r->>'head_scene_id')::uuid::text))::uuid end,
      fork_scene_id=case when r->>'fork_scene_id' is null then null else
        (scene_map->>((r->>'fork_scene_id')::uuid::text))::uuid end
    where id=(branch_map->>((r->>'id')::uuid::text))::uuid;
  end loop;
  update public.nw_worlds set active_branch_id=(branch_map->>active_old)::uuid where id=wid;

  for r in select value from jsonb_array_elements(directive_rows) loop
    old_id:=(r->>'id')::uuid::text;
    insert into public.nw_directives
      (id,world_id,owner_id,text,category,metadata,active,created_at,updated_at)
    values((directive_map->>old_id)::uuid,wid,u,r->>'text',
      coalesce(r->>'category','general'),coalesce(r->'metadata','{}'::jsonb),
      coalesce((r->>'active')::boolean,true),
      coalesce((r->>'created_at')::timestamptz,now()),
      coalesce((r->>'updated_at')::timestamptz,now()));
  end loop;
  for r in select value from jsonb_array_elements(edit_rows) loop
    d_id:=(directive_map->>((r->>'directive_id')::uuid::text))::uuid;
    new_snapshot_before:=jsonb_set(jsonb_set(jsonb_set(r->'before_state',
      '{id}',to_jsonb(d_id::text),true),'{world_id}',to_jsonb(wid::text),true),
      '{owner_id}',to_jsonb(u::text),true);
    new_snapshot_after:=jsonb_set(jsonb_set(jsonb_set(r->'after_state',
      '{id}',to_jsonb(d_id::text),true),'{world_id}',to_jsonb(wid::text),true),
      '{owner_id}',to_jsonb(u::text),true);
    insert into public.nw_directive_edits
      (id,world_id,owner_id,directive_id,action,before_state,after_state,created_at)
    values(gen_random_uuid(),wid,u,d_id,r->>'action',new_snapshot_before,new_snapshot_after,
      coalesce((r->>'created_at')::timestamptz,now()));
  end loop;
  for r in select value from jsonb_array_elements(revision_rows) loop
    insert into public.nw_revisions
      (id,world_id,owner_id,request_id,source_scene_id,branch_id,new_scene_id,
       kept_prefix,continuation,new_events,requested_world_time,created_at)
    values(gen_random_uuid(),wid,u,gen_random_uuid(),
      (scene_map->>((r->>'source_scene_id')::uuid::text))::uuid,
      (branch_map->>((r->>'branch_id')::uuid::text))::uuid,
      (scene_map->>((r->>'new_scene_id')::uuid::text))::uuid,
      r->>'kept_prefix',r->>'continuation',r->'new_events',r->>'requested_world_time',
      coalesce((r->>'created_at')::timestamptz,now()));
  end loop;
  return jsonb_build_object('world_id',wid,'original_world_id',original_id,
    'branches',jsonb_array_length(branch_rows),'scenes',total_scenes,
    'directives',jsonb_array_length(directive_rows),
    'revisions',jsonb_array_length(revision_rows));
end $$;
revoke all on function public.nw_restore_archive(jsonb) from public,anon;
grant execute on function public.nw_restore_archive(jsonb) to authenticated;
