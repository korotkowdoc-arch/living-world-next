-- Remap structured branch-scoped menu preferences during archive restoration.
-- Ordinary prose and world-wide settings are never rewritten.
create or replace function public.nw_import_menu_text(p_owner uuid,p_job uuid,p_text text)
returns text language plpgsql stable security invoker set search_path='' as $menu_import$
declare doc jsonb; target uuid;
begin
 if p_text is null or left(p_text,13)<>'NEXT_MENU_V1:' then return p_text;end if;
 begin doc:=substring(p_text from 14)::jsonb;exception when invalid_text_representation then return p_text;end;
 if jsonb_typeof(doc) is distinct from 'object' or doc->>'kind' is distinct from 'focus' or coalesce(doc->>'branch_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return p_text;end if;
 select mapped_id into target from public.nw_import_rows where owner_id=p_owner and job_id=p_job and section='branches' and old_id=(doc->>'branch_id')::uuid;
 if target is null then return p_text;end if;
 return 'NEXT_MENU_V1:'||jsonb_set(doc,'{branch_id}',to_jsonb(target::text),false)::text;
end $menu_import$;
revoke all on function public.nw_import_menu_text(uuid,uuid,text) from public,anon,authenticated;
create or replace function public.nw_import_menu_audit(p_owner uuid,p_job uuid,p_state jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $menu_import$
begin
 if jsonb_typeof(p_state->'text')='string' then
  return jsonb_set(p_state,'{text}',to_jsonb(public.nw_import_menu_text(p_owner,p_job,p_state->>'text')),false);
 end if;
 return p_state;
end $menu_import$;
revoke all on function public.nw_import_menu_audit(uuid,uuid,jsonb) from public,anon,authenticated;

create or replace function public.nw_import_finalize(p_import_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); j public.nw_import_jobs%rowtype; w jsonb; wid uuid:=gen_random_uuid();
 active_id uuid; receipt jsonb; section_name text; n bigint;
begin
 if u is null then raise exception 'Authentication required'; end if;
 select * into j from public.nw_import_jobs where owner_id=u and id=p_import_id for update;
 if not found then raise exception 'Import not found'; end if;
 if j.result is not null then return j.result; end if;
 if (select count(*) from public.nw_import_chunks where owner_id=u and job_id=p_import_id)<>jsonb_array_length(j.manifest->'chunks') then raise exception 'Incomplete import chunks'; end if;
 foreach section_name in array array['branches','directives','directive_edits','scenes','revisions'] loop
  select count(*) into n from public.nw_import_rows where owner_id=u and job_id=p_import_id and section=section_name;
  if n<>(j.manifest->'counts'->>section_name)::bigint then raise exception 'Incomplete import section: %',section_name; end if;
 end loop;
 w:=j.manifest->'world';
 select mapped_id into active_id from public.nw_import_rows where owner_id=u and job_id=p_import_id and section='branches' and old_id=(w->>'active_branch_id')::uuid;
 if active_id is null then raise exception 'Missing active branch'; end if;
 -- Every parent must have exactly one smaller depth and every root depth 0.
 -- Strict decrease proves acyclicity and reachability in a finite graph,
 -- without a recursive query that may scan a 50k-row chain 50k times.
 if exists(
  select 1 from public.nw_import_rows s
  left join public.nw_import_rows p on p.owner_id=u and p.job_id=p_import_id and p.section='scenes' and p.old_id=s.parent_id
  where s.owner_id=u and s.job_id=p_import_id and s.section='scenes' and
   (s.scene_depth is null or (s.parent_id is null and s.scene_depth<>0)
    or (s.parent_id is not null and (p.old_id is null or p.scene_depth is null or s.scene_depth<>p.scene_depth+1)))
 ) then raise exception 'Cyclic or missing parent scene'; end if;
 if exists(
  select 1 from public.nw_import_rows s
  left join public.nw_import_rows b on b.owner_id=u and b.job_id=p_import_id and b.section='branches' and b.old_id=(s.row_data->>'branch_id')::uuid
  where s.owner_id=u and s.job_id=p_import_id and s.section='scenes' and b.old_id is null
 ) then raise exception 'Missing scene branch'; end if;
 if exists(
  select 1 from public.nw_import_rows b
  left join public.nw_import_rows h on h.owner_id=u and h.job_id=p_import_id and h.section='scenes' and h.old_id=(b.row_data->>'head_scene_id')::uuid
  left join public.nw_import_rows f on f.owner_id=u and f.job_id=p_import_id and f.section='scenes' and f.old_id=(b.row_data->>'fork_scene_id')::uuid
  where b.owner_id=u and b.job_id=p_import_id and b.section='branches'
   and ((b.row_data->>'head_scene_id' is not null and h.old_id is null) or (b.row_data->>'fork_scene_id' is not null and f.old_id is null))
 ) then raise exception 'Missing branch scene'; end if;
 if exists(
  select 1 from public.nw_import_rows s cross join lateral jsonb_array_elements(s.row_data->'events') e
  where s.owner_id=u and s.job_id=p_import_id and s.section='scenes'
  and (jsonb_typeof(e.value) is distinct from 'object' or btrim(coalesce(e.value->>'evidence',''))='' or strpos(s.row_data->>'body',e.value->>'evidence')=0)
 ) then raise exception 'Scene event has no textual evidence'; end if;
 if exists(
  select 1 from public.nw_import_rows where owner_id=u and job_id=p_import_id and section in ('scenes','revisions')
  group by section,(row_data->>'request_id')::uuid having (row_data->>'request_id')::uuid is null or count(*)>1
 ) then raise exception 'Missing or duplicated request ID'; end if;
 -- References to rules and revision sources are validated independently of client checks.
 if exists(
  select 1 from public.nw_import_rows e left join public.nw_import_rows d on d.owner_id=u and d.job_id=p_import_id and d.section='directives' and d.old_id=(e.row_data->>'directive_id')::uuid
  where e.owner_id=u and e.job_id=p_import_id and e.section='directive_edits'
   and (d.old_id is null or jsonb_typeof(e.row_data->'before_state') is distinct from 'object' or jsonb_typeof(e.row_data->'after_state') is distinct from 'object')
 ) then raise exception 'Invalid directive audit'; end if;
 if exists(
  select 1 from public.nw_import_rows r
  left join public.nw_import_rows s on s.owner_id=u and s.job_id=p_import_id and s.section='scenes' and s.old_id=(r.row_data->>'source_scene_id')::uuid
  left join public.nw_import_rows t on t.owner_id=u and t.job_id=p_import_id and t.section='scenes' and t.old_id=(r.row_data->>'new_scene_id')::uuid
  left join public.nw_import_rows b on b.owner_id=u and b.job_id=p_import_id and b.section='branches' and b.old_id=(r.row_data->>'branch_id')::uuid
  where r.owner_id=u and r.job_id=p_import_id and r.section='revisions'
   and (s.old_id is null or t.old_id is null or b.old_id is null or jsonb_typeof(r.row_data->'new_events') is distinct from 'array')
 ) then raise exception 'Invalid revision references'; end if;
 -- The only writes to live story tables occur here, in this single RPC transaction.
 insert into public.nw_worlds(id,owner_id,title,seed,start_marker,active_branch_id,auto_save,directive_version,created_at,updated_at)
 values(wid,u,w->>'title',w->>'seed',coalesce(nullif(w->>'start_marker',''),'Время ещё не установлено'),null,
 coalesce((w->>'auto_save')::boolean,true),coalesce((w->>'directive_version')::integer,0),
 coalesce((w->>'created_at')::timestamptz,now()),now());
 insert into public.nw_branches(id,world_id,owner_id,name,created_at)
 select mapped_id,wid,u,coalesce(nullif(row_data->>'name',''),'Основная линия'),coalesce((row_data->>'created_at')::timestamptz,now())
 from public.nw_import_rows where owner_id=u and job_id=p_import_id and section='branches';
 -- A single statement inserts every mapped scene. PostgreSQL checks self-FKs at
 -- statement end; parent order is irrelevant after the explicit DAG validation.
 insert into public.nw_scenes(id,world_id,owner_id,branch_id,parent_scene_id,request_id,body,world_time,events,created_at,rules_version_at_commit)
 select s.mapped_id,wid,u,b.mapped_id,p.mapped_id,gen_random_uuid(),s.row_data->>'body',s.row_data->>'world_time',s.row_data->'events',
 coalesce((s.row_data->>'created_at')::timestamptz,now()),(s.row_data->>'rules_version_at_commit')::integer
 from public.nw_import_rows s
 join public.nw_import_rows b on b.owner_id=u and b.job_id=p_import_id and b.section='branches' and b.old_id=(s.row_data->>'branch_id')::uuid
 left join public.nw_import_rows p on p.owner_id=u and p.job_id=p_import_id and p.section='scenes' and p.old_id=s.parent_id
 where s.owner_id=u and s.job_id=p_import_id and s.section='scenes';
 update public.nw_branches dest set head_scene_id=h.mapped_id,fork_scene_id=f.mapped_id
 from public.nw_import_rows b
 left join public.nw_import_rows h on h.owner_id=u and h.job_id=p_import_id and h.section='scenes' and h.old_id=(b.row_data->>'head_scene_id')::uuid
 left join public.nw_import_rows f on f.owner_id=u and f.job_id=p_import_id and f.section='scenes' and f.old_id=(b.row_data->>'fork_scene_id')::uuid
 where b.owner_id=u and b.job_id=p_import_id and b.section='branches' and dest.id=b.mapped_id and dest.world_id=wid;
 update public.nw_worlds set active_branch_id=active_id where id=wid and owner_id=u;
 insert into public.nw_directives(id,world_id,owner_id,text,category,metadata,active,created_at,updated_at)
 select mapped_id,wid,u,public.nw_import_menu_text(u,p_import_id,row_data->>'text'),coalesce(row_data->>'category','general'),coalesce(row_data->'metadata','{}'::jsonb),
 coalesce((row_data->>'active')::boolean,true),coalesce((row_data->>'created_at')::timestamptz,now()),coalesce((row_data->>'updated_at')::timestamptz,now())
 from public.nw_import_rows where owner_id=u and job_id=p_import_id and section='directives';
 insert into public.nw_directive_edits(id,world_id,owner_id,directive_id,action,before_state,after_state,created_at)
 select e.mapped_id,wid,u,d.mapped_id,e.row_data->>'action',
 public.nw_import_menu_audit(u,p_import_id,e.row_data->'before_state')||jsonb_build_object('id',d.mapped_id,'world_id',wid,'owner_id',u),
 public.nw_import_menu_audit(u,p_import_id,e.row_data->'after_state')||jsonb_build_object('id',d.mapped_id,'world_id',wid,'owner_id',u),
 coalesce((e.row_data->>'created_at')::timestamptz,now())
 from public.nw_import_rows e join public.nw_import_rows d on d.owner_id=u and d.job_id=p_import_id and d.section='directives' and d.old_id=(e.row_data->>'directive_id')::uuid
 where e.owner_id=u and e.job_id=p_import_id and e.section='directive_edits';
 insert into public.nw_revisions(id,world_id,owner_id,request_id,source_scene_id,branch_id,new_scene_id,kept_prefix,continuation,new_events,requested_world_time,created_at)
 select r.mapped_id,wid,u,gen_random_uuid(),s.mapped_id,b.mapped_id,t.mapped_id,r.row_data->>'kept_prefix',r.row_data->>'continuation',r.row_data->'new_events',
 r.row_data->>'requested_world_time',coalesce((r.row_data->>'created_at')::timestamptz,now())
 from public.nw_import_rows r
 join public.nw_import_rows s on s.owner_id=u and s.job_id=p_import_id and s.section='scenes' and s.old_id=(r.row_data->>'source_scene_id')::uuid
 join public.nw_import_rows t on t.owner_id=u and t.job_id=p_import_id and t.section='scenes' and t.old_id=(r.row_data->>'new_scene_id')::uuid
 join public.nw_import_rows b on b.owner_id=u and b.job_id=p_import_id and b.section='branches' and b.old_id=(r.row_data->>'branch_id')::uuid
 where r.owner_id=u and r.job_id=p_import_id and r.section='revisions';
 receipt:=jsonb_build_object('world_id',wid,'original_world_id',w->>'id','import_id',p_import_id)||(j.manifest->'counts');
 update public.nw_import_jobs set result=receipt,touched_at=now() where owner_id=u and id=p_import_id;
 -- Keep a small idempotent receipt; the temporary row bodies are no longer needed.
 delete from public.nw_import_rows where owner_id=u and job_id=p_import_id;
 delete from public.nw_import_chunks where owner_id=u and job_id=p_import_id;
 return receipt;
end $$;


revoke all on function public.nw_import_finalize(uuid) from public,anon;
grant execute on function public.nw_import_finalize(uuid) to authenticated;
