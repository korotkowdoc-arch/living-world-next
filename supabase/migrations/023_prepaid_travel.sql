create or replace function public.nw_travel_service_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $travel$
declare k text:=e->>'key'; kind text:=e->>'life_kind'; old jsonb:=st->'life'->k;
 service jsonb; stop jsonb; previous text; field text; idx integer; previous_idx integer; n integer;
begin
 if not public.nw_story_text_valid(e->'actor',140) or not public.nw_story_text_valid(e->'title',200) then raise exception 'Invalid travel or service actor/title';end if;
 if kind='journey' then
  if jsonb_typeof(e->'stops') is distinct from 'array' or jsonb_typeof(e->'reached') is distinct from 'number' or coalesce(e->>'reached','') !~ '^[0-9]{1,2}$' or coalesce(e->>'status','') not in ('planned','travelling','paused','arrived','cancelled') then raise exception 'Invalid journey';end if;
  n:=jsonb_array_length(e->'stops');idx:=(e->>'reached')::integer;
  if n not between 2 and 12 or idx<0 or idx>=n or (e->>'status'='planned' and idx<>0) or (e->>'status'='arrived' and idx<>n-1) or (e->>'status' in ('travelling','paused') and idx=n-1) then raise exception 'Invalid journey progress';end if;
  for stop in select value from jsonb_array_elements(e->'stops') loop
   if jsonb_typeof(stop) is distinct from 'object' or (stop-'place'-'mode')<>'{}'::jsonb or not public.nw_story_text_valid(stop->'place',140) or coalesce(stop->>'mode','') not in ('walk','road','rail','air','water','magic','other') or previous=stop->>'place' then raise exception 'Invalid itinerary stop';end if;
   previous:=stop->>'place';
  end loop;
  if old is null then
   if e->>'status'<>'planned' then raise exception 'Journey must be planned first';end if;
  else
   previous_idx:=(old->>'reached')::integer;
   if old->'actor' is distinct from e->'actor' or not (case old->>'status' when 'planned' then e->>'status' in ('planned','travelling','cancelled') when 'travelling' then e->>'status' in ('travelling','paused','arrived','cancelled') when 'paused' then e->>'status' in ('paused','travelling','cancelled') else false end) then raise exception 'Invalid journey transition';end if;
   if old->>'status'<>'planned' and old->'stops' is distinct from e->'stops' then raise exception 'Cannot rewrite departed itinerary';end if;
   if idx<previous_idx or idx>previous_idx+1 or (idx<>previous_idx and (old->>'status'<>'travelling' or e->>'status' not in ('travelling','arrived'))) then raise exception 'Journey stops must be reached in order';end if;
  end if;
  if e->>'status' in ('travelling','paused') and exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='journey' and r.value->'actor'=e->'actor' and r.value->>'status' in ('travelling','paused')) then raise exception 'Another journey already active';end if;
 else
  if not public.nw_story_text_valid(e->'place',140) or not public.nw_story_text_valid(e->'currency',40) or jsonb_typeof(e->'amount') is distinct from 'number' or coalesce(e->>'amount','') !~ '^[0-9]{1,16}$' then raise exception 'Invalid service price';end if;
  if (e->>'amount')::numeric>9007199254740991 then raise exception 'Unsafe service price';end if;
  if kind in ('venue_service','discovery') then
   if coalesce(e->>'category','') not in ('food','drink','lodging','personal_care','shopping','leisure','sport','education','transport','health','other') or jsonb_typeof(e->'duration_minutes') is distinct from 'number' or coalesce(e->>'duration_minutes','') !~ '^[0-9]{1,5}$' or coalesce(e->>'status','') not in ('available','unavailable','retired') then raise exception 'Invalid venue service';end if;
   if (e->>'duration_minutes')::integer not between 1 and 10080 then raise exception 'Invalid duration';end if;
  end if;
  if kind='venue_service' then
   if old is not null and (old->'actor' is distinct from e->'actor' or old->'place' is distinct from e->'place' or old->'category' is distinct from e->'category' or old->>'status'='retired') then raise exception 'Changed or retired service';end if;
  else
   if jsonb_typeof(e->'service_id') is distinct from 'string' or coalesce(e->>'service_id','') !~ '^[A-Za-z0-9_-]{1,80}$' or not public.nw_story_text_valid(e->'provider',140) then raise exception 'Invalid service reference';end if;
   service:=st->'life'->('player-life:venue_service:'||(e->>'service_id'));
   if kind='discovery' then
    if old is not null and (old->'actor' is distinct from e->'actor' or old->'service_id' is distinct from e->'service_id') or exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='discovery' and r.value->'actor'=e->'actor' and r.value->'service_id'=e->'service_id') then raise exception 'Duplicate or changed discovery';end if;
    if service is null or service->'actor' is distinct from e->'provider' then raise exception 'Missing observed service';end if;
    foreach field in array array['title','place','category','amount','currency','duration_minutes','status'] loop
     if service->field is distinct from e->field then raise exception 'Discovery differs from observed service';end if;
    end loop;
   else
    if e->'actor'=e->'provider' or coalesce(e->>'status','') not in ('requested','accepted','completed','cancelled') then raise exception 'Invalid service visit';end if;
    if e->>'status'='completed' then
     if not public.nw_story_text_valid(e->'outcome',600) or ((e->>'amount')::numeric>0 and not ((public.nw_story_text_valid(e->'transfer_event_id',180) and e->>'prepayment_id' is null) or (public.nw_home_id(e->'prepayment_id') and e->>'transfer_event_id' is null))) or ((e->>'amount')::numeric=0 and (e->>'transfer_event_id' is not null or e->>'prepayment_id' is not null)) then raise exception 'Invalid completed service';end if;
    elsif e->>'transfer_event_id' is not null or e->>'prepayment_id' is not null then raise exception 'Only completed service settles payment';end if;
    if old is null then
     if e->>'status' not in ('requested','accepted') then raise exception 'Service must be requested before completion';end if;
    else
     foreach field in array array['actor','provider','service_id','place','title','amount','currency'] loop
      if old->field is distinct from e->field then raise exception 'Changed service visit terms';end if;
     end loop;
     if not (case old->>'status' when 'requested' then e->>'status' in ('requested','accepted','cancelled') when 'accepted' then e->>'status' in ('accepted','completed','cancelled') else false end) then raise exception 'Invalid service visit transition';end if;
    end if;
    if old is null or (old->>'status'='requested' and e->>'status'='accepted') then
     if service is null or service->'actor' is distinct from e->'provider' or service->>'status'<>'available' then raise exception 'Unavailable service';end if;
     foreach field in array array['title','place','amount','currency'] loop
      if service->field is distinct from e->field then raise exception 'Changed service quote';end if;
     end loop;
    end if;
   end if;
  end if;
 end if;
 return jsonb_set(st,array['life',k],e,true);
