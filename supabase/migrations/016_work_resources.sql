-- Work shifts, exact wage receipts, stock-backed service recipes, known transport.
create or replace function public.nw_work_minute(v jsonb)
returns timestamp language plpgsql immutable security invoker set search_path='' as $work$
declare s text;
begin
 if jsonb_typeof(v) is distinct from 'string' then raise exception 'Exact fictional time required';end if;
 s:=btrim(v#>>'{}');
 if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T]([01][0-9]|2[0-3]):[0-5][0-9]$' or left(s,4)='0000' then raise exception 'Exact fictional time required';end if;
 begin return s::timestamp;exception when datetime_field_overflow or invalid_datetime_format then raise exception 'Invalid fictional time';end;
end $work$;
revoke all on function public.nw_work_minute(jsonb) from public,anon,authenticated;
create or replace function public.nw_work_uint(v jsonb)
returns numeric language plpgsql immutable security invoker set search_path='' as $work$
declare n numeric;
begin
 if jsonb_typeof(v) is distinct from 'number' then raise exception 'Invalid integer amount';end if;
 n:=(v#>>'{}')::numeric;
 if n<0 or n>9007199254740991 or trunc(n)<>n then raise exception 'Invalid integer amount';end if;
 return n;
end $work$;
revoke all on function public.nw_work_uint(jsonb) from public,anon,authenticated;
create or replace function public.nw_work_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $work$
declare k text:=e->>'key'; kind text:=e->>'life_kind'; old jsonb:=st->'life'->k; job jsonb; shift jsonb; service jsonb; f text; a timestamp; b timestamp; minutes numeric; amount numeric; rate numeric; expected numeric;
begin
 if not public.nw_story_text_valid(e->'actor',140) then raise exception 'Invalid work actor';end if;
 if kind='work_shift' then
  if not public.nw_story_text_valid(e->'employer',140) or e->'actor'=e->'employer' or jsonb_typeof(e->'employment_id') is distinct from 'string' or coalesce(e->>'employment_id','') !~ '^[A-Za-z0-9_-]{1,80}$' or not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'place',140) or coalesce(e->>'status','') not in ('scheduled','working','worked','cancelled','missed') then raise exception 'Invalid shift';end if;
  a:=public.nw_work_minute(e->'starts_at'); b:=public.nw_work_minute(e->'ends_at');
  if b<=a then raise exception 'Invalid shift interval';end if;
  if e->>'status'='worked' then
   minutes:=public.nw_work_uint(e->'worked_minutes');
   if minutes<1 or minutes>extract(epoch from b-a)/60 or not public.nw_story_text_valid(e->'outcome',600) then raise exception 'Invalid worked shift';end if;
  elsif e->>'worked_minutes' is not null or e->>'outcome' is not null then raise exception 'Shift has no completed work yet';end if;
  if e->>'pay_period' is not null then
   if e->>'pay_period' not in ('hour','task','day','week','month') or not public.nw_story_text_valid(e->'currency',80) then raise exception 'Invalid pay terms';end if;
   rate:=public.nw_work_uint(e->'rate');
  elsif e->>'rate' is not null or e->>'currency' is not null then raise exception 'Incomplete pay terms';end if;
  job:=st->'jobs'->(e->>'employment_id');
  if old is null then
   if e->>'status'<>'scheduled' or job is null or job->>'status'<>'active' or job->'actor' is distinct from e->'actor' or job->'counterparty' is distinct from e->'employer' or (job->>'place' is not null and job->'place' is distinct from e->'place') or job->>'pay_period' is distinct from e->>'pay_period' or (e->>'pay_period' is not null and (job->'amount' is distinct from e->'rate' or job->'currency' is distinct from e->'currency')) then raise exception 'Shift requires active matching employment';end if;
  else
   foreach f in array array['actor','employer','employment_id','pay_period','rate','currency'] loop
    if old->>f is distinct from e->>f then raise exception 'Changed shift terms';end if;
   end loop;
   if not (case old->>'status' when 'scheduled' then e->>'status' in ('scheduled','working','cancelled','missed') when 'working' then e->>'status' in ('working','worked','cancelled') else false end) then raise exception 'Invalid shift transition';end if;
   if old->>'status'<>'scheduled' and (old->'starts_at' is distinct from e->'starts_at' or old->'ends_at' is distinct from e->'ends_at' or old->'place' is distinct from e->'place') then raise exception 'Cannot rewrite started shift';end if;
   if old->>'status'='scheduled' and e->>'status'='working' and coalesce(job->>'status','')<>'active' then raise exception 'Employment is not active';end if;
  end if;
  if e->>'status'='working' and exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='work_shift' and r.value->'actor'=e->'actor' and r.value->>'status'='working') then raise exception 'Another shift is already in progress';end if;
 elsif kind='wage' then
  if not public.nw_story_text_valid(e->'employer',140) or e->'actor'=e->'employer' or jsonb_typeof(e->'shift_id') is distinct from 'string' or coalesce(e->>'shift_id','') !~ '^[A-Za-z0-9_-]{1,80}$' or e->>'status' is distinct from 'paid' or not public.nw_story_text_valid(e->'currency',80) then raise exception 'Invalid wage receipt';end if;
  amount:=public.nw_work_uint(e->'amount');
  if (amount>0 and not public.nw_story_text_valid(e->'transfer_event_id',180)) or (amount=0 and e->>'transfer_event_id' is not null) then raise exception 'Invalid wage transfer';end if;
  shift:=st->'life'->('player-life:work_shift:'||(e->>'shift_id'));
  if old is not null or exists(select 1 from jsonb_each(st->'life') r where r.value->>'life_kind'='wage' and r.value->'shift_id'=e->'shift_id') or shift is null or shift->>'status'<>'worked' or shift->'actor' is distinct from e->'actor' or shift->'employer' is distinct from e->'employer' or shift->'currency' is distinct from e->'currency' then raise exception 'Wage requires one completed shift';end if;
  if shift->>'pay_period'='task' then expected:=(shift->>'rate')::numeric;
  elsif shift->>'pay_period'='hour' then expected:=(shift->>'rate')::numeric*(shift->>'worked_minutes')::numeric/60;
  else raise exception 'Use periodic payment schedule';end if;
  if expected is distinct from amount then raise exception 'Wage must equal agreed exact amount';end if;
 elsif kind='service_recipe' then
  if jsonb_typeof(e->'service_id') is distinct from 'string' or coalesce(e->>'service_id','') !~ '^[A-Za-z0-9_-]{1,80}$' or coalesce(e->>'status','') not in ('active','retired') then raise exception 'Invalid recipe';end if;
  perform public.nw_assert_stock_lines(e->'stock_lines','consume');
  service:=st->'life'->('player-life:venue_service:'||(e->>'service_id'));
  if service is null or service->'actor' is distinct from e->'actor' then raise exception 'Recipe must belong to service';end if;
  if old is null then
   if e->>'status'<>'active' or exists(select 1 from jsonb_each(st->'life') r where r.value->>'life_kind'='service_recipe' and r.value->'service_id'=e->'service_id' and r.value->>'status'='active') then raise exception 'One active recipe per service';end if;
  elsif old->'actor' is distinct from e->'actor' or old->'service_id' is distinct from e->'service_id' or old->'stock_lines' is distinct from e->'stock_lines' or old->>'status'<>'active' or e->>'status'<>'retired' then raise exception 'Immutable recipe';end if;
 elsif kind='transit_notice' then
  if not public.nw_story_text_valid(e->'provider',140) or not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'from',140) or not public.nw_story_text_valid(e->'to',140) or e->'from'=e->'to' or coalesce(e->>'mode','') not in ('road','rail','air','water','magic','other') or coalesce(e->>'status','') not in ('scheduled','cancelled') or not public.nw_story_text_valid(e->'currency',40) then raise exception 'Invalid transit notice';end if;
  amount:=public.nw_work_uint(e->'amount');
  if public.nw_work_minute(e->'arrives_at')<=public.nw_work_minute(e->'departs_at') then raise exception 'Invalid transport interval';end if;
  if old is not null then
   foreach f in array array['actor','provider','from','to','mode'] loop
    if old->f is distinct from e->f then raise exception 'Changed transit identity';end if;
   end loop;
  end if;
 else raise exception 'Unknown work record';end if;
 return jsonb_set(st,array['life',k],e,true);
