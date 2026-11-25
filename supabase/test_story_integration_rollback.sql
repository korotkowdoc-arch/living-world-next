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
-- Real append path: enterprise stock and production are atomic and branch-local.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $stock_integration$
declare wid uuid; bid uuid; root uuid; done uuid; rejected boolean;
 body text:='Workshop counted stock and completed an order.';
 grp jsonb:='{"id":"g","type":"world","social_record_version":1,"social_kind":"group","record_id":"shop","key":"social:group:shop","name":"Workshop","purpose":"Furniture","status":"active"}';
 enterprise jsonb:='{"id":"e","type":"world","dynamics_version":1,"dynamics_kind":"enterprise","record_id":"shop","key":"dynamics:enterprise:shop","actor":"Workshop","group_id":"shop","title":"Workshop","place":"Town","business_kind":"Furniture","status":"operating"}';
 count_record jsonb:='{"id":"c","type":"world","dynamics_version":1,"dynamics_kind":"stock_operation","record_id":"count","key":"dynamics:stock_operation:count","actor":"Workshop","status":"recorded","stock_action":"count","stock_lines":[{"product_id":"wood","unit":"piece","quantity":10},{"product_id":"chair","unit":"piece","quantity":0}]}';
 planned jsonb:='{"id":"o","type":"world","dynamics_version":1,"dynamics_kind":"production_order","record_id":"order","key":"dynamics:production_order:order","actor":"Workshop","enterprise_id":"shop","title":"Chairs","status":"planned","stock_lines":[{"product_id":"wood","unit":"piece","quantity":-4},{"product_id":"chair","unit":"piece","quantity":2}]}';
 batch jsonb:='{"id":"b","type":"world","dynamics_version":1,"dynamics_kind":"stock_operation","record_id":"batch","key":"dynamics:stock_operation:batch","actor":"Workshop","status":"recorded","stock_action":"produce","stock_lines":[{"product_id":"wood","unit":"piece","quantity":-4},{"product_id":"chair","unit":"piece","quantity":2}]}';
 common jsonb:=jsonb_build_object('description',body,'evidence',body); closed jsonb;
begin
 wid:=public.nw_create_world('Production test','Synthetic enterprise','2026-11-01');
 select active_branch_id into bid from public.nw_worlds where id=wid;
 root:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'2026-11-01',jsonb_build_array(grp||common,enterprise||common,count_record||common,planned||common),0);
 closed:=planned||common||'{"status":"completed","stock_record_id":"batch","outcome":"Chairs ready"}'::jsonb;
 rejected:=false;begin perform public.nw_commit_scene(wid,bid,root,gen_random_uuid(),body,'2026-11-02',jsonb_build_array(closed),0);exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'Order completed without batch';end if;
 done:=public.nw_commit_scene(wid,bid,root,gen_random_uuid(),body,'2026-11-02',jsonb_build_array(batch||common,closed),0);
 rejected:=false;begin perform public.nw_commit_scene(wid,bid,done,gen_random_uuid(),body,'2026-11-03',jsonb_build_array(batch||common||'{"record_id":"oversize","key":"dynamics:stock_operation:oversize","stock_lines":[{"product_id":"wood","unit":"piece","quantity":-7},{"product_id":"chair","unit":"piece","quantity":3}]}'::jsonb),0);exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'Overdrawn stock accepted';end if;
 if (select head_scene_id from public.nw_branches where id=bid) is distinct from done then raise exception 'Rejected stock change advanced head';end if;
 perform public.nw_commit_scene(wid,bid,done,gen_random_uuid(),body,'2026-11-03',jsonb_build_array(batch||common||'{"record_id":"second","key":"dynamics:stock_operation:second"}'::jsonb),0);
end $stock_integration$;
-- Decisions: do not advance a paused scene without the player's answer.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $decision$
declare wid uuid; bid uuid; root uuid; next_scene uuid; req uuid:=gen_random_uuid(); bad boolean;
 body text:='Anna waited for his answer.';
 q jsonb:='{"id":"q","type":"world","dynamics_version":1,"dynamics_kind":"player_choice","record_id":"q1","key":"dynamics:player_choice:q1","actor":"Boris","description":"Decision","status":"pending","question":"What to say?","options":[{"id":"yes","text":"Agree"},{"id":"no","text":"Decline"}],"evidence":"Anna waited for his answer."}';
 a jsonb:='{"id":"a","type":"world","dynamics_version":1,"dynamics_kind":"player_choice","record_id":"q1","key":"dynamics:player_choice:q1","actor":"Boris","description":"Decision","status":"answered","selected_option":"no","action_text":"Decline","evidence":"Boris declined."}';
