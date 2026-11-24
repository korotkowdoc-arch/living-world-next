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
 -- Every failing append must leave the pinned head intact.
 for result in select value from jsonb_array_elements('[
 {"id":"x","type":"plan","actor":"Anna","plan_id":"missing","action":"resume","evidence":"Anna planned a new job."},
 {"id":"x","type":"world","dynamics_version":1,"dynamics_kind":"life_transition","record_id":"work","key":"dynamics:life_transition:work","actor":"Boris","title":"Work","transition_kind":"employment","description":"Plan","status":"planned","evidence":"Anna planned a new job."},
 {"id":"x","type":"world","dynamics_version":1,"dynamics_kind":"institution","record_id":"shop","key":"dynamics:institution:shop","name":"Shop","function":"Sales","group_id":"missing","place":"Town","status":"operating","description":"Shop","evidence":"Anna planned a new job."}
 ]'::jsonb) loop
  bad:=false;
  begin perform public.nw_commit_scene(wid,bid,second_scene,gen_random_uuid(),'Anna planned a new job.','2026-11-26',jsonb_build_array(result),0);
  exception when raise_exception then bad:=true; end;
  if not bad then raise exception 'Invalid transition accepted: %',result; end if;
  if (select head_scene_id from public.nw_branches where id=bid) is distinct from second_scene then raise exception 'Rejected transition changed head'; end if;
 end loop;

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
-- Real commit path: a paid date must have a distinct exact money transfer.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $payments$
declare wid uuid; bid uuid; root uuid; paid_head uuid; req uuid:=gen_random_uuid(); bad boolean;
 body text:='Boris transferred 20 coins to Anna for rent.';
 schedule jsonb:='{"id":"schedule","type":"world","dynamics_version":1,"dynamics_kind":"payment_schedule","record_id":"rent","key":"dynamics:payment_schedule:rent","actor":"Boris","counterparty":"Anna","title":"Rent","description":"Rent every two days","status":"active","payment_kind":"rent","amount":20,"currency":"coin","starts_on":"2026-11-01","every_days":2,"evidence":"Rent every two days."}';
 paid jsonb:='{"id":"paid","type":"world","dynamics_version":1,"dynamics_kind":"payment_occurrence","record_id":"rent1","key":"dynamics:payment_occurrence:rent1","actor":"Boris","counterparty":"Anna","title":"Rent","description":"Rent payment","status":"paid","amount":20,"currency":"coin","schedule_id":"rent","scheduled_on":"2026-11-01","transfer_event_id":"t","outcome":"Paid","evidence":"Boris transferred 20 coins to Anna for rent."}';
 transfer jsonb:='{"id":"t","type":"money","operation":"transfer","actor":"Boris","counterparty":"Anna","currency":"coin","delta":-20,"evidence":"Boris transferred 20 coins to Anna for rent."}';
begin
 wid:=public.nw_create_world('Payment test','Synthetic payment schedule','2026-11-01');
 select active_branch_id into bid from public.nw_worlds where id=wid;
 root:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),'Rent every two days. Boris has 50 coins.','2026-11-01',jsonb_build_array(schedule,'{"id":"balance","type":"money","operation":"reconcile","actor":"Boris","currency":"coin","delta":0,"balance":50,"evidence":"Boris has 50 coins."}'::jsonb),0);
 bad:=false; begin perform public.nw_commit_scene(wid,bid,root,gen_random_uuid(),body,'2026-11-01',jsonb_build_array(paid),0); exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Paid date without transfer accepted';end if;
 bad:=false; begin perform public.nw_commit_scene(wid,bid,root,gen_random_uuid(),body,'2026-11-01',jsonb_build_array(transfer||'{"delta":-19}'::jsonb,paid),0); exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Wrong amount accepted';end if;
 paid_head:=public.nw_commit_scene(wid,bid,root,req,body,'2026-11-01',jsonb_build_array(transfer,paid),0);
 if public.nw_commit_scene(wid,bid,root,req,body,'2026-11-01',jsonb_build_array(transfer,paid),0) is distinct from paid_head then raise exception 'Payment retry receipt differs';end if;
 bad:=false; begin perform public.nw_commit_scene(wid,bid,paid_head,gen_random_uuid(),body,'2026-11-03',jsonb_build_array(transfer,paid),0); exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Duplicate date accepted';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,paid_head,gen_random_uuid(),body,'2026-11-03',jsonb_build_array(transfer,paid||'{"record_id":"rent2","key":"dynamics:payment_occurrence:rent2","scheduled_on":"2026-11-03"}'::jsonb,paid||'{"id":"paid2","record_id":"rent3","key":"dynamics:payment_occurrence:rent3","scheduled_on":"2026-11-05"}'::jsonb),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Transfer reused for two dates';end if;
 if (select head_scene_id from public.nw_branches where id=bid) is distinct from paid_head then raise exception 'Rejected payment changed head';end if;
 -- A second valid transfer remains possible, proving rejected attempts did not debit.
 perform public.nw_commit_scene(wid,bid,paid_head,gen_random_uuid(),body,'2026-11-03',jsonb_build_array(transfer,paid||'{"record_id":"rent2","key":"dynamics:payment_occurrence:rent2","scheduled_on":"2026-11-03"}'::jsonb),0);