end $work$;
revoke all on function public.nw_work_step(jsonb,jsonb) from public,anon,authenticated;
create or replace function public.nw_visit_recipe_guard(st jsonb,e jsonb)
returns void language plpgsql immutable security invoker set search_path='' as $work$
declare old jsonb:=st->'life'->(e->>'key'); recipe jsonb; rid text;
begin
 if e->>'recipe_id' is not null and (jsonb_typeof(e->'recipe_id') is distinct from 'string' or e->>'recipe_id' !~ '^[A-Za-z0-9_-]{1,80}$') then raise exception 'Invalid recipe reference';end if;
 if old->>'status'='accepted' and old->>'recipe_id' is distinct from e->>'recipe_id' then raise exception 'Cannot change recipe after acceptance';end if;
 if e->>'status'='accepted' and coalesce(old->>'status','')<>'accepted' then
  select value->>'record_id' into rid from jsonb_each(st->'life') where value->>'life_kind'='service_recipe' and value->'service_id'=e->'service_id' and value->>'status'='active';
  if rid is distinct from e->>'recipe_id' then raise exception 'Accepted service must pin its recipe';end if;
 end if;
 if e->>'status'='completed' and e->>'recipe_id' is not null then
  recipe:=st->'life'->('player-life:service_recipe:'||(e->>'recipe_id'));
  if recipe is null or recipe->'service_id' is distinct from e->'service_id' or recipe->'actor' is distinct from e->'provider' or not public.nw_story_text_valid(e->'stock_event_id',180) then raise exception 'Missing accepted recipe or stock reference';end if;
 elsif e->>'stock_event_id' is not null then raise exception 'Only completed recipe service consumes stock';end if;