begin
 wid:=public.nw_create_world('Decision test','Synthetic decision','2026-11-01');
 select active_branch_id into bid from public.nw_worlds where id=wid;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body||' He left.','2026-11-01',jsonb_build_array(q),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Choice does not end scene';end if;
 root:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'2026-11-01',jsonb_build_array(q),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,root,gen_random_uuid(),'He left without answering.','2026-11-01','[]',0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Pending choice bypassed';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,root,gen_random_uuid(),'Boris declined.','2026-11-01',jsonb_build_array(a||'{"action_text":"Agree"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Altered answer accepted';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,root,gen_random_uuid(),'Boris declined.','2026-11-01',jsonb_build_array(a||'{"type":"character","name":"Boris"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Forged choice event type accepted';end if;
 next_scene:=public.nw_commit_scene(wid,bid,root,req,'Boris declined.','2026-11-01',jsonb_build_array(a),0);
 if public.nw_commit_scene(wid,bid,root,req,'Boris declined.','2026-11-01',jsonb_build_array(a),0) is distinct from next_scene then raise exception 'Answer retry changed receipt';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,next_scene,gen_random_uuid(),'Boris declined.','2026-11-01',jsonb_build_array(a),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Answer repeated';end if;
 perform public.nw_fork_before(wid,next_scene,'Alternative choice');
 select active_branch_id into bid from public.nw_worlds where id=wid;
 perform public.nw_commit_scene(wid,bid,root,gen_random_uuid(),'Boris declined.','2026-11-01',jsonb_build_array(a||'{"selected_option":"custom","action_text":"Decline politely"}'),0);
end $decision$;
-- A staged archive round trip; the original world and source IDs are never reused.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $archive$
declare job uuid:=gen_random_uuid(); old_world uuid:=gen_random_uuid(); old_branch uuid:=gen_random_uuid(); old_scene uuid:=gen_random_uuid();
 b text; s text; d text; edits text; old_rule uuid:=gen_random_uuid(); focus text; manifest jsonb; receipt jsonb; restored uuid; active uuid; new_head uuid; rejected boolean:=false;
begin
 b:=jsonb_build_array(jsonb_build_object('id',old_branch,'world_id',old_world,'name','Main','head_scene_id',old_scene))::text;
 s:=jsonb_build_array(jsonb_build_object('id',old_scene,'world_id',old_world,'branch_id',old_branch,'parent_scene_id',null,'request_id',gen_random_uuid(),'body','A fictional archive source scene.','events','[]'::jsonb,'import_depth',0,'world_time','2026-01-01'))::text;
 focus:='NEXT_MENU_V1:'||jsonb_build_object('kind','focus','branch_id',old_branch,'priorities',jsonb_build_array('Work'))::text;
 d:=jsonb_build_array(jsonb_build_object('id',old_rule,'world_id',old_world,'text',focus,'category','general','active',true))::text;
 edits:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'world_id',old_world,'directive_id',old_rule,'action','edit','before_state',jsonb_build_object('text','Ordinary rule'),'after_state',jsonb_build_object('text',focus)))::text;
 manifest:=jsonb_build_object('format','living-world-next-staged-v1','archive_sha256',repeat('a',64),'world',jsonb_build_object('id',old_world,'active_branch_id',old_branch,'title','Archive test','seed','Synthetic archive round trip'),
 'counts',jsonb_build_object('branches',1,'directives',1,'directive_edits',1,'scenes',1,'revisions',0),'total_bytes',octet_length(b)+octet_length(s)+octet_length(d)+octet_length(edits),
 'chunks',jsonb_build_array(
 jsonb_build_object('index',0,'section','branches','count',1,'bytes',octet_length(b),'sha256',encode(sha256(convert_to(b,'UTF8')),'hex')),
 jsonb_build_object('index',1,'section','scenes','count',1,'bytes',octet_length(s),'sha256',encode(sha256(convert_to(s,'UTF8')),'hex')),
 jsonb_build_object('index',2,'section','directives','count',1,'bytes',octet_length(d),'sha256',encode(sha256(convert_to(d,'UTF8')),'hex')),
 jsonb_build_object('index',3,'section','directive_edits','count',1,'bytes',octet_length(edits),'sha256',encode(sha256(convert_to(edits,'UTF8')),'hex'))));
 perform public.nw_import_begin(job,manifest);
 perform public.nw_import_chunk(job,0,b);
 if (public.nw_import_chunk(job,0,b)->>'reused') is distinct from 'true' then raise exception 'Chunk retry failed'; end if;
 if (public.nw_import_begin(job,manifest)->'uploaded') is distinct from '[0]'::jsonb then raise exception 'Resume missing uploaded chunk'; end if;
 begin perform public.nw_import_finalize(job); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'Incomplete archive finalized'; end if;
 perform public.nw_import_chunk(job,1,s);
 perform public.nw_import_chunk(job,2,d);
 perform public.nw_import_chunk(job,3,edits);
 receipt:=public.nw_import_finalize(job);restored:=(receipt->>'world_id')::uuid;
 if restored is null or restored=old_world then raise exception 'Archive reused world ID'; end if;
 if public.nw_import_finalize(job) is distinct from receipt then raise exception 'Finalize retry changed receipt'; end if;
 select active_branch_id into active from public.nw_worlds where id=restored;
 select head_scene_id into new_head from public.nw_branches where id=active;
 if new_head is null or new_head=old_scene or active=old_branch then raise exception 'Archive IDs not remapped'; end if;
 if (select body from public.nw_scenes where id=new_head) is distinct from 'A fictional archive source scene.' then raise exception 'Archive body lost'; end if;
 if (select (substring(text from 14)::jsonb)->>'branch_id' from public.nw_directives where world_id=restored) is distinct from active::text then raise exception 'Menu focus not remapped';end if;
 if (select (substring(after_state->>'text' from 14)::jsonb)->>'branch_id' from public.nw_directive_edits where world_id=restored) is distinct from active::text then raise exception 'Menu audit not remapped';end if;
 if (select before_state->>'text' from public.nw_directive_edits where world_id=restored) is distinct from 'Ordinary rule' then raise exception 'Ordinary directive changed';end if;
