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
rollback;
