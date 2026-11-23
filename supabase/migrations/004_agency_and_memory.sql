-- LIVING WORLD NEXT 0.4: evidence-bound NPC plans, complete structured-memory pagination,
-- and strict idempotent scene replay even after a branch/rule change.
-- Apply AFTER 003_atomic_world_creation.sql. Alters only nw_* structures; no legacy lw_* mutation.
alter table public.nw_scenes add column if not exists rules_version_at_commit integer;

-- Exact first-write identity is parent/head + text + world clock + events + rules version.
-- A lost response may be retried with the SAME request_id even if the world progressed.
create or replace function public.nw_commit_scene(
 p_world_id uuid,p_branch_id uuid,p_expected_head uuid,p_request_id uuid,p_body text,
 p_world_time text default null,p_events jsonb default '[]'::jsonb,p_expected_rules_version integer default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); current_head uuid; world_branch uuid; actual_rules_version integer;
 existing public.nw_scenes%rowtype; new_id uuid := gen_random_uuid(); e jsonb; seen_ids text[] := array[]::text[];
begin
 if u is null then raise exception 'Authentication required'; end if;
 if p_request_id is null then raise exception 'Missing idempotency key'; end if;
 select * into existing from public.nw_scenes where world_id=p_world_id and request_id=p_request_id and owner_id=u;
 if found then
  if existing.branch_id=p_branch_id and existing.parent_scene_id is not distinct from p_expected_head
     and existing.body=p_body and existing.events=coalesce(p_events,'[]'::jsonb)
     and existing.world_time is not distinct from nullif(trim(p_world_time),'')
     and (existing.rules_version_at_commit is null or existing.rules_version_at_commit=p_expected_rules_version)
   then return existing.id;
  end if;
  raise exception 'Idempotency key reused for different content';
 end if;
 select active_branch_id,directive_version into world_branch,actual_rules_version from public.nw_worlds where id=p_world_id and owner_id=u for update;
 if not found or world_branch is distinct from p_branch_id then raise exception 'Not the active branch'; end if;
 select head_scene_id into current_head from public.nw_branches
 where id=p_branch_id and world_id=p_world_id and owner_id=u for update;
 if not found then raise exception 'Branch not found'; end if;
 -- Concurrent retry of the same request may have committed while we waited for row locks.
 select * into existing from public.nw_scenes where world_id=p_world_id and request_id=p_request_id and owner_id=u;
 if found then
  if existing.branch_id=p_branch_id and existing.parent_scene_id is not distinct from p_expected_head
     and existing.body=p_body and existing.events=coalesce(p_events,'[]'::jsonb)
     and existing.world_time is not distinct from nullif(trim(p_world_time),'')
     and (existing.rules_version_at_commit is null or existing.rules_version_at_commit=p_expected_rules_version) then return existing.id; end if;
  raise exception 'Idempotency key reused for different content';
 end if;
 if p_expected_rules_version is null or p_expected_rules_version<>actual_rules_version then raise exception 'World rules changed: fetch context before committing'; end if;
 if current_head is distinct from p_expected_head then raise exception 'Head changed: refresh story before committing'; end if;
 if char_length(trim(coalesce(p_body,''))) not between 10 and 200000 then raise exception 'Invalid scene text'; end if;
 if jsonb_typeof(coalesce(p_events,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_events,'[]'::jsonb)) > 100 then raise exception 'Invalid scene events'; end if;
 for e in select value from jsonb_array_elements(coalesce(p_events,'[]'::jsonb)) loop
  if jsonb_typeof(e)<>'object' or nullif(trim(e->>'id'),'') is null or nullif(trim(e->>'type'),'') is null
     or nullif(trim(e->>'evidence'),'') is null or position(e->>'evidence' in p_body)=0 then
   raise exception 'Event without exact evidence in scene';
  end if;
  if not (e->>'type' in ('character','relationship','knowledge','money','item','commitment','world','offscreen','plan')) then
   raise exception 'Unknown event type';
  end if;
  if (e->>'id')=any(seen_ids) then raise exception 'Duplicate scene event id'; end if;
  seen_ids := array_append(seen_ids,e->>'id');
  if e->>'type'='plan' then
    if nullif(trim(e->>'actor'),'') is null or nullif(trim(e->>'plan_id'),'') is null or
       coalesce(e->>'action','') not in ('start','advance','pause','resume','complete','abandon')
       then raise exception 'Invalid actor plan'; end if;
    if e->>'action'='start' and nullif(trim(e->>'goal'),'') is null
       then raise exception 'New plan requires a character goal'; end if;
    if e->>'action'='complete' and not exists(
      select 1 from jsonb_array_elements(p_events) a(value)
      where a.value->>'id'=e->>'performed_event_id' and a.value->>'type' in ('world','offscreen')
    ) then raise exception 'Plan completion requires a performed world/offscreen event'; end if;
  end if;
  if e->>'type'='money' and (
    nullif(trim(e->>'actor'),'') is null or nullif(trim(e->>'currency'),'') is null or
    jsonb_typeof(e->'delta')<>'number' or (e->>'delta') !~ '^-?[0-9]+$'
  ) then raise exception 'Money change requires exact integer and actor/currency'; end if;
  if e->>'type'='knowledge' and (
    nullif(trim(e->>'actor'),'') is null or nullif(trim(e->>'fact'),'') is null or nullif(trim(e->>'channel'),'') is null
  ) then raise exception 'Knowledge requires actor, fact and channel'; end if;
  -- Each active user-authored lock can independently forbid reconciliation or respect.
  if e->>'type'='relationship' and exists (
    select 1 from public.nw_directives d
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(d.metadata->'relationship_locks')='array'
        then d.metadata->'relationship_locks'
        when jsonb_typeof(d.metadata->'relationship_lock')='object'
        then jsonb_build_array(d.metadata->'relationship_lock')
        else '[]'::jsonb end
    ) as locks(item)
    where d.world_id=p_world_id and d.owner_id=u and d.active=true
    and (
      (lower(btrim(locks.item->>'a'))=lower(btrim(e->>'a')) and lower(btrim(locks.item->>'b'))=lower(btrim(e->>'b'))) or
      (lower(btrim(locks.item->>'a'))=lower(btrim(e->>'b')) and lower(btrim(locks.item->>'b'))=lower(btrim(e->>'a')))
    )
    and (
      (locks.item->>'forbid_reconciliation'='true' and e->>'stance' in ('friends','reconciled','peace','close_friends','romantic_partners')) or
      (locks.item->>'forbid_respect'='true' and (e->>'stance' in ('respect','admiration') or e->>'respect'='true'))
    )
  ) then raise exception 'Explicit relationship lock violated'; end if;
 end loop;
 insert into public.nw_scenes(id,owner_id,world_id,branch_id,parent_scene_id,request_id,body,world_time,events,rules_version_at_commit)
 values(new_id,u,p_world_id,p_branch_id,current_head,p_request_id,p_body,nullif(trim(p_world_time),''),coalesce(p_events,'[]'::jsonb),actual_rules_version);
 update public.nw_branches set head_scene_id=new_id where id=p_branch_id;
 update public.nw_worlds set updated_at=now() where id=p_world_id;
 return new_id;