end $archive$;
-- Menu preference edits never consume a saved player choice, move time, or fork.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $menu$
declare wid uuid; bid uuid; h uuid; next_bid uuid; receipt jsonb; did uuid; bad boolean;
 settings jsonb:='{"kind":"settings","settings":{"pace":"fast","detail":"high","agency":"normal","events":"normal","choices":"important","visibility":"immersive","hud":true,"skip_routine":true}}';
 q jsonb:='{"id":"q","type":"world","dynamics_version":1,"dynamics_kind":"player_choice","record_id":"menu-q","key":"dynamics:player_choice:menu-q","actor":"Anna","status":"pending","description":"Decision","question":"Choose?","options":[{"id":"yes","text":"Agree"},{"id":"no","text":"Decline"}],"evidence":"Anna had a choice."}';
begin
 wid:=public.nw_create_world('Menu test','Synthetic menu integration','1994-08-01');
 select active_branch_id into bid from public.nw_worlds where id=wid;
 h:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),'Anna had a choice.','1994-08-01',jsonb_build_array(q),0);
 receipt:=public.nw_save_menu_preferences(wid,bid,h,0,settings);
 did:=(receipt->>'directive_id')::uuid;
 if receipt->>'directive_version' is distinct from '1' or did is null then raise exception 'Menu receipt wrong';end if;
 if public.nw_save_menu_preferences(wid,bid,h,1,settings) is distinct from receipt then raise exception 'Identical preferences incremented version';end if;
 bad:=false;begin perform public.nw_save_menu_preferences(wid,bid,h,0,settings);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Stale menu accepted';end if;
 bad:=false;begin perform public.nw_save_menu_preferences(wid,bid,null,1,settings);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Stale head accepted';end if;
 receipt:=public.nw_save_menu_preferences(wid,bid,h,1,jsonb_set(settings,'{settings,pace}','"slow"'));
 if receipt->>'directive_id' is distinct from did::text or receipt->>'directive_version' is distinct from '2' then raise exception 'Menu edit not in place';end if;
 if (select count(*) from public.nw_directive_edits where world_id=wid and directive_id=did)<>1 then raise exception 'Menu audit missing';end if;
 perform public.nw_save_menu_preferences(wid,bid,h,2,jsonb_build_object('kind','focus','branch_id',bid,'priorities',jsonb_build_array('Work')));
 if (select head_scene_id from public.nw_branches where id=bid) is distinct from h then raise exception 'Menu changed head';end if;
 if (select count(*) from public.nw_scenes where world_id=wid)<>1 then raise exception 'Menu created scene';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),'Anna walked away.','1994-08-01','[]',3);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Menu consumed pending choice';end if;
 perform public.nw_fork_before(wid,h,'Other menu branch');
 select active_branch_id into next_bid from public.nw_worlds where id=wid;
 bad:=false;begin perform public.nw_save_menu_preferences(wid,bid,h,3,settings);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Inactive branch accepted';end if;
 perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
 perform set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
 bad:=false;begin perform public.nw_save_menu_preferences(wid,next_bid,null,3,settings);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Menu owner isolation failed';end if;
