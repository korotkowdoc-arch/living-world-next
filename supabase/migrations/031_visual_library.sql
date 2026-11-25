-- Private, versioned visual library. Visuals are metadata, not story events.
-- Each asset is anchored to a confirmed scene or the empty starting branch.
create table if not exists public.nw_visual_assets (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
 world_id uuid not null references public.nw_worlds(id) on delete cascade,
 branch_id uuid not null references public.nw_branches(id) on delete cascade,
 scene_id uuid references public.nw_scenes(id) on delete cascade,
 subject_kind text not null check(subject_kind in ('character','scene','place','item','document','chapter','creature','ritual','outfit','photo','other')),
 subject_id text not null check(char_length(trim(subject_id)) between 1 and 180),
 kind text not null check(kind in ('portrait','scene','location','artifact','cover','illustration','photo','diagram','outfit','creature')),
 title text not null check(char_length(trim(title)) between 1 and 240),
 identity_notes text not null default '' check(char_length(identity_notes)<=4000),
 prompt text not null check(char_length(trim(prompt)) between 1 and 8000),
 reference_asset_ids uuid[] not null default '{}' check(cardinality(reference_asset_ids)<=8),
 status text not null default 'pending' check(status in ('pending','ready','archived')),
 created_at timestamptz not null default now(),
 mime_type text check(mime_type in ('image/png','image/jpeg','image/webp')),
 byte_size bigint check(byte_size between 1 and 8388608),
 storage_path text unique not null
);
create index if not exists nw_visual_world_created on public.nw_visual_assets(world_id,created_at desc);
alter table public.nw_visual_assets enable row level security;
revoke all on public.nw_visual_assets from public,anon,authenticated;
grant select on public.nw_visual_assets to authenticated;
create policy nw_visual_owner on public.nw_visual_assets for select to authenticated using(owner_id=(select auth.uid()));
-- Only scene ancestry (or the same empty root branch) may appear in the current library.
create or replace function public.nw_list_visual_assets(p_world_id uuid,p_limit integer default 40,p_offset integer default 0)
returns setof public.nw_visual_assets language sql stable security invoker set search_path='' as $$
 with recursive ancestry as (
  select s.id,s.parent_scene_id from public.nw_worlds w join public.nw_branches b on b.id=w.active_branch_id join public.nw_scenes s on s.id=b.head_scene_id where w.id=p_world_id and w.owner_id=auth.uid()
  union all select s.id,s.parent_scene_id from public.nw_scenes s join ancestry a on s.id=a.parent_scene_id where s.world_id=p_world_id and s.owner_id=auth.uid()
 )
 select v.* from public.nw_visual_assets v join public.nw_worlds w on w.id=v.world_id
 where v.world_id=p_world_id and v.owner_id=auth.uid() and w.owner_id=auth.uid() and v.status<>'archived'
 and (v.scene_id in(select id from ancestry) or (v.scene_id is null and v.branch_id=w.active_branch_id))
 order by v.created_at desc,v.id desc limit greatest(1,least(coalesce(p_limit,40),100)) offset greatest(0,coalesce(p_offset,0));
