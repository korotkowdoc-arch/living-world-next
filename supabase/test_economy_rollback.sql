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
rollback;
