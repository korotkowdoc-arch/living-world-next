-- LIVING WORLD NEXT 0.1: isolated tables, no mutation of legacy lw_*.
-- Apply once in Supabase SQL editor. Authenticate as the actual project owner.
create extension if not exists pgcrypto;

create table if not exists public.nw_worlds (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check (char_length(title) between 1 and 100),
 seed text not null check (char_length(seed) between 8 and 12000),
 start_marker text not null default 'Время ещё не установлено',
 active_branch_id uuid,
 auto_save boolean not null default true,
 directive_version integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.nw_branches (
 id uuid primary key default gen_random_uuid(),
 world_id uuid not null references public.nw_worlds(id) on delete cascade,
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null default 'Основная линия',
 fork_scene_id uuid,
 head_scene_id uuid,
 created_at timestamptz not null default now()
);
create table if not exists public.nw_scenes (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 world_id uuid not null references public.nw_worlds(id) on delete cascade,
 branch_id uuid not null references public.nw_branches(id) on delete cascade,
 parent_scene_id uuid references public.nw_scenes(id),
 request_id uuid not null,
 body text not null check (char_length(body) between 10 and 200000),
 world_time text,
 events jsonb not null default '[]'::jsonb check(jsonb_typeof(events)='array'),
 created_at timestamptz not null default now(),
 unique(world_id, request_id)
);
create table if not exists public.nw_directives (
 id uuid primary key default gen_random_uuid(),
 world_id uuid not null references public.nw_worlds(id) on delete cascade,
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 text text not null check (char_length(text) between 1 and 5000),
 category text not null default 'general',
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists nw_worlds_owner on public.nw_worlds(owner_id, updated_at desc);
create index if not exists nw_branches_world on public.nw_branches(world_id);
create index if not exists nw_scenes_world on public.nw_scenes(world_id, created_at desc);
create index if not exists nw_directives_world on public.nw_directives(world_id);

alter table public.nw_worlds enable row level security;
alter table public.nw_branches enable row level security;
alter table public.nw_scenes enable row level security;
alter table public.nw_directives enable row level security;
revoke all on public.nw_worlds,public.nw_branches,public.nw_scenes,public.nw_directives from anon, authenticated;
grant select, delete on public.nw_worlds to authenticated;
grant select on public.nw_branches,public.nw_scenes,public.nw_directives to authenticated;

drop policy if exists nw_world_read on public.nw_worlds;
create policy nw_world_read on public.nw_worlds for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists nw_world_delete on public.nw_worlds;
create policy nw_world_delete on public.nw_worlds for delete to authenticated using (owner_id = (select auth.uid()));
drop policy if exists nw_branch_read on public.nw_branches;
create policy nw_branch_read on public.nw_branches for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists nw_scene_read on public.nw_scenes;
create policy nw_scene_read on public.nw_scenes for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists nw_directive_read on public.nw_directives;
create policy nw_directive_read on public.nw_directives for select to authenticated using (owner_id = (select auth.uid()));

-- All writes go through validated, owner-scoped, atomic RPCs.
create or replace function public.nw_create_world(p_title text,p_seed text,p_start_marker text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); wid uuid := gen_random_uuid(); bid uuid := gen_random_uuid();
begin
 if u is null then raise exception 'Authentication required'; end if;
 if char_length(trim(coalesce(p_title,''))) not between 1 and 100 or char_length(trim(coalesce(p_seed,''))) not between 8 and 12000 then raise exception 'Invalid world description'; end if;
 insert into public.nw_worlds(id,owner_id,title,seed,start_marker,active_branch_id)
 values(wid,u,trim(p_title),trim(p_seed),coalesce(nullif(trim(p_start_marker),''),'Время ещё не установлено'),bid);
 insert into public.nw_branches(id,world_id,owner_id,name) values(bid,wid,u,'Основная линия');
 return wid;
end $$;

create or replace function public.nw_add_directive(p_world_id uuid,p_text text,p_category text default 'general',p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); did uuid := gen_random_uuid();
begin
 if u is null or not exists(select 1 from public.nw_worlds where id=p_world_id and owner_id=u) then raise exception 'World not found'; end if;
 if char_length(trim(coalesce(p_text,''))) not between 1 and 5000 then raise exception 'Invalid directive'; end if;
 if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)) <> 'object' then raise exception 'Invalid metadata'; end if;
 insert into public.nw_directives(id,world_id,owner_id,text,category,metadata)
 values(did,p_world_id,u,trim(p_text),left(coalesce(p_category,'general'),40),coalesce(p_metadata,'{}'::jsonb));
 update public.nw_worlds set directive_version=directive_version+1,updated_at=now() where id=p_world_id;
 return did;
end $$;

