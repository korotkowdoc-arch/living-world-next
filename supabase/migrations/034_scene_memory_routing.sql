-- Isolated evidence-backed supplemental memory stored atomically in scene.events.
-- It cannot be a typed state record, knowledge grant, or plan-completion evidence.
-- Existing scenes, RLS, owner/head lock and all previous guards are unchanged.
create or replace function public.nw_assert_scene_memory_append(events jsonb)
returns void language plpgsql immutable security invoker set search_path='' as $sm$
declare e jsonb;v jsonb;k text;sig jsonb;seen jsonb:='[]'::jsonb;act jsonb;
begin
 if exists(select 1 from jsonb_array_elements(events) x where x ? 'knowledge_version' and (x->>'type' is distinct from 'knowledge' or x->'knowledge_version' is distinct from '1'::jsonb or exists(select 1 from jsonb_object_keys(x) k where right(k,8)='_version' and k<>'knowledge_version'))) then raise exception 'Knowledge record must use type knowledge and its own version only';end if;
 for e in select value from jsonb_array_elements(events) where value ? 'scene_memory_version' loop
  if e->'scene_memory_version' is distinct from '1'::jsonb or e->>'type' is distinct from 'world' or (e-array['id','type','scene_memory_version','memory_kind','domain','actors','actor','summary','evidence','place','topics'])<>'{}'::jsonb or coalesce(e->>'memory_kind','') not in ('observed','claim','intention','belief','description','uncertain') or coalesce(e->>'domain','') not in ('character','relationships','knowledge','finance','inventory','property','education','work','magic','medicine','community','civic','documents','travel','calendar','goals','world','experiences') or not public.nw_story_text_valid(e->'summary',600) or not public.nw_story_text_valid(e->'evidence',1200) or jsonb_typeof(e->'actors') is distinct from 'array' then raise exception 'Invalid isolated scene memory';end if;
  if jsonb_array_length(e->'actors')>8 or (select count(distinct value)<>count(*) from jsonb_array_elements(e->'actors')) or exists(select 1 from jsonb_array_elements(e->'actors') where not public.nw_story_text_valid(value,140)) then raise exception 'Invalid scene memory actors';end if;
  if e->>'actor' is not null and (not public.nw_story_text_valid(e->'actor',140) or not (e->'actors' @> jsonb_build_array(e->'actor'))) or e->>'memory_kind' in ('claim','intention','belief') and e->>'actor' is null then raise exception 'Scene memory requires explicit speaker or holder';end if;
  if e->>'place' is not null and not public.nw_story_text_valid(e->'place',140) then raise exception 'Invalid scene memory place';end if;
  if e->>'topics' is not null then
   if jsonb_typeof(e->'topics') is distinct from 'array' then raise exception 'Invalid scene memory topics';end if;
   if jsonb_array_length(e->'topics')>8 or (select count(distinct value)<>count(*) from jsonb_array_elements(e->'topics')) or exists(select 1 from jsonb_array_elements(e->'topics') where not public.nw_story_text_valid(value,100)) then raise exception 'Invalid scene memory topics';end if;
  end if;
  if jsonb_array_length(e->'actors')=0 and e->>'place' is null and (e->>'topics' is null or jsonb_array_length(e->'topics')=0) then raise exception 'Scene memory requires actor, place or topic';end if;
  select coalesce(jsonb_agg(value order by value),'[]'::jsonb) into act from jsonb_array_elements(e->'actors');
  sig:=jsonb_build_array(e->'memory_kind',e->'domain',e->'actor',act,e->'place',e->'summary',e->'evidence');
  if seen @> jsonb_build_array(sig) and exists(select 1 from jsonb_array_elements(seen) where value=sig) then raise exception 'Duplicate scene memory';end if;
  seen:=seen||jsonb_build_array(sig);
 end loop;
