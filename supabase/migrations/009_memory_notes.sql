-- 009: derived source notes, separate from immutable canon. Not installed by this commit.
create table if not exists public.nw_memory_notes (
 owner_id uuid not null references auth.users(id) on delete cascade,
 world_id uuid not null references public.nw_worlds(id) on delete cascade,
 scene_id uuid not null references public.nw_scenes(id) on delete cascade,
 note_key text not null,
 note jsonb not null,
 created_at timestamptz not null default now(),
 primary key(owner_id,world_id,scene_id,note_key)
);
create index if not exists nw_memory_notes_scene_idx on public.nw_memory_notes(scene_id);
alter table public.nw_memory_notes enable row level security;
revoke all on public.nw_memory_notes from public,anon,authenticated;

create or replace function public.nw_save_memory_notes(p_world_id uuid,p_scene_id uuid,p_expected_head uuid,p_notes jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); h uuid; b text; n jsonb; k text; old jsonb; actor jsonb; total integer;
begin
 if u is null then raise exception 'Authentication required'; end if;
 -- Same world lock as scene append/branch change. No scene or world is rewritten.
 perform 1 from public.nw_worlds where id=p_world_id and owner_id=u for update;
 if not found then raise exception 'World not found'; end if;
 select br.head_scene_id into h from public.nw_worlds w join public.nw_branches br on br.id=w.active_branch_id
 where w.id=p_world_id and w.owner_id=u and br.owner_id=u and br.world_id=p_world_id;
 if not found or h is distinct from p_expected_head then raise exception 'History changed'; end if;
 if not public.nw_scene_in_active_branch(p_world_id,p_scene_id) then raise exception 'Scene not in active branch'; end if;
 select body into b from public.nw_scenes where id=p_scene_id and world_id=p_world_id and owner_id=u;
 if not found then raise exception 'Scene not found'; end if;
 if jsonb_typeof(p_notes) is distinct from 'array' or jsonb_array_length(p_notes) not between 1 and 20 or octet_length(p_notes::text)>100000 then raise exception 'Invalid notes'; end if;
 if exists(select 1 from jsonb_array_elements(p_notes) x group by x.value->>'key' having count(*)>1) then raise exception 'Duplicate note key'; end if;
 for n in select value from jsonb_array_elements(p_notes) loop
  k:=n->>'key';
  if jsonb_typeof(n) is distinct from 'object' or coalesce(k,'') !~ '^[A-Za-z0-9_-]{1,80}$'
   or coalesce(n->>'kind','') not in ('action','claim','intention','belief','relationship','place','other')
   or jsonb_typeof(n->'summary') is distinct from 'string' or char_length(btrim(n->>'summary')) not between 1 and 600
   or jsonb_typeof(n->'quote') is distinct from 'string' or char_length(btrim(n->>'quote')) not between 1 and 1200
   or strpos(b,n->>'quote')=0 or jsonb_typeof(n->'actors') is distinct from 'array'
   or jsonb_array_length(n->'actors')>8 then raise exception 'Invalid note or source quote'; end if;
  for actor in select value from jsonb_array_elements(n->'actors') loop
   if jsonb_typeof(actor) is distinct from 'string' or char_length(btrim(actor#>>'{}')) not between 1 and 140 then raise exception 'Invalid actor'; end if;
  end loop;
  n:=jsonb_build_object('key',k,'kind',n->'kind','summary',n->'summary','quote',n->'quote','actors',n->'actors');
  select note into old from public.nw_memory_notes where owner_id=u and world_id=p_world_id and scene_id=p_scene_id and note_key=k;
  if found then
   if old is distinct from n then raise exception 'Note key reused for different content'; end if;
  else
   select count(*) into total from public.nw_memory_notes where owner_id=u and world_id=p_world_id and scene_id=p_scene_id;
   if total>=100 then raise exception 'Too many derived notes for scene'; end if;
   insert into public.nw_memory_notes(owner_id,world_id,scene_id,note_key,note) values(u,p_world_id,p_scene_id,k,n);
  end if;
 end loop;
 return jsonb_build_object('saved',true,'scene_id',p_scene_id,'count',jsonb_array_length(p_notes),'canonical',false);
end $$;

create or replace function public.nw_read_memory_notes(p_world_id uuid,p_expected_head uuid,p_actor text default null,p_scene_id uuid default null,p_limit integer default 20,p_offset integer default 0)
returns table(scene_id uuid,note_key text,note jsonb,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); h uuid;
begin
 if u is null then raise exception 'Authentication required'; end if;
 select br.head_scene_id into h from public.nw_worlds w join public.nw_branches br on br.id=w.active_branch_id
 where w.id=p_world_id and w.owner_id=u and br.owner_id=u and br.world_id=p_world_id;
 if not found or h is distinct from p_expected_head then raise exception 'History changed'; end if;
 if char_length(coalesce(p_actor,''))>140 then raise exception 'Invalid actor'; end if;
 return query with recursive ancestry(id,parent_scene_id,depth) as (
  select s.id,s.parent_scene_id,0 from public.nw_scenes s where s.id=h and s.world_id=p_world_id and s.owner_id=u
  union all select s.id,s.parent_scene_id,a.depth+1 from public.nw_scenes s join ancestry a on s.id=a.parent_scene_id
   where s.world_id=p_world_id and s.owner_id=u and a.depth<100000
 )
 select n.scene_id,n.note_key,n.note,n.created_at from public.nw_memory_notes n join ancestry a on n.scene_id=a.id
 where n.owner_id=u and n.world_id=p_world_id and (p_scene_id is null or n.scene_id=p_scene_id)
 and (p_actor is null or n.note->'actors' ? p_actor)
 order by a.depth,n.note_key limit greatest(1,least(coalesce(p_limit,20),40)) offset greatest(0,coalesce(p_offset,0));
end $$;
revoke all on function public.nw_save_memory_notes(uuid,uuid,uuid,jsonb),public.nw_read_memory_notes(uuid,uuid,text,uuid,integer,integer) from public,anon;
grant execute on function public.nw_save_memory_notes(uuid,uuid,uuid,jsonb),public.nw_read_memory_notes(uuid,uuid,text,uuid,integer,integer) to authenticated;