end $travel$;
revoke all on function public.nw_travel_service_step(jsonb,jsonb) from public,anon,authenticated;


-- Full transport prepayment, consumption and full refund; no second ledger.
create or replace function public.nw_ticket_payment_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $prepaid$
declare k text:=e->>'key';old jsonb:=st->'life'->k; ticket jsonb; visit jsonb; reservation jsonb; f text; amount numeric;
begin
 if not public.nw_story_text_valid(e->'actor',140) or not public.nw_story_text_valid(e->'provider',140) or e->'actor'=e->'provider' or not public.nw_home_id(e->'ticket_id') or not public.nw_home_id(e->'reservation_id') or not public.nw_home_id(e->'visit_id') or not public.nw_story_text_valid(e->'currency',40) or not public.nw_story_text_valid(e->'transfer_event_id',180) or coalesce(e->>'status','') not in ('paid','refunded') then raise exception 'Invalid ticket payment';end if;
 amount:=public.nw_work_uint(e->'amount');if amount<=0 then raise exception 'Ticket payment must be positive';end if;
 ticket:=st->'life'->('player-life:transport_ticket:'||(e->>'ticket_id'));
 visit:=st->'life'->('player-life:service_visit:'||(e->>'visit_id'));
 reservation:=st->'life'->('player-life:reservation:'||(e->>'reservation_id'));
 if ticket is null or visit is null or reservation is null or ticket->'actor' is distinct from e->'actor' or ticket->'visit_id' is distinct from e->'visit_id' or ticket->'reservation_id' is distinct from e->'reservation_id' or ticket->>'status'<>'reserved' or reservation->>'status'<>'reserved' or reservation->'actor' is distinct from e->'actor' or reservation->'visit_id' is distinct from e->'visit_id' or visit->'actor' is distinct from e->'actor' or visit->'provider' is distinct from e->'provider' or visit->>'status'<>'accepted' or visit->'amount' is distinct from e->'amount' or visit->'currency' is distinct from e->'currency' then raise exception 'Payment needs matching accepted reserved ticket';end if;
 if old is null then
  if e->>'status'<>'paid' or exists(select 1 from jsonb_each(st->'life') r where r.value->>'life_kind'='ticket_payment' and r.value->'visit_id'=e->'visit_id') then raise exception 'Ticket can be prepaid only once';end if;
 else
  if old->>'status'<>'paid' or e->>'status'<>'refunded' then raise exception 'Refund requires unconsumed payment';end if;
  foreach f in array array['actor','provider','ticket_id','reservation_id','visit_id','amount','currency'] loop
   if old->f is distinct from e->f then raise exception 'Refund differs from original payment';end if;
  end loop;
 end if;
 return jsonb_set(st,array['life',k],e,true);
