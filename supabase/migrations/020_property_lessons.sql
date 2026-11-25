-- Recorded property title, tickets, lessons and assignments.
create or replace function public.nw_property_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $property$
declare k text:=e->>'key';kind text:=e->>'life_kind';status text:=coalesce(e->>'status','');old jsonb:=st->'life'->k;a jsonb;b jsonb;c jsonb;d jsonb;f text;ek text;amount numeric;
begin
 if not public.nw_story_text_valid(e->'actor',140) then raise exception 'Invalid property actor';end if;
 if old is not null and kind<>'estate_condition' and old->'actor' is distinct from e->'actor' then raise exception 'Changed property actor';end if;
 if kind='estate' then
  if old is not null or status<>'owned' or not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'place',140) or coalesce(e->>'estate_kind','') not in ('house','apartment','land','commercial','other') then raise exception 'Invalid or repeated estate title';end if;
 elsif kind='estate_sale' then
  if not public.nw_home_id(e->'estate_id') or not public.nw_story_text_valid(e->'buyer',140) or e->'buyer'=e->'actor' or not public.nw_story_text_valid(e->'currency',80) or status not in ('offered','accepted','settled','cancelled') then raise exception 'Invalid estate sale';end if;
  amount:=public.nw_work_uint(e->'amount');
  if status='settled' then
   if not public.nw_story_text_valid(e->'outcome',600) or amount>0 and not public.nw_story_text_valid(e->'transfer_event_id',180) or amount=0 and e->>'transfer_event_id' is not null then raise exception 'Invalid sale settlement';end if;
  elsif e->>'transfer_event_id' is not null then raise exception 'Only settlement requires transfer';end if;
  ek:='player-life:estate:'||(e->>'estate_id');a:=st->'life'->ek;
  if a is null or (status<>'cancelled' and a->'actor' is distinct from e->'actor') or old is null and status<>'offered' then raise exception 'Sale requires current estate owner';end if;
  if old is not null then
   foreach f in array array['estate_id','buyer','amount','currency'] loop
    if old->f is distinct from e->f then raise exception 'Changed sale terms';end if;
   end loop;
   if not (case old->>'status' when 'offered' then status in ('accepted','cancelled') when 'accepted' then status in ('settled','cancelled') else false end) then raise exception 'Invalid sale transition';end if;
  end if;
  if status='accepted' and exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='estate_sale' and r.value->'estate_id'=e->'estate_id' and r.value->>'status'='accepted') then raise exception 'Estate already under accepted sale';end if;
  if status='settled' then
   st:=jsonb_set(st,array['life',ek],a||jsonb_build_object('actor',e->'buyer','previous_owner',e->'actor','last_sale_id',e->'record_id'),false);
  end if;
 elsif kind='estate_condition' then
  if not public.nw_home_id(e->'estate_id') or not public.nw_story_text_valid(e->'area',140) or not public.nw_story_text_valid(e->'description',600) or status not in ('good','worn','damaged','unsafe','unknown') then raise exception 'Invalid estate condition';end if;
  a:=st->'life'->('player-life:estate:'||(e->>'estate_id'));
  if a is null or a->'actor' is distinct from e->'actor' or old is not null and (old->'estate_id' is distinct from e->'estate_id' or old->'area' is distinct from e->'area') or exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='estate_condition' and r.value->'estate_id'=e->'estate_id' and r.value->'area'=e->'area') then raise exception 'Estate condition needs current owner and unique area';end if;
 elsif kind='transport_ticket' then
  if not public.nw_home_id(e->'notice_id') or not public.nw_home_id(e->'reservation_id') or not public.nw_home_id(e->'visit_id') or not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'from',140) or not public.nw_story_text_valid(e->'to',140) or e->'from'=e->'to' or status not in ('reserved','used','cancelled') or public.nw_work_minute(e->'departs_at')>=public.nw_work_minute(e->'arrives_at') then raise exception 'Invalid ticket';end if;
  a:=st->'life'->('player-life:transit_notice:'||(e->>'notice_id'));b:=st->'life'->('player-life:reservation:'||(e->>'reservation_id'));c:=st->'life'->('player-life:service_visit:'||(e->>'visit_id'));d:=st->'life'->('player-life:capacity_slot:'||(b->>'slot_id'));
  if a is null or b is null or c is null or d is null or a->'actor' is distinct from e->'actor' or b->'actor' is distinct from e->'actor' or c->'actor' is distinct from e->'actor' or b->'visit_id' is distinct from e->'visit_id' or c->'provider' is distinct from a->'provider' or (st->'life'->('player-life:venue_service:'||(c->>'service_id')))->>'category' is distinct from 'transport' or d->'starts_at' is distinct from e->'departs_at' or d->'ends_at' is distinct from e->'arrives_at' or exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='transport_ticket' and r.value->'reservation_id'=e->'reservation_id') then raise exception 'Ticket requires matching reservation, schedule and transport service';end if;
  if old is null then
   if status<>'reserved' or a->>'status'<>'scheduled' or b->>'status'<>'reserved' or c->>'status'<>'accepted' or c->'amount' is distinct from a->'amount' or c->'currency' is distinct from a->'currency' then raise exception 'Ticket requires accepted service and known schedule';end if;
   foreach f in array array['from','to','departs_at','arrives_at'] loop
    if a->f is distinct from e->f then raise exception 'Ticket differs from observed schedule';end if;
   end loop;
  else
   foreach f in array array['notice_id','reservation_id','visit_id','title','from','to','departs_at','arrives_at'] loop
    if old->f is distinct from e->f then raise exception 'Ticket terms immutable';end if;
   end loop;
   if old->>'status'<>'reserved' or status not in ('used','cancelled') then raise exception 'Invalid ticket transition';end if;
  end if;
  if status='used' and (b->>'status'<>'used' or c->>'status'<>'completed') or status='cancelled' and (b->>'status'<>'cancelled' or c->>'status'<>'cancelled') then raise exception 'Resolve reservation and service before ticket';end if;
 elsif kind='lesson' then
  if not public.nw_home_id(e->'enrollment_id') or not public.nw_story_text_valid(e->'teacher',140) or e->'actor'=e->'teacher' or not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'place',140) or status not in ('scheduled','attended','missed','cancelled') or public.nw_work_minute(e->'starts_at')>=public.nw_work_minute(e->'ends_at') or status in ('attended','missed') and not public.nw_story_text_valid(e->'outcome',600) then raise exception 'Invalid lesson';end if;
  a:=st->'life'->('player-life:enrollment:'||(e->>'enrollment_id'));
  if a is null or a->'actor' is distinct from e->'actor' or a->>'status'<>'enrolled' or a->'place' is distinct from e->'place' or old is null and status<>'scheduled' then raise exception 'Lesson requires own active enrollment';end if;
  if old is not null then
   foreach f in array array['enrollment_id','teacher','title','place'] loop
    if old->f is distinct from e->f then raise exception 'Changed lesson identity';end if;
   end loop;
   if old->>'status'<>'scheduled' or status<>'scheduled' and (old->'starts_at' is distinct from e->'starts_at' or old->'ends_at' is distinct from e->'ends_at') then raise exception 'Invalid lesson transition';end if;
  end if;
 elsif kind='assignment' then
  if not public.nw_home_id(e->'lesson_id') or not public.nw_story_text_valid(e->'title',200) or status not in ('assigned','submitted','graded','cancelled') or status in ('submitted','graded') and not public.nw_story_text_valid(e->'submission',600) or status='graded' and (not public.nw_story_text_valid(e->'grade',80) or not public.nw_story_text_valid(e->'outcome',600)) then raise exception 'Invalid assignment';end if;
  -- Dates without time remain valid but are not precise deadline hours.
  if coalesce(e->>'due_at','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then perform public.nw_work_minute(to_jsonb((e->>'due_at')||' 00:00'));else perform public.nw_work_minute(e->'due_at');end if;
  a:=st->'life'->('player-life:lesson:'||(e->>'lesson_id'));
  if a is null or a->'actor' is distinct from e->'actor' or a->>'status'<>'attended' or old is null and status<>'assigned' then raise exception 'Assignment requires attended lesson';end if;
  if old is not null then
   foreach f in array array['lesson_id','title','due_at'] loop
    if old->f is distinct from e->f then raise exception 'Changed assignment identity';end if;
   end loop;
   if not (case old->>'status' when 'assigned' then status in ('submitted','cancelled') when 'submitted' then status in ('graded','cancelled') else false end) or old->>'status'='submitted' and old->'submission' is distinct from e->'submission' then raise exception 'Invalid assignment transition';end if;
  end if;
 else raise exception 'Unknown property/lesson record';end if;
 return jsonb_set(st,array['life',k],e,true);
end $property$;
revoke all on function public.nw_property_step(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.nw_player_life_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $life$
declare k text:=e->>'key'; kind text:=e->>'life_kind'; old jsonb; other jsonb; field text; val jsonb; item text; garment jsonb;
 slots constant text[]:=array['head','face','upper','outer','lower','feet','hands','accessory'];
begin
 if not (e?'player_life_version') and coalesce(k,'') not like 'player-life:%' then
  if e->>'type'='item' then st:=jsonb_set(st,'{economy}',public.nw_economy_step(st->'economy',e)); end if;
  if e->>'dynamics_kind'='employment' and e->'dynamics_version'='1'::jsonb then st:=jsonb_set(st,array['jobs',e->>'record_id'],e,true);end if;
  if (e->'dynamics_version'='1'::jsonb and e->>'dynamics_kind' in ('economic_agreement','payment_schedule','institution')) or (e->'growth_version'='1'::jsonb and e->>'growth_kind'='skill') or (e->'social_record_version'='1'::jsonb and e->>'social_kind'='group') then st:=jsonb_set(st,array['refs',k],e,true);end if;
  return st;
 end if;
 if e->>'type' is distinct from 'world' or e->'player_life_version' is distinct from '1'::jsonb
  or coalesce(kind,'') not in ('need','garment','outfit','letter','preset','appointment','impression','journey','venue_service','service_visit','discovery','work_shift','wage','service_recipe','transit_notice','lease','home_condition','budget','capacity_slot','reservation','enrollment','assessment','practice_record','reputation','invitation','health_episode','estate','estate_sale','estate_condition','transport_ticket','lesson','assignment') or coalesce(e->>'record_id','') !~ '^[A-Za-z0-9_-]{1,80}$'
  or jsonb_typeof(e->'record_id') is distinct from 'string' or k is distinct from ('player-life:'||kind||':'||(e->>'record_id'))
  or num_nonnulls(e->'world_record_version',e->'social_record_version',e->'interaction_version',e->'activity_version',e->'consequence_version',e->'growth_version',e->'dynamics_version')<>0
  then raise exception 'Invalid player life identity';end if;
 if kind in ('estate','estate_sale','estate_condition','transport_ticket','lesson','assignment') then return public.nw_property_step(st,e);end if;
 if kind in ('invitation','health_episode') then return public.nw_social_life_step(st,e);end if;
 if kind in ('lease','home_condition','budget','capacity_slot','reservation','enrollment','assessment','practice_record','reputation') then return public.nw_home_step(st,e);end if;
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
declare u uuid:=auth.uid(); st jsonb:='{"life":{},"jobs":{},"refs":{},"economy":{"balances":{},"items":{}}}'; r record; e jsonb; seen integer:=0; old jsonb; t jsonb; used text[]:=array[]::text[]; transfers jsonb:='{}'; locations jsonb:='{}'; ref text; stock_ops jsonb:='{}'; used_stock text[]:=array[]::text[]; recipe jsonb;
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
  if (e->>'life_kind'='estate_sale' and e->>'status'='settled' and (e->>'amount')::numeric>0) or (e->>'life_kind'='wage' and (e->>'amount')::numeric>0) or (e->>'life_kind'='service_visit' and e->>'status'='completed' and (e->>'amount')::numeric>0) or (e->>'dynamics_kind'='payment_occurrence' and e->>'status'='paid') then
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