end $menu$;
-- Player life state is branch-local and cannot forge ownership or letter delivery.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $life$
declare wid uuid; bid uuid; h uuid; bad boolean; req uuid;
 body text:='Anna recorded an event.';
 garment jsonb:='{"id":"garment","type":"world","player_life_version":1,"life_kind":"garment","record_id":"coat","key":"player-life:garment:coat","item_id":"coat","slot":"outer","style":"casual","description":"A coat","evidence":"Anna recorded an event."}';
 outfit jsonb:='{"id":"outfit","type":"world","player_life_version":1,"life_kind":"outfit","record_id":"anna","key":"player-life:outfit:anna","actor":"Anna","slots":{"outer":"coat"},"evidence":"Anna recorded an event."}';
 item jsonb:='{"id":"item","type":"item","item_id":"coat","custody_version":1,"actor":"Anna","action":"acquire","evidence":"Anna recorded an event."}';
 need jsonb:='{"id":"need","type":"world","player_life_version":1,"life_kind":"need","record_id":"anna-hunger","key":"player-life:need:anna-hunger","actor":"Anna","need":"hunger","status":"urgent","description":"Hungry","evidence":"Anna recorded an event."}';
 letter jsonb:='{"id":"letter","type":"world","player_life_version":1,"life_kind":"letter","record_id":"one","key":"player-life:letter:one","sender":"Anna","recipient":"Boris","subject":"Hello","message":"Private note","channel":"Post","status":"sent","evidence":"Anna recorded an event."}';
