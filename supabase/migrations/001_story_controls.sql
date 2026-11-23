-- Apply AFTER supabase/schema.sql, including on an already installed NW 0.1 database.
-- No writes to the legacy lw_* tables, no alteration/deletion of played scenes.

alter table public.nw_directives add column if not exists active boolean not null default true;
alter table public.nw_directives add column if not exists updated_at timestamptz not null default now();

create table if not exists public.nw_directive_edits (
 id uuid primary key default gen_random_uuid(),
 world_id uuid not null references public.nw_worlds(id) on delete cascade,
 directive_id uuid not null references public.nw_directives(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 action text not null check(action in ('edit','disable','enable')),
 before_state jsonb not null,
 after_state jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists nw_directive_edits_world on public.nw_directive_edits(world_id,created_at desc);
alter table public.nw_directive_edits enable row level security;
revoke all on public.nw_directive_edits from anon,authenticated;
grant select on public.nw_directive_edits to authenticated;
drop policy if exists nw_directive_edits_read on public.nw_directive_edits;
create policy nw_directive_edits_read on public.nw_directive_edits for select to authenticated using(owner_id=(select auth.uid()));

-- Important: updates to rules increment directive_version so stale scene writes are rejected.
create or replace function public.nw_edit_directive(
 p_world_id uuid,p_directive_id uuid,p_text text,p_category text,p_metadata jsonb,p_expected_version integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare u uuid:=auth.uid(); actual integer; old public.nw_directives%rowtype; new_row public.nw_directives%rowtype;
begin
 if u is null then raise exception 'Authentication required'; end if;
 select directive_version into actual from public.nw_worlds where id=p_world_id and owner_id=u for update;
 if not found then raise exception 'World not found'; end if;
 if actual is distinct from p_expected_version then raise exception 'World rules changed: refresh before editing'; end if;
 select * into old from public.nw_directives where id=p_directive_id and world_id=p_world_id and owner_id=u for update;
 if not found then raise exception 'Directive not found'; end if;
 if char_length(trim(coalesce(p_text,''))) not between 1 and 5000 or jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' then raise exception 'Invalid directive'; end if;
 if (old.text,old.category,old.metadata) is not distinct from (trim(p_text),left(coalesce(p_category,'general'),40),coalesce(p_metadata,'{}'::jsonb)) then return true; end if;
 update public.nw_directives set text=trim(p_text),category=left(coalesce(p_category,'general'),40),metadata=coalesce(p_metadata,'{}'::jsonb),updated_at=now()
 where id=p_directive_id returning * into new_row;
 insert into public.nw_directive_edits(world_id,directive_id,owner_id,action,before_state,after_state)
 values(p_world_id,p_directive_id,u,'edit',to_jsonb(old),to_jsonb(new_row));
 update public.nw_worlds set directive_version=directive_version+1,updated_at=now() where id=p_world_id;
 return true;
end $$;

create or replace function public.nw_toggle_directive(
 p_world_id uuid,p_directive_id uuid,p_active boolean,p_expected_version integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare u uuid:=auth.uid(); actual integer; old public.nw_directives%rowtype; new_row public.nw_directives%rowtype;
begin
 if u is null then raise exception 'Authentication required'; end if;
 select directive_version into actual from public.nw_worlds where id=p_world_id and owner_id=u for update;
 if not found then raise exception 'World not found'; end if;
 if actual is distinct from p_expected_version then raise exception 'World rules changed: refresh before editing'; end if;
 select * into old from public.nw_directives where id=p_directive_id and world_id=p_world_id and owner_id=u for update;
 if not found then raise exception 'Directive not found'; end if;
 if p_active is null then raise exception 'Missing directive state'; end if;
 if old.active=p_active then return true; end if;
 update public.nw_directives set active=p_active,updated_at=now() where id=p_directive_id returning * into new_row;
 insert into public.nw_directive_edits(world_id,directive_id,owner_id,action,before_state,after_state)
 values(p_world_id,p_directive_id,u,case when p_active then 'enable' else 'disable' end,to_jsonb(old),to_jsonb(new_row));
 update public.nw_worlds set directive_version=directive_version+1,updated_at=now() where id=p_world_id;
 return true;
end $$;

-- The request receipt is owner-scoped and safe to check after a connection timeout.
create or replace function public.nw_scene_receipt(p_world_id uuid,p_request_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
 select case when s.id is null then jsonb_build_object('saved',false,'request_id',p_request_id)
 else jsonb_build_object('saved',true,'request_id',p_request_id,'scene_id',s.id,'branch_id',s.branch_id) end
 from (select 1) sentinel left join public.nw_scenes s on s.world_id=p_world_id and s.owner_id=auth.uid() and s.request_id=p_request_id
 where exists(select 1 from public.nw_worlds w where w.id=p_world_id and w.owner_id=auth.uid())
$$;

-- Revision receipts make a whole scene replacement (branch + scene) idempotent.
create table if not exists public.nw_revisions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 world_id uuid not null references public.nw_worlds(id) on delete cascade,
 request_id uuid not null,
 source_scene_id uuid not null references public.nw_scenes(id),
 branch_id uuid not null references public.nw_branches(id),
 new_scene_id uuid not null references public.nw_scenes(id),
 kept_prefix text not null,
 continuation text not null,
 new_events jsonb not null default '[]'::jsonb,
 requested_world_time text,
 created_at timestamptz not null default now(),
 unique(world_id,request_id)
);
create index if not exists nw_revisions_world on public.nw_revisions(world_id,created_at desc);
alter table public.nw_revisions enable row level security;
revoke all on public.nw_revisions from anon,authenticated;
grant select on public.nw_revisions to authenticated;
drop policy if exists nw_revisions_read on public.nw_revisions;
create policy nw_revisions_read on public.nw_revisions for select to authenticated using(owner_id=(select auth.uid()));

create or replace function public.nw_revise_scene(
 p_world_id uuid,p_source_scene_id uuid,p_prefix text,p_continuation text,p_events jsonb,p_request_id uuid,
 p_world_time text default null,p_expected_rules_version integer default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=auth.uid(); v integer; active uuid; old_scene public.nw_scenes%rowtype;
        prev public.nw_revisions%rowtype; new_branch uuid; new_scene uuid; kept jsonb; merged jsonb;
begin
 if u is null then raise exception 'Authentication required'; end if;
 if p_request_id is null then raise exception 'Missing request id'; end if;
 -- Lock BEFORE checking receipts, including retries racing a first write.
 select directive_version,active_branch_id into v,active from public.nw_worlds where id=p_world_id and owner_id=u for update;
 if not found then raise exception 'World not found'; end if;
 select * into prev from public.nw_revisions where world_id=p_world_id and request_id=p_request_id and owner_id=u;
 if found then
  if prev.source_scene_id=p_source_scene_id and prev.kept_prefix=coalesce(p_prefix,'')
     and prev.continuation=coalesce(p_continuation,'') and prev.new_events=coalesce(p_events,'[]'::jsonb)
     and prev.requested_world_time is not distinct from p_world_time then
    return jsonb_build_object('scene_id',prev.new_scene_id,'branch_id',prev.branch_id,'reused',true);
  end if;
  raise exception 'Idempotency key reused for different revision';
 end if;
 if p_expected_rules_version is null or v<>p_expected_rules_version then raise exception 'World rules changed: fetch context again'; end if;
 select * into old_scene from public.nw_scenes where id=p_source_scene_id and world_id=p_world_id and owner_id=u;
 if not found then raise exception 'Source scene not found'; end if;
 if left(old_scene.body,char_length(coalesce(p_prefix,'')))<>coalesce(p_prefix,'') then raise exception 'Preserved prefix differs from source scene'; end if;
 if char_length(coalesce(p_prefix,'')||coalesce(p_continuation,'')) not between 10 and 200000 then raise exception 'Invalid revised scene length'; end if;
 if jsonb_typeof(coalesce(p_events,'[]'::jsonb))<>'array' then raise exception 'Invalid revised events'; end if;
 -- Confirm that source is an ancestor of the CURRENT branch, not some unrelated history.
 if not exists(
  with recursive ancestry as (
    select s.id,s.parent_scene_id from public.nw_branches b join public.nw_scenes s on s.id=b.head_scene_id
    where b.id=active and b.world_id=p_world_id and b.owner_id=u
    union all
    select s.id,s.parent_scene_id from public.nw_scenes s join ancestry a on a.parent_scene_id=s.id
     where s.world_id=p_world_id and s.owner_id=u
  ) select 1 from ancestry where id=p_source_scene_id
 ) then raise exception 'Scene is not in current branch ancestry'; end if;
 -- Proven actions before the revision point survive. Unkept events are deliberately not carried over.
 select coalesce(jsonb_agg(e.value),'[]'::jsonb) into kept
 from jsonb_array_elements(coalesce(old_scene.events,'[]'::jsonb)) as e(value)
 where nullif(e.value->>'evidence','') is not null and position(e.value->>'evidence' in coalesce(p_prefix,''))>0;
 merged := kept || coalesce(p_events,'[]'::jsonb);
 new_branch:=public.nw_fork_before(p_world_id,p_source_scene_id,'На это: альтернативная сцена');
 new_scene:=public.nw_commit_scene(p_world_id,new_branch,old_scene.parent_scene_id,p_request_id,
    coalesce(p_prefix,'')||coalesce(p_continuation,''),coalesce(p_world_time,old_scene.world_time),merged,p_expected_rules_version);
 insert into public.nw_revisions(owner_id,world_id,request_id,source_scene_id,branch_id,new_scene_id,kept_prefix,continuation,new_events,requested_world_time)
 values(u,p_world_id,p_request_id,p_source_scene_id,new_branch,new_scene,coalesce(p_prefix,''),coalesce(p_continuation,''),coalesce(p_events,'[]'::jsonb),p_world_time);
 return jsonb_build_object('scene_id',new_scene,'branch_id',new_branch,'reused',false,'kept_events',jsonb_array_length(kept));
end $$;

-- Direct scene commit cannot fake a new positive relationship if a live author lock forbids it.

create or replace function public.nw_commit_scene(
 p_world_id uuid,p_branch_id uuid,p_expected_head uuid,p_request_id uuid,p_body text,
 p_world_time text default null,p_events jsonb default '[]'::jsonb,p_expected_rules_version integer default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); current_head uuid; world_branch uuid; actual_rules_version integer; existing public.nw_scenes%rowtype; new_id uuid := gen_random_uuid(); e jsonb; seen_ids text[] := array[]::text[];
begin
 if u is null then raise exception 'Authentication required'; end if;
 if p_request_id is null then raise exception 'Missing idempotency key'; end if;
 select * into existing from public.nw_scenes where world_id=p_world_id and request_id=p_request_id and owner_id=u;
 if found then
  if existing.branch_id=p_branch_id and existing.body=p_body and existing.events=coalesce(p_events,'[]'::jsonb)
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
  if existing.branch_id=p_branch_id and existing.body=p_body and existing.events=coalesce(p_events,'[]'::jsonb) then return existing.id; end if;
  raise exception 'Idempotency key reused for different content';
 end if;
 if p_expected_rules_version is not null and p_expected_rules_version<>actual_rules_version then raise exception 'World rules changed: fetch context before committing'; end if;
 if current_head is distinct from p_expected_head then raise exception 'Head changed: refresh story before committing'; end if;
 if char_length(trim(coalesce(p_body,''))) not between 10 and 200000 then raise exception 'Invalid scene text'; end if;
 if jsonb_typeof(coalesce(p_events,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_events,'[]'::jsonb)) > 100 then raise exception 'Invalid scene events'; end if;
 for e in select value from jsonb_array_elements(coalesce(p_events,'[]'::jsonb)) loop
  if jsonb_typeof(e)<>'object' or nullif(trim(e->>'id'),'') is null or nullif(trim(e->>'type'),'') is null
     or nullif(trim(e->>'evidence'),'') is null or position(e->>'evidence' in p_body)=0 then
   raise exception 'Event without exact evidence in scene';
  end if;
  if not (e->>'type' in ('character','relationship','knowledge','money','item','commitment','world','offscreen')) then
   raise exception 'Unknown event type';
  end if;
  if (e->>'id')=any(seen_ids) then raise exception 'Duplicate scene event id'; end if;
  seen_ids := array_append(seen_ids,e->>'id');
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
 insert into public.nw_scenes(id,owner_id,world_id,branch_id,parent_scene_id,request_id,body,world_time,events)
 values(new_id,u,p_world_id,p_branch_id,current_head,p_request_id,p_body,nullif(trim(p_world_time),''),coalesce(p_events,'[]'::jsonb));
 update public.nw_branches set head_scene_id=new_id where id=p_branch_id;
 update public.nw_worlds set updated_at=now() where id=p_world_id;
 return new_id;
end $$;


revoke all on function public.nw_edit_directive(uuid,uuid,text,text,jsonb,integer),
 public.nw_toggle_directive(uuid,uuid,boolean,integer),
 public.nw_scene_receipt(uuid,uuid),
 public.nw_revise_scene(uuid,uuid,text,text,jsonb,uuid,text,integer)
 from public,anon;
grant execute on function public.nw_edit_directive(uuid,uuid,text,text,jsonb,integer),
 public.nw_toggle_directive(uuid,uuid,boolean,integer),
 public.nw_scene_receipt(uuid,uuid),
 public.nw_revise_scene(uuid,uuid,text,text,jsonb,uuid,text,integer)
 to authenticated;