end $prepaid$;
revoke all on function public.nw_ticket_payment_step(jsonb,jsonb) from public,anon,authenticated;
create or replace function public.nw_prepaid_visit_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $prepaid$
declare p jsonb; k text;
begin
 select value into p from jsonb_each(st->'life') where value->>'life_kind'='ticket_payment' and value->'visit_id'=e->'record_id';
 if e->>'status'='completed' then
  if p is not null and p->>'status'<>'paid' then raise exception 'Refunded or consumed payment cannot complete service';end if;
  if p is not null and (p->'record_id' is distinct from e->'prepayment_id' or e->>'transfer_event_id' is not null) or p is null and e->>'prepayment_id' is not null then raise exception 'Completion must use its own prepaid receipt';end if;
 elsif e->>'status'='cancelled' and p->>'status'='paid' then raise exception 'Cancel prepaid ticket only after full refund';end if;
 st:=public.nw_travel_service_step(st,e);
 if e->>'status'='completed' and p is not null then
  k:='player-life:ticket_payment:'||(p->>'record_id');
  st:=jsonb_set(st,array['life',k],p||jsonb_build_object('status','consumed','consumed_visit_id',e->'record_id'),false);
 end if;
 return st;
end $prepaid$;
revoke all on function public.nw_prepaid_visit_step(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.nw_player_life_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $life$
declare k text:=e->>'key'; kind text:=e->>'life_kind'; old jsonb; other jsonb; field text; val jsonb; item text; garment jsonb;
 slots constant text[]:=array['head','face','upper','outer','lower','feet','hands','accessory'];
begin
 if not (e?'player_life_version') and coalesce(k,'') not like 'player-life:%' then
  if e->>'type'='item' then st:=jsonb_set(st,'{economy}',public.nw_economy_step(st->'economy',e));st:=public.nw_furnishing_invalidate(st,e); end if;
  if e->>'dynamics_kind'='employment' and e->'dynamics_version'='1'::jsonb then st:=jsonb_set(st,array['jobs',e->>'record_id'],e,true);end if;
  if (e->'dynamics_version'='1'::jsonb and e->>'dynamics_kind' in ('economic_agreement','payment_schedule','institution')) or (e->'growth_version'='1'::jsonb and e->>'growth_kind'='skill') or (e->'social_record_version'='1'::jsonb and e->>'social_kind'='group') then st:=jsonb_set(st,array['refs',k],e,true);end if;
  return st;
 end if;
 if e->>'type' is distinct from 'world' or e->'player_life_version' is distinct from '1'::jsonb
  or coalesce(kind,'') not in ('need','garment','outfit','letter','preset','appointment','impression','journey','venue_service','service_visit','discovery','work_shift','wage','service_recipe','transit_notice','lease','home_condition','budget','capacity_slot','reservation','enrollment','assessment','practice_record','reputation','invitation','health_episode','estate','estate_sale','estate_condition','transport_ticket','lesson','assignment','market_adjustment','market_observation','furnishing','ticket_payment') or coalesce(e->>'record_id','') !~ '^[A-Za-z0-9_-]{1,80}$'
  or jsonb_typeof(e->'record_id') is distinct from 'string' or k is distinct from ('player-life:'||kind||':'||(e->>'record_id'))
  or num_nonnulls(e->'world_record_version',e->'social_record_version',e->'interaction_version',e->'activity_version',e->'consequence_version',e->'growth_version',e->'dynamics_version')<>0
  then raise exception 'Invalid player life identity';end if;
 if kind='ticket_payment' then return public.nw_ticket_payment_step(st,e);end if;
 if kind in ('market_adjustment','market_observation','furnishing') then return public.nw_market_home_step(st,e);end if;
 if kind in ('estate','estate_sale','estate_condition','transport_ticket','lesson','assignment') then return public.nw_furnishing_invalidate(public.nw_property_step(st,e),e);end if;
 if kind in ('invitation','health_episode') then return public.nw_social_life_step(st,e);end if;
 if kind in ('lease','home_condition','budget','capacity_slot','reservation','enrollment','assessment','practice_record','reputation') then return public.nw_furnishing_invalidate(public.nw_home_step(st,e),e);end if;
 if kind in ('work_shift','wage','service_recipe','transit_notice') then return public.nw_work_step(st,e);end if;
 if kind='service_visit' then perform public.nw_visit_recipe_guard(st,e);return public.nw_prepaid_visit_step(st,e);end if;
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
declare u uuid:=auth.uid(); st jsonb:='{"life":{},"jobs":{},"refs":{},"economy":{"balances":{},"items":{}}}'; r record; e jsonb; seen integer:=0; old jsonb; t jsonb; used text[]:=array[]::text[]; transfers jsonb:='{}'; locations jsonb:='{}'; ref text; stock_ops jsonb:='{}'; used_stock text[]:=array[]::text[]; recipe jsonb; signature text; snapshot jsonb; snapshot_count integer:=0; total_count integer:=0; root_checked boolean:=false; event_position bigint; cancellation_kind text; cancellation_id text;
begin
 if not exists(select 1 from jsonb_array_elements(p_events) x where x?'player_life_version' or x->>'key' like 'player-life:%') then return;end if;
 if u is null or not exists(select 1 from public.nw_worlds where id=p_world and owner_id=u) then raise exception 'World not found';end if;
 signature:=public.nw_life_checkpoint_signature();
 -- Stop walking only at a compatible snapshot on the actual parent chain.
 -- Never use a snapshot just because it shares a world or branch name.
 for r in with recursive chain as (
  select s.id,s.parent_scene_id,s.events,1 depth,c.state cached_state,c.scene_count cached_count
  from public.nw_scenes s left join public.nw_life_checkpoints c on c.scene_id=s.id and c.world_id=p_world and c.owner_id=u and c.engine_signature=signature
  where s.id=p_head and s.world_id=p_world and s.owner_id=u
  union all
  select s.id,s.parent_scene_id,s.events,p.depth+1,c.state,c.scene_count
  from chain p join public.nw_scenes s on s.id=p.parent_scene_id
  left join public.nw_life_checkpoints c on c.scene_id=s.id and c.world_id=p_world and c.owner_id=u and c.engine_signature=signature
  where s.world_id=p_world and s.owner_id=u and p.depth<50001 and p.cached_state is null
 ) select * from chain order by depth desc loop
  seen:=seen+1;
  if seen=1 then
   if r.cached_state is not null then st:=r.cached_state;snapshot_count:=r.cached_count;root_checked:=true;continue;
   elsif r.parent_scene_id is null then root_checked:=true;
   else raise exception 'Incomplete life ancestry';end if;
  end if;
  if seen+snapshot_count>50001 then raise exception 'Incomplete life ancestry';end if;
  for e in select value from jsonb_array_elements(r.events) loop
   begin st:=public.nw_player_life_step(st,e);exception when raise_exception then null;end;
  end loop;
 end loop;
 total_count:=seen+snapshot_count-case when snapshot_count>0 then 1 else 0 end;
 if p_head is not null and (not root_checked or total_count>50000) then raise exception 'Missing or incomplete life ancestry';end if;
 -- A first checkpoint and then one per 128 additional scenes. Cap storage
 -- at eight checkpoints per world and 8 MiB per serialized state.
 if p_head is not null and (snapshot_count=0 or total_count-snapshot_count>=128) and octet_length(st::text)<=8388608 then
  insert into public.nw_life_checkpoints(scene_id,world_id,owner_id,engine_signature,scene_count,state)
  values(p_head,p_world,u,signature,total_count,st)
  on conflict(scene_id) do update set engine_signature=excluded.engine_signature,scene_count=excluded.scene_count,state=excluded.state,created_at=now();
  delete from public.nw_life_checkpoints c where c.world_id=p_world and c.owner_id=u and c.scene_id in (
   select x.scene_id from public.nw_life_checkpoints x where x.world_id=p_world and x.owner_id=u order by x.created_at desc,x.scene_id desc offset 8
  );
 end if;
 -- The generic economy guard has already checked balances. Record only preceding
 -- transfers and location observations; one transfer cannot pay two receipts.
 for e,event_position in select value,ordinality from jsonb_array_elements(p_events) with ordinality loop
  if e->>'type'='money' and e->>'operation'='transfer' then transfers:=jsonb_set(transfers,array[e->>'id'],e,true);end if;
  if e->>'type'='character' and (e->'state_patch')?'location' then locations:=jsonb_set(locations,array[e->>'name'],e->'state_patch'->'location',true);end if;
  if e->>'dynamics_kind'='stock_operation' and e->'dynamics_version'='1'::jsonb and e->>'stock_action'='consume' then stock_ops:=jsonb_set(stock_ops,array[e->>'id'],e,true);end if;
  if e->>'life_kind'='ticket_payment' or (e->>'life_kind'='estate_sale' and e->>'status'='settled' and (e->>'amount')::numeric>0) or (e->>'life_kind'='wage' and (e->>'amount')::numeric>0) or (e->>'life_kind'='service_visit' and e->>'status'='completed' and (e->>'amount')::numeric>0 and e->>'prepayment_id' is null) or (e->>'dynamics_kind'='payment_occurrence' and e->>'status'='paid') then
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
   if e->>'life_kind'='estate_sale' then
    t:=transfers->ref;
    if t is null or t->'actor' is distinct from e->'buyer' or t->'counterparty' is distinct from e->'actor' or t->'currency' is distinct from e->'currency' or (t->>'delta')::numeric is distinct from -(e->>'amount')::numeric then raise exception 'Estate sale requires preceding exact transfer';end if;
   end if;
   if e->>'life_kind'='ticket_payment' then
    t:=transfers->ref;
    if t is null or t->'actor' is distinct from (case when e->>'status'='refunded' then e->'provider' else e->'actor' end) or t->'counterparty' is distinct from (case when e->>'status'='refunded' then e->'actor' else e->'provider' end) or t->'currency' is distinct from e->'currency' or (t->>'delta')::numeric is distinct from -(e->>'amount')::numeric then raise exception 'Ticket payment requires preceding exact transfer';end if;
    if e->>'status'='refunded' then
     foreach cancellation_kind in array array['service_visit','reservation','transport_ticket'] loop
      cancellation_id:=case cancellation_kind when 'service_visit' then e->>'visit_id' when 'reservation' then e->>'reservation_id' else e->>'ticket_id' end;
      if not exists(select 1 from jsonb_array_elements(p_events) with ordinality a(value,idx) where a.idx>event_position and a.value->>'type'='world' and a.value->'player_life_version'='1'::jsonb and a.value->>'life_kind'=cancellation_kind and a.value->>'record_id'=cancellation_id and a.value->'actor'=e->'actor' and a.value->>'status'='cancelled') then raise exception 'Refund must cancel service, reservation and ticket in the same scene';end if;
     end loop;
    end if;
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