begin
 wid:=public.nw_create_world('Life test','Synthetic life integration','1994-08-01');
 select active_branch_id into bid from public.nw_worlds where id=wid;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01',jsonb_build_array(outfit),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Unowned outfit accepted';end if;
 h:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01',jsonb_build_array(item,garment,outfit,need,letter),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01',jsonb_build_array(need||'{"record_id":"other","key":"player-life:need:other"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Duplicate need accepted';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01',jsonb_build_array(letter||'{"status":"read"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Undelivered letter read';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01',jsonb_build_array(letter||'{"status":"delivered","message":"Changed"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Sent letter changed';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01',jsonb_build_array(letter||'{"status":"delivered","sender_notified":true}',item||'{"action":"transfer","counterparty":"Boris"}'),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01',jsonb_build_array(outfit),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Transferred clothing equipped';end if;
 req:=gen_random_uuid();
 perform public.nw_commit_scene(wid,bid,h,req,body,'1994-08-01',jsonb_build_array(letter||'{"status":"read"}'),0);
 if (select count(*) from public.nw_scenes where world_id=wid)<>3 then raise exception 'Rejected life scenes persisted';end if;
end $life$;
-- Calendar, named outfit and impressions must pass the real scene transaction.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $calendar$
declare wid uuid; bid uuid; h uuid; bad boolean;
 body text:='Anna recorded an event.';
 item jsonb:='{"id":"item","type":"item","item_id":"coat","custody_version":1,"actor":"Anna","action":"acquire","evidence":"Anna recorded an event."}';
 garment jsonb:='{"id":"garment","type":"world","player_life_version":1,"life_kind":"garment","record_id":"coat","key":"player-life:garment:coat","item_id":"coat","slot":"outer","style":"formal","description":"A coat","evidence":"Anna recorded an event."}';
 preset jsonb:='{"id":"preset","type":"world","player_life_version":1,"life_kind":"preset","record_id":"formal","key":"player-life:preset:formal","actor":"Anna","title":"Formal","status":"active","slots":{"outer":"coat"},"evidence":"Anna recorded an event."}';
 meet jsonb:='{"id":"meet","type":"world","player_life_version":1,"life_kind":"appointment","record_id":"visit","key":"player-life:appointment:visit","actor":"Anna","participants":["Anna","Boris"],"title":"Visit","place":"Cafe","starts_at":"1994-08-01 12:00","ends_at":"1994-08-01 13:00","status":"confirmed","evidence":"Anna recorded an event."}';
 impression jsonb:='{"id":"impression","type":"world","player_life_version":1,"life_kind":"impression","record_id":"seen","key":"player-life:impression:seen","actor":"Anna","observer":"Boris","description":"Compliment","basis":"Coat","status":"positive","known_to_actor":true,"evidence":"Anna recorded an event."}';
begin
 wid:=public.nw_create_world('Calendar test','Synthetic calendar','1994-08-01');
 select active_branch_id into bid from public.nw_worlds where id=wid;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01 08:00',jsonb_build_array(preset),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Unowned preset accepted';end if;
 h:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01 08:00',jsonb_build_array(item,garment,preset,meet,impression),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 08:00',jsonb_build_array(meet||'{"status":"completed","place":"Elsewhere"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Meeting rewritten while closing';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 08:00',jsonb_build_array(meet||'{"starts_at":"1994-02-30 12:00"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Invalid meeting date accepted';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 08:00',jsonb_build_array(impression||'{"known_to_actor":false}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Witnessed impression erased';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 13:00',jsonb_build_array(meet||'{"status":"completed"}',item||'{"action":"transfer","counterparty":"Boris"}'),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 13:00',jsonb_build_array(preset),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Unavailable garment preset accepted';end if;
 perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 13:00',jsonb_build_array(preset||'{"status":"removed"}'),0);
 if (select count(*) from public.nw_scenes where world_id=wid)<>3 then raise exception 'Invalid calendar scene persisted';end if;
end $calendar$;
-- Travel and venue services must preserve location, custody and settlement history.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $travel$
declare wid uuid; bid uuid; h uuid; bad boolean;
 body text:='Anna recorded an event.';
 journey jsonb:='{"id":"trip","type":"world","player_life_version":1,"life_kind":"journey","record_id":"trip","key":"player-life:journey:trip","actor":"Anna","title":"Trip","status":"planned","reached":0,"stops":[{"place":"Home","mode":"walk"},{"place":"Station","mode":"walk"},{"place":"Cafe","mode":"rail"}],"evidence":"Anna recorded an event."}';
 loc jsonb:='{"id":"location","type":"character","name":"Anna","state_patch":{"location":"Home"},"evidence":"Anna recorded an event."}';
 service jsonb:='{"id":"service","type":"world","player_life_version":1,"life_kind":"venue_service","record_id":"meal","key":"player-life:venue_service:meal","actor":"Cafe","place":"Cafe","title":"Meal","category":"food","amount":10,"currency":"GBP","duration_minutes":30,"status":"available","evidence":"Anna recorded an event."}';
 discovery jsonb:='{"id":"discovery","type":"world","player_life_version":1,"life_kind":"discovery","record_id":"anna-meal","key":"player-life:discovery:anna-meal","actor":"Anna","provider":"Cafe","service_id":"meal","place":"Cafe","title":"Meal","category":"food","amount":10,"currency":"GBP","duration_minutes":30,"status":"available","evidence":"Anna recorded an event."}';
 visit jsonb:='{"id":"visit","type":"world","player_life_version":1,"life_kind":"service_visit","record_id":"lunch","key":"player-life:service_visit:lunch","actor":"Anna","provider":"Cafe","service_id":"meal","place":"Cafe","title":"Meal","amount":10,"currency":"GBP","status":"accepted","evidence":"Anna recorded an event."}';
 cash jsonb:='{"id":"cash","type":"money","actor":"Anna","currency":"GBP","operation":"reconcile","delta":0,"balance":20,"evidence":"Anna recorded an event."}';
 pay jsonb:='{"id":"pay","type":"money","actor":"Anna","counterparty":"Cafe","currency":"GBP","operation":"transfer","delta":-10,"evidence":"Anna recorded an event."}';
 done jsonb;
begin
 wid:=public.nw_create_world('Travel test','Synthetic travel and service','1994-08-01');
 select active_branch_id into bid from public.nw_worlds where id=wid;
 h:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(journey,cash),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(journey||'{"status":"travelling"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Departure without location accepted';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(loc,journey||'{"status":"travelling"}'),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:30',jsonb_build_array(jsonb_set(loc,'{state_patch,location}','"Cafe"'),journey||'{"status":"arrived","reached":2}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Journey skipped a stop';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:30',jsonb_build_array(jsonb_set(loc,'{state_patch,location}','"Station"'),journey||'{"status":"travelling","reached":1}'),0);
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:00',jsonb_build_array(jsonb_set(loc,'{state_patch,location}','"Cafe"'),journey||'{"status":"arrived","reached":2}',service,discovery,visit),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:00',jsonb_build_array(discovery||'{"amount":9}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Forged discovery accepted';end if;
 done:=visit||'{"status":"completed","transfer_event_id":"pay","outcome":"Meal served"}';
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:30',jsonb_build_array(done),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Unpaid service accepted';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:30',jsonb_build_array(done,pay),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Service payment order ignored';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:30',jsonb_build_array(pay||'{"delta":-9}',done),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Wrong service price accepted';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:30',jsonb_build_array(pay,done,done||'{"id":"second","record_id":"second","key":"player-life:service_visit:second"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Reused service payment accepted';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:30',jsonb_build_array(pay,done),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:30',jsonb_build_array(pay,done),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Service completed twice';end if;
 if (select count(*) from public.nw_scenes where world_id=wid)<>5 then raise exception 'Rejected scene persisted';end if;
end $travel$;
-- Work and stock-backed service transactions.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $work$
declare wid uuid; bid uuid; h uuid; bad boolean; body text:='Anna recorded an event.';
 common jsonb:='{"type":"world","player_life_version":1,"evidence":"Anna recorded an event."}';
 job jsonb:='{"id":"job","type":"world","dynamics_version":1,"dynamics_kind":"employment","record_id":"job","key":"dynamics:employment:job","actor":"Anna","counterparty":"Cafe","title":"Work","place":"Cafe","status":"active","amount":12,"currency":"GBP","pay_period":"hour","description":"Job","evidence":"Anna recorded an event."}';
 shift jsonb:='{"id":"shift","life_kind":"work_shift","record_id":"shift","key":"player-life:work_shift:shift","actor":"Anna","employer":"Cafe","employment_id":"job","title":"Shift","place":"Cafe","starts_at":"1994-08-01 10:00","ends_at":"1994-08-01 14:00","pay_period":"hour","rate":12,"currency":"GBP","status":"scheduled"}';
 wage jsonb:='{"id":"wage","life_kind":"wage","record_id":"wage","key":"player-life:wage:wage","actor":"Anna","employer":"Cafe","shift_id":"shift","status":"paid","amount":42,"currency":"GBP","transfer_event_id":"salary"}';
 salary jsonb:='{"id":"salary","type":"money","actor":"Cafe","counterparty":"Anna","currency":"GBP","operation":"transfer","delta":-42,"evidence":"Anna recorded an event."}';
 cash jsonb:='{"id":"cash","type":"money","actor":"Cafe","currency":"GBP","operation":"reconcile","balance":100,"delta":0,"evidence":"Anna recorded an event."}';
 service jsonb:='{"id":"service","life_kind":"venue_service","record_id":"meal","key":"player-life:venue_service:meal","actor":"Cafe","place":"Cafe","title":"Meal","category":"food","amount":10,"currency":"GBP","duration_minutes":30,"status":"available"}';
 recipe jsonb:='{"id":"recipe","life_kind":"service_recipe","record_id":"recipe","key":"player-life:service_recipe:recipe","actor":"Cafe","service_id":"meal","status":"active","stock_lines":[{"product_id":"bread","unit":"piece","quantity":-2}]}';
 visit jsonb:='{"id":"visit","life_kind":"service_visit","record_id":"lunch","key":"player-life:service_visit:lunch","actor":"Anna","service_id":"meal","provider":"Cafe","place":"Cafe","title":"Meal","amount":10,"currency":"GBP","status":"accepted","recipe_id":"recipe"}';
 stock jsonb:='{"id":"count","type":"world","dynamics_version":1,"dynamics_kind":"stock_operation","record_id":"count","key":"dynamics:stock_operation:count","actor":"Cafe","status":"recorded","stock_action":"count","stock_lines":[{"product_id":"bread","unit":"piece","quantity":3}],"description":"Count","evidence":"Anna recorded an event."}';
 consume jsonb:='{"id":"consume","type":"world","dynamics_version":1,"dynamics_kind":"stock_operation","record_id":"consume","key":"dynamics:stock_operation:consume","actor":"Cafe","status":"recorded","stock_action":"consume","stock_lines":[{"product_id":"bread","unit":"piece","quantity":-2}],"description":"Consumed","evidence":"Anna recorded an event."}';
 pay jsonb:='{"id":"pay","type":"money","actor":"Anna","counterparty":"Cafe","currency":"GBP","operation":"transfer","delta":-10,"evidence":"Anna recorded an event."}';
 done jsonb; worked jsonb;
begin
 wid:=public.nw_create_world('Work test','Synthetic work','1994-08-01');
 select active_branch_id into bid from public.nw_worlds where id=wid;
 shift:=shift||common;wage:=wage||common;service:=service||common;recipe:=recipe||common;visit:=visit||common;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(shift),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Shift without employment accepted';end if;
 h:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(job,cash,shift,service,recipe,stock),0);
 worked:=shift||'{"status":"worked","worked_minutes":210,"outcome":"Worked"}';
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:00',jsonb_build_array(worked),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Unstarted shift completed';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:00',jsonb_build_array(shift||'{"status":"working"}'),0);
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 14:00',jsonb_build_array(worked),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 14:00',jsonb_build_array(wage,salary),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Wage before transfer accepted';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 14:00',jsonb_build_array(salary||'{"delta":-43}',wage||'{"amount":43}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Incorrect wage accepted';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 14:00',jsonb_build_array(salary,wage),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 14:00',jsonb_build_array(salary,wage),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Duplicate wage accepted';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 14:00',jsonb_build_array(visit-'recipe_id'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Recipe bypass accepted';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 14:00',jsonb_build_array(visit),0);
 done:=visit||'{"status":"completed","outcome":"Meal served","transfer_event_id":"pay","stock_event_id":"consume"}';
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 14:30',jsonb_build_array(pay,done),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Service without stock accepted';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 14:30',jsonb_build_array(pay,consume||'{"stock_lines":[{"product_id":"bread","unit":"piece","quantity":-1}]}',done),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Wrong stock recipe accepted';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 14:30',jsonb_build_array(pay,consume,done),0);
 if (select count(*) from public.nw_scenes where world_id=wid)<>6 then raise exception 'Rejected scene persisted';end if;
end $work$;
-- Housing, capacity and education are checked under the same commit lock.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $home$
declare wid uuid; bid uuid; h uuid; bad boolean; body text:='Anna recorded an event.';
 common jsonb:='{"type":"world","player_life_version":1,"evidence":"Anna recorded an event."}';
 agreement jsonb:='{"id":"rent","type":"world","dynamics_version":1,"dynamics_kind":"economic_agreement","record_id":"rent","key":"dynamics:economic_agreement:rent","actor":"Anna","counterparty":"Owner","title":"Rent","place":"Flat","agreement_kind":"rent","status":"active","amount":50,"currency":"GBP","description":"Rent","evidence":"Anna recorded an event."}';
 schedule jsonb:='{"id":"schedule","type":"world","dynamics_version":1,"dynamics_kind":"payment_schedule","record_id":"rent","key":"dynamics:payment_schedule:rent","actor":"Anna","counterparty":"Owner","title":"Rent","payment_kind":"rent","status":"active","amount":50,"currency":"GBP","starts_on":"1994-08-01","every_days":30,"description":"Rent","evidence":"Anna recorded an event."}';
 lease jsonb:='{"id":"lease","life_kind":"lease","record_id":"flat","key":"player-life:lease:flat","actor":"Anna","landlord":"Owner","place":"Flat","title":"Flat","agreement_id":"rent","schedule_id":"rent","status":"active"}';
 budget jsonb:='{"id":"budget","life_kind":"budget","record_id":"budget","key":"player-life:budget:budget","actor":"Anna","title":"Budget","currency":"GBP","monthly_limit":60,"savings_target":100,"status":"active"}';
 service jsonb:='{"id":"service","life_kind":"venue_service","record_id":"room","key":"player-life:venue_service:room","actor":"Hotel","place":"Hotel","title":"Room","category":"lodging","amount":0,"currency":"GBP","duration_minutes":1440,"status":"available"}';
 slot jsonb:='{"id":"slot","life_kind":"capacity_slot","record_id":"night","key":"player-life:capacity_slot:night","actor":"Hotel","service_id":"room","resource":"Room","starts_at":"1994-08-01 15:00","ends_at":"1994-08-02 11:00","capacity":1,"status":"open"}';
 visit jsonb:='{"id":"visit","life_kind":"service_visit","record_id":"a","key":"player-life:service_visit:a","actor":"Anna","provider":"Hotel","service_id":"room","place":"Hotel","title":"Room","amount":0,"currency":"GBP","status":"accepted"}';
 booking jsonb:='{"id":"booking","life_kind":"reservation","record_id":"a","key":"player-life:reservation:a","actor":"Anna","slot_id":"night","visit_id":"a","units":1,"status":"reserved"}';
 grp jsonb:='{"id":"group","type":"world","social_record_version":1,"social_kind":"group","record_id":"school","key":"social:group:school","name":"School","purpose":"Education","status":"active","evidence":"Anna recorded an event."}';
 institution jsonb:='{"id":"institution","type":"world","dynamics_version":1,"dynamics_kind":"institution","record_id":"school","key":"dynamics:institution:school","name":"School","group_id":"school","function":"Education","place":"School","status":"operating","description":"School","evidence":"Anna recorded an event."}';
 enrollment jsonb:='{"id":"enrollment","life_kind":"enrollment","record_id":"course","key":"player-life:enrollment:course","actor":"Anna","institution_id":"school","title":"Magic","place":"School","status":"enrolled"}';
 exam jsonb:='{"id":"exam","life_kind":"assessment","record_id":"exam","key":"player-life:assessment:exam","actor":"Anna","enrollment_id":"course","title":"Exam","starts_at":"1994-08-02 10:00","ends_at":"1994-08-02 11:00","status":"scheduled"}';
 skill jsonb:='{"id":"skill","type":"world","growth_version":1,"growth_kind":"skill","record_id":"spell","key":"growth:skill:spell","actor":"Anna","name":"Spells","status":"learning","description":"Learning","evidence":"Anna recorded an event."}';
 practice jsonb:='{"id":"practice","life_kind":"practice_record","record_id":"practice","key":"player-life:practice_record:practice","actor":"Anna","skill_id":"spell","origin_kind":"assessment","origin_id":"exam","description":"Practised","status":"recorded"}';
 other_visit jsonb; other_booking jsonb;
begin
 wid:=public.nw_create_world('Home test','Synthetic life','1994-08-01');select active_branch_id into bid from public.nw_worlds where id=wid;
 lease:=lease||common;budget:=budget||common;service:=service||common;slot:=slot||common;visit:=visit||common;booking:=booking||common;enrollment:=enrollment||common;exam:=exam||common;practice:=practice||common;
 other_visit:=visit||'{"id":"visit-b","record_id":"b","key":"player-life:service_visit:b","actor":"Boris"}';
 other_booking:=booking||'{"id":"booking-b","record_id":"b","key":"player-life:reservation:b","actor":"Boris","visit_id":"b"}';
 bad:=false;begin perform public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(lease),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Lease without rent terms accepted';end if;
 h:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(agreement,schedule,lease,budget,service,slot,visit,other_visit,booking,grp,institution,enrollment,exam,skill),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(other_booking),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Capacity exceeded';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(booking||'{"status":"cancelled"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Released capacity before visit cancelled';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(practice),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Practice before examination accepted';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(lease||'{"status":"ended"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Lease closed without contract closure';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(visit||'{"status":"cancelled"}',booking||'{"status":"cancelled"}',other_booking),0);
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-02 11:00',jsonb_build_array(exam||'{"status":"passed","outcome":"Passed"}',practice),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-02 11:00',jsonb_build_array(practice||'{"record_id":"dup","key":"player-life:practice_record:dup"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Duplicated practice accepted';end if;
 if (select count(*) from public.nw_scenes where world_id=wid)<>3 then raise exception 'Rejected scene persisted';end if;
end $home$;
-- Invitations require explicit response and matching appointment; health is observed.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $social_life$
declare wid uuid; bid uuid; h uuid; bad boolean; body text:='Anna recorded an event.';
 common jsonb:='{"type":"world","player_life_version":1,"evidence":"Anna recorded an event."}';
 invite jsonb:='{"id":"invite","life_kind":"invitation","record_id":"tea","key":"player-life:invitation:tea","actor":"Anna","recipient":"Boris","title":"Tea","place":"Cafe","invite_kind":"meeting","starts_at":"1994-08-01 14:00","ends_at":"1994-08-01 15:00","status":"sent"}';
 meeting jsonb:='{"id":"appointment","life_kind":"appointment","record_id":"tea","key":"player-life:appointment:tea","actor":"Anna","participants":["Anna","Boris"],"title":"Tea","place":"Cafe","starts_at":"1994-08-01 14:00","ends_at":"1994-08-01 15:00","status":"confirmed"}';
 health jsonb:='{"id":"health","life_kind":"health_episode","record_id":"cold","key":"player-life:health_episode:cold","actor":"Anna","title":"Cold","health_kind":"illness","severity":"moderate","status":"observed","description":"Observed symptoms"}';
 accepted jsonb;
begin
 wid:=public.nw_create_world('Social test','Synthetic social life','1994-08-01');select active_branch_id into bid from public.nw_worlds where id=wid;
 invite:=invite||common;meeting:=meeting||common;health:=health||common;accepted:=invite||'{"status":"accepted","appointment_id":"tea","outcome":"Boris agreed"}';
 bad:=false;begin perform public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(health||'{"status":"resolved"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Unobserved illness resolved';end if;
 h:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(invite,health),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(accepted),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Invitation accepted without matching meeting';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(meeting,accepted||'{"place":"Elsewhere"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Invitation terms rewritten';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:00',jsonb_build_array(meeting,accepted),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 15:00',jsonb_build_array(accepted||'{"status":"completed","outcome":"Met"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Invitation completed before meeting';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 15:00',jsonb_build_array(meeting||'{"status":"completed"}',accepted||'{"status":"completed","outcome":"Met"}',health||'{"status":"recovering","description":"Recovering"}'),0);
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-02 09:00',jsonb_build_array(health||'{"status":"resolved","description":"Recovered"}'),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-02 09:00',jsonb_build_array(health),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Closed health episode reopened';end if;
 if (select count(*) from public.nw_scenes where world_id=wid)<>4 then raise exception 'Rejected scene persisted';end if;
end $social_life$;
rollback;
