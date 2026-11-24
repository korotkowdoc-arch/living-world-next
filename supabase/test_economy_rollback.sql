-- Run AFTER migration 007 on a development database, as its owner.
-- Only pure fold assertions; no user data is read or changed.
begin;
do $verify$
declare state jsonb:='{"balances":{},"items":{}}'; bad jsonb; caught boolean;
begin
 state:=public.nw_economy_step(state,'{"type":"money","actor":"A","currency":"coin","delta":0,"operation":"reconcile","balance":10}');
 state:=public.nw_economy_step(state,'{"type":"money","actor":"A","currency":"coin","delta":-4,"operation":"transfer","counterparty":"B"}');
 if (state->'balances'->(jsonb_build_array('A','coin')::text)->>'balance')::integer is distinct from 6 then raise exception 'Sender balance wrong'; end if;
 if (state->'balances'->(jsonb_build_array('B','coin')::text)->>'known')::boolean is distinct from false then raise exception 'Unknown recipient was invented'; end if;
 caught:=false;
 begin
  bad:=public.nw_economy_step(state,'{"type":"money","actor":"A","currency":"coin","delta":-7,"operation":"transfer","counterparty":"B"}');
 exception when raise_exception then caught:=true; end;
 if not caught then raise exception 'Overspend not rejected'; end if;
 state:=public.nw_economy_step(state,'{"type":"item","item_id":"book","custody_version":1,"actor":"A","action":"acquire"}');
 state:=public.nw_economy_step(state,'{"type":"item","item_id":"book","custody_version":1,"actor":"B","action":"observe"}');
 if state->'items'->'book'->>'holder' is distinct from 'A' then raise exception 'Observation changed custody'; end if;
 state:=public.nw_economy_step(state,'{"type":"item","item_id":"book","custody_version":1,"actor":"B","action":"take","counterparty":"A"}');
 if state->'items'->'book'->>'holder' is distinct from 'B' then raise exception 'Taking failed'; end if;
 state:=public.nw_economy_step(state,'{"type":"item","item_id":"book","custody_version":1,"actor":"B","action":"destroy"}');
 caught:=false;
 begin
  bad:=public.nw_economy_step(state,'{"type":"item","item_id":"book","custody_version":1,"actor":"A","action":"recover"}');
 exception when raise_exception then caught:=true; end;
 if not caught then raise exception 'Destroyed item restored'; end if;
end $verify$;
-- The same pure validation used by the atomic commit, with valid and invalid payloads.
do $story$
declare bad jsonb; caught boolean;
begin
 perform public.nw_assert_story_event_shape('{"type":"character","name":"A","state_patch":{"birth_date":"2000-02-29","life_stage":"adult","condition":null}}');
 perform public.nw_assert_story_event_shape('{"type":"relationship","a":"A","b":"B","relationship_version":1,"relationship_patch":{"attraction":"ambivalent","jealousy":"unknown"}}');
 perform public.nw_assert_story_event_shape('{"type":"world","interaction_version":1,"interaction_kind":"date","actors":["A","B"],"description":"Meeting"}');
 perform public.nw_assert_story_event_shape('{"type":"world","dynamics_version":1,"dynamics_kind":"family_duty","record_id":"d","key":"dynamics:family_duty:d","status":"active","title":"Care","description":"Care","actors":["A"],"family_kind":"care","starts_on":"2026-01-01","every_days":2}');
 for bad in select value from jsonb_array_elements('[
  {"type":"character","name":"A","state_patch":{"birth_date":"2001-02-29"}},
  {"type":"character","name":"A","state_patch":{"invented":"x"}},
  {"type":"relationship","a":"A","b":"B","relationship_version":1,"relationship_patch":{"trust":"jealous"}},
  {"type":"world","interaction_version":1,"interaction_kind":"date","actors":["A","B","C"],"description":"Meeting"},
  {"type":"world","key":"dynamics:bond:bad","description":"Unversioned"},
  {"type":"world","interaction_version":1,"dynamics_version":1},
  {"type":"world","dynamics_version":1,"dynamics_kind":"life_transition","record_id":"t","key":"dynamics:life_transition:t","status":"completed","actor":"A","title":"Work","description":"Work","transition_kind":"employment"}
 ]'::jsonb) loop
  caught:=false;
  begin perform public.nw_assert_story_event_shape(bad);
  exception when raise_exception then caught:=true; end;
  if not caught then raise exception 'Invalid story shape accepted: %',bad; end if;
 end loop;
