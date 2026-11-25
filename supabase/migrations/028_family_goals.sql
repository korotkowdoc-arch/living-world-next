-- Birth dates and milestones use the fictional calendar; goals require actual participation.
create or replace function public.nw_family_goal_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $fg$
declare k text:=e->>'key';kind text:=e->>'life_kind';status text:=coalesce(e->>'status','');old jsonb:=st->'life'->k;a jsonb;b jsonb;m jsonb;f text;child text;parent text;expected text;
begin
 if not public.nw_story_text_valid(e->'actor',140) or (old is not null and old->'actor' is distinct from e->'actor') then raise exception 'Invalid family/goal actor';end if;
 if kind='child_birth' then
  if old is not null or not public.nw_story_text_valid(e->'parent',140) or e->'parent'=e->'actor' or coalesce(e->>'born_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not public.nw_home_id(e->'family_event_id') or status<>'recorded' then raise exception 'Invalid birth record';end if;
  perform public.nw_work_minute(to_jsonb((e->>'born_on')||' 00:00'));
  child:=e->>'actor';parent:=e->>'parent';
  a:=st->'refs'->('dynamics:family_event:'||(e->>'family_event_id'));
  if a is null or a->>'family_kind'<>'birth' or a->>'status'<>'completed' or not coalesce(a->'actors' @> jsonb_build_array(child,parent),false) or exists(select 1 from jsonb_each(st->'life') x where x.value->>'life_kind'='child_birth' and (x.value->'actor'=e->'actor' or x.value->'family_event_id'=e->'family_event_id')) then raise exception 'Birth needs distinct completed event';end if;
 elsif kind='child_milestone' then
  if old is not null or not public.nw_home_id(e->'child_id') or not public.nw_home_id(e->'family_event_id') or coalesce(e->>'occurred_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not public.nw_story_text_valid(e->'title',200) or coalesce(e->>'category','') not in ('care','education','birthday','development','other') or not public.nw_story_text_valid(e->'description',600) or status<>'recorded' then raise exception 'Invalid child milestone';end if;
  perform public.nw_work_minute(to_jsonb((e->>'occurred_on')||' 00:00'));
  a:=st->'life'->('player-life:child_birth:'||(e->>'child_id'));b:=st->'refs'->('dynamics:family_event:'||(e->>'family_event_id'));
  child:=a->>'actor';parent:=e->>'actor';
  expected:=case when e->>'category'='development' then 'other' else e->>'category' end;
  if a is null or b is null or e->>'occurred_on'<a->>'born_on' or b->>'status'<>'completed' or b->>'family_kind' is distinct from expected or not coalesce(b->'actors' @> jsonb_build_array(child,parent),false) or exists(select 1 from jsonb_each(st->'life') x where x.value->>'life_kind'='child_milestone' and x.value->'family_event_id'=e->'family_event_id') then raise exception 'Milestone needs matching child and family event';end if;
 elsif kind='shared_goal' then
  if not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'description',600) or jsonb_typeof(e->'steps') is distinct from 'array' or status not in ('proposed','active','completed','cancelled') or (status in ('completed','cancelled') and not public.nw_story_text_valid(e->'outcome',600)) then raise exception 'Invalid shared goal';end if;
  if coalesce(e->>'due_at','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then perform public.nw_work_minute(to_jsonb((e->>'due_at')||' 00:00'));else perform public.nw_work_minute(e->'due_at');end if;
  if jsonb_array_length(e->'steps') not between 1 and 12 or (select count(distinct value->>'id') from jsonb_array_elements(e->'steps'))<>jsonb_array_length(e->'steps') then raise exception 'Invalid goal step count';end if;
  for m in select value from jsonb_array_elements(e->'steps') loop
   if jsonb_typeof(m) is distinct from 'object' or (m-'id'-'title')<>'{}'::jsonb or not public.nw_home_id(m->'id') or not public.nw_story_text_valid(m->'title',200) then raise exception 'Invalid goal step';end if;
  end loop;
  if old is null then
   if status<>'proposed' then raise exception 'Goal starts as proposal';end if;
  else
   foreach f in array array['title','description','due_at','steps'] loop
    if old->f is distinct from e->f then raise exception 'Goal identity immutable';end if;
   end loop;
   if not(case old->>'status' when 'proposed' then status in ('active','cancelled') when 'active' then status in ('completed','cancelled') else false end) then raise exception 'Invalid shared goal transition';end if;
  end if;
  if status in ('active','completed') and not exists(select 1 from jsonb_each(st->'life') x where x.value->>'life_kind'='shared_goal_member' and x.value->'goal_id'=e->'record_id' and x.value->>'status'='accepted') then raise exception 'Goal requires another accepted participant';end if;
  if status='completed' then
   for m in select value from jsonb_array_elements(e->'steps') loop
    if not exists(select 1 from jsonb_each(st->'life') x where x.value->>'life_kind'='shared_goal_step' and x.value->'goal_id'=e->'record_id' and x.value->'step_id'=m->'id') then raise exception 'Goal step not completed';end if;
   end loop;
  end if;
 elsif kind='shared_goal_member' then
  if not public.nw_home_id(e->'goal_id') or not public.nw_story_text_valid(e->'organizer',140) or e->'actor'=e->'organizer' or status not in ('invited','accepted','declined','left','removed') or (status<>'invited' and not public.nw_story_text_valid(e->'outcome',600)) then raise exception 'Invalid goal invitation';end if;
  a:=st->'life'->('player-life:shared_goal:'||(e->>'goal_id'));
  if a is null or a->'actor' is distinct from e->'organizer' or a->>'status' not in ('proposed','active') then raise exception 'Invitation requires open goal';end if;
  if old is null then
   if status<>'invited' or exists(select 1 from jsonb_each(st->'life') x where x.value->>'life_kind'='shared_goal_member' and x.value->'goal_id'=e->'goal_id' and x.value->'actor'=e->'actor' and x.value->>'status' in ('invited','accepted')) then raise exception 'One open invitation per participant';end if;
  else
   if old->'goal_id' is distinct from e->'goal_id' or old->'organizer' is distinct from e->'organizer' or not(case old->>'status' when 'invited' then status in ('accepted','declined','removed') when 'accepted' then status in ('left','removed') else false end) then raise exception 'Invalid goal member transition';end if;
  end if;
 elsif kind='shared_goal_step' then
  if old is not null or not public.nw_home_id(e->'goal_id') or not public.nw_home_id(e->'step_id') or not public.nw_home_id(e->'completion_id') or coalesce(e->>'completion_kind','') not in ('activity','family_event') or not public.nw_story_text_valid(e->'outcome',600) or status<>'completed' then raise exception 'Invalid goal step';end if;
  a:=st->'life'->('player-life:shared_goal:'||(e->>'goal_id'));b:=st->'refs'->((case e->>'completion_kind' when 'activity' then 'activity:activity:' else 'dynamics:family_event:' end)||(e->>'completion_id'));
  if a is null or b is null or a->>'status'<>'active' or b->>'status'<>'completed' or not coalesce(b->'actors' @> jsonb_build_array(e->'actor'),false) or not public.nw_story_text_valid(b->'outcome',600) or not exists(select 1 from jsonb_array_elements(a->'steps') x where x->'id'=e->'step_id') or not exists(select 1 from jsonb_each(st->'life') x where x.value->>'life_kind'='shared_goal_member' and x.value->'goal_id'=e->'goal_id' and x.value->>'status'='accepted') or (a->'actor' is distinct from e->'actor' and not exists(select 1 from jsonb_each(st->'life') x where x.value->>'life_kind'='shared_goal_member' and x.value->'goal_id'=e->'goal_id' and x.value->'actor'=e->'actor' and x.value->>'status'='accepted')) or exists(select 1 from jsonb_each(st->'life') x where x.value->>'life_kind'='shared_goal_step' and x.value->'goal_id'=e->'goal_id' and (x.value->'step_id'=e->'step_id' or (x.value->'completion_kind'=e->'completion_kind' and x.value->'completion_id'=e->'completion_id'))) then raise exception 'Step requires active goal and unique participant completion';end if;
 else raise exception 'Unknown family goal record';end if;
 if kind in ('child_birth','child_milestone') and not exists(select 1 from jsonb_each(st->'refs') x where x.value->>'dynamics_kind'='bond' and x.value->>'bond_type'='parenthood' and x.value->>'actor'=parent and x.value->>'counterparty'=child and x.value->>'status' in ('active','strained','estranged')) then raise exception 'Family record requires confirmed parenthood';end if;
 return jsonb_set(st,array['life',k],e,true);
end $fg$;
revoke all on function public.nw_family_goal_step(jsonb,jsonb) from public,anon,authenticated;
create or replace function public.nw_family_goal_clock(p_events jsonb,p_world_time text)
returns void language plpgsql immutable security invoker set search_path='' as $fg$
declare e jsonb; i bigint; stamp text;
begin
 for e,i in select value,ordinality from jsonb_array_elements(p_events) with ordinality loop
  if e->'player_life_version' is distinct from '1'::jsonb then continue;end if;
  if e->>'life_kind' in ('child_birth','child_milestone') then
   stamp:=trim(p_world_time);
   if stamp is null or stamp !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}([ T][0-9]{2}:[0-9]{2})?$' or left(stamp,10) is distinct from coalesce(e->>'born_on',e->>'occurred_on') then raise exception 'Family record requires exact scene date';end if;
   perform public.nw_work_minute(to_jsonb(case when length(stamp)=10 then stamp||' 00:00' else replace(stamp,'T',' ') end));
   if not exists(select 1 from jsonb_array_elements(p_events) with ordinality x(value,idx) where idx<i and x.value->'dynamics_version'='1'::jsonb and x.value->>'dynamics_kind'='family_event' and x.value->'record_id'=e->'family_event_id' and x.value->>'status'='completed') then raise exception 'Family event must be completed in same scene';end if;
  elsif e->>'life_kind'='shared_goal_step' and not exists(select 1 from jsonb_array_elements(p_events) with ordinality x(value,idx) where idx<i and x.value->'record_id'=e->'completion_id' and x.value->>'status'='completed' and ((e->>'completion_kind'='activity' and x.value->'activity_version'='1'::jsonb and x.value->>'activity_kind'='activity') or (e->>'completion_kind'='family_event' and x.value->'dynamics_version'='1'::jsonb and x.value->>'dynamics_kind'='family_event'))) then raise exception 'Goal step requires actual same-scene completion';end if;
 end loop;
end $fg$;
revoke all on function public.nw_family_goal_clock(jsonb,text) from public,anon,authenticated;

create or replace function public.nw_player_life_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $life$
declare k text:=e->>'key'; kind text:=e->>'life_kind'; old jsonb; other jsonb; field text; val jsonb; item text; garment jsonb;
 slots constant text[]:=array['head','face','upper','outer','lower','feet','hands','accessory'];
begin
 if not (e?'player_life_version') and coalesce(k,'') not like 'player-life:%' then
  if e->>'type'='item' then st:=jsonb_set(st,'{economy}',public.nw_economy_step(st->'economy',e));st:=public.nw_furnishing_invalidate(st,e); end if;
  if e->>'dynamics_kind'='employment' and e->'dynamics_version'='1'::jsonb then perform public.nw_employment_requirements(st,e);st:=jsonb_set(st,array['jobs',e->>'record_id'],e,true);end if;
  if (e->'dynamics_version'='1'::jsonb and e->>'dynamics_kind' in ('economic_agreement','payment_schedule','institution','enterprise','family_duty','family_event','bond')) or e->'consequence_version'='1'::jsonb or (e->'activity_version'='1'::jsonb and e->>'activity_kind'='activity') or (e->'growth_version'='1'::jsonb and e->>'growth_kind'='skill') or (e->'social_record_version'='1'::jsonb and e->>'social_kind'='group') then st:=jsonb_set(st,array['refs',k],e,true);end if;
  return st;
 end if;
 if e->>'type' is distinct from 'world' or e->'player_life_version' is distinct from '1'::jsonb
  or coalesce(kind,'') not in ('need','garment','outfit','letter','preset','appointment','impression','journey','venue_service','service_visit','discovery','work_shift','wage','service_recipe','transit_notice','lease','home_condition','budget','capacity_slot','reservation','enrollment','assessment','practice_record','reputation','invitation','health_episode','estate','estate_sale','estate_condition','transport_ticket','lesson','assignment','market_adjustment','market_observation','furnishing','ticket_payment','study_program','program_enrollment','module_result','qualification','supply_contract','household','household_member','household_contribution','job_requirement','care_record','household_task','career_change','consequence_response','household_expense','expense_share','care_plan','child_birth','child_milestone','shared_goal','shared_goal_member','shared_goal_step') or coalesce(e->>'record_id','') !~ '^[A-Za-z0-9_-]{1,80}$'
  or jsonb_typeof(e->'record_id') is distinct from 'string' or k is distinct from ('player-life:'||kind||':'||(e->>'record_id'))
  or num_nonnulls(e->'world_record_version',e->'social_record_version',e->'interaction_version',e->'activity_version',e->'consequence_version',e->'growth_version',e->'dynamics_version')<>0
  then raise exception 'Invalid player life identity';end if;
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











create or replace function public.nw_commit_scene(
 p_world_id uuid,p_branch_id uuid,p_expected_head uuid,p_request_id uuid,p_body text,
 p_world_time text default null,p_events jsonb default '[]'::jsonb,p_expected_rules_version integer default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); current_head uuid; world_branch uuid; actual_rules_version integer;
 existing public.nw_scenes%rowtype; new_id uuid := gen_random_uuid(); e jsonb; seen_ids text[] := array[]::text[];
begin
 if u is null then raise exception 'Authentication required'; end if;
 if p_request_id is null then raise exception 'Missing idempotency key'; end if;
 select * into existing from public.nw_scenes where world_id=p_world_id and request_id=p_request_id and owner_id=u;
 if found then
  if existing.branch_id=p_branch_id and existing.parent_scene_id is not distinct from p_expected_head
     and existing.body=p_body and existing.events=coalesce(p_events,'[]'::jsonb)
     and existing.world_time is not distinct from nullif(trim(p_world_time),'')
     and (existing.rules_version_at_commit is null or existing.rules_version_at_commit=p_expected_rules_version)
   then return existing.id;
  end if;
  raise exception 'Idempotency key reused for different content';
 end if;
 select active_branch_id,directive_version into world_branch,actual_rules_version from public.nw_worlds where id=p_world_id and owner_id=u for update;
 if not found or world_branch is distinct from p_branch_id then raise exception 'Not the active branch'; end if;
 select head_scene_id into current_head from public.nw_branches
 where id=p_branch_id and world_id=p_world_id and owner_id=u for update;
 if not found then raise exception 'Branch not found'; end if;
 -- Concurrent retry of the same request may have committed while we waited for row locks.
 select * into existing from public.nw_scenes where world_id=p_world_id and request_id=p_request_id and owner_id=u;
 if found then
  if existing.branch_id=p_branch_id and existing.parent_scene_id is not distinct from p_expected_head
     and existing.body=p_body and existing.events=coalesce(p_events,'[]'::jsonb)
     and existing.world_time is not distinct from nullif(trim(p_world_time),'')
     and (existing.rules_version_at_commit is null or existing.rules_version_at_commit=p_expected_rules_version) then return existing.id; end if;
  raise exception 'Idempotency key reused for different content';
 end if;
 if p_expected_rules_version is null or p_expected_rules_version<>actual_rules_version then raise exception 'World rules changed: fetch context before committing'; end if;
 if current_head is distinct from p_expected_head then raise exception 'Head changed: refresh story before committing'; end if;
 if char_length(trim(coalesce(p_body,''))) not between 10 and 200000 then raise exception 'Invalid scene text'; end if;
 if jsonb_typeof(coalesce(p_events,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_events,'[]'::jsonb)) > 100 then raise exception 'Invalid scene events'; end if;
 for e in select value from jsonb_array_elements(coalesce(p_events,'[]'::jsonb)) loop
  if jsonb_typeof(e)<>'object' or nullif(trim(e->>'id'),'') is null or nullif(trim(e->>'type'),'') is null
     or nullif(trim(e->>'evidence'),'') is null or position(e->>'evidence' in p_body)=0 then
   raise exception 'Event without exact evidence in scene';
  end if;
  if not (e->>'type' in ('character','relationship','knowledge','money','item','commitment','world','offscreen','plan')) then
   raise exception 'Unknown event type';
  end if;
  if (e->>'id')=any(seen_ids) then raise exception 'Duplicate scene event id'; end if;
  seen_ids := array_append(seen_ids,e->>'id');
  if e->>'dynamics_kind'='player_choice' then
   if e->>'type' is distinct from 'world' or e->'dynamics_version' is distinct from '1'::jsonb then raise exception 'Invalid player choice event type'; end if;
   if e->>'status'='pending' and right(rtrim(p_body,E' \t\r\n'),char_length(e->>'evidence')) is distinct from (e->>'evidence') then raise exception 'Pending choice must end the scene'; end if;
  end if;
  perform public.nw_assert_story_event_shape(e);
  if e->>'type'='plan' then
    if nullif(trim(e->>'actor'),'') is null or nullif(trim(e->>'plan_id'),'') is null or
       coalesce(e->>'action','') not in ('start','advance','pause','resume','complete','abandon')
       then raise exception 'Invalid actor plan'; end if;
    if e->>'action'='start' and nullif(trim(e->>'goal'),'') is null
       then raise exception 'New plan requires a character goal'; end if;
    if e->>'action'='complete' and not exists(
      select 1 from jsonb_array_elements(p_events) a(value)
      where a.value->>'id'=e->>'performed_event_id' and a.value->>'type' in ('world','offscreen') and a.value->>'dynamics_kind' is distinct from 'player_choice'
    ) then raise exception 'Plan completion requires a performed world/offscreen event'; end if;
  end if;
  if e->>'type'='money' and (
    nullif(trim(e->>'actor'),'') is null or nullif(trim(e->>'currency'),'') is null or
    jsonb_typeof(e->'delta')<>'number' or (e->>'delta') !~ '^-?[0-9]+$'
  ) then raise exception 'Money change requires exact integer and actor/currency'; end if;
  if e->>'type'='knowledge' and (
    nullif(trim(e->>'actor'),'') is null or nullif(trim(e->>'fact'),'') is null or nullif(trim(e->>'channel'),'') is null
  ) then raise exception 'Knowledge requires actor, fact and channel'; end if;
  -- Each active user-authored lock can independently forbid reconciliation or respect.
  if e->>'type'='relationship' and exists (
    select 1 from public.nw_directives d
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(d.metadata->'relationship_locks')='array'
        then d.metadata->'relationship_locks'
        when jsonb_typeof(d.metadata->'relationship_lock')='object'
        then jsonb_build_array(d.metadata->'relationship_lock')
        else '[]'::jsonb end
    ) as locks(item)
    where d.world_id=p_world_id and d.owner_id=u and d.active=true
    and (
      (lower(btrim(locks.item->>'a'))=lower(btrim(e->>'a')) and lower(btrim(locks.item->>'b'))=lower(btrim(e->>'b'))) or
      (lower(btrim(locks.item->>'a'))=lower(btrim(e->>'b')) and lower(btrim(locks.item->>'b'))=lower(btrim(e->>'a')))
    )
    and (
      (locks.item->>'forbid_reconciliation'='true' and (e->>'stance' in ('friends','reconciled','peace','close_friends','romantic_partners') or e->'relationship_patch'->>'affection'='affectionate')) or
      (locks.item->>'forbid_respect'='true' and (e->>'stance' in ('respect','admiration') or e->>'respect'='true' or e->'relationship_patch'->>'respect'='respected'))
    )
  ) then raise exception 'Explicit relationship lock violated'; end if;
 end loop;
 perform public.nw_assert_economy_append(p_world_id,current_head,coalesce(p_events,'[]'::jsonb));
 perform public.nw_assert_story_transitions(p_world_id,current_head,coalesce(p_events,'[]'::jsonb));
 perform public.nw_family_goal_clock(coalesce(p_events,'[]'::jsonb),p_world_time);
 perform public.nw_assert_player_life_append(p_world_id,current_head,coalesce(p_events,'[]'::jsonb));
 insert into public.nw_scenes(id,owner_id,world_id,branch_id,parent_scene_id,request_id,body,world_time,events,rules_version_at_commit)
 values(new_id,u,p_world_id,p_branch_id,current_head,p_request_id,p_body,nullif(trim(p_world_time),''),coalesce(p_events,'[]'::jsonb),actual_rules_version);
 update public.nw_branches set head_scene_id=new_id where id=p_branch_id;
 update public.nw_worlds set updated_at=now() where id=p_world_id;
 return new_id;
end $$;
revoke all on function public.nw_commit_scene(uuid,uuid,uuid,uuid,text,text,jsonb,integer) from public,anon;
grant execute on function public.nw_commit_scene(uuid,uuid,uuid,uuid,text,text,jsonb,integer) to authenticated;
