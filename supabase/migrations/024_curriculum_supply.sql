-- Academic program progress and exact commercial settlement.
create or replace function public.nw_curriculum_supply_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $curriculum$
declare k text:=e->>'key';kind text:=e->>'life_kind';status text:=coalesce(e->>'status','');old jsonb:=st->'life'->k;a jsonb;b jsonb;c jsonb;m jsonb;f text;amount numeric;
begin
 if not public.nw_story_text_valid(e->'actor',140) or (old is not null and old->'actor' is distinct from e->'actor') then raise exception 'Invalid academic or supply actor';end if;
 if kind='study_program' then
  if not public.nw_home_id(e->'institution_id') or not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'place',140) or jsonb_typeof(e->'modules') is distinct from 'array' or status not in ('active','retired') then raise exception 'Invalid study program';end if;
  if jsonb_array_length(e->'modules') not between 1 and 20 or (select count(distinct value->>'id') from jsonb_array_elements(e->'modules'))<>jsonb_array_length(e->'modules') then raise exception 'Invalid program module count';end if;
  for m in select value from jsonb_array_elements(e->'modules') loop
   if jsonb_typeof(m) is distinct from 'object' or (m-'id'-'title')<>'{}'::jsonb or not public.nw_home_id(m->'id') or not public.nw_story_text_valid(m->'title',200) then raise exception 'Invalid module';end if;
  end loop;
  a:=st->'refs'->('dynamics:institution:'||(e->>'institution_id'));
  if a is null or a->'place' is distinct from e->'place' or old is null and (a->>'status'<>'operating' or status<>'active') then raise exception 'Program requires operating institution';end if;
  if old is not null then
   if old->>'status'<>'active' or status<>'retired' then raise exception 'Invalid program transition';end if;
   foreach f in array array['institution_id','title','place','modules'] loop
    if old->f is distinct from e->f then raise exception 'Program identity immutable';end if;
   end loop;
  end if;
 elsif kind='program_enrollment' then
  if not public.nw_home_id(e->'program_id') or not public.nw_home_id(e->'enrollment_id') or status not in ('active','completed','withdrawn') then raise exception 'Invalid program enrollment';end if;
  a:=st->'life'->('player-life:study_program:'||(e->>'program_id'));b:=st->'life'->('player-life:enrollment:'||(e->>'enrollment_id'));
  if a is null or b is null or b->'actor' is distinct from e->'actor' or b->'institution_id' is distinct from a->'institution_id' or b->'place' is distinct from a->'place' or exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='program_enrollment' and r.value->'enrollment_id'=e->'enrollment_id') then raise exception 'Program requires matching enrollment';end if;
  if old is null then
   if status<>'active' or a->>'status'<>'active' or b->>'status'<>'enrolled' then raise exception 'Program requires active enrollment';end if;
  elsif old->>'status'<>'active' or status not in ('completed','withdrawn') or old->'program_id' is distinct from e->'program_id' or old->'enrollment_id' is distinct from e->'enrollment_id' then raise exception 'Invalid program enrollment transition';end if;
  if status='completed' then
   if b->>'status'<>'completed' then raise exception 'Complete underlying enrollment first';end if;
   for m in select value from jsonb_array_elements(a->'modules') loop
    if not exists(select 1 from jsonb_each(st->'life') r where r.value->>'life_kind'='module_result' and r.value->'program_enrollment_id'=e->'record_id' and r.value->'module_id'=m->'id' and r.value->>'status'='passed') then raise exception 'Program module not passed';end if;
   end loop;
  elsif status='withdrawn' and b->>'status'<>'withdrawn' then raise exception 'Withdraw underlying enrollment first';end if;
 elsif kind='module_result' then
  if old is not null or not public.nw_home_id(e->'program_enrollment_id') or not public.nw_home_id(e->'module_id') or not public.nw_home_id(e->'assessment_id') or status not in ('passed','failed') then raise exception 'Invalid module result';end if;
  a:=st->'life'->('player-life:program_enrollment:'||(e->>'program_enrollment_id'));b:=st->'life'->('player-life:study_program:'||(a->>'program_id'));c:=st->'life'->('player-life:assessment:'||(e->>'assessment_id'));
  if a is null or b is null or c is null or a->'actor' is distinct from e->'actor' or a->>'status'<>'active' or c->'actor' is distinct from e->'actor' or c->'enrollment_id' is distinct from a->'enrollment_id' or c->>'status' is distinct from status or not exists(select 1 from jsonb_array_elements(b->'modules') x where x->'id'=e->'module_id' and x->'title'=c->'title') or exists(select 1 from jsonb_each(st->'life') r where r.value->>'life_kind'='module_result' and (r.value->'assessment_id'=e->'assessment_id' or (r.value->'program_enrollment_id'=e->'program_enrollment_id' and r.value->'module_id'=e->'module_id' and r.value->>'status'='passed'))) then raise exception 'Module needs distinct matching assessment';end if;
 elsif kind='qualification' then
  if not public.nw_home_id(e->'program_enrollment_id') or not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'description',600) or status not in ('awarded','revoked') then raise exception 'Invalid qualification';end if;
  a:=st->'life'->('player-life:program_enrollment:'||(e->>'program_enrollment_id'));
  if a is null or a->'actor' is distinct from e->'actor' or a->>'status'<>'completed' or exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='qualification' and r.value->'program_enrollment_id'=e->'program_enrollment_id') or old is null and status<>'awarded' or old is not null and (old->>'status'<>'awarded' or status<>'revoked' or old->'program_enrollment_id' is distinct from e->'program_enrollment_id' or old->'title' is distinct from e->'title') then raise exception 'Qualification requires completed program and unique award';end if;
 elsif kind='supply_contract' then
  if not public.nw_home_id(e->'enterprise_id') or not public.nw_home_id(e->'agreement_id') or not public.nw_story_text_valid(e->'supplier',140) or e->'actor'=e->'supplier' or not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'currency',80) or status not in ('proposed','active','disputed','settled','cancelled') then raise exception 'Invalid supply contract';end if;
  amount:=public.nw_work_uint(e->'amount');if amount<=0 then raise exception 'Supply amount must be positive';end if;
  if coalesce(e->>'due_at','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then perform public.nw_work_minute(to_jsonb((e->>'due_at')||' 00:00'));else perform public.nw_work_minute(e->'due_at');end if;
  perform public.nw_assert_stock_lines(e->'stock_lines','transfer');
  if status='settled' and (not public.nw_story_text_valid(e->'transfer_event_id',180) or not public.nw_story_text_valid(e->'stock_event_id',180) or not public.nw_story_text_valid(e->'outcome',600)) or status<>'settled' and (e->>'transfer_event_id' is not null or e->>'stock_event_id' is not null) or status='disputed' and not public.nw_story_text_valid(e->'outcome',600) then raise exception 'Invalid supply settlement or dispute';end if;
  a:=st->'refs'->('dynamics:enterprise:'||(e->>'enterprise_id'));b:=st->'refs'->('dynamics:economic_agreement:'||(e->>'agreement_id'));
  if a is null or b is null or a->'actor' is distinct from e->'actor' or b->'actor' is distinct from e->'actor' or b->'counterparty' is distinct from e->'supplier' or b->'amount' is distinct from e->'amount' or b->'currency' is distinct from e->'currency' or b->>'agreement_kind' not in ('service','other') or b->>'status' is distinct from status or (status in ('active','settled') and a->>'status'<>'operating') or exists(select 1 from jsonb_each(st->'life') r where r.key<>k and r.value->>'life_kind'='supply_contract' and r.value->'agreement_id'=e->'agreement_id') then raise exception 'Supply requires matching agreement and enterprise';end if;
  if old is null then
   if status<>'proposed' then raise exception 'Supply contract must be proposed first';end if;
  else
   foreach f in array array['enterprise_id','agreement_id','supplier','title','currency','amount','due_at','stock_lines'] loop
    if old->f is distinct from e->f then raise exception 'Changed supply contract terms';end if;
   end loop;
   if not (case old->>'status' when 'proposed' then status in ('active','cancelled') when 'active' then status in ('disputed','settled','cancelled') when 'disputed' then status in ('active','settled','cancelled') else false end) then raise exception 'Invalid supply contract transition';end if;
  end if;
 else raise exception 'Unknown curriculum/supply record';end if;
 return jsonb_set(st,array['life',k],e,true);
end $curriculum$;
revoke all on function public.nw_curriculum_supply_step(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.nw_player_life_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $life$
declare k text:=e->>'key'; kind text:=e->>'life_kind'; old jsonb; other jsonb; field text; val jsonb; item text; garment jsonb;
 slots constant text[]:=array['head','face','upper','outer','lower','feet','hands','accessory'];
begin
 if not (e?'player_life_version') and coalesce(k,'') not like 'player-life:%' then
  if e->>'type'='item' then st:=jsonb_set(st,'{economy}',public.nw_economy_step(st->'economy',e));st:=public.nw_furnishing_invalidate(st,e); end if;
  if e->>'dynamics_kind'='employment' and e->'dynamics_version'='1'::jsonb then st:=jsonb_set(st,array['jobs',e->>'record_id'],e,true);end if;
  if (e->'dynamics_version'='1'::jsonb and e->>'dynamics_kind' in ('economic_agreement','payment_schedule','institution','enterprise')) or (e->'growth_version'='1'::jsonb and e->>'growth_kind'='skill') or (e->'social_record_version'='1'::jsonb and e->>'social_kind'='group') then st:=jsonb_set(st,array['refs',k],e,true);end if;
  return st;
 end if;
 if e->>'type' is distinct from 'world' or e->'player_life_version' is distinct from '1'::jsonb
  or coalesce(kind,'') not in ('need','garment','outfit','letter','preset','appointment','impression','journey','venue_service','service_visit','discovery','work_shift','wage','service_recipe','transit_notice','lease','home_condition','budget','capacity_slot','reservation','enrollment','assessment','practice_record','reputation','invitation','health_episode','estate','estate_sale','estate_condition','transport_ticket','lesson','assignment','market_adjustment','market_observation','furnishing','ticket_payment','study_program','program_enrollment','module_result','qualification','supply_contract') or coalesce(e->>'record_id','') !~ '^[A-Za-z0-9_-]{1,80}$'
  or jsonb_typeof(e->'record_id') is distinct from 'string' or k is distinct from ('player-life:'||kind||':'||(e->>'record_id'))
  or num_nonnulls(e->'world_record_version',e->'social_record_version',e->'interaction_version',e->'activity_version',e->'consequence_version',e->'growth_version',e->'dynamics_version')<>0
  then raise exception 'Invalid player life identity';end if;
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
  if e->>'dynamics_kind'='stock_operation' and e->'dynamics_version'='1'::jsonb and e->>'stock_action' in ('consume','transfer') then stock_ops:=jsonb_set(stock_ops,array[e->>'id'],e,true);end if;
  if (e->>'life_kind'='supply_contract' and e->>'status'='settled') or e->>'life_kind'='ticket_payment' or (e->>'life_kind'='estate_sale' and e->>'status'='settled' and (e->>'amount')::numeric>0) or (e->>'life_kind'='wage' and (e->>'amount')::numeric>0) or (e->>'life_kind'='service_visit' and e->>'status'='completed' and (e->>'amount')::numeric>0 and e->>'prepayment_id' is null) or (e->>'dynamics_kind'='payment_occurrence' and e->>'status'='paid') then
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
  st:=public.nw_player_life_step(st,e);
 end loop;
end $life$;
revoke all on function public.nw_assert_player_life_append(uuid,uuid,jsonb) from public,anon,authenticated;