end $story$;
-- Linked family duty occurrences cannot duplicate or drift off their date grid.
do $family$
declare st jsonb:='{"plans":{},"records":{}}'; e jsonb; bad boolean;
begin
 st:=public.nw_story_transition_step(st,'{"type":"world","dynamics_version":1,"dynamics_kind":"family_duty","record_id":"care","key":"dynamics:family_duty:care","family_kind":"care","actors":["Anna"],"title":"Care","description":"Care","starts_on":"2026-01-01","every_days":2,"status":"active"}');
 e:='{"type":"world","dynamics_version":1,"dynamics_kind":"family_event","record_id":"care1","key":"dynamics:family_event:care1","family_kind":"care","actors":["Anna"],"title":"Care","description":"Care","status":"completed","outcome":"Done","duty_id":"care","scheduled_on":"2026-01-03"}';
 st:=public.nw_story_transition_step(st,e);
 if (st->'records'->'dynamics:family_event:care1'->>'status') is distinct from 'completed' then raise exception 'Family occurrence not saved'; end if;
 bad:=false; begin perform public.nw_story_transition_step(st,e||'{"record_id":"duplicate","key":"dynamics:family_event:duplicate"}'::jsonb); exception when raise_exception then bad:=true; end;
 if not bad then raise exception 'Duplicate family occurrence accepted'; end if;
 bad:=false; begin perform public.nw_story_transition_step(st,e||'{"record_id":"wrong","key":"dynamics:family_event:wrong","scheduled_on":"2026-01-04"}'::jsonb); exception when raise_exception then bad:=true; end;
 if not bad then raise exception 'Off-grid family occurrence accepted'; end if;
end $family$;
do $commercial$
declare st jsonb:='{"plans":{},"records":{}}'; e jsonb; bad boolean;
begin
 e:='{"type":"world","dynamics_version":1,"dynamics_kind":"economic_agreement","record_id":"debt","key":"dynamics:economic_agreement:debt","actor":"B","counterparty":"A","title":"Debt","description":"Debt","status":"active","agreement_kind":"debt","amount":20,"currency":"coin"}';
 st:=public.nw_story_transition_step(st,e);
 bad:=false;begin perform public.nw_story_transition_step(st,e||'{"amount":21}'::jsonb);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Debt changed identity';end if;
 bad:=false;begin perform public.nw_story_transition_step(st,e||'{"status":"settled"}'::jsonb);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Debt settled without outcome';end if;
 st:=public.nw_story_transition_step(st,e||'{"status":"settled","outcome":"Waived"}'::jsonb);
 bad:=false;begin perform public.nw_story_transition_step(st,e);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Settled agreement reopened';end if;
end $commercial$;
do $payment$
declare st jsonb:='{"plans":{},"records":{}}'; e jsonb; bad boolean;
begin
 st:=public.nw_story_transition_step(st,'{"type":"world","dynamics_version":1,"dynamics_kind":"payment_schedule","record_id":"rent","key":"dynamics:payment_schedule:rent","actor":"B","counterparty":"A","title":"Rent","description":"Rent","status":"active","payment_kind":"rent","amount":20,"currency":"coin","starts_on":"2026-11-01","every_days":2}');
 e:='{"type":"world","dynamics_version":1,"dynamics_kind":"payment_occurrence","record_id":"rent1","key":"dynamics:payment_occurrence:rent1","actor":"B","counterparty":"A","title":"Rent","description":"Rent","status":"paid","amount":20,"currency":"coin","schedule_id":"rent","scheduled_on":"2026-11-01","transfer_event_id":"t","outcome":"Paid"}';
 st:=public.nw_story_transition_step(st,e);
 bad:=false;begin perform public.nw_story_transition_step(st,e||'{"record_id":"dup","key":"dynamics:payment_occurrence:dup"}'::jsonb);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Duplicate payment accepted';end if;
 bad:=false;begin perform public.nw_story_transition_step(st,e||'{"record_id":"bad","key":"dynamics:payment_occurrence:bad","scheduled_on":"2026-11-02"}'::jsonb);exception when raise_exception then bad:=true;end;
 if not bad then raise exception 'Off-grid payment accepted';end if;
end $payment$;
rollback;
