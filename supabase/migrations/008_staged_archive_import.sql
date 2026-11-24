-- 008: resumable private staging for large archive imports.
-- No existing worlds/scenes are changed. Apply after 006; production test required.
create table if not exists public.nw_import_jobs(
 owner_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null,
 manifest jsonb not null,
 result jsonb,
 created_at timestamptz not null default now(),
 touched_at timestamptz not null default now(),
 primary key(owner_id,id)
);
create table if not exists public.nw_import_chunks(
 owner_id uuid not null, job_id uuid not null, chunk_index integer not null,
 sha256 text not null, primary key(owner_id,job_id,chunk_index),
 foreign key(owner_id,job_id) references public.nw_import_jobs(owner_id,id) on delete cascade
);
create table if not exists public.nw_import_rows(
 owner_id uuid not null, job_id uuid not null, section text not null,
 old_id uuid not null, mapped_id uuid not null default gen_random_uuid(),
 parent_id uuid, scene_depth integer, row_data jsonb not null,
 primary key(owner_id,job_id,section,old_id),
 foreign key(owner_id,job_id) references public.nw_import_jobs(owner_id,id) on delete cascade,
 check(section in ('branches','directives','directive_edits','scenes','revisions'))
);
create index if not exists nw_import_parent_idx on public.nw_import_rows(owner_id,job_id,section,parent_id);
alter table public.nw_import_jobs enable row level security;
alter table public.nw_import_chunks enable row level security;
alter table public.nw_import_rows enable row level security;
revoke all on public.nw_import_jobs,public.nw_import_chunks,public.nw_import_rows from public,anon,authenticated;

create or replace function public.nw_import_begin(p_import_id uuid,p_manifest jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); old public.nw_import_jobs%rowtype; c jsonb; section_name text;
 n integer; i integer:=0; total bigint:=0; total_rows bigint:=0; expected bigint; actual bigint;
begin
 if u is null or p_import_id is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(p_manifest) is distinct from 'object' or p_manifest->>'format' is distinct from 'living-world-next-staged-v1'
   or coalesce(p_manifest->>'archive_sha256','') !~ '^[a-f0-9]{64}$'
   or jsonb_typeof(p_manifest->'world') is distinct from 'object'
   or jsonb_typeof(p_manifest->'counts') is distinct from 'object'
   or jsonb_typeof(p_manifest->'chunks') is distinct from 'array'
   or octet_length(p_manifest::text)>1000000 then raise exception 'Invalid import manifest'; end if;
 if (p_manifest->'world'->>'id')::uuid is null or (p_manifest->'world'->>'active_branch_id')::uuid is null
    or char_length(btrim(coalesce(p_manifest->'world'->>'title',''))) not between 1 and 100
    or char_length(btrim(coalesce(p_manifest->'world'->>'seed',''))) not between 8 and 12000
    or coalesce((p_manifest->'world'->>'directive_version')::integer,0)<0
    then raise exception 'Invalid world'; end if;
 n:=jsonb_array_length(p_manifest->'chunks');
 if n not between 1 and 1000 then raise exception 'Invalid chunk count'; end if;
 for c in select value from jsonb_array_elements(p_manifest->'chunks') loop
  if jsonb_typeof(c) is distinct from 'object' or (c->>'index')::integer is distinct from i
   or coalesce(c->>'section','') not in ('branches','directives','directive_edits','scenes','revisions')
   or coalesce((c->>'count')::integer,0) not between 1 and 400
   or coalesce((c->>'bytes')::integer,0) not between 2 and 2097152
   or coalesce(c->>'sha256','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid chunk specification'; end if;
  total:=total+(c->>'bytes')::integer;i:=i+1;
 end loop;
 if total>104857600 or total is distinct from (p_manifest->>'total_bytes')::bigint then raise exception 'Import byte limit or count mismatch'; end if;
 foreach section_name in array array['branches','directives','directive_edits','scenes','revisions'] loop
  expected:=(p_manifest->'counts'->>section_name)::bigint;
  select coalesce(sum((value->>'count')::integer),0) into actual from jsonb_array_elements(p_manifest->'chunks') where value->>'section'=section_name;
  if expected is null or expected not between 0 and 50000 or expected<>actual then raise exception 'Section count mismatch: %',section_name; end if;
  total_rows:=total_rows+expected;
 end loop;
 if total_rows>100000 or (p_manifest->'counts'->>'branches')::integer<1 then raise exception 'Import row limit'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,817));
 delete from public.nw_import_jobs where owner_id=u and result is null and touched_at<now()-interval '7 days';
 select * into old from public.nw_import_jobs where owner_id=u and id=p_import_id for update;
 if found then
  if old.manifest is distinct from p_manifest then raise exception 'Import ID reused for different archive'; end if;
  update public.nw_import_jobs set touched_at=now() where owner_id=u and id=p_import_id;
  return jsonb_build_object('result',old.result,'uploaded',coalesce((select jsonb_agg(chunk_index order by chunk_index) from public.nw_import_chunks where owner_id=u and job_id=p_import_id),'[]'::jsonb));
 end if;
 if (select count(*) from public.nw_import_jobs where owner_id=u and result is null)>=3 then raise exception 'Too many unfinished imports; cancel an old import'; end if;
 insert into public.nw_import_jobs(owner_id,id,manifest) values(u,p_import_id,p_manifest);
 return jsonb_build_object('result',null,'uploaded','[]'::jsonb);
