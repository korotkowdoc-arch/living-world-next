-- LIVING WORLD NEXT 0.3: full active-branch search and evidence-backed character memory.
-- Execute AFTER 001_story_controls.sql. Never modifies legacy lw_* or saved scenes.
-- These RPCs read the entire confirmed ancestry, including beyond the last 1000 scenes.

create or replace function public.nw_search_history(
 p_world_id uuid, p_query text, p_limit integer default 25, p_offset integer default 0
) returns table(scene_id uuid, world_time text, snippet text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.nw_worlds w where w.id=p_world_id and w.owner_id=auth.uid()) then
   raise exception 'World not found';
 end if;
 if char_length(btrim(coalesce(p_query,''))) not between 2 and 180 then
   raise exception 'Search query must contain 2-180 characters';
 end if;
 return query
 with recursive ancestry as (
   select s.id,s.parent_scene_id,s.body,s.world_time,s.created_at,0 depth
   from public.nw_worlds w join public.nw_branches b on b.id=w.active_branch_id
   join public.nw_scenes s on s.id=b.head_scene_id
   where w.id=p_world_id and w.owner_id=auth.uid() and b.owner_id=auth.uid()
   union all
   select s.id,s.parent_scene_id,s.body,s.world_time,s.created_at,a.depth+1
   from ancestry a join public.nw_scenes s on s.id=a.parent_scene_id
   where s.world_id=p_world_id and s.owner_id=auth.uid()
 ), matched as (
   select a.*,strpos(lower(a.body),lower(btrim(p_query))) match_at from ancestry a
 )
 select m.id,m.world_time,
   substring(m.body from greatest(1,m.match_at-150) for 420),m.created_at
 from matched m where m.match_at>0 order by m.depth asc
 limit greatest(1,least(coalesce(p_limit,25),40)) offset greatest(0,coalesce(p_offset,0));
end $$;

create or replace function public.nw_actor_history(
 p_world_id uuid, p_actor text, p_limit integer default 40, p_offset integer default 0
) returns table(scene_id uuid, world_time text, event jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.nw_worlds w where w.id=p_world_id and w.owner_id=auth.uid()) then
   raise exception 'World not found';
 end if;
 if char_length(btrim(coalesce(p_actor,''))) not between 1 and 140 then
   raise exception 'Invalid character name';
 end if;
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
 from ancestry a cross join lateral jsonb_array_elements(a.events) e(value)
 where lower(btrim(p_actor)) in (
   lower(coalesce(e.value->>'actor','')),lower(coalesce(e.value->>'name','')),
   lower(coalesce(e.value->>'a','')),lower(coalesce(e.value->>'b',''))
 )
 order by a.depth desc
 limit greatest(1,least(coalesce(p_limit,40),100)) offset greatest(0,coalesce(p_offset,0));
end $$;

revoke all on function public.nw_search_history(uuid,text,integer,integer),
 public.nw_actor_history(uuid,text,integer,integer) from public,anon;
grant execute on function public.nw_search_history(uuid,text,integer,integer),
 public.nw_actor_history(uuid,text,integer,integer) to authenticated;
