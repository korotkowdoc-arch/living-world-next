-- Extension barrier inside the existing owner/head locked transaction.
-- Structural parity and exact references; JS remains responsible for detailed
-- domain transitions (research, clinical courses, ritual stages, investment quantities).
-- Old archives and existing scenes are not rewritten.
create or replace function public.nw_assert_extension_append(p_world uuid,p_head uuid,p_events jsonb)
returns void language plpgsql security invoker set search_path='' as $ext$
declare e jsonb;t jsonb;v text;k text;prefix text;kind text;rid text;field text;ref text;entry record;n integer;amount jsonb;sender text;recipient text;currency text;
begin
 for entry in select value,ordinality from jsonb_array_elements(p_events) with ordinality loop
  e:=entry.value;v:=null;prefix:=null;
  select count(*) into n from unnest(array['world_record_version','social_record_version','interaction_version','activity_version','consequence_version','growth_version','dynamics_version','player_life_version','advanced_version','magic_version','magic_society_version','document_version','wealth_version']) x where e ? x;
  if n>1 then raise exception 'Multiple record versions';end if;
  foreach field in array array['advanced','magic','magic_society','document','wealth'] loop
   if e ? (field||'_version') or coalesce(e->>'key','') like replace(field,'_','-')||':%' then
    if v is not null then raise exception 'Multiple extension identities';end if;
    v:=field;prefix:=replace(field,'_','-');
   end if;
  end loop;
  if v is null then continue;end if;
  kind:=e->>(v||'_kind');rid:=e->>'record_id';k:=e->>'key';
  if e->>'type' is distinct from 'world' or e->(v||'_version') is distinct from '1'::jsonb or coalesce(rid,'') !~ '^[A-Za-z0-9_-]{1,80}$' or k is distinct from prefix||':'||kind||':'||rid or kind is null or not public.nw_story_text_valid(e->'actor',140) and not (v='advanced' and kind='edition') then
   raise exception 'Invalid extension identity';
  end if;
  if not (case v
   when 'advanced' then kind in ('instrument','lot','distribution','motive','channel','edition','subscription','map_point','lot_transfer','loan','loan_payment')
   when 'magic' then kind in ('tradition','technique','training','research','reserve','casting','artifact','condition','diagnosis','therapy','course','treatment','law')
   when 'magic_society' then kind in ('ritual','ritual_session','ritual_member','ritual_step','ingredient','formula','batch','enchantment','species','habitat','population','encounter','clinic','credential','admission','clinical_visit','laboratory','lab_member','patent','license')
   when 'document' then kind in ('document','edition','chapter','access','reading','bookmark','note','review','royalty','link')
   when 'wealth' then kind in ('estate_case','beneficiary','bequest','treasury','treasury_member','treasury_payment')
   else false end) then raise exception 'Unknown extension kind';end if;
  if not public.nw_story_text_valid(e->'status',40) then raise exception 'Missing extension status';end if;
  if v='document' then
   if char_length(rid)>60 then raise exception 'Invalid document record ID';end if;
   if kind='chapter' then
    if not public.nw_story_text_valid(e->'body',16000) or not public.nw_story_text_valid(e->'title',240) or coalesce(e->>'edition_id','') !~ '^[A-Za-z0-9_-]{1,60}$' or coalesce(e->>'chapter_id','') !~ '^[A-Za-z0-9_-]{1,60}$' or e->>'status' is distinct from 'recorded' then raise exception 'Invalid document chapter';end if;
    if exists(select 1 from jsonb_array_elements(p_events) with ordinality x(value,idx) where idx<entry.ordinality and value->>'document_kind'='chapter' and (value->>'key'=k or (value->>'edition_id'=e->>'edition_id' and value->>'chapter_id'=e->>'chapter_id'))) then raise exception 'Immutable document chapter';end if;
    if exists(with recursive a as (
     select s.id,s.parent_scene_id,s.events from public.nw_scenes s where s.id=p_head and s.world_id=p_world and s.owner_id=auth.uid()
     union all select s.id,s.parent_scene_id,s.events from public.nw_scenes s join a on s.id=a.parent_scene_id where s.world_id=p_world and s.owner_id=auth.uid()
    ) select 1 from a cross join lateral jsonb_array_elements(a.events) x(value) where value->>'document_kind'='chapter' and (value->>'key'=k or (value->>'edition_id'=e->>'edition_id' and value->>'chapter_id'=e->>'chapter_id'))) then raise exception 'Immutable document chapter';end if;
   elsif kind='edition' then
    if jsonb_typeof(e->'contents') is distinct from 'array' or not public.nw_story_text_valid(e->'title',240) or coalesce(e->>'number','') !~ '^[1-9][0-9]*$' then raise exception 'Invalid edition manifest';end if;
    if jsonb_array_length(e->'contents') not between 1 and 100 or exists(select 1 from jsonb_array_elements(e->'contents') x where coalesce(x->>'id','') !~ '^[A-Za-z0-9_-]{1,60}$' or not public.nw_story_text_valid(x->'title',240)) or (select count(distinct x->>'id') from jsonb_array_elements(e->'contents') x)<>jsonb_array_length(e->'contents') then raise exception 'Invalid chapter manifest';end if;
   end if;
  end if;
  if (v='advanced' and (kind in ('lot','distribution','loan_payment') or kind='lot_transfer' and e->>'transfer_kind'='sale') or v='document' and kind='royalty' or v='wealth' and kind='treasury_payment' and e->>'status'='settled' or v='magic_society' and kind='license' and e->>'status'='active' and coalesce(e->>'amount','0')<>'0') and not public.nw_story_text_valid(e->'transfer_event_id',180) then raise exception 'Missing extension payment reference';end if;
  if v='magic_society' and kind='batch' and not public.nw_story_text_valid(e->'stock_event_id',180) then raise exception 'Missing batch stock reference';end if;
  if v='wealth' and kind='treasury' and (e->>'account' is distinct from 'treasury:'||rid or not public.nw_story_text_valid(e->'currency',40)) then raise exception 'Invalid treasury account';end if;
  if v='wealth' and kind='treasury_payment' and coalesce(e->>'direction','') not in ('deposit','expense','withdrawal') then raise exception 'Invalid treasury direction';end if;
  -- Payment/reference reuse is checked across ALL systems in a new scene.
  if e ? 'transfer_event_id' and e->'transfer_event_id'<>'null'::jsonb then
   ref:=e->>'transfer_event_id';
   if (select count(*) from jsonb_array_elements(p_events) x where x->>'transfer_event_id'=ref)>1 then raise exception 'Reused extension payment';end if;
   select value into t from jsonb_array_elements(p_events) with ordinality x(value,idx) where idx<entry.ordinality and value->>'id'=ref;
   amount:=case when v='advanced' and kind='loan' then e->'principal' else e->'amount' end;
   currency:=e->>'currency';sender:=null;recipient:=null;
   if v='document' and kind='royalty' then sender:=e->>'actor';recipient:=e->>'recipient';end if;
   if v='magic_society' and kind='license' then sender:=e->>'holder';recipient:=e->>'actor';end if;
   if v='advanced' and kind='lot_transfer' then sender:=e->>'counterparty';recipient:=e->>'actor';end if;
   if v='advanced' and kind='loan' then sender:=e->>'actor';recipient:=e->>'counterparty';end if;
   if v='advanced' and kind='loan_payment' then sender:=e->>'actor';end if;
   if v='wealth' and kind='treasury_payment' then
    if e->>'direction'='deposit' then sender:=e->>'counterparty';recipient:='treasury:'||(e->>'treasury_id');else sender:='treasury:'||(e->>'treasury_id');recipient:=e->>'counterparty';end if;
   end if;
   if t is null or t->>'type' is distinct from 'money' or t->>'operation' is distinct from 'transfer' or jsonb_typeof(amount) is distinct from 'number' or amount::text !~ '^[1-9][0-9]*$' or t->'delta' is distinct from to_jsonb(-(amount::text::numeric)) or t->>'currency' is distinct from currency or sender is not null and t->>'actor' is distinct from sender or recipient is not null and t->>'counterparty' is distinct from recipient then raise exception 'Extension payment must match a preceding exact transfer';end if;
  end if;
  if e ? 'stock_event_id' and e->'stock_event_id'<>'null'::jsonb then
   ref:=e->>'stock_event_id';
   if (select count(*) from jsonb_array_elements(p_events) x where x->>'stock_event_id'=ref)>1 then raise exception 'Reused extension stock movement';end if;
   select value into t from jsonb_array_elements(p_events) with ordinality x(value,idx) where idx<entry.ordinality and value->>'id'=ref;
   if t is null or t->>'dynamics_kind' is distinct from 'stock_operation' or t->'dynamics_version' is distinct from '1'::jsonb or t->>'actor' is distinct from e->>'actor' or coalesce(t->>'stock_action','') not in ('consume','produce') then raise exception 'Extension stock must match preceding operation';end if;
  end if;
 end loop;
 -- Reserved shared accounts may not be used as generic character balances.
 for e in select value from jsonb_array_elements(p_events) loop
  if e->>'type'='money' and (coalesce(e->>'actor','') like 'treasury:%' or coalesce(e->>'counterparty','') like 'treasury:%') then
   if e->>'operation'='reconcile' and e->'balance'='0'::jsonb and e->'delta'='0'::jsonb and exists(select 1 from jsonb_array_elements(p_events) x where x->>'wealth_kind'='treasury' and x->>'account'=e->>'actor' and x->>'currency'=e->>'currency' and x->>'status'='active') then continue;end if;
   if not exists(select 1 from jsonb_array_elements(p_events) x where x->'wealth_version'='1'::jsonb and x->>'wealth_kind'='treasury_payment' and x->>'status'='settled' and x->>'transfer_event_id'=e->>'id') then raise exception 'Unannotated treasury movement';end if;
  end if;
 end loop;
end $ext$;
revoke all on function public.nw_assert_extension_append(uuid,uuid,jsonb) from public,anon,authenticated;

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
 perform public.nw_assert_extension_append(p_world_id,current_head,coalesce(p_events,'[]'::jsonb));
 insert into public.nw_scenes(id,owner_id,world_id,branch_id,parent_scene_id,request_id,body,world_time,events,rules_version_at_commit)
 values(new_id,u,p_world_id,p_branch_id,current_head,p_request_id,p_body,nullif(trim(p_world_time),''),coalesce(p_events,'[]'::jsonb),actual_rules_version);
 update public.nw_branches set head_scene_id=new_id where id=p_branch_id;
 update public.nw_worlds set updated_at=now() where id=p_world_id;
 return new_id;
end $$;
revoke all on function public.nw_commit_scene(uuid,uuid,uuid,uuid,text,text,jsonb,integer) from public,anon;
grant execute on function public.nw_commit_scene(uuid,uuid,uuid,uuid,text,text,jsonb,integer) to authenticated;