$$;
revoke all on function public.nw_list_visual_assets(uuid,integer,integer) from public,anon;
grant execute on function public.nw_list_visual_assets(uuid,integer,integer) to authenticated;
create or replace function public.nw_prepare_visual(p_world_id uuid,p_branch_id uuid,p_expected_head uuid,p_subject_kind text,p_subject_id text,p_kind text,p_title text,p_prompt text,p_identity_notes text default '',p_references uuid[] default '{}')
returns public.nw_visual_assets language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();h uuid;v public.nw_visual_assets;aid uuid:=gen_random_uuid();r uuid;
begin
 if u is null then raise exception 'Authentication required';end if;
 perform 1 from public.nw_worlds where id=p_world_id and owner_id=u and active_branch_id=p_branch_id for update;
 if not found then raise exception 'Not active owned world';end if;
 select head_scene_id into h from public.nw_branches where id=p_branch_id and world_id=p_world_id and owner_id=u for update;
 if not found or h is distinct from p_expected_head then raise exception 'Stale visual request';end if;
 if cardinality(coalesce(p_references,'{}'))>8 then raise exception 'Too many references';end if;
 foreach r in array coalesce(p_references,'{}') loop
  if not exists(select 1 from public.nw_list_visual_assets(p_world_id,100,0) a where a.id=r and a.status='ready') then raise exception 'Reference not in current visible library';end if;
 end loop;
 if (select count(*) from public.nw_visual_assets where owner_id=u and world_id=p_world_id and status='pending')>=30 then raise exception 'Finish or archive pending visuals first';end if;
 insert into public.nw_visual_assets(id,owner_id,world_id,branch_id,scene_id,subject_kind,subject_id,kind,title,prompt,identity_notes,reference_asset_ids,storage_path)
 values(aid,u,p_world_id,p_branch_id,h,p_subject_kind,p_subject_id,p_kind,p_title,p_prompt,coalesce(p_identity_notes,''),coalesce(p_references,'{}'),u::text||'/'||p_world_id::text||'/'||aid::text)
 returning * into v;return v;
end $$;
revoke all on function public.nw_prepare_visual(uuid,uuid,uuid,text,text,text,text,text,text,uuid[]) from public,anon;
grant execute on function public.nw_prepare_visual(uuid,uuid,uuid,text,text,text,text,text,text,uuid[]) to authenticated;
-- Storage is present in Supabase, not the plain PostgreSQL CI harness.
do $storage$ begin
 if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
  execute $q$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('nw-world-visuals','nw-world-visuals',false,8388608,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing$q$;
  execute $q$create policy nw_visual_upload on storage.objects for insert to authenticated with check(bucket_id='nw-world-visuals' and exists(select 1 from public.nw_visual_assets a where a.storage_path=name and a.owner_id=(select auth.uid()) and a.status='pending'))$q$;
  execute $q$create policy nw_visual_download on storage.objects for select to authenticated using(bucket_id='nw-world-visuals' and exists(select 1 from public.nw_visual_assets a where a.storage_path=name and a.owner_id=(select auth.uid()) and a.status in ('pending','ready')))$q$;
  execute $q$create policy nw_visual_delete_pending on storage.objects for delete to authenticated using(bucket_id='nw-world-visuals' and exists(select 1 from public.nw_visual_assets a where a.storage_path=name and a.owner_id=(select auth.uid()) and a.status in ('pending','archived')))$q$;
 end if;
end $storage$;
create or replace function public.nw_finish_visual(p_asset_id uuid)
returns public.nw_visual_assets language plpgsql security definer set search_path='' as $$
declare v public.nw_visual_assets;m jsonb;n bigint;t text;
begin
 select * into v from public.nw_visual_assets where id=p_asset_id and owner_id=auth.uid() for update;
 if not found or v.status='archived' then raise exception 'Visual not found';end if;
 if v.status='ready' then return v;end if;
 if to_regclass('storage.objects') is null then raise exception 'Storage unavailable';end if;
 execute 'select metadata from storage.objects where bucket_id=$1 and name=$2' into m using 'nw-world-visuals',v.storage_path;
 if m is null then raise exception 'Upload image first';end if;
 t:=m->>'mimetype';if coalesce(m->>'size','') !~ '^[0-9]+$' then raise exception 'Missing image size';end if;n:=(m->>'size')::bigint;
 if t is null or t not in ('image/png','image/jpeg','image/webp') or n not between 1 and 8388608 then raise exception 'Invalid image object';end if;
 update public.nw_visual_assets set status='ready',mime_type=t,byte_size=n where id=v.id returning * into v;return v;
end $$;
revoke all on function public.nw_finish_visual(uuid) from public,anon;
grant execute on function public.nw_finish_visual(uuid) to authenticated;
create or replace function public.nw_archive_visual(p_asset_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.nw_visual_assets set status='archived' where id=p_asset_id and owner_id=auth.uid();
 if not found then raise exception 'Visual not found';end if;
end $$;
revoke all on function public.nw_archive_visual(uuid) from public,anon;
grant execute on function public.nw_archive_visual(uuid) to authenticated;