create or replace function public.nw_set_autosave(p_world_id uuid,p_enabled boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 update public.nw_worlds set auto_save=coalesce(p_enabled,false),updated_at=now()
 where id=p_world_id and owner_id=auth.uid();
 if not found then raise exception 'World not found'; end if;
 return p_enabled;
end $$;

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
  -- Enforce explicit, owner-authored relationship locks at the database boundary too.
  if e->>'type'='relationship' and e->>'stance' in ('friends','reconciled','peace','close_friends','romantic_partners') and exists (
   select 1 from public.nw_directives d where d.world_id=p_world_id and d.owner_id=u
   and d.metadata->'relationship_lock'->>'forbid_reconciliation' = 'true'
   and (
     (lower(d.metadata->'relationship_lock'->>'a')=lower(e->>'a') and lower(d.metadata->'relationship_lock'->>'b')=lower(e->>'b')) or
     (lower(d.metadata->'relationship_lock'->>'a')=lower(e->>'b') and lower(d.metadata->'relationship_lock'->>'b')=lower(e->>'a'))
   )
  ) then raise exception 'Explicit no-reconciliation rule violated'; end if;
 end loop;
 insert into public.nw_scenes(id,owner_id,world_id,branch_id,parent_scene_id,request_id,body,world_time,events)
 values(new_id,u,p_world_id,p_branch_id,current_head,p_request_id,p_body,nullif(trim(p_world_time),''),coalesce(p_events,'[]'::jsonb));
 update public.nw_branches set head_scene_id=new_id where id=p_branch_id;
 update public.nw_worlds set updated_at=now() where id=p_world_id;
 return new_id;
end $$;

create or replace function public.nw_fork_before(p_world_id uuid,p_scene_id uuid,p_name text default 'Альтернативная линия')
returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); bid uuid; current_bid uuid; parent_id uuid; new_bid uuid := gen_random_uuid();
begin
 if u is null then raise exception 'Authentication required'; end if;
 select active_branch_id into current_bid from public.nw_worlds where id=p_world_id and owner_id=u for update;
 if not found then raise exception 'World not found'; end if;
 select id into bid from public.nw_branches where id=current_bid and world_id=p_world_id and owner_id=u;
 if not found then raise exception 'Branch not found'; end if;
 if not exists(
   with recursive ancestors as (
     select s.id,s.parent_scene_id from public.nw_scenes s
     where s.id=(select head_scene_id from public.nw_branches where id=bid) and s.world_id=p_world_id
     union all
     select p.id,p.parent_scene_id from public.nw_scenes p join ancestors a on p.id=a.parent_scene_id
      where p.world_id=p_world_id
   ) select 1 from ancestors where id=p_scene_id
 ) then raise exception 'Scene is not in current branch ancestry'; end if;
 select parent_scene_id into parent_id from public.nw_scenes where id=p_scene_id and world_id=p_world_id and owner_id=u;
 insert into public.nw_branches(id,world_id,owner_id,name,fork_scene_id,head_scene_id)
 values(new_bid,p_world_id,u,left(coalesce(nullif(trim(p_name),''),'Альтернативная линия'),120),p_scene_id,parent_id);
 update public.nw_worlds set active_branch_id=new_bid,updated_at=now() where id=p_world_id;
 return new_bid;
end $$;

create or replace function public.nw_switch_branch(p_world_id uuid,p_branch_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.nw_branches where id=p_branch_id and world_id=p_world_id and owner_id=auth.uid()) then
  raise exception 'Branch not found';
 end if;
 update public.nw_worlds set active_branch_id=p_branch_id,updated_at=now() where id=p_world_id and owner_id=auth.uid();
 return found;
end $$;

create or replace function public.nw_active_history(p_world_id uuid,p_limit integer default 50,p_offset integer default 0)
returns table(id uuid,branch_id uuid,parent_scene_id uuid,body text,world_time text,events jsonb,created_at timestamptz)
language sql stable security definer set search_path = '' as $$
 with recursive ancestry as (
  select s.id,s.parent_scene_id,s.branch_id,s.body,s.world_time,s.events,s.created_at,0 as depth
  from public.nw_worlds w join public.nw_branches b on b.id=w.active_branch_id
  join public.nw_scenes s on s.id=b.head_scene_id
  where w.id=p_world_id and w.owner_id=auth.uid() and b.owner_id=auth.uid()
  union all
  select s.id,s.parent_scene_id,s.branch_id,s.body,s.world_time,s.events,s.created_at,a.depth+1
  from public.nw_scenes s join ancestry a on s.id=a.parent_scene_id
  where s.world_id=p_world_id and s.owner_id=auth.uid()
 )
 select a.id,a.branch_id,a.parent_scene_id,a.body,a.world_time,a.events,a.created_at
 from ancestry a order by a.depth asc limit greatest(1,least(coalesce(p_limit,50),200)) offset greatest(0,coalesce(p_offset,0))
$$;

revoke all on function public.nw_create_world(text,text,text),
 public.nw_add_directive(uuid,text,text,jsonb), public.nw_set_autosave(uuid,boolean),
 public.nw_commit_scene(uuid,uuid,uuid,uuid,text,text,jsonb,integer),
 public.nw_fork_before(uuid,uuid,text),public.nw_switch_branch(uuid,uuid),
 public.nw_active_history(uuid,integer,integer) from public,anon;
grant execute on function public.nw_create_world(text,text,text),
 public.nw_add_directive(uuid,text,text,jsonb), public.nw_set_autosave(uuid,boolean),
 public.nw_commit_scene(uuid,uuid,uuid,uuid,text,text,jsonb,integer),
 public.nw_fork_before(uuid,uuid,text),public.nw_switch_branch(uuid,uuid),
 public.nw_active_history(uuid,integer,integer) to authenticated;