end $$;

create or replace function public.nw_import_chunk(p_import_id uuid,p_index integer,p_payload text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); j public.nw_import_jobs%rowtype; spec jsonb; parsed jsonb; r jsonb; actual_sha text; existing_sha text; sec text; original_id uuid; rid uuid;
begin
 if u is null then raise exception 'Authentication required'; end if;
 select * into j from public.nw_import_jobs where owner_id=u and id=p_import_id for update;
 if not found then raise exception 'Import not found'; end if;
 if j.result is not null then return jsonb_build_object('finished',true); end if;
 if p_index is null or p_index<0 or p_index>=jsonb_array_length(j.manifest->'chunks') then raise exception 'Invalid chunk index'; end if;
 spec:=j.manifest->'chunks'->p_index;
 if p_payload is null or octet_length(p_payload)<>(spec->>'bytes')::integer or octet_length(p_payload)>2097152 then raise exception 'Chunk byte mismatch'; end if;
 actual_sha:=encode(sha256(convert_to(p_payload,'UTF8')),'hex');
 if actual_sha is distinct from spec->>'sha256' then raise exception 'Chunk SHA-256 mismatch'; end if;
 select sha256 into existing_sha from public.nw_import_chunks where owner_id=u and job_id=p_import_id and chunk_index=p_index;
 if found then
  if existing_sha<>actual_sha then raise exception 'Chunk changed'; end if;
  return jsonb_build_object('accepted',true,'reused',true);
 end if;
 parsed:=p_payload::jsonb;sec:=spec->>'section';original_id:=(j.manifest->'world'->>'id')::uuid;
 if jsonb_typeof(parsed) is distinct from 'array' or jsonb_array_length(parsed)<>(spec->>'count')::integer then raise exception 'Chunk row count mismatch'; end if;
 for r in select value from jsonb_array_elements(parsed) loop
  rid:=(r->>'id')::uuid;
  if jsonb_typeof(r) is distinct from 'object' or rid is null or (r->>'world_id')::uuid is distinct from original_id then raise exception 'Invalid or foreign archive row'; end if;
  if sec='scenes' and (char_length(coalesce(r->>'body','')) not between 10 and 200000 or jsonb_typeof(r->'events') is distinct from 'array') then raise exception 'Invalid scene'; end if;
  if sec='scenes' and coalesce((r->>'import_depth')::integer,-1) not between 0 and 49999 then raise exception 'Invalid scene depth'; end if;
  insert into public.nw_import_rows(owner_id,job_id,section,old_id,parent_id,scene_depth,row_data)
    values(u,p_import_id,sec,rid,case when sec='scenes' then (r->>'parent_scene_id')::uuid end,
     case when sec='scenes' then (r->>'import_depth')::integer end,r-'import_depth');
 end loop;
 insert into public.nw_import_chunks(owner_id,job_id,chunk_index,sha256) values(u,p_import_id,p_index,actual_sha);
 update public.nw_import_jobs set touched_at=now() where owner_id=u and id=p_import_id;
 return jsonb_build_object('accepted',true,'reused',false);
end $$;

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
 select mapped_id,wid,u,row_data->>'text',coalesce(row_data->>'category','general'),coalesce(row_data->'metadata','{}'::jsonb),
 coalesce((row_data->>'active')::boolean,true),coalesce((row_data->>'created_at')::timestamptz,now()),coalesce((row_data->>'updated_at')::timestamptz,now())
 from public.nw_import_rows where owner_id=u and job_id=p_import_id and section='directives';
 insert into public.nw_directive_edits(id,world_id,owner_id,directive_id,action,before_state,after_state,created_at)
 select e.mapped_id,wid,u,d.mapped_id,e.row_data->>'action',
 (e.row_data->'before_state')||jsonb_build_object('id',d.mapped_id,'world_id',wid,'owner_id',u),
 (e.row_data->'after_state')||jsonb_build_object('id',d.mapped_id,'world_id',wid,'owner_id',u),
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

create or replace function public.nw_import_cancel(p_import_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 delete from public.nw_import_jobs where owner_id=auth.uid() and id=p_import_id and result is null;
 return found;
end $$;
revoke all on function public.nw_import_begin(uuid,jsonb),public.nw_import_chunk(uuid,integer,text),public.nw_import_finalize(uuid),public.nw_import_cancel(uuid) from public,anon;
grant execute on function public.nw_import_begin(uuid,jsonb),public.nw_import_chunk(uuid,integer,text),public.nw_import_finalize(uuid),public.nw_import_cancel(uuid) to authenticated;