end $work$;
revoke all on function public.nw_visit_recipe_guard(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.nw_player_life_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $life$
declare k text:=e->>'key'; kind text:=e->>'life_kind'; old jsonb; other jsonb; field text; val jsonb; item text; garment jsonb;
 slots constant text[]:=array['head','face','upper','outer','lower','feet','hands','accessory'];
begin
 if not (e?'player_life_version') and coalesce(k,'') not like 'player-life:%' then
  if e->>'type'='item' then st:=jsonb_set(st,'{economy}',public.nw_economy_step(st->'economy',e)); end if;
  if e->>'dynamics_kind'='employment' and e->'dynamics_version'='1'::jsonb then st:=jsonb_set(st,array['jobs',e->>'record_id'],e,true);end if;
  return st;
 end if;
 if e->>'type' is distinct from 'world' or e->'player_life_version' is distinct from '1'::jsonb
  or coalesce(kind,'') not in ('need','garment','outfit','letter','preset','appointment','impression','journey','venue_service','service_visit','discovery','work_shift','wage','service_recipe','transit_notice') or coalesce(e->>'record_id','') !~ '^[A-Za-z0-9_-]{1,80}$'
  or jsonb_typeof(e->'record_id') is distinct from 'string' or k is distinct from ('player-life:'||kind||':'||(e->>'record_id'))
  or num_nonnulls(e->'world_record_version',e->'social_record_version',e->'interaction_version',e->'activity_version',e->'consequence_version',e->'growth_version',e->'dynamics_version')<>0
  then raise exception 'Invalid player life identity';end if;
 if kind in ('work_shift','wage','service_recipe','transit_notice') then return public.nw_work_step(st,e);end if;
 if kind='service_visit' then perform public.nw_visit_recipe_guard(st,e);end if;
 if kind in ('journey','venue_service','service_visit','discovery') then return public.nw_travel_service_step(st,e);end if;
 old:=st->'life'->k;
 if old is not null and (old->>'life_kind' is distinct from kind or old->'record_id' is distinct from e->'record_id') then raise exception 'Changed life identity';end if;
 if kind='need' then
  if not public.nw_story_text_valid(e->'actor',140) or coalesce(e->>'need','') not in ('hunger','thirst','energy','hygiene','comfort','stress') or coalesce(e->>'status','') not in ('comfortable','noticeable','urgent','critical','unknown')
    or not public.nw_story_text_valid(e->'description',600) then raise exception 'Invalid observed need';end if;
  if old is not null and (old->'actor' is distinct from e->'actor' or old->'need' is distinct from e->'need') or exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='need' and r.value->'actor'=e->'actor' and r.value->'need'=e->'need') then raise exception 'Duplicate or changed need';end if;
 elsif kind='garment' then
  if not public.nw_story_text_valid(e->'item_id',140) or not coalesce((e->>'slot')=any(slots),false) or not public.nw_story_text_valid(e->'description',600) or not public.nw_story_text_valid(e->'style',140)
   or not ((st->'economy'->'items') ? (e->>'item_id')) then raise exception 'Invalid garment or missing item';end if;
  if old is not null and (old->'item_id' is distinct from e->'item_id' or old->'slot' is distinct from e->'slot') or exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='garment' and r.value->'item_id'=e->'item_id') then raise exception 'Duplicate or changed garment';end if;
 elsif kind in ('outfit','preset') then
  if kind='preset' and (not public.nw_story_text_valid(e->'title',140) or coalesce(e->>'status','') not in ('active','removed')) then raise exception 'Invalid preset';end if;
  if not public.nw_story_text_valid(e->'actor',140) or jsonb_typeof(e->'slots') is distinct from 'object' then raise exception 'Invalid outfit';end if;
  if old is not null and old->'actor' is distinct from e->'actor' or (kind='outfit' and exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='outfit' and r.value->'actor'=e->'actor')) then raise exception 'Duplicate or changed outfit';end if;
  if (select count(*) from jsonb_each(e->'slots'))<>(select count(distinct value) from jsonb_each(e->'slots')) then raise exception 'Duplicate equipped item';end if;
  if kind='preset' then
   if old->>'status'='removed' or (e->>'status'='removed' and old is null) then raise exception 'Invalid preset transition';end if;
   if e->>'status'='active' and exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='preset' and r.value->'actor'=e->'actor' and r.value->'title'=e->'title' and r.value->>'status'='active') then raise exception 'Duplicate preset title';end if;
  end if;
  for field,val in select key,value from jsonb_each(e->'slots') loop
   if not field=any(slots) or not public.nw_story_text_valid(val,140) then raise exception 'Invalid outfit slot';end if;
   if kind='preset' and e->>'status'='removed' then continue;end if;
   item:=val#>>'{}';
   if not exists(select 1 from jsonb_each(st->'life') r where r.value->>'life_kind'='garment' and r.value->>'item_id'=item and r.value->>'slot'=field)
    or st->'economy'->'items'->item->>'custody_status' is distinct from 'held' or st->'economy'->'items'->item->'holder' is distinct from e->'actor' then raise exception 'Outfit requires confirmed held garment';end if;
  end loop;
 elsif kind='appointment' then
  if not public.nw_story_text_valid(e->'actor',140) or not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'place',140) or coalesce(e->>'status','') not in ('proposed','confirmed','completed','cancelled','missed') or jsonb_typeof(e->'participants') is distinct from 'array' then raise exception 'Invalid appointment';end if;
  if jsonb_array_length(e->'participants') not between 1 and 12 or not (e->'participants' @> jsonb_build_array(e->'actor')) or (select count(distinct value) from jsonb_array_elements(e->'participants'))<>jsonb_array_length(e->'participants') or exists(select 1 from jsonb_array_elements(e->'participants') x(value) where not public.nw_story_text_valid(value,140)) then raise exception 'Invalid appointment participants';end if;
  if coalesce(e->>'starts_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T]([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(e->>'ends_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T]([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Exact appointment time required';end if;
  begin
   if (e->>'ends_at')::timestamp<=(e->>'starts_at')::timestamp then raise exception 'Invalid appointment interval';end if;
  exception when datetime_field_overflow or invalid_datetime_format then raise exception 'Invalid appointment date';end;
  if old is null then
   if e->>'status' not in ('proposed','confirmed') then raise exception 'Appointment must be proposed or confirmed first';end if;
  else
   if old->'actor' is distinct from e->'actor' or not (case old->>'status' when 'proposed' then e->>'status' in ('proposed','confirmed','cancelled') when 'confirmed' then e->>'status' in ('confirmed','completed','cancelled','missed') else false end) then raise exception 'Invalid appointment transition';end if;
   if e->>'status' in ('completed','missed') and (old->'starts_at' is distinct from e->'starts_at' or old->'ends_at' is distinct from e->'ends_at' or old->'place' is distinct from e->'place' or old->'participants' is distinct from e->'participants') then raise exception 'Cannot rewrite closing meeting';end if;
  end if;
 elsif kind='impression' then
  if not public.nw_story_text_valid(e->'actor',140) or not public.nw_story_text_valid(e->'observer',140) or e->'actor'=e->'observer' or not public.nw_story_text_valid(e->'description',600) or not public.nw_story_text_valid(e->'basis',600) or coalesce(e->>'status','') not in ('positive','neutral','negative','mixed','unknown') or jsonb_typeof(e->'known_to_actor') is distinct from 'boolean' then raise exception 'Invalid impression';end if;
  if old is not null and (old->'actor' is distinct from e->'actor' or old->'observer' is distinct from e->'observer' or (old->'known_to_actor'='true'::jsonb and e->'known_to_actor'='false'::jsonb)) then raise exception 'Invalid impression transition';end if;
 else
  if not public.nw_story_text_valid(e->'sender',140) or not public.nw_story_text_valid(e->'recipient',140) or e->'sender'=e->'recipient' or coalesce(e->>'status','') not in ('draft','sent','delivered','read','failed')
   or not public.nw_story_text_valid(e->'subject',200) or not public.nw_story_text_valid(e->'message',5000) or not public.nw_story_text_valid(e->'channel',140)
   or (e?'sender_notified' and (jsonb_typeof(e->'sender_notified') is distinct from 'boolean' or e->'sender_notified'='true'::jsonb and e->>'status' not in ('delivered','read','failed'))) then raise exception 'Invalid letter';end if;
  if old is null then
   if e->>'status' not in ('draft','sent') then raise exception 'Letter must be sent before delivery';end if;
  else
   if old->'sender' is distinct from e->'sender' or old->'recipient' is distinct from e->'recipient' or old->'channel' is distinct from e->'channel'
    or not (case old->>'status' when 'draft' then e->>'status' in ('draft','sent') when 'sent' then e->>'status' in ('delivered','failed') when 'delivered' then e->>'status' in ('delivered','read') when 'read' then e->>'status'='read' when 'failed' then e->>'status'='failed' else false end)
    or (old->>'status'<>'draft' and (old->'subject' is distinct from e->'subject' or old->'message' is distinct from e->'message'))
    or (old->'status'=e->'status' and old->'sender_notified'='true'::jsonb and e->'sender_notified' is distinct from 'true'::jsonb) then raise exception 'Invalid letter transition';end if;
  end if;
 end if;
 return jsonb_set(st,array['life',k],e,true);
end $life$;
revoke all on function public.nw_player_life_step(jsonb,jsonb) from public,anon,authenticated;



create or replace function public.nw_assert_player_life_append(p_world uuid,p_head uuid,p_events jsonb)
returns void language plpgsql security invoker set search_path='' as $life$
declare u uuid:=auth.uid(); st jsonb:='{"life":{},"jobs":{},"economy":{"balances":{},"items":{}}}'; r record; e jsonb; seen integer:=0; old jsonb; t jsonb; used text[]:=array[]::text[]; transfers jsonb:='{}'; locations jsonb:='{}'; ref text; stock_ops jsonb:='{}'; used_stock text[]:=array[]::text[]; recipe jsonb;
begin
 if not exists(select 1 from jsonb_array_elements(p_events) x where x?'player_life_version' or x->>'key' like 'player-life:%') then return;end if;
 if u is null or not exists(select 1 from public.nw_worlds where id=p_world and owner_id=u) then raise exception 'World not found';end if;
 for r in with recursive chain as (
  select s.id,s.parent_scene_id,s.events,1 depth from public.nw_scenes s where s.id=p_head and s.world_id=p_world and s.owner_id=u
  union all select s.id,s.parent_scene_id,s.events,c.depth+1 from chain c join public.nw_scenes s on s.id=c.parent_scene_id where s.world_id=p_world and s.owner_id=u and c.depth<50001
 ) select * from chain order by depth desc loop
  seen:=seen+1;if (seen=1 and r.parent_scene_id is not null) or seen>50000 then raise exception 'Incomplete life ancestry';end if;
  for e in select value from jsonb_array_elements(r.events) loop
   begin st:=public.nw_player_life_step(st,e);exception when raise_exception then null;end;
  end loop;
 end loop;
 if p_head is not null and seen=0 then raise exception 'Missing life ancestry';end if;
 -- The generic economy guard has already checked balances. Record only preceding
 -- transfers and location observations; one transfer cannot pay two receipts.
 for e in select value from jsonb_array_elements(p_events) loop
  if e->>'type'='money' and e->>'operation'='transfer' then transfers:=jsonb_set(transfers,array[e->>'id'],e,true);end if;
  if e->>'type'='character' and (e->'state_patch')?'location' then locations:=jsonb_set(locations,array[e->>'name'],e->'state_patch'->'location',true);end if;
  if e->>'dynamics_kind'='stock_operation' and e->'dynamics_version'='1'::jsonb and e->>'stock_action'='consume' then stock_ops:=jsonb_set(stock_ops,array[e->>'id'],e,true);end if;
  if (e->>'life_kind'='wage' and (e->>'amount')::numeric>0) or (e->>'life_kind'='service_visit' and e->>'status'='completed' and (e->>'amount')::numeric>0) or (e->>'dynamics_kind'='payment_occurrence' and e->>'status'='paid') then
   ref:=e->>'transfer_event_id';
   if ref is null or ref=any(used) then raise exception 'Transfer reused across settlement records';end if;
   if e->>'life_kind'='service_visit' then
    t:=transfers->ref;
    if t is null or t->'actor' is distinct from e->'actor' or t->'counterparty' is distinct from e->'provider' or t->'currency' is distinct from e->'currency' or (t->>'delta')::numeric is distinct from -(e->>'amount')::numeric then raise exception 'Service requires preceding exact payment';end if;
   end if;
   if e->>'life_kind'='wage' then
    t:=transfers->ref;
    if t is null or t->'actor' is distinct from e->'employer' or t->'counterparty' is distinct from e->'actor' or t->'currency' is distinct from e->'currency' or (t->>'delta')::numeric is distinct from -(e->>'amount')::numeric then raise exception 'Wage requires preceding exact transfer';end if;
   end if;
   used:=array_append(used,ref);
  end if;
  if e->>'life_kind'='journey' and e->>'status' in ('travelling','arrived') then
   old:=st->'life'->(e->>'key');
   if (old is null or old->>'status'='planned' or old->'reached' is distinct from e->'reached') and locations->(e->>'actor') is distinct from e->'stops'->((e->>'reached')::integer)->'place' then raise exception 'Journey departure/arrival requires preceding location observation';end if;
  end if;
  if e->>'life_kind'='service_visit' and e->>'status'='completed' and e->>'recipe_id' is not null then
   ref:=e->>'stock_event_id';t:=stock_ops->ref;recipe:=st->'life'->('player-life:service_recipe:'||(e->>'recipe_id'));
   if ref is null or ref=any(used_stock) or t is null or recipe is null or t->'actor' is distinct from e->'provider' or t->'stock_lines' is distinct from recipe->'stock_lines' then raise exception 'Service requires its own exact stock consumption';end if;
   used_stock:=array_append(used_stock,ref);
  end if;
  st:=public.nw_player_life_step(st,e);
 end loop;
end $life$;
revoke all on function public.nw_assert_player_life_append(uuid,uuid,jsonb) from public,anon,authenticated;