end $sm$;
revoke all on function public.nw_assert_scene_memory_append(jsonb) from public,anon,authenticated;

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
  if e->>'dynamics_kind'='player_choice' then
   if e->>'type' is distinct from 'world' or e->'dynamics_version' is distinct from '1'::jsonb then raise exception 'Invalid player choice event type'; end if;
   if e->>'status'='pending' and right(rtrim(p_body,E' \t\r\n'),char_length(e->>'evidence')) is distinct from (e->>'evidence') then raise exception 'Pending choice must end the scene'; end if;
  end if;
  perform public.nw_assert_story_event_shape(e);
  if e->>'type'='plan' then
    if nullif(trim(e->>'actor'),'') is null or nullif(trim(e->>'plan_id'),'') is null or
       coalesce(e->>'action','') not in ('start','advance','pause','resume','complete','abandon')
       then raise exception 'Invalid actor plan'; end if;
    if e->>'action'='start' and nullif(trim(e->>'goal'),'') is null
       then raise exception 'New plan requires a character goal'; end if;
    if e->>'action'='complete' and not exists(
      select 1 from jsonb_array_elements(p_events) a(value)
      where a.value->>'id'=e->>'performed_event_id' and a.value->>'type' in ('world','offscreen') and a.value->>'dynamics_kind' is distinct from 'player_choice' and not (a.value ? 'scene_memory_version')
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
      (locks.item->>'forbid_reconciliation'='true' and (e->>'stance' in ('friends','reconciled','peace','close_friends','romantic_partners') or e->'relationship_patch'->>'affection'='affectionate')) or
      (locks.item->>'forbid_respect'='true' and (e->>'stance' in ('respect','admiration') or e->>'respect'='true' or e->'relationship_patch'->>'respect'='respected'))
    )
  ) then raise exception 'Explicit relationship lock violated'; end if;
 end loop;
 perform public.nw_assert_economy_append(p_world_id,current_head,coalesce(p_events,'[]'::jsonb));
 perform public.nw_assert_story_transitions(p_world_id,current_head,coalesce(p_events,'[]'::jsonb));
 perform public.nw_family_goal_clock(coalesce(p_events,'[]'::jsonb),p_world_time);
 perform public.nw_assert_player_life_append(p_world_id,current_head,coalesce(p_events,'[]'::jsonb));
 perform public.nw_assert_extension_append(p_world_id,current_head,coalesce(p_events,'[]'::jsonb));
 perform public.nw_assert_scene_memory_append(coalesce(p_events,'[]'::jsonb));
 insert into public.nw_scenes(id,owner_id,world_id,branch_id,parent_scene_id,request_id,body,world_time,events,rules_version_at_commit)
 values(new_id,u,p_world_id,p_branch_id,current_head,p_request_id,p_body,nullif(trim(p_world_time),''),coalesce(p_events,'[]'::jsonb),actual_rules_version);
 update public.nw_branches set head_scene_id=new_id where id=p_branch_id;
 update public.nw_worlds set updated_at=now() where id=p_world_id;
 return new_id;
end $$;
revoke all on function public.nw_commit_scene(uuid,uuid,uuid,uuid,text,text,jsonb,integer) from public,anon;
grant execute on function public.nw_commit_scene(uuid,uuid,uuid,uuid,text,text,jsonb,integer) to authenticated;

-- Preserve existing event-history pagination and the owner/branch boundary.
-- Interpretive notes remain available in scene source and narrator recall,
-- never in the endpoint whose contract is confirmed structured events.
create or replace function public.nw_actor_history(p_world_id uuid,p_actor text,p_limit integer default 40,p_offset integer default 0)
returns table(scene_id uuid,world_time text,event jsonb,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $actor$
begin
 if auth.uid() is null or not exists(select 1 from public.nw_worlds w where w.id=p_world_id and w.owner_id=auth.uid()) then raise exception 'World not found';end if;
 if char_length(btrim(coalesce(p_actor,''))) not between 1 and 140 then raise exception 'Invalid character name';end if;
 return query
 with recursive ancestry as (
  select s.id,s.parent_scene_id,s.events,s.world_time,s.created_at,0 depth
  from public.nw_worlds w join public.nw_branches b on b.id=w.active_branch_id
  join public.nw_scenes s on s.id=b.head_scene_id
  where w.id=p_world_id and w.owner_id=auth.uid() and b.owner_id=auth.uid()
  union all
  select s.id,s.parent_scene_id,s.events,s.world_time,s.created_at,a.depth+1
  from ancestry a join public.nw_scenes s on s.id=a.parent_scene_id
  where s.world_id=p_world_id and s.owner_id=auth.uid()
 )
 select a.id,a.world_time,e.value,a.created_at
 from ancestry a cross join lateral jsonb_array_elements(a.events) with ordinality e(value,ordinality)
 where not (e.value ? 'scene_memory_version') and lower(btrim(p_actor)) in (
  lower(coalesce(e.value->>'actor','')),lower(coalesce(e.value->>'name','')),
  lower(coalesce(e.value->>'a','')),lower(coalesce(e.value->>'b',''))
 )
 order by a.depth desc,e.ordinality
 limit greatest(1,least(coalesce(p_limit,40),100)) offset greatest(0,coalesce(p_offset,0));
end $actor$;
revoke all on function public.nw_actor_history(uuid,text,integer,integer) from public,anon;
grant execute on function public.nw_actor_history(uuid,text,integer,integer) to authenticated;
