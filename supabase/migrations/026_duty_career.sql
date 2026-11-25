-- Household responsibilities, career transitions, consequence responses.
create or replace function public.nw_duty_career_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $dc$
declare k text:=e->>'key'; kind text:=e->>'life_kind'; status text:=coalesce(e->>'status',''); old jsonb:=st->'life'->k; a jsonb;b jsonb;c jsonb; f text; scheduled date; starts date; step_days integer;
begin
 if not public.nw_story_text_valid(e->'actor',140) or not public.nw_story_text_valid(e->'title',200) or (old is not null and old->'actor' is distinct from e->'actor') then raise exception 'Invalid duty or career actor/title';end if;
 if status not in ('proposed','planned') and not public.nw_story_text_valid(e->'outcome',600) then raise exception 'Explicit response outcome required';end if;
 if kind='household_task' then
  if not public.nw_home_id(e->'household_id') or not public.nw_home_id(e->'duty_id') or not public.nw_story_text_valid(e->'host',140) or coalesce(e->>'scheduled_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or status not in ('proposed','accepted','declined','completed','missed','cancelled') then raise exception 'Invalid household task';end if;
  perform public.nw_work_minute(to_jsonb((e->>'scheduled_on')||' 00:00'));
  if (status in ('completed','missed') and not public.nw_home_id(e->'family_event_id')) or (status not in ('completed','missed') and e->>'family_event_id' is not null) then raise exception 'Task requires matching event';end if;
  a:=st->'life'->('player-life:household:'||(e->>'household_id'));b:=st->'refs'->('dynamics:family_duty:'||(e->>'duty_id'));
  if a is null or b is null or a->'actor' is distinct from e->'host' or not coalesce(b->'actors' @> jsonb_build_array(e->'actor',e->'host'),false) then raise exception 'Task requires matching household and duty';end if;
  scheduled:=(e->>'scheduled_on')::date;starts:=(b->>'starts_on')::date;step_days:=(b->>'every_days')::integer;
  if scheduled<starts or (b->>'ends_on' is not null and scheduled>(b->>'ends_on')::date) or mod(scheduled-starts,step_days)<>0 then raise exception 'Task date not in duty schedule';end if;
  if status in ('proposed','accepted','completed') and (not public.nw_household_accessible(st,a) or (a->'actor' is distinct from e->'actor' and not exists(select 1 from jsonb_each(st->'life') x where x.value->>'life_kind'='household_member' and x.value->'household_id'=e->'household_id' and x.value->'actor'=e->'actor' and x.value->>'status'='joined'))) then raise exception 'Task requires accessible household membership';end if;
  if old is null then
   if status<>'proposed' or b->>'status'<>'active' or exists(select 1 from jsonb_each(st->'life') x where x.value->>'life_kind'='household_task' and x.value->'duty_id'=e->'duty_id' and x.value->'scheduled_on'=e->'scheduled_on' and x.value->>'status' in ('proposed','accepted','completed','missed')) or exists(select 1 from jsonb_each(st->'refs') x where x.value->>'dynamics_kind'='family_event' and x.value->'duty_id'=e->'duty_id' and x.value->'scheduled_on'=e->'scheduled_on' and x.value->>'status' in ('completed','cancelled')) then raise exception 'Task needs unique available duty occurrence';end if;
  else
   foreach f in array array['title','household_id','duty_id','host','scheduled_on'] loop
    if old->f is distinct from e->f then raise exception 'Changed household task identity';end if;
   end loop;
   if not(case old->>'status' when 'proposed' then status in ('accepted','declined','cancelled') when 'accepted' then status in ('completed','missed','cancelled') else false end) then raise exception 'Invalid task transition';end if;
  end if;
  if status in ('completed','missed') then
   c:=st->'refs'->('dynamics:family_event:'||(e->>'family_event_id'));
   if c is null or c->'duty_id' is distinct from e->'duty_id' or c->'scheduled_on' is distinct from e->'scheduled_on' or c->>'status' is distinct from (case status when 'completed' then 'completed' else 'cancelled' end) then raise exception 'Task outcome must match family event';end if;
  end if;
 elsif kind='career_change' then
  if not public.nw_home_id(e->'previous_job_id') or coalesce(e->>'change_kind','') not in ('promotion','transfer','new_employer','resignation','dismissal','retirement') or status not in ('proposed','completed','cancelled') then raise exception 'Invalid career change';end if;
  if e->>'change_kind' in ('promotion','transfer','new_employer') then
   if not public.nw_home_id(e->'next_job_id') or e->'next_job_id'=e->'previous_job_id' then raise exception 'Career change requires separate job';end if;
  elsif e->>'next_job_id' is not null then raise exception 'Job exit must not have next job';end if;
  a:=st->'jobs'->(e->>'previous_job_id');b:=st->'jobs'->(e->>'next_job_id');
  if a is null or a->'actor' is distinct from e->'actor' or (e->>'next_job_id' is not null and (b is null or b->'actor' is distinct from e->'actor')) or (b is not null and ((e->>'change_kind'='new_employer')=(a->'counterparty'=b->'counterparty'))) then raise exception 'Career change requires matching jobs';end if;
  if old is null then
   if status<>'proposed' or a->>'status' not in ('active','suspended') or (b is not null and b->>'status'<>'offered') or exists(select 1 from jsonb_each(st->'life') x where x.value->>'life_kind'='career_change' and x.value->>'status'='proposed' and (x.value->'previous_job_id'=e->'previous_job_id' or (e->>'next_job_id' is not null and x.value->'next_job_id'=e->'next_job_id'))) then raise exception 'Career change requires existing job and available offer';end if;
  else
   if old->>'status'<>'proposed' or status not in ('completed','cancelled') then raise exception 'Invalid career transition';end if;
   foreach f in array array['title','change_kind','previous_job_id','next_job_id'] loop
    if old->>f is distinct from e->>f then raise exception 'Career identity immutable';end if;
   end loop;
  end if;
  if status='completed' and (a->>'status'<>'ended' or (b is not null and b->>'status'<>'active') or exists(select 1 from jsonb_each(st->'life') x where x.value->>'life_kind'='work_shift' and x.value->'employment_id'=e->'previous_job_id' and x.value->>'status' in ('scheduled','working'))) then raise exception 'Close old job and shifts, activate new job first';end if;
 elsif kind='consequence_response' then
  if not public.nw_home_id(e->'consequence_id') or not public.nw_story_text_valid(e->'action_description',600) or status not in ('planned','performed','cancelled') or (status='performed' and coalesce(e->>'result','') not in ('attempted','resolved')) or (status<>'performed' and e->>'result' is not null) then raise exception 'Invalid consequence response';end if;
  if coalesce(e->>'due_at','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then perform public.nw_work_minute(to_jsonb((e->>'due_at')||' 00:00'));else perform public.nw_work_minute(e->'due_at');end if;
  a:=st->'refs'->('consequence:'||(e->>'consequence_id'));
  if a is null or (a->'actor' is distinct from e->'actor' and a->'responsible' is distinct from e->'actor') then raise exception 'Response needs participant in consequence';end if;
  if old is null then
   if status<>'planned' or a->>'status'='resolved' or exists(select 1 from jsonb_each(st->'life') x where x.value->>'life_kind'='consequence_response' and x.value->'actor'=e->'actor' and x.value->'consequence_id'=e->'consequence_id' and x.value->>'status'='planned') then raise exception 'One open response per participant';end if;
  else
   if old->>'status'<>'planned' or status not in ('performed','cancelled') then raise exception 'Invalid response transition';end if;
   foreach f in array array['title','consequence_id','due_at','action_description'] loop
    if old->f is distinct from e->f then raise exception 'Response identity immutable';end if;
   end loop;
  end if;
  if status='performed' and e->>'result'='resolved' and a->>'status'<>'resolved' then raise exception 'Resolution requires recorded consequence resolution';end if;
 else raise exception 'Unknown duty or career record';end if;
 return jsonb_set(st,array['life',k],e,true);
end $dc$;
revoke all on function public.nw_duty_career_step(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.nw_player_life_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $life$
declare k text:=e->>'key'; kind text:=e->>'life_kind'; old jsonb; other jsonb; field text; val jsonb; item text; garment jsonb;
 slots constant text[]:=array['head','face','upper','outer','lower','feet','hands','accessory'];
begin
 if not (e?'player_life_version') and coalesce(k,'') not like 'player-life:%' then
  if e->>'type'='item' then st:=jsonb_set(st,'{economy}',public.nw_economy_step(st->'economy',e));st:=public.nw_furnishing_invalidate(st,e); end if;
  if e->>'dynamics_kind'='employment' and e->'dynamics_version'='1'::jsonb then perform public.nw_employment_requirements(st,e);st:=jsonb_set(st,array['jobs',e->>'record_id'],e,true);end if;
  if (e->'dynamics_version'='1'::jsonb and e->>'dynamics_kind' in ('economic_agreement','payment_schedule','institution','enterprise','family_duty','family_event')) or e->'consequence_version'='1'::jsonb or (e->'growth_version'='1'::jsonb and e->>'growth_kind'='skill') or (e->'social_record_version'='1'::jsonb and e->>'social_kind'='group') then st:=jsonb_set(st,array['refs',k],e,true);end if;
  return st;
 end if;
 if e->>'type' is distinct from 'world' or e->'player_life_version' is distinct from '1'::jsonb
  or coalesce(kind,'') not in ('need','garment','outfit','letter','preset','appointment','impression','journey','venue_service','service_visit','discovery','work_shift','wage','service_recipe','transit_notice','lease','home_condition','budget','capacity_slot','reservation','enrollment','assessment','practice_record','reputation','invitation','health_episode','estate','estate_sale','estate_condition','transport_ticket','lesson','assignment','market_adjustment','market_observation','furnishing','ticket_payment','study_program','program_enrollment','module_result','qualification','supply_contract','household','household_member','household_contribution','job_requirement','care_record','household_task','career_change','consequence_response') or coalesce(e->>'record_id','') !~ '^[A-Za-z0-9_-]{1,80}$'
  or jsonb_typeof(e->'record_id') is distinct from 'string' or k is distinct from ('player-life:'||kind||':'||(e->>'record_id'))
  or num_nonnulls(e->'world_record_version',e->'social_record_version',e->'interaction_version',e->'activity_version',e->'consequence_version',e->'growth_version',e->'dynamics_version')<>0
  then raise exception 'Invalid player life identity';end if;
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









create or replace function public.nw_assert_player_life_append(p_world uuid,p_head uuid,p_events jsonb)
returns void language plpgsql security invoker set search_path='' as $life$
declare u uuid:=auth.uid(); st jsonb:='{"life":{},"jobs":{},"refs":{},"economy":{"balances":{},"items":{}}}'; r record; e jsonb; seen integer:=0; old jsonb; t jsonb; used text[]:=array[]::text[]; transfers jsonb:='{}'; locations jsonb:='{}'; ref text; stock_ops jsonb:='{}'; used_stock text[]:=array[]::text[]; recipe jsonb; signature text; snapshot jsonb; snapshot_count integer:=0; total_count integer:=0; root_checked boolean:=false; event_position bigint; cancellation_kind text; cancellation_id text; linked jsonb; program jsonb; module jsonb;
begin
 if not exists(select 1 from jsonb_array_elements(p_events) x where x?'player_life_version' or x->>'key' like 'player-life:%' or x->>'dynamics_kind' in ('economic_agreement','employment','family_event')) then return;end if;
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
  if e->>'dynamics_kind'='stock_operation' and e->'dynamics_version'='1'::jsonb and e->>'stock_action' in ('consume','transfer') then stock_ops:=jsonb_set(stock_ops,array[e->>'id'],e,true);end if;
  if e->>'life_kind'='household_contribution' or (e->>'life_kind'='supply_contract' and e->>'status'='settled') or e->>'life_kind'='ticket_payment' or (e->>'life_kind'='estate_sale' and e->>'status'='settled' and (e->>'amount')::numeric>0) or (e->>'life_kind'='wage' and (e->>'amount')::numeric>0) or (e->>'life_kind'='service_visit' and e->>'status'='completed' and (e->>'amount')::numeric>0 and e->>'prepayment_id' is null) or (e->>'dynamics_kind'='payment_occurrence' and e->>'status'='paid') then
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
   if e->>'life_kind'='supply_contract' then
    t:=transfers->ref;
    if t is null or t->'actor' is distinct from e->'actor' or t->'counterparty' is distinct from e->'supplier' or t->'currency' is distinct from e->'currency' or (t->>'delta')::numeric is distinct from -(e->>'amount')::numeric then raise exception 'Supply requires exact payment';end if;
   end if;
   if e->>'life_kind'='household_contribution' then
    t:=transfers->ref;
    if t is null or t->'actor' is distinct from e->'actor' or t->'counterparty' is distinct from e->'host' or t->'currency' is distinct from e->'currency' or (t->>'delta')::numeric is distinct from -(e->>'amount')::numeric then raise exception 'Household contribution requires exact transfer';end if;
   end if;
   used:=array_append(used,ref);
  end if;
  if e->>'life_kind'='supply_contract' and e->>'status'='settled' then
   ref:=e->>'stock_event_id';t:=stock_ops->ref;
   if ref is null or ref=any(used_stock) or t is null or t->>'stock_action' is distinct from 'transfer' or t->'actor' is distinct from e->'supplier' or t->'counterparty' is distinct from e->'actor' or t->'stock_lines' is distinct from e->'stock_lines' then raise exception 'Supply requires own exact stock transfer';end if;
   used_stock:=array_append(used_stock,ref);
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
  if e->'player_life_version'='1'::jsonb and e->>'life_kind'='enrollment' and e->>'status' in ('completed','withdrawn') then
   select value into linked from jsonb_each(st->'life') where value->>'life_kind'='program_enrollment' and value->'enrollment_id'=e->'record_id' and value->>'status'='active';
   if linked is not null then
    if e->>'status'='completed' then
     program:=st->'life'->('player-life:study_program:'||(linked->>'program_id'));
     for module in select value from jsonb_array_elements(program->'modules') loop
      if not exists(select 1 from jsonb_each(st->'life') mr where mr.value->>'life_kind'='module_result' and mr.value->'program_enrollment_id'=linked->'record_id' and mr.value->'module_id'=module->'id' and mr.value->>'status'='passed') then raise exception 'Cannot complete enrollment before linked modules pass';end if;
     end loop;
    end if;
    if not exists(select 1 from jsonb_array_elements(p_events) with ordinality x(value,idx) where x.idx>event_position and x.value->'player_life_version'='1'::jsonb and x.value->>'life_kind'='program_enrollment' and x.value->'key'=linked->'key' and x.value->'actor'=linked->'actor' and x.value->'status'=e->'status') then raise exception 'Close linked program in same scene';end if;
   end if;
  end if;
  if e->'dynamics_version'='1'::jsonb and e->>'dynamics_kind'='economic_agreement' then
   select value into linked from jsonb_each(st->'life') where value->>'life_kind'='supply_contract' and value->'agreement_id'=e->'record_id';
   if linked is not null and linked->'status' is distinct from e->'status' and not exists(select 1 from jsonb_array_elements(p_events) with ordinality x(value,idx) where x.idx>event_position and x.value->'player_life_version'='1'::jsonb and x.value->>'life_kind'='supply_contract' and x.value->'key'=linked->'key' and x.value->'actor'=linked->'actor' and x.value->'status'=e->'status') then raise exception 'Change linked supply contract in same scene';end if;
  end if;
  if e->'dynamics_version'='1'::jsonb and e->>'dynamics_kind'='family_event' and e->>'duty_id' is not null and e->>'status' in ('completed','cancelled') then
   select value into linked from jsonb_each(st->'life') where value->>'life_kind'='household_task' and value->'duty_id'=e->'duty_id' and value->'scheduled_on'=e->'scheduled_on' and value->>'status' in ('proposed','accepted');
   if linked is not null and not exists(select 1 from jsonb_array_elements(p_events) with ordinality x(value,idx) where x.idx>event_position and x.value->'player_life_version'='1'::jsonb and x.value->>'life_kind'='household_task' and x.value->'key'=linked->'key' and x.value->'actor'=linked->'actor' and (x.value->>'status'='cancelled' or (x.value->>'status'=(case e->>'status' when 'completed' then 'completed' else 'missed' end) and x.value->'family_event_id'=e->'record_id'))) then raise exception 'Resolve assigned task in same scene as family event';end if;
  end if;
  st:=public.nw_player_life_step(st,e);
 end loop;
end $life$;
revoke all on function public.nw_assert_player_life_append(uuid,uuid,jsonb) from public,anon,authenticated;

