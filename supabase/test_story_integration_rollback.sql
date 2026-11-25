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
-- Title transfer, ticket terms and classroom progression.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $property$
declare wid uuid; bid uuid; h uuid; bad boolean; body text:='Anna recorded an event.';
 common jsonb:='{"type":"world","player_life_version":1,"evidence":"Anna recorded an event."}';
 estate jsonb:='{"id":"estate","life_kind":"estate","record_id":"home","key":"player-life:estate:home","actor":"Owner","title":"Home","place":"London","estate_kind":"house","status":"owned"}';
 offer jsonb:='{"id":"offer","life_kind":"estate_sale","record_id":"sale","key":"player-life:estate_sale:sale","actor":"Owner","buyer":"Anna","estate_id":"home","amount":100,"currency":"GBP","status":"offered"}';
 cash jsonb:='{"id":"cash","type":"money","actor":"Anna","currency":"GBP","operation":"reconcile","delta":0,"balance":120,"evidence":"Anna recorded an event."}';
 pay jsonb:='{"id":"pay","type":"money","actor":"Anna","counterparty":"Owner","currency":"GBP","operation":"transfer","delta":-100,"evidence":"Anna recorded an event."}';
 service jsonb:='{"id":"service","life_kind":"venue_service","record_id":"train","key":"player-life:venue_service:train","actor":"Rail","title":"Ticket","place":"Station","category":"transport","amount":0,"currency":"GBP","duration_minutes":60,"status":"available"}';
 notice jsonb:='{"id":"notice","life_kind":"transit_notice","record_id":"train","key":"player-life:transit_notice:train","actor":"Anna","provider":"Rail","title":"Train","from":"Station","to":"London","mode":"rail","departs_at":"1994-08-01 10:00","arrives_at":"1994-08-01 11:00","amount":0,"currency":"GBP","status":"scheduled"}';
 slot jsonb:='{"id":"slot","life_kind":"capacity_slot","record_id":"seat","key":"player-life:capacity_slot:seat","actor":"Rail","service_id":"train","resource":"Seat","starts_at":"1994-08-01 10:00","ends_at":"1994-08-01 11:00","capacity":1,"status":"open"}';
 visit jsonb:='{"id":"visit","life_kind":"service_visit","record_id":"train","key":"player-life:service_visit:train","actor":"Anna","provider":"Rail","service_id":"train","title":"Ticket","place":"Station","amount":0,"currency":"GBP","status":"accepted"}';
 reservation jsonb:='{"id":"reservation","life_kind":"reservation","record_id":"seat","key":"player-life:reservation:seat","actor":"Anna","slot_id":"seat","visit_id":"train","units":1,"status":"reserved"}';
 ticket jsonb:='{"id":"ticket","life_kind":"transport_ticket","record_id":"ticket","key":"player-life:transport_ticket:ticket","actor":"Anna","notice_id":"train","reservation_id":"seat","visit_id":"train","title":"Train","from":"Station","to":"London","departs_at":"1994-08-01 10:00","arrives_at":"1994-08-01 11:00","status":"reserved"}';
 grp jsonb:='{"id":"group","type":"world","social_record_version":1,"social_kind":"group","record_id":"school","key":"social:group:school","name":"School","purpose":"Education","status":"active","evidence":"Anna recorded an event."}';
 institution jsonb:='{"id":"institution","type":"world","dynamics_version":1,"dynamics_kind":"institution","record_id":"school","key":"dynamics:institution:school","name":"School","group_id":"school","function":"Education","place":"School","status":"operating","description":"School","evidence":"Anna recorded an event."}';
 enrollment jsonb:='{"id":"enrollment","life_kind":"enrollment","record_id":"course","key":"player-life:enrollment:course","actor":"Anna","institution_id":"school","title":"Magic","place":"School","status":"enrolled"}';
 lesson jsonb:='{"id":"lesson","life_kind":"lesson","record_id":"class","key":"player-life:lesson:class","actor":"Anna","enrollment_id":"course","teacher":"Teacher","title":"Class","place":"School","starts_at":"1994-08-02 10:00","ends_at":"1994-08-02 11:00","status":"scheduled"}';
 assignment jsonb:='{"id":"assignment","life_kind":"assignment","record_id":"homework","key":"player-life:assignment:homework","actor":"Anna","lesson_id":"class","title":"Homework","due_at":"1994-08-03","status":"assigned"}';
 settled jsonb;
