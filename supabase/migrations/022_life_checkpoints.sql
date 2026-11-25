-- Private, derived checkpoints for the life transition guard. Never accept a
-- client-supplied state. Scene ancestry is immutable; deletion cascades.
create table if not exists public.nw_life_checkpoints(
 scene_id uuid primary key references public.nw_scenes(id) on delete cascade,
 world_id uuid not null references public.nw_worlds(id) on delete cascade,
 owner_id uuid not null,
 engine_signature text not null,
 scene_count integer not null check(scene_count between 1 and 50000),
 state jsonb not null check(jsonb_typeof(state)='object'),
 created_at timestamptz not null default now()
);
alter table public.nw_life_checkpoints enable row level security;
revoke all on table public.nw_life_checkpoints from public,anon,authenticated;
create index if not exists nw_life_checkpoints_world_created_idx on public.nw_life_checkpoints(world_id,created_at desc,scene_id);
-- Fingerprint implementation, not application version. A later migration that
-- changes any NW function invalidates old state automatically; ignore the
-- checkpoint reader itself to avoid a circular definition.
create or replace function public.nw_life_checkpoint_signature()
returns text language sql stable security invoker set search_path='' as $checkpoint$
 select md5(coalesce(string_agg(pg_get_functiondef(p.oid), E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid)), ''))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f' and left(p.proname,3)='nw_'
 and p.proname not in ('nw_life_checkpoint_signature','nw_assert_player_life_append');
$checkpoint$;
revoke all on function public.nw_life_checkpoint_signature() from public,anon,authenticated;

