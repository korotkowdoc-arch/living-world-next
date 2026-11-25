-- Evidence-backed room geometry and explicit connectivity. Existing room records remain valid.
create or replace function public.nw_room_layout_access(st jsonb,e jsonb,rid text)
returns boolean language sql immutable security invoker set search_path='' as $$
 select exists(select 1 from (select st->'life'->('player-life:room:'||rid) r,st->'life'->('player-life:'||(e->>'home_kind')||':'||(e->>'home_id')) h) x
 where r->>'status'='active' and r->>'actor'=e->>'actor' and public.nw_life_same_fields(r,e,array['home_kind','home_id','title_revision']) and h->>'actor'=e->>'actor' and ((e->>'home_kind'='estate' and h->>'status'='owned' and h->>'last_sale_id' is not distinct from e->>'title_revision') or (e->>'home_kind'='lease' and h->>'status'='active')))
$$;
revoke all on function public.nw_room_layout_access(jsonb,jsonb,text) from public,anon,authenticated;
create or replace function public.nw_room_geometry_valid(e jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare f text;v integer;
begin
 foreach f in array array['floor','x_cm','y_cm','width_cm','height_cm'] loop
  if jsonb_typeof(e->f) is distinct from 'number' or coalesce(e->>f,'') !~ '^-?[0-9]{1,5}$' then return false;end if;
  v:=(e->>f)::integer;
  if f='floor' and v not between -5 and 100 or f in ('x_cm','y_cm') and v not between 0 and 50000 or f in ('width_cm','height_cm') and v not between 1 and 20000 then return false;end if;
 end loop;
 return (e->>'x_cm')::integer+(e->>'width_cm')::integer<=50000 and (e->>'y_cm')::integer+(e->>'height_cm')::integer<=50000;
end $$;
revoke all on function public.nw_room_geometry_valid(jsonb) from public,anon,authenticated;
create or replace function public.nw_room_layout_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $rl$
declare k text:=e->>'key';kind text:=e->>'life_kind';s text:=coalesce(e->>'status','');old jsonb:=st->'life'->k;r jsonb;other jsonb;a jsonb;b jsonb;rid text:=e->>'room_id';oid text:=e->>'other_room_id';
begin
 if not public.nw_story_text_valid(e->'actor',140) or coalesce(e->>'home_kind','') not in ('estate','lease') or not public.nw_home_id(e->'home_id') or not public.nw_home_id(e->'room_id') or e->>'title_revision' is not null and (e->>'home_kind'<>'estate' or not public.nw_home_id(e->'title_revision')) or not public.nw_room_layout_access(st,e,rid) then raise exception 'Room measurement requires current observed access';end if;
 if kind='room_layout' then
  if not public.nw_room_geometry_valid(e) or s not in ('recorded','withdrawn') or old is not null and not public.nw_life_same_fields(old,e,array['home_kind','home_id','room_id']) then raise exception 'Invalid room geometry or identity';end if;
  if s='withdrawn' then
   if old is null or old->>'status'<>'recorded' or not public.nw_life_same_fields(old,e,array['actor','home_kind','home_id','title_revision','floor','x_cm','y_cm','width_cm','height_cm']) then raise exception 'Withdraw current room geometry only';end if;
  else
   for r in select value from jsonb_each(st->'life') x where x.key<>k and value->>'life_kind'='room_layout' and value->>'status'='recorded' and public.nw_life_same_fields(value,e,array['actor','home_kind','home_id','title_revision']) and public.nw_room_layout_access(st,value,value->>'room_id') loop
    if r->>'room_id'=rid then raise exception 'Duplicate room geometry';end if;
    if r->>'floor'=e->>'floor' and (r->>'x_cm')::integer<(e->>'x_cm')::integer+(e->>'width_cm')::integer and (e->>'x_cm')::integer<(r->>'x_cm')::integer+(r->>'width_cm')::integer and (r->>'y_cm')::integer<(e->>'y_cm')::integer+(e->>'height_cm')::integer and (e->>'y_cm')::integer<(r->>'y_cm')::integer+(r->>'height_cm')::integer then raise exception 'Room rectangles overlap';end if;
   end loop;
   for r in select value from jsonb_each(st->'life') where value->>'life_kind'='room_connection' and value->>'status' in ('open','closed') and public.nw_life_same_fields(value,e,array['actor','home_kind','home_id','title_revision']) and (value->>'room_id'=rid or value->>'other_room_id'=rid) and public.nw_room_layout_access(st,value,value->>'room_id') and public.nw_room_layout_access(st,value,value->>'other_room_id') loop
    oid:=case when r->>'room_id'=rid then r->>'other_room_id' else r->>'room_id' end;
    select value into other from jsonb_each(st->'life') where value->>'life_kind'='room_layout' and value->>'status'='recorded' and value->>'room_id'=oid and public.nw_life_same_fields(value,e,array['actor','home_kind','home_id','title_revision']) limit 1;
    if other is not null and ((r->>'connection_kind'='stairs' and e->>'floor'=other->>'floor') or (r->>'connection_kind'<>'stairs' and e->>'floor'<>other->>'floor')) then raise exception 'Update incompatible room link first';end if;
   end loop;
  end if;
 elsif kind='room_connection' then
  if not public.nw_home_id(e->'other_room_id') or oid=rid or not public.nw_room_layout_access(st,e,oid) or coalesce(e->>'connection_kind','') not in ('doorway','passage','stairs') or s not in ('open','closed','removed') or old is not null and not public.nw_life_same_fields(old,e,array['home_kind','home_id','room_id','other_room_id','connection_kind']) then raise exception 'Invalid room connection';end if;
  if s='removed' then
   if old is null or old->>'status' not in ('open','closed') or not public.nw_life_same_fields(old,e,array['actor','home_kind','home_id','title_revision']) then raise exception 'Remove current room connection only';end if;
  else
   if exists(select 1 from jsonb_each(st->'life') x where x.key<>k and value->>'life_kind'='room_connection' and value->>'status' in ('open','closed') and public.nw_life_same_fields(value,e,array['actor','home_kind','home_id','title_revision']) and ((value->>'room_id'=rid and value->>'other_room_id'=oid) or (value->>'room_id'=oid and value->>'other_room_id'=rid))) then raise exception 'Duplicate room link';end if;
   select value into a from jsonb_each(st->'life') where value->>'life_kind'='room_layout' and value->>'status'='recorded' and value->>'room_id'=rid and public.nw_life_same_fields(value,e,array['actor','home_kind','home_id','title_revision']) limit 1;
   select value into b from jsonb_each(st->'life') where value->>'life_kind'='room_layout' and value->>'status'='recorded' and value->>'room_id'=oid and public.nw_life_same_fields(value,e,array['actor','home_kind','home_id','title_revision']) limit 1;
   if a is not null and b is not null and ((e->>'connection_kind'='stairs' and a->>'floor'=b->>'floor') or (e->>'connection_kind'<>'stairs' and a->>'floor'<>b->>'floor')) then raise exception 'Room link incompatible with floors';end if;
  end if;
 else raise exception 'Unknown room layout record';end if;
 return jsonb_set(st,array['life',k],e,true);
end $rl$;
revoke all on function public.nw_room_layout_step(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.nw_player_life_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $life$
declare k text:=e->>'key'; kind text:=e->>'life_kind'; old jsonb; other jsonb; field text; val jsonb; item text; garment jsonb;
 slots constant text[]:=array['head','face','upper','outer','lower','feet','hands','accessory'];
begin
 if not (e?'player_life_version') and coalesce(k,'') not like 'player-life:%' then
  if e->>'type'='character' and e->'state_patch'?'birth_date' and exists(select 1 from jsonb_each(st->'life') x where x.value->>'life_kind'='child_birth' and x.value->>'actor'=trim(e->>'name') and x.value->'born_on' is distinct from e->'state_patch'->'birth_date') then raise exception 'Recorded birth date cannot change';end if;
  if e->>'type'='item' then st:=jsonb_set(st,'{economy}',public.nw_economy_step(st->'economy',e));st:=public.nw_furnishing_invalidate(st,e); end if;
  if e->>'dynamics_kind'='employment' and e->'dynamics_version'='1'::jsonb then perform public.nw_employment_requirements(st,e);st:=jsonb_set(st,array['jobs',e->>'record_id'],e,true);end if;
  if (e->'dynamics_version'='1'::jsonb and e->>'dynamics_kind' in ('economic_agreement','payment_schedule','institution','enterprise','family_duty','family_event','bond')) or e->'consequence_version'='1'::jsonb or (e->'activity_version'='1'::jsonb and e->>'activity_kind'='activity') or (e->'growth_version'='1'::jsonb and e->>'growth_kind'='skill') or (e->'social_record_version'='1'::jsonb and e->>'social_kind' in ('group','membership')) then st:=jsonb_set(st,array['refs',k],e,true);end if;
  return st;
 end if;
 if e->>'type' is distinct from 'world' or e->'player_life_version' is distinct from '1'::jsonb
  or coalesce(kind,'') not in ('need','garment','outfit','letter','preset','appointment','impression','journey','venue_service','service_visit','discovery','work_shift','wage','service_recipe','transit_notice','lease','home_condition','budget','capacity_slot','reservation','enrollment','assessment','practice_record','reputation','invitation','health_episode','estate','estate_sale','estate_condition','transport_ticket','lesson','assignment','market_adjustment','market_observation','furnishing','ticket_payment','study_program','program_enrollment','module_result','qualification','supply_contract','household','household_member','household_contribution','job_requirement','care_record','household_task','career_change','consequence_response','household_expense','expense_share','care_plan','child_birth','child_milestone','shared_goal','shared_goal_member','shared_goal_step','room','civic_office','civic_case','civic_notice','civic_submission','civic_decision','civic_motion','civic_ballot','community_event','community_participation','community_result','community_report','room_layout','room_connection') or coalesce(e->>'record_id','') !~ '^[A-Za-z0-9_-]{1,80}$'
  or jsonb_typeof(e->'record_id') is distinct from 'string' or k is distinct from ('player-life:'||kind||':'||(e->>'record_id'))
  or num_nonnulls(e->'world_record_version',e->'social_record_version',e->'interaction_version',e->'activity_version',e->'consequence_version',e->'growth_version',e->'dynamics_version')<>0
  then raise exception 'Invalid player life identity';end if;
 if kind in ('room_layout','room_connection') then return public.nw_room_layout_step(st,e);end if;
 if kind in ('room','civic_office','civic_case','civic_notice','civic_submission','civic_decision','civic_motion','civic_ballot','community_event','community_participation','community_result','community_report') then return public.nw_civic_community_step(st,e);end if;
 if kind in ('child_birth','child_milestone','shared_goal','shared_goal_member','shared_goal_step') then return public.nw_family_goal_step(st,e);end if;
 if kind in ('household_expense','expense_share','care_plan') then return public.nw_expense_care_step(st,e);end if;
 if kind in ('household_task','career_change','consequence_response') then return public.nw_duty_career_step(st,e);end if;
 if kind in ('household','household_member','household_contribution','job_requirement','care_record') then return public.nw_household_step(st,e);end if;
 if kind in ('study_program','program_enrollment','module_result','qualification','supply_contract') then return public.nw_curriculum_supply_step(st,e);end if;
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