end $payments$;
-- A staged archive round trip; the original world and source IDs are never reused.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $archive$
declare job uuid:=gen_random_uuid(); old_world uuid:=gen_random_uuid(); old_branch uuid:=gen_random_uuid(); old_scene uuid:=gen_random_uuid();
 b text; s text; manifest jsonb; receipt jsonb; restored uuid; active uuid; new_head uuid; rejected boolean:=false;
begin
 b:=jsonb_build_array(jsonb_build_object('id',old_branch,'world_id',old_world,'name','Main','head_scene_id',old_scene))::text;
 s:=jsonb_build_array(jsonb_build_object('id',old_scene,'world_id',old_world,'branch_id',old_branch,'parent_scene_id',null,'request_id',gen_random_uuid(),'body','A fictional archive source scene.','events','[]'::jsonb,'import_depth',0,'world_time','2026-01-01'))::text;
 manifest:=jsonb_build_object('format','living-world-next-staged-v1','archive_sha256',repeat('a',64),'world',jsonb_build_object('id',old_world,'active_branch_id',old_branch,'title','Archive test','seed','Synthetic archive round trip'),
 'counts',jsonb_build_object('branches',1,'directives',0,'directive_edits',0,'scenes',1,'revisions',0),'total_bytes',octet_length(b)+octet_length(s),
 'chunks',jsonb_build_array(
 jsonb_build_object('index',0,'section','branches','count',1,'bytes',octet_length(b),'sha256',encode(sha256(convert_to(b,'UTF8')),'hex')),
 jsonb_build_object('index',1,'section','scenes','count',1,'bytes',octet_length(s),'sha256',encode(sha256(convert_to(s,'UTF8')),'hex'))));
 perform public.nw_import_begin(job,manifest);
 perform public.nw_import_chunk(job,0,b);
 if (public.nw_import_chunk(job,0,b)->>'reused') is distinct from 'true' then raise exception 'Chunk retry failed'; end if;
 if (public.nw_import_begin(job,manifest)->'uploaded') is distinct from '[0]'::jsonb then raise exception 'Resume missing uploaded chunk'; end if;
 begin perform public.nw_import_finalize(job); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'Incomplete archive finalized'; end if;
 perform public.nw_import_chunk(job,1,s);
 receipt:=public.nw_import_finalize(job);restored:=(receipt->>'world_id')::uuid;
 if restored is null or restored=old_world then raise exception 'Archive reused world ID'; end if;
 if public.nw_import_finalize(job) is distinct from receipt then raise exception 'Finalize retry changed receipt'; end if;
 select active_branch_id into active from public.nw_worlds where id=restored;
 select head_scene_id into new_head from public.nw_branches where id=active;
 if new_head is null or new_head=old_scene or active=old_branch then raise exception 'Archive IDs not remapped'; end if;
 if (select body from public.nw_scenes where id=new_head) is distinct from 'A fictional archive source scene.' then raise exception 'Archive body lost'; end if;
end $archive$;
rollback;
