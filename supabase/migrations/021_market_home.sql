-- Market changes and furniture placement share canonical life and custody state.
create or replace function public.nw_furnishing_valid(st jsonb,e jsonb)
returns boolean language sql immutable security invoker set search_path='' as $market$
 select coalesce(st->'life'->('player-life:'||(e->>'home_kind')||':'||(e->>'home_id'))->'actor'=e->'actor'
 and st->'life'->('player-life:'||(e->>'home_kind')||':'||(e->>'home_id'))->>'status'=case e->>'home_kind' when 'estate' then 'owned' when 'lease' then 'active' else '' end
 and st->'economy'->'items'->(e->>'item_id')->>'custody_status'='held'
 and st->'economy'->'items'->(e->>'item_id')->'holder'=e->'actor',false);
$market$;
revoke all on function public.nw_furnishing_valid(jsonb,jsonb) from public,anon,authenticated;
create or replace function public.nw_furnishing_invalidate(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $market$
declare r record;
begin
 if e->>'type'='item' or e->>'life_kind' in ('estate_sale','lease') then
  for r in select key,value from jsonb_each(st->'life') where value->>'life_kind'='furnishing' and value->>'status'='placed' and (e->>'type'<>'item' or value->'item_id'=e->'item_id') loop
   if not public.nw_furnishing_valid(st,r.value) then st:=jsonb_set(st,array['life',r.key,'status'],'"unconfirmed"'::jsonb,false);end if;
  end loop;
 end if;
 return st;
end $market$;
revoke all on function public.nw_furnishing_invalidate(jsonb,jsonb) from public,anon,authenticated;
create or replace function public.nw_market_home_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $market$
declare k text:=e->>'key'; kind text:=e->>'life_kind'; old jsonb:=st->'life'->k; a jsonb; f text; sk text; amount numeric; previous numeric;
begin
 if not public.nw_story_text_valid(e->'actor',140) or not public.nw_story_text_valid(e->'description',600) then raise exception 'Invalid market/home actor or description';end if;
 if kind='market_adjustment' then
  if old is not null or not public.nw_home_id(e->'service_id') or not public.nw_story_text_valid(e->'currency',40) or coalesce(e->>'cause','') not in ('demand','supply','cost','competition','season','policy','other') or e->>'status' is distinct from 'recorded' then raise exception 'Invalid price adjustment';end if;
  amount:=public.nw_work_uint(e->'amount');previous:=public.nw_work_uint(e->'previous_amount');
  sk:='player-life:venue_service:'||(e->>'service_id');a:=st->'life'->sk;
  if amount=previous or a is null or a->'actor' is distinct from e->'actor' or a->>'status'='retired' or a->'amount' is distinct from e->'previous_amount' or a->'currency' is distinct from e->'currency' then raise exception 'Adjustment must match current service and owner';end if;
  st:=jsonb_set(st,array['life',sk],a||jsonb_build_object('amount',e->'amount','evidence',e->'evidence','last_adjustment_id',e->'record_id'),false);
 elsif kind='market_observation' then
  if old is not null or not public.nw_home_id(e->'service_id') or not public.nw_home_id(e->'discovery_id') or not public.nw_story_text_valid(e->'provider',140) or not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'place',140) or not public.nw_story_text_valid(e->'currency',40) or coalesce(e->>'supply','') not in ('low','normal','high','unknown') or coalesce(e->>'demand','') not in ('low','normal','high','unknown') or e->>'status' is distinct from 'recorded' then raise exception 'Invalid observed market price';end if;
  amount:=public.nw_work_uint(e->'amount');a:=st->'life'->('player-life:discovery:'||(e->>'discovery_id'));
  if a is null or a->'actor' is distinct from e->'actor' then raise exception 'Observation requires own discovered quote';end if;
  foreach f in array array['service_id','provider','title','place','amount','currency'] loop
   if a->f is distinct from e->f then raise exception 'Observation differs from discovered quote';end if;
  end loop;
 elsif kind='furnishing' then
  if not public.nw_story_text_valid(e->'item_id',140) or not public.nw_home_id(e->'home_id') or coalesce(e->>'home_kind','') not in ('estate','lease') or not public.nw_story_text_valid(e->'area',140) or coalesce(e->>'status','') not in ('placed','removed') then raise exception 'Invalid furnishing';end if;
  if old is not null and old->'item_id' is distinct from e->'item_id' or exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='furnishing' and r.value->'item_id'=e->'item_id') then raise exception 'One furnishing record per item';end if;
  if e->>'status'='placed' then
   if not public.nw_furnishing_valid(st,e) then raise exception 'Placement needs own accessible home and held item';end if;
   if old->>'status'='placed' and public.nw_furnishing_valid(st,old) and old->'actor' is distinct from e->'actor' then raise exception 'Already placed by another holder';end if;
  else
   if old is null or old->>'status'<>'placed' then raise exception 'No existing placement';end if;
   foreach f in array array['actor','home_kind','home_id','area'] loop
    if old->f is distinct from e->f then raise exception 'Removal must match placement';end if;
   end loop;
  end if;
 else raise exception 'Unknown market/home record';end if;
 return jsonb_set(st,array['life',k],e,true);
end $market$;
revoke all on function public.nw_market_home_step(jsonb,jsonb) from public,anon,authenticated;

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
  or coalesce(kind,'') not in ('need','garment','outfit','letter','preset','appointment','impression','journey','venue_service','service_visit','discovery','work_shift','wage','service_recipe','transit_notice','lease','home_condition','budget','capacity_slot','reservation','enrollment','assessment','practice_record','reputation','invitation','health_episode','estate','estate_sale','estate_condition','transport_ticket','lesson','assignment','market_adjustment','market_observation','furnishing') or coalesce(e->>'record_id','') !~ '^[A-Za-z0-9_-]{1,80}$'
  or jsonb_typeof(e->'record_id') is distinct from 'string' or k is distinct from ('player-life:'||kind||':'||(e->>'record_id'))
  or num_nonnulls(e->'world_record_version',e->'social_record_version',e->'interaction_version',e->'activity_version',e->'consequence_version',e->'growth_version',e->'dynamics_version')<>0
  then raise exception 'Invalid player life identity';end if;
 if kind in ('market_adjustment','market_observation','furnishing') then return public.nw_market_home_step(st,e);end if;
 if kind in ('estate','estate_sale','estate_condition','transport_ticket','lesson','assignment') then return public.nw_furnishing_invalidate(public.nw_property_step(st,e),e);end if;
 if kind in ('invitation','health_episode') then return public.nw_social_life_step(st,e);end if;
 if kind in ('lease','home_condition','budget','capacity_slot','reservation','enrollment','assessment','practice_record','reputation') then return public.nw_furnishing_invalidate(public.nw_home_step(st,e),e);end if;
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





