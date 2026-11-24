-- Integration against an isolated PostgreSQL/Supabase-compatible test database.
-- Run as DB owner. Synthetic users, scenes and notes are rolled back.
begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222') on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $verify$
declare wid uuid; bid uuid; root uuid; second_scene uuid; request_id uuid:=gen_random_uuid();
 body text:='Anna was born on 2000-02-29. Anna owns a book.';
 events jsonb:='[{"id":"birth","type":"character","name":"Anna","state_patch":{"birth_date":"2000-02-29"},"evidence":"Anna was born on 2000-02-29."},{"id":"book","type":"item","item_id":"book","custody_version":1,"actor":"Anna","action":"acquire","evidence":"Anna owns a book."}]';
 bad boolean; result jsonb; notes jsonb:='[{"key":"n1","kind":"action","summary":"Book ownership","quote":"Anna owns a book.","actors":["Anna"]}]'; count_notes integer;
begin
 wid:=public.nw_create_world('Integration test','Synthetic narrative integration test','2026-11-24');
 select active_branch_id into bid from public.nw_worlds where id=wid;
 root:=public.nw_commit_scene(wid,bid,null,request_id,body,'2026-11-24',events,0);
 if public.nw_commit_scene(wid,bid,null,request_id,body,'2026-11-24',events,0) is distinct from root then raise exception 'Receipt replay failed'; end if;
 bad:=false;
 begin
  perform public.nw_commit_scene(wid,bid,root,gen_random_uuid(),'Anna changed jobs.','2026-11-25','[{"id":"bad","type":"character","name":"Anna","state_patch":{"birth_date":"2001-02-29"},"evidence":"Anna changed jobs."}]',0);
 exception when raise_exception then bad:=true; end;
 if not bad then raise exception 'Invalid birth date accepted'; end if;
 if (select head_scene_id from public.nw_branches where id=bid) is distinct from root then raise exception 'Rejected write changed head'; end if;
 second_scene:=public.nw_commit_scene(wid,bid,root,gen_random_uuid(),'Anna planned a new job.','2026-11-25','[{"id":"work","type":"world","dynamics_version":1,"dynamics_kind":"life_transition","record_id":"work","key":"dynamics:life_transition:work","actor":"Anna","title":"Work","transition_kind":"employment","description":"Plan","status":"planned","evidence":"Anna planned a new job."}]',0);
 if (select count(*) from public.nw_active_memory_page(wid,second_scene,20,0))<>2 then raise exception 'Ancestry missing'; end if;
 result:=public.nw_save_memory_notes(wid,root,second_scene,notes);
 if result->>'saved' is distinct from 'true' or result->>'canonical' is distinct from 'false' then raise exception 'Note receipt wrong'; end if;
 perform public.nw_save_memory_notes(wid,root,second_scene,notes);
 select count(*) into count_notes from public.nw_read_memory_notes(wid,second_scene,'Anna',root,20,0);
 if count_notes<>1 then raise exception 'Duplicate or missing note'; end if;
 bad:=false;
 begin
  perform public.nw_save_memory_notes(wid,root,second_scene,'[{"key":"fake","kind":"claim","summary":"Fake","quote":"not in scene","actors":["Anna"]}]');
 exception when raise_exception then bad:=true; end;
 if not bad then raise exception 'Fake quote accepted'; end if;
 perform public.nw_fork_before(wid,second_scene,'Alternative');
 if (select count(*) from public.nw_active_memory_page(wid,root,20,0))<>1 then raise exception 'Old ending leaked into branch'; end if;
 if (select count(*) from public.nw_read_memory_notes(wid,root,'Anna',root,20,0))<>1 then raise exception 'Shared ancestor note lost'; end if;
 perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
 perform set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
 if exists(select 1 from public.nw_worlds where id=wid) then raise exception 'RLS leaks world to another user'; end if;
 bad:=false;
 begin perform public.nw_read_memory_notes(wid,root,null,null,20,0);
 exception when raise_exception then bad:=true; end;
 if not bad then raise exception 'Notes RPC leaks another owner'; end if;
end $verify$;
rollback;
