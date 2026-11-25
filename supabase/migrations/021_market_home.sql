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

create or replace function public.nw_home_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $home$
declare k text:=e->>'key'; kind text:=e->>'life_kind'; status text:=coalesce(e->>'status',''); old jsonb:=st->'life'->k; a jsonb; b jsonb; f text; start_time timestamp; end_time timestamp; units numeric; total numeric;
begin
 if not public.nw_story_text_valid(e->'actor',140) then raise exception 'Invalid life actor';end if;
 if old is not null and old->'actor' is distinct from e->'actor' then raise exception 'Changed life actor';end if;
 if kind='lease' then
  if not public.nw_story_text_valid(e->'landlord',140) or e->'landlord'=e->'actor' or not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'place',140) or not public.nw_home_id(e->'agreement_id') or not public.nw_home_id(e->'schedule_id') or status not in ('proposed','active','ended','cancelled') then raise exception 'Invalid lease';end if;
  if old is null then
   if status not in ('proposed','active') then raise exception 'Lease must begin proposed or active';end if;
  else
   foreach f in array array['landlord','place','agreement_id','schedule_id'] loop
    if old->f is distinct from e->f then raise exception 'Changed lease terms';end if;
   end loop;
   if not (case old->>'status' when 'proposed' then status in ('proposed','active','cancelled') when 'active' then status in ('active','ended') else false end) then raise exception 'Invalid lease transition';end if;
  end if;
  if exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='lease' and (r.value->'agreement_id'=e->'agreement_id' or r.value->'schedule_id'=e->'schedule_id')) then raise exception 'Duplicate lease terms';end if;
  a:=st->'refs'->('dynamics:economic_agreement:'||(e->>'agreement_id'));b:=st->'refs'->('dynamics:payment_schedule:'||(e->>'schedule_id'));
  if a is null or b is null or a->>'agreement_kind'<>'rent' or b->>'payment_kind'<>'rent' or a->'actor' is distinct from e->'actor' or b->'actor' is distinct from e->'actor' or a->'counterparty' is distinct from e->'landlord' or b->'counterparty' is distinct from e->'landlord' or a->'place' is distinct from e->'place' or a->'amount' is distinct from b->'amount' or a->'currency' is distinct from b->'currency' then raise exception 'Lease requires matching rent terms';end if;
  if status='active' and (a->>'status'<>'active' or b->>'status'<>'active') or status='ended' and (a->>'status' not in ('settled','cancelled') or b->>'status'<>'ended') then raise exception 'Lease state requires matching contract and payment state';end if;
 elsif kind='home_condition' then
  if not public.nw_home_id(e->'lease_id') or not public.nw_story_text_valid(e->'area',140) or not public.nw_story_text_valid(e->'description',600) or status not in ('good','worn','damaged','unsafe','unknown') then raise exception 'Invalid home condition';end if;
  a:=st->'life'->('player-life:lease:'||(e->>'lease_id'));
  if a is null or a->'actor' is distinct from e->'actor' or a->>'status'<>'active' or old is not null and (old->'lease_id' is distinct from e->'lease_id' or old->'area' is distinct from e->'area') or exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='home_condition' and r.value->'lease_id'=e->'lease_id' and r.value->'area'=e->'area') then raise exception 'Home condition needs own active lease and unique area';end if;
 elsif kind='budget' then
  if not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'currency',80) or status not in ('active','paused','closed') then raise exception 'Invalid budget';end if;
  perform public.nw_work_uint(e->'monthly_limit');perform public.nw_work_uint(e->'savings_target');
  if old is null and status<>'active' or old is not null and (old->'currency' is distinct from e->'currency' or old->>'status'='closed') or status<>'closed' and exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='budget' and r.value->'actor'=e->'actor' and r.value->'currency'=e->'currency' and r.value->>'status'<>'closed') then raise exception 'One current budget per currency';end if;
 elsif kind='capacity_slot' then
  if not public.nw_home_id(e->'service_id') or not public.nw_story_text_valid(e->'resource',140) or status not in ('open','closed') then raise exception 'Invalid capacity slot';end if;
  start_time:=public.nw_work_minute(e->'starts_at');end_time:=public.nw_work_minute(e->'ends_at');units:=public.nw_work_uint(e->'capacity');
  if start_time>=end_time or units not between 1 and 10000 then raise exception 'Invalid capacity interval or units';end if;
  a:=st->'life'->('player-life:venue_service:'||(e->>'service_id'));
  if a is null or a->'actor' is distinct from e->'actor' or old is null and status<>'open' or old is not null and old->>'status'='closed' then raise exception 'Slot requires owned service';end if;
  if old is not null then
   foreach f in array array['service_id','resource','starts_at','ends_at','capacity'] loop
    if old->f is distinct from e->f then raise exception 'Immutable capacity slot';end if;
   end loop;
  end if;
  if exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='capacity_slot' and r.value->'actor'=e->'actor' and r.value->'resource'=e->'resource' and public.nw_work_minute(r.value->'starts_at')<end_time and start_time<public.nw_work_minute(r.value->'ends_at')) then raise exception 'Overlapping slots';end if;
 elsif kind='reservation' then
  if not public.nw_home_id(e->'slot_id') or not public.nw_home_id(e->'visit_id') or status not in ('reserved','used','cancelled') then raise exception 'Invalid reservation';end if;
  units:=public.nw_work_uint(e->'units');if units not between 1 and 10000 then raise exception 'Invalid reservation units';end if;
  a:=st->'life'->('player-life:capacity_slot:'||(e->>'slot_id'));b:=st->'life'->('player-life:service_visit:'||(e->>'visit_id'));
  if a is null or b is null or b->'actor' is distinct from e->'actor' or b->'provider' is distinct from a->'actor' or b->'service_id' is distinct from a->'service_id' or exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='reservation' and r.value->'visit_id'=e->'visit_id') then raise exception 'Reservation must match own visit';end if;
  if old is null then
   if status<>'reserved' or a->>'status'<>'open' or b->>'status'<>'accepted' then raise exception 'Reservation requires open slot and accepted service';end if;
   select coalesce(sum((value->>'units')::numeric),0) into total from jsonb_each(st->'life') where value->>'life_kind'='reservation' and value->'slot_id'=e->'slot_id' and value->>'status' in ('reserved','used');
   if total+units>(a->>'capacity')::numeric then raise exception 'Capacity exhausted';end if;
  else
   foreach f in array array['slot_id','visit_id','units'] loop
    if old->f is distinct from e->f then raise exception 'Changed reservation terms';end if;
   end loop;
   if old->>'status'<>'reserved' or status not in ('used','cancelled') or status='used' and b->>'status'<>'completed' or status='cancelled' and b->>'status'<>'cancelled' then raise exception 'Close matching service before reservation';end if;
  end if;
 elsif kind='enrollment' then
  if not public.nw_home_id(e->'institution_id') or not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'place',140) or status not in ('applied','enrolled','completed','withdrawn','rejected') then raise exception 'Invalid enrollment';end if;
  a:=st->'refs'->('dynamics:institution:'||(e->>'institution_id'));
  if a is null or a->'place' is distinct from e->'place' or old is null and (status not in ('applied','enrolled') or a->>'status'<>'operating') then raise exception 'Enrollment requires operating institution';end if;
  if old is not null then
   foreach f in array array['institution_id','title','place'] loop
    if old->f is distinct from e->f then raise exception 'Changed enrollment';end if;
   end loop;
   if not (case old->>'status' when 'applied' then status in ('enrolled','rejected','withdrawn') when 'enrolled' then status in ('completed','withdrawn') else false end) then raise exception 'Invalid enrollment transition';end if;
  end if;
 elsif kind='assessment' then
  if not public.nw_home_id(e->'enrollment_id') or not public.nw_story_text_valid(e->'title',200) or status not in ('scheduled','passed','failed','cancelled') or status in ('passed','failed') and not public.nw_story_text_valid(e->'outcome',600) then raise exception 'Invalid assessment';end if;
  if public.nw_work_minute(e->'starts_at')>=public.nw_work_minute(e->'ends_at') then raise exception 'Invalid assessment interval';end if;
  a:=st->'life'->('player-life:enrollment:'||(e->>'enrollment_id'));
  if a is null or a->'actor' is distinct from e->'actor' or a->>'status'<>'enrolled' or old is null and status<>'scheduled' then raise exception 'Assessment needs active enrollment';end if;
  if old is not null and (old->>'status'<>'scheduled' or old->'enrollment_id' is distinct from e->'enrollment_id' or old->'title' is distinct from e->'title' or status<>'scheduled' and (old->'starts_at' is distinct from e->'starts_at' or old->'ends_at' is distinct from e->'ends_at')) then raise exception 'Invalid assessment transition';end if;
 elsif kind='practice_record' then
  if not public.nw_home_id(e->'skill_id') or not public.nw_home_id(e->'origin_id') or coalesce(e->>'origin_kind','') not in ('work_shift','assessment','lesson') or status<>'recorded' or not public.nw_story_text_valid(e->'description',600) then raise exception 'Invalid practice evidence';end if;
  a:=st->'refs'->('growth:skill:'||(e->>'skill_id'));b:=st->'life'->('player-life:'||(e->>'origin_kind')||':'||(e->>'origin_id'));
  if old is not null or a is null or b is null or a->'actor' is distinct from e->'actor' or b->'actor' is distinct from e->'actor' or not (case e->>'origin_kind' when 'work_shift' then b->>'status'='worked' when 'lesson' then b->>'status'='attended' else b->>'status' in ('passed','failed') end) or exists(select 1 from jsonb_each(st->'life') r where r.value->>'life_kind'='practice_record' and r.value->'actor'=e->'actor' and r.value->'skill_id'=e->'skill_id' and r.value->'origin_kind'=e->'origin_kind' and r.value->'origin_id'=e->'origin_id') then raise exception 'Practice needs unique completed activity and own skill';end if;
 elsif kind='reputation' then
  if not public.nw_home_id(e->'group_id') or not public.nw_story_text_valid(e->'observer',140) or e->'actor'=e->'observer' or not public.nw_story_text_valid(e->'description',600) or jsonb_typeof(e->'known_to_actor') is distinct from 'boolean' or status not in ('positive','neutral','negative','mixed','unknown') or old is not null or not ((st->'refs')?('social:group:'||(e->>'group_id'))) then raise exception 'Invalid or repeated reputation observation';end if;
 else raise exception 'Unknown housing or education record';end if;
 return jsonb_set(st,array['life',k],e,true);
end $home$;
revoke all on function public.nw_home_step(jsonb,jsonb) from public,anon,authenticated;


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





