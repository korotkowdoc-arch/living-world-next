-- Private derived JS projection snapshots, written only by the trusted
-- projection Edge Function after independent reconstruction from canonical scenes.
-- No player-facing RPC accepts serialized state.
create table if not exists public.nw_projection_snapshots(
 world_id uuid not null references public.nw_worlds(id) on delete cascade,
 branch_id uuid not null references public.nw_branches(id) on delete cascade,
 head_scene_id uuid not null references public.nw_scenes(id) on delete cascade,
 owner_id uuid not null,
 engine_id text not null check(engine_id ~ '^[A-Za-z0-9_.:-]{1,100}$'),
 scene_count integer not null check(scene_count between 1 and 50000),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=4194304),
 created_at timestamptz not null default now(),
 primary key(branch_id,head_scene_id,engine_id)
);
alter table public.nw_projection_snapshots enable row level security;
revoke all on table public.nw_projection_snapshots from public,anon,authenticated;
grant select,insert,update,delete on public.nw_projection_snapshots to service_role;
grant select on public.nw_worlds,public.nw_branches,public.nw_scenes to service_role;
create index if not exists nw_projection_snapshots_world_created_idx on public.nw_projection_snapshots(world_id,created_at desc);
-- The owner argument is verified by the Edge Function against Auth, and the
-- current branch/head are checked again here. Stop only at a snapshot on
-- the actual parent chain, never at an unrelated latest snapshot.
create or replace function public.nw_projection_snapshot_input(p_owner uuid,p_world uuid,p_branch uuid,p_head uuid,p_engine text)
returns jsonb language plpgsql stable security invoker set search_path='' as $snap$
declare boundary uuid; checkpoint jsonb; cached_count integer; oldest_parent uuid; suffix jsonb; walked integer;
begin
 if p_owner is null or p_head is null or coalesce(p_engine,'') !~ '^[A-Za-z0-9_.:-]{1,100}$' or not exists(
  select 1 from public.nw_worlds w join public.nw_branches b on b.id=w.active_branch_id
  where w.id=p_world and w.owner_id=p_owner and b.id=p_branch and b.world_id=w.id and b.owner_id=p_owner and b.head_scene_id=p_head
 ) then return jsonb_build_object('status','unavailable');end if;
 with recursive walk as (
  select s.id,s.parent_scene_id,s.world_time,s.events,1 depth,c.payload,c.scene_count
  from public.nw_scenes s left join public.nw_projection_snapshots c on c.world_id=p_world and c.branch_id=p_branch and c.owner_id=p_owner and c.head_scene_id=s.id and c.engine_id=p_engine
  where s.id=p_head and s.world_id=p_world and s.owner_id=p_owner
  union all
  select s.id,s.parent_scene_id,s.world_time,s.events,w.depth+1,c.payload,c.scene_count
  from walk w join public.nw_scenes s on s.id=w.parent_scene_id
  left join public.nw_projection_snapshots c on c.world_id=p_world and c.branch_id=p_branch and c.owner_id=p_owner and c.head_scene_id=s.id and c.engine_id=p_engine
  where s.world_id=p_world and s.owner_id=p_owner and w.depth<5001 and w.payload is null
 ), oldest as (select * from walk order by depth desc limit 1)
 select o.id,o.payload,o.scene_count,o.parent_scene_id,o.depth,
  coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'parent_scene_id',w.parent_scene_id,'world_time',w.world_time,'events',w.events) order by w.depth desc) from walk w where w.payload is null),'[]'::jsonb)
 into boundary,checkpoint,cached_count,oldest_parent,walked,suffix from oldest o;
 if boundary is null or (checkpoint is null and oldest_parent is not null) or walked>5000 or coalesce(cached_count-1,0)+walked>50000 or octet_length(suffix::text)>8388608 then return jsonb_build_object('status','too_large');end if;
 return jsonb_build_object('status','ready','head',p_head,'engine_id',p_engine,'checkpoint',checkpoint,'suffix',suffix);
end $snap$;
revoke all on function public.nw_projection_snapshot_input(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.nw_projection_snapshot_input(uuid,uuid,uuid,uuid,text) to service_role;
create or replace function public.nw_projection_snapshot_put(p_owner uuid,p_world uuid,p_branch uuid,p_head uuid,p_engine text,p_payload jsonb)
returns boolean language plpgsql security invoker set search_path='' as $snap$
declare n integer; actual integer; root uuid;
begin
 if p_owner is null or p_head is null or coalesce(p_engine,'') !~ '^[A-Za-z0-9_.:-]{1,100}$' or jsonb_typeof(p_payload) is distinct from 'object' or p_payload->'version' is distinct from '1'::jsonb or p_payload->'evidence_prevalidated' is distinct from 'true'::jsonb or p_payload->>'head_scene_id' is distinct from p_head::text or jsonb_typeof(p_payload->'state') is distinct from 'object' or coalesce(p_payload->>'scene_count','') !~ '^[0-9]{1,5}$' or octet_length(p_payload::text)>4194304 then return false;end if;
 n:=(p_payload->>'scene_count')::integer;if n not between 1 and 50000 then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(p_world::text,0));
 if not exists(select 1 from public.nw_worlds w join public.nw_branches b on b.id=w.active_branch_id where w.id=p_world and w.owner_id=p_owner and b.id=p_branch and b.world_id=w.id and b.owner_id=p_owner and b.head_scene_id=p_head) then return false;end if;
 with recursive chain as (
  select s.id,s.parent_scene_id,1 depth from public.nw_scenes s where s.id=p_head and s.world_id=p_world and s.owner_id=p_owner
  union all select s.id,s.parent_scene_id,c.depth+1 from chain c join public.nw_scenes s on s.id=c.parent_scene_id where s.world_id=p_world and s.owner_id=p_owner and c.depth<50001
 ) select depth,parent_scene_id into actual,root from chain order by depth desc limit 1;
 if actual is distinct from n or root is not null then return false;end if;
 insert into public.nw_projection_snapshots(world_id,branch_id,head_scene_id,owner_id,engine_id,scene_count,payload)
 values(p_world,p_branch,p_head,p_owner,p_engine,n,p_payload)
 on conflict(branch_id,head_scene_id,engine_id) do nothing;
 delete from public.nw_projection_snapshots s where s.world_id=p_world and s.owner_id=p_owner and (s.branch_id,s.head_scene_id,s.engine_id) in (
  select x.branch_id,x.head_scene_id,x.engine_id from public.nw_projection_snapshots x where x.world_id=p_world and x.owner_id=p_owner order by x.created_at desc,x.head_scene_id desc,x.engine_id desc offset 4
 );
 return true;
end $snap$;
revoke all on function public.nw_projection_snapshot_put(uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.nw_projection_snapshot_put(uuid,uuid,uuid,uuid,text,jsonb) to service_role;