begin
 wid:=public.nw_create_world('Property test','Synthetic title','1994-08-01');select active_branch_id into bid from public.nw_worlds where id=wid;
 estate:=estate||common;offer:=offer||common;service:=service||common;notice:=notice||common;slot:=slot||common;visit:=visit||common;reservation:=reservation||common;ticket:=ticket||common;enrollment:=enrollment||common;lesson:=lesson||common;assignment:=assignment||common;
 settled:=offer||'{"status":"settled","transfer_event_id":"pay","outcome":"Title transferred"}';
 h:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(estate,offer,cash,service,notice,slot,visit,reservation,grp,institution,enrollment,lesson),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(estate||'{"actor":"Anna"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Title rewritten directly';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(offer||'{"status":"accepted"}',ticket),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(settled),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Unpaid title transfer';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(pay||'{"delta":-99}',settled),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Wrong title payment';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(ticket||'{"status":"used"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Ticket used before travel';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(pay,settled,notice||'{"departs_at":"1994-08-01 12:00","arrives_at":"1994-08-01 13:00"}'),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(offer||'{"id":"again","record_id":"again","key":"player-life:estate_sale:again"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Former owner could sell estate';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 11:00',jsonb_build_array(visit||'{"status":"completed","outcome":"Arrived"}',reservation||'{"status":"used"}',ticket||'{"status":"used"}'),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-02 09:00',jsonb_build_array(assignment),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Assignment before lesson';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-02 11:00',jsonb_build_array(lesson||'{"status":"attended","outcome":"Attended"}',assignment),0);
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-03 09:00',jsonb_build_array(assignment||'{"status":"submitted","submission":"Work"}'),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-03 10:00',jsonb_build_array(assignment||'{"status":"graded","submission":"Other","grade":"A","outcome":"Grade"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Changed graded submission';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-03 10:00',jsonb_build_array(assignment||'{"status":"graded","submission":"Work","grade":"A","outcome":"Grade"}'),0);
 if (select count(*) from public.nw_scenes where world_id=wid)<>7 then raise exception 'Rejected scene persisted';end if;
end $property$;
-- Market, furnishing and branch-safe server checkpoints.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $market$
declare wid uuid; bid uuid; h uuid; root uuid; adjusted uuid; bad boolean; body text:='Anna recorded an event.';
 common jsonb:='{"type":"world","player_life_version":1,"evidence":"Anna recorded an event."}';
 estate jsonb:='{"id":"estate","life_kind":"estate","record_id":"home","key":"player-life:estate:home","actor":"Anna","title":"Home","place":"London","estate_kind":"house","status":"owned"}';
 item jsonb:='{"id":"chair","type":"item","item_id":"chair","name":"Chair","custody_version":1,"actor":"Anna","action":"acquire","evidence":"Anna recorded an event."}';
 furniture jsonb:='{"id":"furniture","life_kind":"furnishing","record_id":"chair","key":"player-life:furnishing:chair","actor":"Anna","item_id":"chair","home_kind":"estate","home_id":"home","area":"Living room","description":"Chair","status":"placed"}';
 service jsonb:='{"id":"service","life_kind":"venue_service","record_id":"meal","key":"player-life:venue_service:meal","actor":"Cafe","title":"Meal","place":"Cafe","category":"food","amount":5,"currency":"GBP","duration_minutes":30,"status":"available"}';
 discovery jsonb:='{"id":"quote","life_kind":"discovery","record_id":"quote","key":"player-life:discovery:quote","actor":"Anna","service_id":"meal","provider":"Cafe","title":"Meal","place":"Cafe","category":"food","amount":5,"currency":"GBP","duration_minutes":30,"status":"available"}';
 adjustment jsonb:='{"id":"adjust","life_kind":"market_adjustment","record_id":"increase","key":"player-life:market_adjustment:increase","actor":"Cafe","service_id":"meal","previous_amount":5,"amount":7,"currency":"GBP","cause":"cost","description":"Costs rose","status":"recorded"}';
 observation jsonb:='{"id":"observed","life_kind":"market_observation","record_id":"observed","key":"player-life:market_observation:observed","actor":"Anna","service_id":"meal","discovery_id":"quote","provider":"Cafe","title":"Meal","place":"Cafe","amount":5,"currency":"GBP","supply":"unknown","demand":"high","description":"Saw price","status":"recorded"}';
 visit jsonb:='{"id":"visit","life_kind":"service_visit","record_id":"meal","key":"player-life:service_visit:meal","actor":"Anna","provider":"Cafe","service_id":"meal","title":"Meal","place":"Cafe","amount":5,"currency":"GBP","status":"accepted"}';
begin
 wid:=public.nw_create_world('Market checkpoint test','Synthetic market','1994-08-01');select active_branch_id into bid from public.nw_worlds where id=wid;
 estate:=estate||common;furniture:=furniture||common;service:=service||common;discovery:=discovery||common;adjustment:=adjustment||common;observation:=observation||common;visit:=visit||common;
 root:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(estate,item,service,discovery,visit),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,root,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(adjustment||'{"previous_amount":4}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Incorrect prior price accepted';end if;
 adjusted:=public.nw_commit_scene(wid,bid,root,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(adjustment,furniture,observation),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,adjusted,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(visit||'{"id":"new","record_id":"new","key":"player-life:service_visit:new"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Stale quote used for new service';end if;
 h:=public.nw_commit_scene(wid,bid,adjusted,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(item||'{"action":"drop"}'),0);
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(item||'{"action":"recover"}'),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(furniture||'{"status":"removed"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Recovery resurrected old placement';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(furniture),0);
 for i in 1..128 loop
  h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00','[]'::jsonb,0);
 end loop;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(discovery||'{"amount":7}'),0);
 perform public.nw_fork_before(wid,adjusted,'Before market');
 select active_branch_id into bid from public.nw_worlds where id=wid;
 select head_scene_id into h from public.nw_branches where id=bid;
 if h is distinct from root then raise exception 'Fork did not pin root';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(adjustment||'{"amount":6}'),0);
 perform set_config('nw.test_checkpoint_world',wid::text,true);
end $market$;
reset role;
do $checkpoint_verify$
declare wid uuid:=current_setting('nw.test_checkpoint_world')::uuid;
begin
 if has_table_privilege('authenticated','public.nw_life_checkpoints','SELECT') or has_table_privilege('authenticated','public.nw_life_checkpoints','INSERT') or has_function_privilege('authenticated','public.nw_life_checkpoint_signature()','EXECUTE') then raise exception 'Checkpoint state exposed';end if;
 if (select count(*) from public.nw_life_checkpoints where world_id=wid)<>2 then raise exception 'Expected root and extended checkpoints';end if;
 if (select max(scene_count) from public.nw_life_checkpoints where world_id=wid)<>133 then raise exception 'Incorrect checkpoint ancestry count';end if;
 if exists(select 1 from public.nw_life_checkpoints where world_id=wid and engine_signature<>public.nw_life_checkpoint_signature()) then raise exception 'Incompatible checkpoint written';end if;
end $checkpoint_verify$;
-- Prepayment is applied to the exact ticket and can be fully refunded once.
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $prepaid$
declare wid uuid; bid uuid; h uuid; paid_head uuid; used_head uuid; bad boolean; body text:='Anna recorded an event.';
 common jsonb:='{"type":"world","player_life_version":1,"evidence":"Anna recorded an event."}';
 cash jsonb:='{"id":"cash","type":"money","actor":"Anna","currency":"GBP","operation":"reconcile","balance":100,"delta":0,"evidence":"Anna recorded an event."}';
 service jsonb:='{"id":"service","life_kind":"venue_service","record_id":"train","key":"player-life:venue_service:train","actor":"Rail","title":"Train","place":"Station","category":"transport","amount":10,"currency":"GBP","duration_minutes":60,"status":"available"}';
 notice jsonb:='{"id":"notice","life_kind":"transit_notice","record_id":"train","key":"player-life:transit_notice:train","actor":"Anna","provider":"Rail","title":"Train","from":"Station","to":"London","mode":"rail","departs_at":"1994-08-01 10:00","arrives_at":"1994-08-01 11:00","amount":10,"currency":"GBP","status":"scheduled"}';
 slot jsonb:='{"id":"slot","life_kind":"capacity_slot","record_id":"seat","key":"player-life:capacity_slot:seat","actor":"Rail","service_id":"train","resource":"Seat","starts_at":"1994-08-01 10:00","ends_at":"1994-08-01 11:00","capacity":1,"status":"open"}';
 visit jsonb:='{"id":"visit","life_kind":"service_visit","record_id":"train","key":"player-life:service_visit:train","actor":"Anna","provider":"Rail","service_id":"train","title":"Train","place":"Station","amount":10,"currency":"GBP","status":"accepted"}';
 reservation jsonb:='{"id":"reservation","life_kind":"reservation","record_id":"seat","key":"player-life:reservation:seat","actor":"Anna","slot_id":"seat","visit_id":"train","units":1,"status":"reserved"}';
 ticket jsonb:='{"id":"ticket","life_kind":"transport_ticket","record_id":"ticket","key":"player-life:transport_ticket:ticket","actor":"Anna","notice_id":"train","reservation_id":"seat","visit_id":"train","title":"Train","from":"Station","to":"London","departs_at":"1994-08-01 10:00","arrives_at":"1994-08-01 11:00","status":"reserved"}';
 receipt jsonb:='{"id":"receipt","life_kind":"ticket_payment","record_id":"paid","key":"player-life:ticket_payment:paid","actor":"Anna","provider":"Rail","ticket_id":"ticket","reservation_id":"seat","visit_id":"train","amount":10,"currency":"GBP","transfer_event_id":"payment","status":"paid"}';
 payment jsonb:='{"id":"payment","type":"money","actor":"Anna","counterparty":"Rail","currency":"GBP","operation":"transfer","delta":-10,"evidence":"Anna recorded an event."}';
 refund jsonb:='{"id":"refund","type":"money","actor":"Rail","counterparty":"Anna","currency":"GBP","operation":"transfer","delta":-10,"evidence":"Anna recorded an event."}';
 done jsonb; refunded jsonb;
begin
 wid:=public.nw_create_world('Prepaid ticket test','Synthetic transport','1994-08-01');select active_branch_id into bid from public.nw_worlds where id=wid;
 service:=service||common;notice:=notice||common;slot:=slot||common;visit:=visit||common;reservation:=reservation||common;ticket:=ticket||common;receipt:=receipt||common;
 done:=visit||'{"status":"completed","outcome":"Arrived","prepayment_id":"paid"}';
 refunded:=receipt||'{"status":"refunded","transfer_event_id":"refund"}';
 h:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(cash,service,notice,slot,visit,reservation,ticket),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(receipt,payment),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Receipt without preceding transfer';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(done),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Unpaid ticket completed';end if;
 paid_head:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(payment,receipt),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,paid_head,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(payment,receipt||'{"id":"dup","record_id":"dup","key":"player-life:ticket_payment:dup"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Duplicate ticket payment';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,paid_head,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(payment,visit||'{"status":"completed","outcome":"Arrived","transfer_event_id":"payment"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Second charge accepted';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,paid_head,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(visit||'{"status":"cancelled"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Paid ticket cancelled without refund';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,paid_head,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(refund,refunded),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Refund without cancellation';end if;
 used_head:=public.nw_commit_scene(wid,bid,paid_head,gen_random_uuid(),body,'1994-08-01 11:00',jsonb_build_array(done,reservation||'{"status":"used"}',ticket||'{"status":"used"}'),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,used_head,gen_random_uuid(),body,'1994-08-01 11:00',jsonb_build_array(refund,refunded,visit||'{"status":"cancelled"}',reservation||'{"status":"cancelled"}',ticket||'{"status":"cancelled"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Used ticket refunded';end if;
 perform public.nw_fork_before(wid,used_head,'Refund alternative');select active_branch_id into bid from public.nw_worlds where id=wid;select head_scene_id into h from public.nw_branches where id=bid;
 if h is distinct from paid_head then raise exception 'Refund branch not pinned';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(refund,refunded,visit||'{"status":"cancelled"}',reservation||'{"status":"cancelled"}',ticket||'{"status":"cancelled"}'),0);
 if (select count(*) from public.nw_scenes where world_id=wid)<>4 then raise exception 'Rejected prepaid scene persisted';end if;
end $prepaid$;
-- Programs require passed modules; commercial contracts require atomic stock and payment.
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $curriculum$
declare wid uuid; bid uuid; h uuid; bad boolean; body text:='Anna recorded an event.';
 common jsonb:='{"type":"world","player_life_version":1,"evidence":"Anna recorded an event."}';
 dyn jsonb:='{"type":"world","dynamics_version":1,"description":"Recorded","evidence":"Anna recorded an event."}';
 grp jsonb:='{"id":"group","type":"world","social_record_version":1,"social_kind":"group","record_id":"school","key":"social:group:school","name":"School","purpose":"Education","status":"active","evidence":"Anna recorded an event."}';
 inst jsonb:='{"id":"institution","dynamics_kind":"institution","record_id":"school","key":"dynamics:institution:school","name":"School","group_id":"school","function":"Education","place":"School","status":"operating"}';
 enrollment jsonb:='{"id":"enroll","life_kind":"enrollment","record_id":"course","key":"player-life:enrollment:course","actor":"Anna","institution_id":"school","title":"Magic","place":"School","status":"enrolled"}';
 program jsonb:='{"id":"program","life_kind":"study_program","record_id":"program","key":"player-life:study_program:program","actor":"School","institution_id":"school","title":"Magic","place":"School","modules":[{"id":"spells","title":"Spells"},{"id":"potions","title":"Potions"}],"status":"active"}';
 joined jsonb:='{"id":"join","life_kind":"program_enrollment","record_id":"join","key":"player-life:program_enrollment:join","actor":"Anna","program_id":"program","enrollment_id":"course","status":"active"}';
 exam jsonb:='{"id":"exam","life_kind":"assessment","record_id":"exam","key":"player-life:assessment:exam","actor":"Anna","enrollment_id":"course","title":"Spells","starts_at":"1994-08-01 10:00","ends_at":"1994-08-01 11:00","status":"scheduled"}';
 exam2 jsonb; result jsonb:='{"id":"result","life_kind":"module_result","record_id":"result","key":"player-life:module_result:result","actor":"Anna","program_enrollment_id":"join","module_id":"spells","assessment_id":"exam","status":"passed"}';
 result2 jsonb; award jsonb:='{"id":"award","life_kind":"qualification","record_id":"award","key":"player-life:qualification:award","actor":"Anna","program_enrollment_id":"join","title":"Magic certificate","description":"Awarded","status":"awarded"}';
 enterprise jsonb:='{"id":"enterprise","dynamics_kind":"enterprise","record_id":"shop","key":"dynamics:enterprise:shop","actor":"Anna","title":"Shop","place":"Shop","group_id":"shop","business_kind":"Retail","status":"operating"}';
 agreement jsonb:='{"id":"agreement","dynamics_kind":"economic_agreement","record_id":"agreement","key":"dynamics:economic_agreement:agreement","actor":"Anna","counterparty":"Supplier","title":"Supply","agreement_kind":"other","amount":30,"currency":"GBP","status":"proposed"}';
 contract jsonb:='{"id":"contract","life_kind":"supply_contract","record_id":"supply","key":"player-life:supply_contract:supply","actor":"Anna","enterprise_id":"shop","agreement_id":"agreement","supplier":"Supplier","title":"Bread","amount":30,"currency":"GBP","due_at":"1994-08-02 10:00","stock_lines":[{"product_id":"bread","unit":"piece","quantity":3}],"status":"proposed"}';
 stock jsonb:='{"id":"stock","dynamics_kind":"stock_operation","record_id":"stock","key":"dynamics:stock_operation:stock","actor":"Supplier","stock_action":"count","stock_lines":[{"product_id":"bread","unit":"piece","quantity":5}],"status":"recorded"}';
 delivery jsonb:='{"id":"delivery","dynamics_kind":"stock_operation","record_id":"delivery","key":"dynamics:stock_operation:delivery","actor":"Supplier","counterparty":"Anna","stock_action":"transfer","stock_lines":[{"product_id":"bread","unit":"piece","quantity":3}],"status":"recorded"}';
 cash jsonb:='{"id":"cash","type":"money","actor":"Anna","currency":"GBP","operation":"reconcile","delta":0,"balance":50,"evidence":"Anna recorded an event."}';
 pay jsonb:='{"id":"pay","type":"money","actor":"Anna","counterparty":"Supplier","currency":"GBP","operation":"transfer","delta":-30,"evidence":"Anna recorded an event."}'; settled jsonb; closed jsonb;
begin
 wid:=public.nw_create_world('Curriculum test','Synthetic academic and commercial life','1994-08-01');select active_branch_id into bid from public.nw_worlds where id=wid;
 inst:=inst||dyn;enrollment:=enrollment||common;program:=program||common;joined:=joined||common;exam:=exam||common;result:=result||common;award:=award||common;
 exam2:=exam||'{"id":"exam2","record_id":"exam2","key":"player-life:assessment:exam2","title":"Potions"}';
 result2:=result||'{"id":"result2","record_id":"result2","key":"player-life:module_result:result2","module_id":"potions","assessment_id":"exam2"}';
 enterprise:=enterprise||dyn;agreement:=agreement||dyn;contract:=contract||common;stock:=stock||dyn;delivery:=delivery||dyn;
 settled:=contract||'{"status":"settled","transfer_event_id":"pay","stock_event_id":"delivery","outcome":"Delivered"}';
 closed:=agreement||'{"status":"settled","outcome":"Delivered"}';
 h:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(grp,inst,enrollment,program,joined,exam,exam2,grp||'{"id":"group-shop","record_id":"shop","key":"social:group:shop","name":"Shop"}',enterprise,agreement,contract,stock,cash),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(award),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Premature qualification';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(enrollment||'{"status":"completed"}',joined||'{"status":"completed"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Premature program completion';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 11:00',jsonb_build_array(exam||'{"status":"passed","outcome":"Passed"}',result,exam2||'{"status":"passed","outcome":"Passed"}',result2),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 11:00',jsonb_build_array(enrollment||'{"status":"completed"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Underlying enrollment closed alone';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 11:00',jsonb_build_array(enrollment||'{"status":"completed"}',joined||'{"status":"completed"}',award),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 11:00',jsonb_build_array(agreement||'{"status":"active"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Underlying agreement activated alone';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 11:00',jsonb_build_array(agreement||'{"status":"active"}',contract||'{"status":"active"}'),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-02 10:00',jsonb_build_array(pay,closed,settled),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Supply settled without stock';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-02 10:00',jsonb_build_array(delivery,pay||'{"delta":-29}',closed,settled),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Supply settled with wrong payment';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-02 10:00',jsonb_build_array(delivery,pay,closed,settled),0);
 if (select count(*) from public.nw_scenes where world_id=wid)<>5 then raise exception 'Rejected scene persisted';end if;
end $curriculum$;
-- Household consent, exact contributions, recorded requirements and care.
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $household$
declare wid uuid; bid uuid; h uuid; bad boolean; body text:='Anna recorded an event.';
 common jsonb:='{"type":"world","player_life_version":1,"evidence":"Anna recorded an event."}';
 estate jsonb:='{"id":"estate","life_kind":"estate","record_id":"home","key":"player-life:estate:home","actor":"Lia","title":"Home","place":"London","estate_kind":"house","status":"owned"}';
 household jsonb:='{"id":"household","life_kind":"household","record_id":"home","key":"player-life:household:home","actor":"Lia","title":"Home","home_kind":"estate","home_id":"home","status":"active"}';
 member jsonb:='{"id":"member","life_kind":"household_member","record_id":"anna","key":"player-life:household_member:anna","actor":"Anna","host":"Lia","household_id":"home","status":"invited"}';
 contribution jsonb:='{"id":"contribution","life_kind":"household_contribution","record_id":"rent","key":"player-life:household_contribution:rent","actor":"Anna","host":"Lia","household_id":"home","title":"Rent share","amount":20,"currency":"GBP","transfer_event_id":"pay","status":"recorded"}';
 cash jsonb:='{"id":"cash","type":"money","actor":"Anna","currency":"GBP","operation":"reconcile","delta":0,"balance":100,"evidence":"Anna recorded an event."}';
 pay jsonb:='{"id":"pay","type":"money","actor":"Anna","counterparty":"Lia","currency":"GBP","operation":"transfer","delta":-20,"evidence":"Anna recorded an event."}';
 sale jsonb:='{"id":"sale","life_kind":"estate_sale","record_id":"sale","key":"player-life:estate_sale:sale","actor":"Lia","buyer":"Other","estate_id":"home","amount":0,"currency":"GBP","status":"offered"}';
 job jsonb:='{"id":"job","type":"world","dynamics_version":1,"dynamics_kind":"employment","record_id":"job","key":"dynamics:employment:job","actor":"Anna","counterparty":"Employer","title":"Clerk","amount":5,"currency":"GBP","pay_period":"hour","status":"offered","description":"Work","evidence":"Anna recorded an event."}';
 req jsonb:='{"id":"req","life_kind":"job_requirement","record_id":"job","key":"player-life:job_requirement:job","actor":"Employer","employment_id":"job","skills":[{"name":"Accounting","level":"competent"}],"status":"active"}';
 skill jsonb:='{"id":"skill","type":"world","growth_version":1,"growth_kind":"skill","record_id":"accounting","key":"growth:skill:accounting","actor":"Anna","name":"Accounting","status":"learning","description":"Learning","evidence":"Anna recorded an event."}';
 episode jsonb:='{"id":"episode","life_kind":"health_episode","record_id":"cold","key":"player-life:health_episode:cold","actor":"Anna","title":"Cold","health_kind":"illness","severity":"moderate","status":"observed","description":"Symptoms"}';
 service jsonb:='{"id":"service","life_kind":"venue_service","record_id":"care","key":"player-life:venue_service:care","actor":"Doctor","place":"Clinic","title":"Visit","category":"health","amount":0,"currency":"GBP","duration_minutes":20,"status":"available"}';
 visit jsonb:='{"id":"visit","life_kind":"service_visit","record_id":"care","key":"player-life:service_visit:care","actor":"Anna","provider":"Doctor","service_id":"care","place":"Clinic","title":"Visit","amount":0,"currency":"GBP","status":"accepted"}';
 care jsonb:='{"id":"care","life_kind":"care_record","record_id":"care","key":"player-life:care_record:care","actor":"Anna","episode_id":"cold","visit_id":"care","description":"Consulted","status":"recorded"}';
begin
 wid:=public.nw_create_world('Household test','Synthetic family and career','1994-08-01');select active_branch_id into bid from public.nw_worlds where id=wid;
 estate:=estate||common;household:=household||common;member:=member||common;contribution:=contribution||common;sale:=sale||common;req:=req||common;episode:=episode||common;service:=service||common;visit:=visit||common;care:=care||common;
 h:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(estate,household,member,cash,job,req,skill,episode,service,visit),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(pay,contribution),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Unjoined member contributed';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(job||'{"status":"active"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Unqualified applicant hired';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(care),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Care before completed service';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:00',jsonb_build_array(member||'{"status":"joined","outcome":"Agreed"}',skill||'{"status":"competent"}',job||'{"status":"active"}',visit||'{"status":"completed","outcome":"Consulted"}',care),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:00',jsonb_build_array(contribution),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Contribution without payment';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:00',jsonb_build_array(pay,contribution,sale),0);
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:00',jsonb_build_array(sale||'{"status":"accepted"}'),0);
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:00',jsonb_build_array(sale||'{"status":"settled","outcome":"Transferred"}'),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:00',jsonb_build_array(pay,contribution||'{"id":"again","record_id":"again","key":"player-life:household_contribution:again"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Contribution to inaccessible household';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:00',jsonb_build_array(member||'{"status":"left","outcome":"Moved away"}',skill||'{"status":"limited"}',job||'{"status":"active"}'),0);
 if (select count(*) from public.nw_scenes where world_id=wid)<>6 then raise exception 'Rejected scene persisted';end if;
end $household$;
-- Assigned household responsibilities, preserved career history and response outcomes.
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $duty_career$
declare wid uuid; bid uuid; h uuid; bad boolean; body text:='Anna recorded an event.';
 common jsonb:='{"type":"world","player_life_version":1,"evidence":"Anna recorded an event."}';
 dyn jsonb:='{"type":"world","dynamics_version":1,"description":"Recorded","evidence":"Anna recorded an event."}';
 estate jsonb:='{"id":"estate","life_kind":"estate","record_id":"home","key":"player-life:estate:home","actor":"Lia","title":"Home","place":"London","estate_kind":"house","status":"owned"}';
 home jsonb:='{"id":"home","life_kind":"household","record_id":"home","key":"player-life:household:home","actor":"Lia","title":"Home","home_kind":"estate","home_id":"home","status":"active"}';
 member jsonb:='{"id":"member","life_kind":"household_member","record_id":"anna","key":"player-life:household_member:anna","actor":"Anna","host":"Lia","household_id":"home","status":"invited"}';
 duty jsonb:='{"id":"duty","dynamics_kind":"family_duty","record_id":"clean","key":"dynamics:family_duty:clean","actors":["Lia","Anna"],"title":"Clean","family_kind":"household","starts_on":"1994-08-02","every_days":2,"status":"active"}';
 task jsonb:='{"id":"task","life_kind":"household_task","record_id":"clean","key":"player-life:household_task:clean","actor":"Anna","host":"Lia","household_id":"home","duty_id":"clean","title":"Clean","scheduled_on":"1994-08-02","status":"proposed"}';
 occurrence jsonb:='{"id":"event","dynamics_kind":"family_event","record_id":"clean","key":"dynamics:family_event:clean","actors":["Lia","Anna"],"title":"Clean","family_kind":"household","duty_id":"clean","scheduled_on":"1994-08-02","status":"completed","outcome":"Cleaned"}';
 oldjob jsonb:='{"id":"oldjob","dynamics_kind":"employment","record_id":"old","key":"dynamics:employment:old","actor":"Anna","counterparty":"Employer","title":"Clerk","place":"Shop","amount":5,"currency":"GBP","pay_period":"hour","status":"active"}';
 newjob jsonb;
 change jsonb:='{"id":"change","life_kind":"career_change","record_id":"promotion","key":"player-life:career_change:promotion","actor":"Anna","title":"Promotion","change_kind":"promotion","previous_job_id":"old","next_job_id":"new","status":"proposed"}';
 shift jsonb:='{"id":"shift","life_kind":"work_shift","record_id":"old","key":"player-life:work_shift:old","actor":"Anna","employer":"Employer","employment_id":"old","title":"Shift","place":"Shop","starts_at":"1994-08-01 10:00","ends_at":"1994-08-01 11:00","pay_period":"hour","rate":5,"currency":"GBP","status":"scheduled"}';
 con jsonb:='{"id":"con","type":"world","consequence_version":1,"consequence_kind":"social","record_id":"con","key":"consequence:con","actor":"Anna","responsible":"Lia","status":"active","description":"Disagreement","evidence":"Anna recorded an event."}';
 response jsonb:='{"id":"response","life_kind":"consequence_response","record_id":"repair","key":"player-life:consequence_response:repair","actor":"Lia","title":"Discuss","consequence_id":"con","due_at":"1994-08-01 09:00","action_description":"Talk","status":"planned"}';
begin
 wid:=public.nw_create_world('Duties and career test','Synthetic household and work','1994-08-01');select active_branch_id into bid from public.nw_worlds where id=wid;
 estate:=estate||common;home:=home||common;member:=member||common;duty:=duty||dyn;task:=task||common;occurrence:=occurrence||dyn;oldjob:=oldjob||dyn;newjob:=oldjob||'{"id":"newjob","record_id":"new","key":"dynamics:employment:new","title":"Manager","amount":10,"status":"offered"}';change:=change||common;shift:=shift||common;response:=response||common;
 h:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(estate,home,member,duty,oldjob,newjob,shift,change,con,response),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(task),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Non-member assigned task';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(oldjob||'{"status":"ended"}',newjob||'{"status":"active"}',change||'{"status":"completed","outcome":"Promoted"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Career closed unresolved shift';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(response||'{"status":"performed","result":"resolved","outcome":"Talked"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Response implied resolution';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(member||'{"status":"joined","outcome":"Agreed"}',task),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(task||'{"id":"duplicate","record_id":"duplicate","key":"player-life:household_task:duplicate"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Duplicate assignment';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:00',jsonb_build_array(task||'{"status":"accepted","outcome":"Agreed"}',shift||'{"status":"working"}'),0);
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 11:00',jsonb_build_array(shift||'{"status":"worked","worked_minutes":60,"outcome":"Worked"}',oldjob||'{"status":"ended"}',newjob||'{"status":"active"}',change||'{"status":"completed","outcome":"Promoted"}'),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-02 12:00',jsonb_build_array(occurrence),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Family occurrence closed without task';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-02 12:00',jsonb_build_array(occurrence,task||'{"status":"completed","family_event_id":"clean","outcome":"Cleaned"}',con||'{"status":"resolved","outcome":"Resolved"}',response||'{"status":"performed","result":"resolved","outcome":"Talked"}'),0);
 if (select count(*) from public.nw_scenes where world_id=wid)<>5 then raise exception 'Rejected scene persisted';end if;
end $duty_career$;
-- Shared paid expenses, consent to reimbursement, and health plans.
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $expense_care$
declare wid uuid; bid uuid; h uuid; bad boolean; body text:='Anna recorded an event.';
 common jsonb:='{"type":"world","player_life_version":1,"evidence":"Anna recorded an event."}';
 estate jsonb:='{"id":"estate","life_kind":"estate","record_id":"home","key":"player-life:estate:home","actor":"Lia","title":"Home","place":"London","estate_kind":"house","status":"owned"}';
 home jsonb:='{"id":"home","life_kind":"household","record_id":"home","key":"player-life:household:home","actor":"Lia","title":"Home","home_kind":"estate","home_id":"home","status":"active"}';
 member jsonb:='{"id":"member","life_kind":"household_member","record_id":"anna","key":"player-life:household_member:anna","actor":"Anna","host":"Lia","household_id":"home","status":"invited"}';
 other_member jsonb;
 cash jsonb:='{"id":"cash","type":"money","actor":"Anna","currency":"GBP","operation":"reconcile","delta":0,"balance":100,"evidence":"Anna recorded an event."}';
 bill jsonb:='{"id":"bill","type":"money","actor":"Lia","counterparty":"Store","currency":"GBP","operation":"transfer","delta":-60,"evidence":"Anna recorded an event."}';
 expense jsonb:='{"id":"expense","life_kind":"household_expense","record_id":"bill","key":"player-life:household_expense:bill","actor":"Lia","household_id":"home","title":"Groceries","provider":"Store","category":"food","amount":60,"currency":"GBP","source_kind":"direct","transfer_event_id":"bill","status":"recorded"}';
 share jsonb:='{"id":"share","life_kind":"expense_share","record_id":"share","key":"player-life:expense_share:share","actor":"Anna","host":"Lia","household_id":"home","expense_id":"bill","title":"Groceries share","amount":25,"currency":"GBP","due_at":"1994-08-02 10:00","status":"proposed"}';
 other_share jsonb;
 pay jsonb:='{"id":"pay","type":"money","actor":"Anna","counterparty":"Lia","currency":"GBP","operation":"transfer","delta":-25,"evidence":"Anna recorded an event."}';
 contribution jsonb:='{"id":"contribution","life_kind":"household_contribution","record_id":"part","key":"player-life:household_contribution:part","actor":"Anna","host":"Lia","household_id":"home","title":"Share","amount":25,"currency":"GBP","transfer_event_id":"pay","status":"recorded"}';
 episode jsonb:='{"id":"episode","life_kind":"health_episode","record_id":"cold","key":"player-life:health_episode:cold","actor":"Anna","title":"Cold","health_kind":"illness","severity":"moderate","status":"observed","description":"Symptoms"}';
 care jsonb:='{"id":"care","life_kind":"care_plan","record_id":"support","key":"player-life:care_plan:support","actor":"Anna","supporter":"Lia","title":"Rest together","episode_id":"cold","due_at":"1994-08-02 10:00","action_kind":"support","description":"Rest and support","status":"proposed"}';
 activity jsonb:='{"id":"act","type":"world","activity_version":1,"activity_kind":"activity","record_id":"act","key":"activity:activity:act","name":"Rest","description":"Rested","actors":["Anna","Lia"],"status":"completed","outcome":"Rested together","evidence":"Anna recorded an event."}';
 service jsonb:='{"id":"service","life_kind":"venue_service","record_id":"food","key":"player-life:venue_service:food","actor":"Store","place":"Store","title":"Food","category":"food","amount":5,"currency":"GBP","duration_minutes":20,"status":"available"}';
 visit jsonb:='{"id":"visit","life_kind":"service_visit","record_id":"food","key":"player-life:service_visit:food","actor":"Lia","provider":"Store","service_id":"food","place":"Store","title":"Food","amount":5,"currency":"GBP","status":"accepted"}';
 service_expense jsonb;
begin
 wid:=public.nw_create_world('Expense care test','Synthetic household care','1994-08-01');select active_branch_id into bid from public.nw_worlds where id=wid;
 estate:=estate||common;home:=home||common;member:=member||common;other_member:=member||'{"id":"other-member","record_id":"other","key":"player-life:household_member:other","actor":"Other"}';expense:=expense||common;share:=share||common;other_share:=share||'{"id":"other-share","record_id":"other","key":"player-life:expense_share:other","actor":"Other","amount":36}';contribution:=contribution||common;episode:=episode||common;care:=care||common;service:=service||common;visit:=visit||common;
 service_expense:=(expense-'transfer_event_id')||'{"id":"service-expense","record_id":"food","key":"player-life:household_expense:food","source_kind":"service","visit_id":"food","amount":5}';
 h:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(estate,home,member,other_member,cash,cash||'{"id":"cash-lia","actor":"Lia"}',episode,care,service,visit),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(expense),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Expense without actual payment';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(activity,care||'{"status":"completed","completion_kind":"activity","completion_id":"act","outcome":"Rested"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Care completed before acceptance';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(member||'{"status":"joined","outcome":"Joined"}',other_member||'{"status":"joined","outcome":"Joined"}',bill,expense,share,care||'{"status":"accepted","outcome":"Agreed"}'),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 09:00',jsonb_build_array(other_share),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Shares exceed actual cost';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-01 10:00',jsonb_build_array(other_share||'{"amount":35}',share||'{"status":"accepted","outcome":"Agreed"}'),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-02 10:00',jsonb_build_array(share||'{"status":"paid","contribution_id":"part","outcome":"Paid"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Share closed without contribution';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-02 10:00',jsonb_build_array(activity||'{"actors":["Anna"]}',care||'{"status":"completed","completion_kind":"activity","completion_id":"act","outcome":"Rested"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Absent supporter counted as present';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-02 10:00',jsonb_build_array(pay,contribution,share||'{"status":"paid","contribution_id":"part","outcome":"Paid"}',activity,care||'{"status":"completed","completion_kind":"activity","completion_id":"act","outcome":"Rested"}'),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-02 10:00',jsonb_build_array(service_expense),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Expense linked incomplete service';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-02 11:00',jsonb_build_array(bill||'{"id":"service-pay","delta":-5}',visit||'{"status":"completed","transfer_event_id":"service-pay","outcome":"Purchased"}',service_expense),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'1994-08-02 11:00',jsonb_build_array(service_expense||'{"id":"duplicate","record_id":"duplicate","key":"player-life:household_expense:duplicate"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Service expense counted twice';end if;
 if (select count(*) from public.nw_scenes where world_id=wid)<>5 then raise exception 'Rejected scene persisted';end if;
end $expense_care$;
-- Dated family events and explicit shared goals.
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $family_goals$
declare wid uuid; bid uuid; h uuid; bad boolean; body text:='Anna recorded an event.';
 common jsonb:='{"type":"world","player_life_version":1,"evidence":"Anna recorded an event."}';
 dyn jsonb:='{"type":"world","dynamics_version":1,"description":"Recorded","evidence":"Anna recorded an event."}';
 birth_event jsonb:='{"id":"birth-event","dynamics_kind":"family_event","record_id":"birth","key":"dynamics:family_event:birth","actors":["Anna","Lia","Alex"],"title":"Birth","family_kind":"birth","status":"completed","outcome":"Born"}';
 bond jsonb:='{"id":"bond","dynamics_kind":"bond","record_id":"parent","key":"dynamics:bond:parent","actor":"Anna","counterparty":"Alex","bond_type":"parenthood","status":"active"}';
 child_character jsonb:='{"id":"child-character","type":"character","name":"Alex","state_patch":{"birth_date":"2000-08-01"},"evidence":"Anna recorded an event."}';
 birth jsonb:='{"id":"birth","life_kind":"child_birth","record_id":"child","key":"player-life:child_birth:child","actor":"Alex","parent":"Anna","born_on":"2000-08-01","family_event_id":"birth","status":"recorded"}';
 school jsonb:='{"id":"school","dynamics_kind":"family_event","record_id":"school","key":"dynamics:family_event:school","actors":["Anna","Alex"],"title":"School","family_kind":"education","status":"completed","outcome":"Attended"}';
 milestone jsonb:='{"id":"milestone","life_kind":"child_milestone","record_id":"school","key":"player-life:child_milestone:school","actor":"Anna","child_id":"child","family_event_id":"school","occurred_on":"2006-09-01","title":"School","category":"education","description":"Attended school","status":"recorded"}';
 goal jsonb:='{"id":"goal","life_kind":"shared_goal","record_id":"home","key":"player-life:shared_goal:home","actor":"Anna","title":"Build home","description":"Shared project","due_at":"2000-08-02 10:00","steps":[{"id":"plan","title":"Plan"},{"id":"prepare","title":"Prepare"}],"status":"proposed"}';
 invite jsonb:='{"id":"invite","life_kind":"shared_goal_member","record_id":"lia","key":"player-life:shared_goal_member:lia","actor":"Lia","organizer":"Anna","goal_id":"home","status":"invited"}';
 activity jsonb:='{"id":"activity","type":"world","activity_version":1,"activity_kind":"activity","record_id":"a","key":"activity:activity:a","name":"Work","description":"Worked","actors":["Lia"],"status":"completed","outcome":"Done","evidence":"Anna recorded an event."}';
 step jsonb:='{"id":"step","life_kind":"shared_goal_step","record_id":"first","key":"player-life:shared_goal_step:first","actor":"Lia","goal_id":"home","step_id":"plan","completion_kind":"activity","completion_id":"a","status":"completed","outcome":"Done"}';
 step2 jsonb;
begin
 wid:=public.nw_create_world('Family goals test','Synthetic family','2000-08-01');select active_branch_id into bid from public.nw_worlds where id=wid;
 birth_event:=birth_event||dyn;bond:=bond||dyn;birth:=birth||common;school:=school||dyn;milestone:=milestone||common;goal:=goal||common;invite:=invite||common;step:=step||common;
 step2:=step||'{"id":"step2","record_id":"second","key":"player-life:shared_goal_step:second","actor":"Anna","step_id":"prepare","completion_id":"b"}';
 bad:=false;begin perform public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'2000-08-01 09:00',jsonb_build_array(child_character,birth_event,birth),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Birth accepted without parenthood';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'2000-08-02 09:00',jsonb_build_array(bond,child_character,birth_event,birth),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Birth accepted on mismatched date';end if;
 h:=public.nw_commit_scene(wid,bid,null,gen_random_uuid(),body,'2000-08-01 09:00',jsonb_build_array(bond,child_character,birth_event,birth,goal,invite),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'2000-08-01 09:00',jsonb_build_array(child_character||'{"state_patch":{"birth_date":"2000-08-02"}}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Registered birth date changed';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'2000-08-01 09:00',jsonb_build_array(goal||'{"status":"active"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Goal activated without agreement';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'2000-08-01 09:00',jsonb_build_array(invite||'{"status":"accepted","outcome":"Agreed"}',goal||'{"status":"active"}'),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'2000-08-01 09:00',jsonb_build_array(goal||'{"status":"completed","outcome":"Finished"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Goal completed before steps';end if;
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'2000-08-01 09:00',jsonb_build_array(activity||'{"actors":["Anna"]}',step),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Step accepted without participant';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'2000-08-01 09:00',jsonb_build_array(activity,step),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'2000-08-01 09:00',jsonb_build_array(activity,step2||'{"actor":"Lia","completion_id":"a"}'),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Step reused same activity';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'2000-08-02 10:00',jsonb_build_array(activity||'{"id":"activity-b","record_id":"b","key":"activity:activity:b","actors":["Anna"]}',step2,goal||'{"status":"completed","outcome":"Finished"}'),0);
 bad:=false;begin perform public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'2006-09-02',jsonb_build_array(school,milestone),0);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Milestone accepted on mismatched date';end if;
 h:=public.nw_commit_scene(wid,bid,h,gen_random_uuid(),body,'2006-09-01',jsonb_build_array(school,milestone),0);
 if (select count(*) from public.nw_scenes where world_id=wid)<>5 then raise exception 'Rejected scene persisted';end if;
end $family_goals$;
rollback;