create or replace function public.nw_assert_player_life_append(p_world uuid,p_head uuid,p_events jsonb)
returns void language plpgsql security invoker set search_path='' as $life$
declare u uuid:=auth.uid(); st jsonb:='{"life":{},"jobs":{},"refs":{},"economy":{"balances":{},"items":{}}}'; r record; e jsonb; seen integer:=0; old jsonb; t jsonb; used text[]:=array[]::text[]; transfers jsonb:='{}'; locations jsonb:='{}'; ref text; stock_ops jsonb:='{}'; used_stock text[]:=array[]::text[]; recipe jsonb; signature text; snapshot jsonb; snapshot_count integer:=0; total_count integer:=0; root_checked boolean:=false;
begin
 if not exists(select 1 from jsonb_array_elements(p_events) x where x?'player_life_version' or x->>'key' like 'player-life:%') then return;end if;
 if u is null or not exists(select 1 from public.nw_worlds where id=p_world and owner_id=u) then raise exception 'World not found';end if;
 signature:=public.nw_life_checkpoint_signature();
 -- Stop walking only at a compatible snapshot on the actual parent chain.
 -- Never use a snapshot just because it shares a world or branch name.
 for r in with recursive chain as (
  select s.id,s.parent_scene_id,s.events,1 depth,c.state cached_state,c.scene_count cached_count
  from public.nw_scenes s left join public.nw_life_checkpoints c on c.scene_id=s.id and c.world_id=p_world and c.owner_id=u and c.engine_signature=signature
  where s.id=p_head and s.world_id=p_world and s.owner_id=u
  union all
  select s.id,s.parent_scene_id,s.events,p.depth+1,c.state,c.scene_count
  from chain p join public.nw_scenes s on s.id=p.parent_scene_id
  left join public.nw_life_checkpoints c on c.scene_id=s.id and c.world_id=p_world and c.owner_id=u and c.engine_signature=signature
  where s.world_id=p_world and s.owner_id=u and p.depth<50001 and p.cached_state is null
 ) select * from chain order by depth desc loop
  seen:=seen+1;
  if seen=1 then
   if r.cached_state is not null then st:=r.cached_state;snapshot_count:=r.cached_count;root_checked:=true;continue;
   elsif r.parent_scene_id is null then root_checked:=true;
   else raise exception 'Incomplete life ancestry';end if;
  end if;
  if seen+snapshot_count>50001 then raise exception 'Incomplete life ancestry';end if;
  for e in select value from jsonb_array_elements(r.events) loop
   begin st:=public.nw_player_life_step(st,e);exception when raise_exception then null;end;
  end loop;
 end loop;
 total_count:=seen+snapshot_count-case when snapshot_count>0 then 1 else 0 end;
 if p_head is not null and (not root_checked or total_count>50000) then raise exception 'Missing or incomplete life ancestry';end if;
 -- A first checkpoint and then one per 128 additional scenes. Cap storage
 -- at eight checkpoints per world and 8 MiB per serialized state.
 if p_head is not null and (snapshot_count=0 or total_count-snapshot_count>=128) and octet_length(st::text)<=8388608 then
  insert into public.nw_life_checkpoints(scene_id,world_id,owner_id,engine_signature,scene_count,state)
  values(p_head,p_world,u,signature,total_count,st)
  on conflict(scene_id) do update set engine_signature=excluded.engine_signature,scene_count=excluded.scene_count,state=excluded.state,created_at=now();
  delete from public.nw_life_checkpoints c where c.world_id=p_world and c.owner_id=u and c.scene_id in (
   select x.scene_id from public.nw_life_checkpoints x where x.world_id=p_world and x.owner_id=u order by x.created_at desc,x.scene_id desc offset 8
  );
 end if;
 -- The generic economy guard has already checked balances. Record only preceding
 -- transfers and location observations; one transfer cannot pay two receipts.
 for e in select value from jsonb_array_elements(p_events) loop
  if e->>'type'='money' and e->>'operation'='transfer' then transfers:=jsonb_set(transfers,array[e->>'id'],e,true);end if;
  if e->>'type'='character' and (e->'state_patch')?'location' then locations:=jsonb_set(locations,array[e->>'name'],e->'state_patch'->'location',true);end if;
  if e->>'dynamics_kind'='stock_operation' and e->'dynamics_version'='1'::jsonb and e->>'stock_action'='consume' then stock_ops:=jsonb_set(stock_ops,array[e->>'id'],e,true);end if;
  if (e->>'life_kind'='estate_sale' and e->>'status'='settled' and (e->>'amount')::numeric>0) or (e->>'life_kind'='wage' and (e->>'amount')::numeric>0) or (e->>'life_kind'='service_visit' and e->>'status'='completed' and (e->>'amount')::numeric>0) or (e->>'dynamics_kind'='payment_occurrence' and e->>'status'='paid') then
   ref:=e->>'transfer_event_id';
   if ref is null or ref=any(used) then raise exception 'Transfer reused across settlement records';end if;
   if e->>'life_kind'='service_visit' then
    t:=transfers->ref;
    if t is null or t->'actor' is distinct from e->'actor' or t->'counterparty' is distinct from e->'provider' or t->'currency' is distinct from e->'currency' or (t->>'delta')::numeric is distinct from -(e->>'amount')::numeric then raise exception 'Service requires preceding exact payment';end if;
   end if;
   if e->>'life_kind'='wage' then
    t:=transfers->ref;
    if t is null or t->'actor' is distinct from e->'employer' or t->'counterparty' is distinct from e->'actor' or t->'currency' is distinct from e->'currency' or (t->>'delta')::numeric is distinct from -(e->>'amount')::numeric then raise exception 'Wage requires preceding exact transfer';end if;
   end if;
   if e->>'life_kind'='estate_sale' then
    t:=transfers->ref;
    if t is null or t->'actor' is distinct from e->'buyer' or t->'counterparty' is distinct from e->'actor' or t->'currency' is distinct from e->'currency' or (t->>'delta')::numeric is distinct from -(e->>'amount')::numeric then raise exception 'Estate sale requires preceding exact transfer';end if;
   end if;
   used:=array_append(used,ref);
  end if;
  if e->>'life_kind'='journey' and e->>'status' in ('travelling','arrived') then
   old:=st->'life'->(e->>'key');
   if (old is null or old->>'status'='planned' or old->'reached' is distinct from e->'reached') and locations->(e->>'actor') is distinct from e->'stops'->((e->>'reached')::integer)->'place' then raise exception 'Journey departure/arrival requires preceding location observation';end if;
  end if;
  if e->>'life_kind'='service_visit' and e->>'status'='completed' and e->>'recipe_id' is not null then
   ref:=e->>'stock_event_id';t:=stock_ops->ref;recipe:=st->'life'->('player-life:service_recipe:'||(e->>'recipe_id'));
   if ref is null or ref=any(used_stock) or t is null or recipe is null or t->'actor' is distinct from e->'provider' or t->'stock_lines' is distinct from recipe->'stock_lines' then raise exception 'Service requires its own exact stock consumption';end if;
   used_stock:=array_append(used_stock,ref);
  end if;
  st:=public.nw_player_life_step(st,e);
 end loop;
end $life$;
revoke all on function public.nw_assert_player_life_append(uuid,uuid,jsonb) from public,anon,authenticated;