end $$;

-- Read only structured events from every ancestor, without downloading huge scene bodies.
-- Bound each pagination session to the same branch head to reject mixed-world snapshots.
create or replace function public.nw_active_memory_page(
 p_world_id uuid,p_expected_head uuid,p_limit integer default 200,p_offset integer default 0
) returns table(id uuid,parent_scene_id uuid,world_time text,events jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare current_head uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select b.head_scene_id into current_head
 from public.nw_worlds w join public.nw_branches b on b.id=w.active_branch_id
 where w.id=p_world_id and w.owner_id=auth.uid() and b.owner_id=auth.uid();
 if not found then raise exception 'World or active branch not found'; end if;
 if current_head is distinct from p_expected_head then raise exception 'History head changed; retry with new context'; end if;
 return query
 with recursive ancestry as (
  select s.id,s.parent_scene_id,s.world_time,s.events,0 as depth
  from public.nw_scenes s where s.id=current_head and s.world_id=p_world_id and s.owner_id=auth.uid()
  union all
  select s.id,s.parent_scene_id,s.world_time,s.events,a.depth+1
  from public.nw_scenes s join ancestry a on s.id=a.parent_scene_id
  where s.world_id=p_world_id and s.owner_id=auth.uid() and a.depth<100000
 )
 select a.id,a.parent_scene_id,a.world_time,a.events from ancestry a
 order by a.depth asc
 limit greatest(1,least(coalesce(p_limit,200),200))
 offset greatest(0,coalesce(p_offset,0));
end $$;

revoke all on function public.nw_active_memory_page(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.nw_active_memory_page(uuid,uuid,integer,integer) to authenticated;

-- A source may belong to an abandoned alternative. Tell the narrator so explicitly.
create or replace function public.nw_scene_in_active_branch(p_world_id uuid,p_scene_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 with recursive ancestry as (
  select s.id,s.parent_scene_id
  from public.nw_worlds w join public.nw_branches b on b.id=w.active_branch_id
  join public.nw_scenes s on s.id=b.head_scene_id
  where w.id=p_world_id and w.owner_id=auth.uid() and b.owner_id=auth.uid() and s.owner_id=auth.uid()
  union all
  select s.id,s.parent_scene_id from public.nw_scenes s
  join ancestry a on s.id=a.parent_scene_id
  where s.world_id=p_world_id and s.owner_id=auth.uid()
 )
 select exists(select 1 from ancestry where id=p_scene_id)
$$;
revoke all on function public.nw_scene_in_active_branch(uuid,uuid) from public,anon;
grant execute on function public.nw_scene_in_active_branch(uuid,uuid) to authenticated;
