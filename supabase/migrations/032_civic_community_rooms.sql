-- Repair the server-side whitelist for rooms and civic records and add community life.
-- No data rewrite, no new public RPC, no change to ownership or head locking.
-- The existing checkpoint signature includes all nw_* function definitions.
create or replace function public.nw_life_group_member(st jsonb,g text,a text)
returns boolean language sql immutable security invoker set search_path='' as $$
 select coalesce(st->'refs'->('social:group:'||g)->>'status'='active',false)
 and (select count(*)=1 and count(*) filter(where value->>'status'='member')=1 from jsonb_each(st->'refs') where value->>'social_kind'='membership' and value->>'group_id'=g and value->>'actor'=a)
$$;
revoke all on function public.nw_life_group_member(jsonb,text,text) from public,anon,authenticated;
create or replace function public.nw_life_office(st jsonb,i text,a text,roles text[])
returns boolean language sql immutable security invoker set search_path='' as $$
 select coalesce(st->'refs'->('dynamics:institution:'||i)->>'status'='operating',false)
 and public.nw_life_group_member(st,st->'refs'->('dynamics:institution:'||i)->>'group_id',a)
 and exists(select 1 from jsonb_each(st->'life') where value->>'life_kind'='civic_office' and value->>'institution_id'=i and value->>'actor'=a and value->>'status'='active' and value->>'role'=any(roles))
$$;
revoke all on function public.nw_life_office(jsonb,text,text,text[]) from public,anon,authenticated;
create or replace function public.nw_life_names(v jsonb,n integer)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
begin
 if jsonb_typeof(v) is distinct from 'array' then return false;end if;
 return jsonb_array_length(v) between 1 and n and (select count(distinct value)=count(*) and bool_and(public.nw_story_text_valid(value,140)) from jsonb_array_elements(v));
end $$;
revoke all on function public.nw_life_names(jsonb,integer) from public,anon,authenticated;
create or replace function public.nw_life_case_access(st jsonb,c jsonb,a text)
returns boolean language sql immutable security invoker set search_path='' as $$
 select coalesce(c->>'actor'=a,false) or exists(select 1 from jsonb_each(st->'life') where value->>'actor'=a and ((value->>'life_kind'='civic_notice' and value->>'target_kind'='case' and value->>'target_id'=c->>'record_id' and value->>'role'='officer' and value->>'status'='delivered') or (value->>'life_kind'='civic_decision' and value->>'case_id'=c->>'record_id' and value->>'status'='issued')))
$$;
revoke all on function public.nw_life_case_access(jsonb,jsonb,text) from public,anon,authenticated;
create or replace function public.nw_life_same_fields(a jsonb,b jsonb,fields text[])
returns boolean language sql immutable security invoker set search_path='' as $$
 select not exists(select 1 from unnest(fields) f where coalesce(a->f,'null'::jsonb) is distinct from coalesce(b->f,'null'::jsonb))
$$;
revoke all on function public.nw_life_same_fields(jsonb,jsonb,text[]) from public,anon,authenticated;
create or replace function public.nw_life_valid_score(v jsonb)
returns boolean language sql immutable security invoker set search_path='' as $$
 select case when jsonb_typeof(v)='number' and v::text ~ '^[0-9]{1,7}$' then (v::text)::numeric<=1000000 else false end
$$;
revoke all on function public.nw_life_valid_score(jsonb) from public,anon,authenticated;
create or replace function public.nw_civic_community_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $cc$
declare k text:=e->>'key';kind text:=e->>'life_kind';rid text:=e->>'record_id';s text:=coalesce(e->>'status','');actor text:=e->>'actor';old jsonb:=st->'life'->k; a jsonb;b jsonb;d jsonb;i text:=e->>'institution_id';g text:=e->>'group_id';v text;cnt integer;y integer;expected text;field text;
begin
 if not coalesce(public.nw_story_text_valid(e->'actor',140),false) then raise exception 'Invalid civic/community actor';end if;
 if kind='room' then
  if coalesce(e->>'home_kind','') not in ('estate','lease') or not public.nw_home_id(e->'home_id') or not public.nw_story_text_valid(e->'area',140) or not public.nw_story_text_valid(e->'label',140) or not public.nw_story_text_valid(e->'purpose',140) or not public.nw_story_text_valid(e->'description',600) or s not in ('active','retired') then raise exception 'Invalid room';end if;
  foreach field in array array['walls','flooring','lighting'] loop
   if e->>field is not null and not public.nw_story_text_valid(e->field,200) then raise exception 'Invalid room finish';end if;
  end loop;
  a:=st->'life'->('player-life:'||(e->>'home_kind')||':'||(e->>'home_id'));
  if a is null or a->>'actor' is distinct from actor or (e->>'home_kind'='estate' and (a->>'status' is distinct from 'owned' or a->>'last_sale_id' is distinct from e->>'title_revision')) or (e->>'home_kind'='lease' and (a->>'status' is distinct from 'active' or e->>'title_revision' is not null)) then raise exception 'Room requires current access and title revision';end if;
  if old is null then if s<>'active' then raise exception 'Room begins active';end if;
  elsif old->>'status'='retired' or not public.nw_life_same_fields(old,e,array['home_kind','home_id','area']) or s='retired' and not public.nw_life_same_fields(old,e,array['actor','title_revision']) then raise exception 'Room identity fixed';end if;
  if s='active' and exists(select 1 from jsonb_each(st->'life') x where x.key<>k and value->>'life_kind'='room' and value->>'status'='active' and value->>'home_kind'=e->>'home_kind' and value->>'home_id'=e->>'home_id' and lower(normalize(value->>'area',NFKC))=lower(normalize(e->>'area',NFKC))) then raise exception 'Duplicate room area';end if;
 elsif kind='civic_office' then
  if not public.nw_home_id(e->'institution_id') or coalesce(e->>'role','') not in ('magistrate','investigator','clerk','councillor') or not public.nw_story_text_valid(e->'description',600) or s not in ('active','revoked') then raise exception 'Invalid office';end if;
  if old is null then
   a:=st->'refs'->('dynamics:institution:'||i);
   if s<>'active' or a->>'status' is distinct from 'operating' or not public.nw_life_group_member(st,a->>'group_id',actor) or exists(select 1 from jsonb_each(st->'life') where value->>'life_kind'='civic_office' and value->>'actor'=actor and value->>'institution_id'=i and value->>'role'=e->>'role' and value->>'status'='active') then raise exception 'Office requires active member and unique appointment';end if;
  elsif old->>'status'<>'active' or s<>'revoked' or not public.nw_life_same_fields(old,e,array['actor','institution_id','role']) then raise exception 'Invalid office revocation';end if;
 elsif kind='civic_case' then
  if not public.nw_home_id(e->'institution_id') or not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'description',600) or not public.nw_life_names(e->'parties',12) or coalesce(e->>'case_kind','') not in ('civil','criminal','disciplinary','administrative','other') or s not in ('open','hearing','closed','dismissed') or not public.nw_life_office(st,i,actor,array['magistrate','investigator']) then raise exception 'Invalid case or unauthorized handler';end if;
  if old is null then if s<>'open' or e->>'handover_from' is not null then raise exception 'Case must begin open';end if;
  else
   if not public.nw_life_same_fields(old,e,array['institution_id','title','description','case_kind','parties']) or old->>'status' not in ('open','hearing') then raise exception 'Case identity or closure fixed';end if;
   if actor<>old->>'actor' then if e->>'handover_from' is distinct from old->>'actor' or s<>old->>'status' then raise exception 'Explicit handover required';end if;
   elsif e->>'handover_from' is not null then raise exception 'Unexpected handover';end if;
   select value into d from jsonb_each(st->'life') where value->>'life_kind'='civic_decision' and value->>'case_id'=rid and value->>'status'='issued' limit 1;
   if s='open' and old->>'status'<>'open' or s='closed' and (old->>'status'<>'hearing' or d->>'disposition' is distinct from 'resolved') or s='dismissed' and d->>'disposition' is distinct from 'dismissed' or d is not null and s in ('open','hearing') and actor=old->>'actor' then raise exception 'Case transition requires matching separate decision';end if;
  end if;
 elsif kind='civic_notice' then
  if old is not null or not public.nw_home_id(e->'target_id') or not public.nw_story_text_valid(e->'sender',140) or actor=e->>'sender' or not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'description',1200) or s<>'delivered' then raise exception 'Invalid delivered notice';end if;
  if e->>'target_kind'='case' then
   a:=st->'life'->('player-life:civic_case:'||(e->>'target_id'));
   if a is null or not public.nw_life_office(st,a->>'institution_id',e->>'sender',array['magistrate','investigator','clerk']) or not public.nw_life_case_access(st,a,e->>'sender') or coalesce(e->>'role','') not in ('party','witness','officer') or coalesce(e->>'notice_kind','') not in ('opened','hearing','decision') then raise exception 'Unauthorized case notice';end if;
   if e->>'role'='party' and not (a->'parties' @> jsonb_build_array(actor)) or e->>'role'='officer' and not public.nw_life_office(st,a->>'institution_id',actor,array['magistrate','investigator','clerk']) or e->>'notice_kind'='opened' and a->>'status' not in ('open','hearing') or e->>'notice_kind'='hearing' and a->>'status'<>'hearing' or e->>'notice_kind'='decision' and (a->>'status' not in ('closed','dismissed') or not exists(select 1 from jsonb_each(st->'life') where value->>'life_kind'='civic_decision' and value->>'case_id'=a->>'record_id' and value->>'status'='issued')) then raise exception 'Notice does not match case role or stage';end if;
  elsif e->>'target_kind'='motion' then
   a:=st->'life'->('player-life:civic_motion:'||(e->>'target_id'));
   if a is null or not (a->'voters' @> jsonb_build_array(actor)) or not public.nw_life_office(st,a->>'institution_id',e->>'sender',array['councillor','clerk']) or e->>'role' is distinct from 'voter' or coalesce(e->>'notice_kind','') not in ('ballot','result') or e->>'notice_kind'='ballot' and a->>'status'<>'open' or e->>'notice_kind'='result' and a->>'status'='open' then raise exception 'Unauthorized motion notice';end if;
  else raise exception 'Unknown notice target';end if;
 elsif kind in ('civic_submission','civic_decision') then
  a:=st->'life'->('player-life:civic_case:'||(e->>'case_id'));
  if old is not null or not public.nw_home_id(e->'case_id') or a is null or a->>'status' not in ('open','hearing') or exists(select 1 from jsonb_each(st->'life') where value->>'life_kind'='civic_decision' and value->>'case_id'=e->>'case_id' and value->>'status'='issued') then raise exception 'Requires open undecided case';end if;
  if kind='civic_submission' then
   if s<>'submitted' or not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'description',1600) or coalesce(e->>'submission_kind','') not in ('claim','response','witness_statement','document','expert_report','other') or not ((public.nw_life_office(st,a->>'institution_id',actor,array['magistrate','investigator']) and public.nw_life_case_access(st,a,actor)) or exists(select 1 from jsonb_each(st->'life') where value->>'life_kind'='civic_notice' and value->>'target_kind'='case' and value->>'target_id'=e->>'case_id' and value->>'actor'=actor and value->>'notice_kind' in ('opened','hearing') and value->>'status'='delivered')) then raise exception 'Submission requires informed participant';end if;
  else
   if s<>'issued' or coalesce(e->>'disposition','') not in ('resolved','dismissed') or not public.nw_story_text_valid(e->'outcome',1200) or e->>'disposition'='resolved' and a->>'status'<>'hearing' or not public.nw_life_office(st,a->>'institution_id',actor,array['magistrate']) or not public.nw_life_case_access(st,a,actor) then raise exception 'Decision requires assigned magistrate';end if;
  end if;
 elsif kind='civic_motion' then
  if not public.nw_home_id(e->'institution_id') or not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'description',1200) or not public.nw_life_names(e->'voters',30) or jsonb_typeof(e->'quorum') is distinct from 'number' or jsonb_typeof(e->'required_yes') is distinct from 'number' or coalesce(e->>'quorum','') !~ '^[1-9][0-9]?$' or coalesce(e->>'required_yes','') !~ '^[1-9][0-9]?$' or s not in ('open','approved','rejected','no_quorum','withdrawn') or not public.nw_life_office(st,i,actor,array['councillor']) then raise exception 'Invalid motion';end if;
  if (e->>'quorum')::integer>jsonb_array_length(e->'voters') or (e->>'required_yes')::integer>jsonb_array_length(e->'voters') or s='open' and e->>'outcome' is not null or s<>'open' and not public.nw_story_text_valid(e->'outcome',600) then raise exception 'Invalid voting rules';end if;
  if old is null then
   if s<>'open' then raise exception 'Motion begins open';end if;
   for v in select value from jsonb_array_elements_text(e->'voters') loop
    if not public.nw_life_group_member(st,st->'refs'->('dynamics:institution:'||i)->>'group_id',v) then raise exception 'Invalid voter membership';end if;
   end loop;
  else
   if old->>'status'<>'open' or s='open' or not public.nw_life_same_fields(old,e,array['actor','institution_id','title','description','voters','quorum','required_yes']) then raise exception 'Motion identity fixed';end if;
   select count(*),count(*) filter(where value->>'vote'='yes') into cnt,y from jsonb_each(st->'life') where value->>'life_kind'='civic_ballot' and value->>'motion_id'=rid and value->>'status'='cast' and old->'voters' @> jsonb_build_array(value->>'actor');
   expected:=case when cnt<(e->>'quorum')::integer then 'no_quorum' when y>=(e->>'required_yes')::integer then 'approved' else 'rejected' end;
   if s<>'withdrawn' and s<>expected then raise exception 'Motion outcome conflicts with tally';end if;
  end if;
 elsif kind='civic_ballot' then
  a:=st->'life'->('player-life:civic_motion:'||(e->>'motion_id'));
  if old is not null or not public.nw_home_id(e->'motion_id') or s<>'cast' or coalesce(e->>'vote','') not in ('yes','no','abstain') or a is null or a->>'status'<>'open' or not (a->'voters' @> jsonb_build_array(actor)) or not public.nw_life_group_member(st,st->'refs'->('dynamics:institution:'||(a->>'institution_id'))->>'group_id',actor) or not exists(select 1 from jsonb_each(st->'life') where value->>'life_kind'='civic_notice' and value->>'target_kind'='motion' and value->>'target_id'=e->>'motion_id' and value->>'actor'=actor and value->>'notice_kind'='ballot' and value->>'status'='delivered') or exists(select 1 from jsonb_each(st->'life') where value->>'life_kind'='civic_ballot' and value->>'motion_id'=e->>'motion_id' and value->>'actor'=actor) then raise exception 'Ballot requires unique informed eligible voter';end if;
 elsif kind='community_event' then
  if not public.nw_home_id(e->'group_id') or not public.nw_life_group_member(st,g,actor) or not public.nw_story_text_valid(e->'title',200) or not public.nw_story_text_valid(e->'description',1000) or not public.nw_story_text_valid(e->'place',140) or coalesce(e->>'event_kind','') not in ('sport','club','lecture','research','festival','performance','exhibition','social','other') or s not in ('scheduled','in_progress','completed','cancelled') or jsonb_typeof(e->'capacity') is distinct from 'number' or coalesce(e->>'capacity','') !~ '^[1-9][0-9]{0,3}$' then raise exception 'Invalid community event';end if;
  if (e->>'capacity')::integer>5000 or public.nw_work_minute(e->'starts_at')>=public.nw_work_minute(e->'ends_at') or s in ('completed','cancelled') and not public.nw_story_text_valid(e->'outcome',600) or s in ('scheduled','in_progress') and e->>'outcome' is not null then raise exception 'Invalid event timing/capacity/outcome';end if;
  if i is not null then a:=st->'refs'->('dynamics:institution:'||i);if a->>'group_id' is distinct from g or a->>'status' is distinct from 'operating' then raise exception 'Invalid event institution';end if;end if;
  if e->>'series' is not null and not public.nw_story_text_valid(e->'series',140) then raise exception 'Invalid series';end if;
  if e->>'home_group_id' is not null or e->>'away_group_id' is not null then
   if e->>'event_kind'<>'sport' or not public.nw_home_id(e->'home_group_id') or not public.nw_home_id(e->'away_group_id') or e->>'home_group_id'=e->>'away_group_id' or st->'refs'->('social:group:'||(e->>'home_group_id')) is null or st->'refs'->('social:group:'||(e->>'away_group_id')) is null then raise exception 'Invalid sport teams';end if;
  end if;
  if old is null then if s<>'scheduled' then raise exception 'Event starts scheduled';end if;
  elsif not public.nw_life_same_fields(old,e,array['actor','group_id','institution_id','title','description','place','event_kind','starts_at','ends_at','capacity','series','home_group_id','away_group_id']) or not (case old->>'status' when 'scheduled' then s in ('in_progress','cancelled') when 'in_progress' then s in ('completed','cancelled') else false end) then raise exception 'Invalid event transition';end if;
 elsif kind='community_participation' then
  a:=st->'life'->('player-life:community_event:'||(e->>'event_id'));
  if not public.nw_home_id(e->'event_id') or not public.nw_story_text_valid(e->'organizer',140) or actor=e->>'organizer' or a is null or a->>'actor' is distinct from e->>'organizer' or coalesce(e->>'role','') not in ('guest','member','athlete','performer','speaker','staff','spectator') or s not in ('invited','accepted','declined','withdrawn','attended','missed','cancelled') or s='invited' and e->>'outcome' is not null or s<>'invited' and not public.nw_story_text_valid(e->'outcome',600) or e->>'team_id' is not null and (not public.nw_home_id(e->'team_id') or e->>'role'<>'athlete') then raise exception 'Invalid participation';end if;
  if old is null then
   if s<>'invited' or a->>'status'<>'scheduled' or not public.nw_life_group_member(st,a->>'group_id',a->>'actor') or exists(select 1 from jsonb_each(st->'life') where value->>'life_kind'='community_participation' and value->>'event_id'=e->>'event_id' and value->>'actor'=actor and value->>'status' not in ('declined','withdrawn','cancelled')) then raise exception 'Invalid invitation';end if;
   if e->>'team_id' is not null and (not coalesce(e->>'team_id' in (a->>'home_group_id',a->>'away_group_id'),false) or not public.nw_life_group_member(st,e->>'team_id',actor)) or e->>'role'='member' and not public.nw_life_group_member(st,a->>'group_id',actor) then raise exception 'Invalid team or membership';end if;
  else
   if not public.nw_life_same_fields(old,e,array['actor','event_id','organizer','role','team_id']) or not(case old->>'status' when 'invited' then s in ('accepted','declined','cancelled') when 'accepted' then s in ('withdrawn','attended','missed','cancelled') else false end) then raise exception 'Invalid RSVP transition';end if;
   if s='accepted' then
    select count(*) into cnt from jsonb_each(st->'life') where value->>'life_kind'='community_participation' and value->>'event_id'=e->>'event_id' and value->>'status' in ('accepted','attended');
    if a->>'status'<>'scheduled' or cnt>=(a->>'capacity')::integer or e->>'team_id' is not null and not public.nw_life_group_member(st,e->>'team_id',actor) then raise exception 'No available event capacity or eligibility';end if;
   end if;
   if s='attended' and a->>'status' not in ('in_progress','completed') or s='missed' and a->>'status'<>'completed' or s='cancelled' and a->>'status'<>'cancelled' or s in ('declined','withdrawn') and a->>'status'<>'scheduled' then raise exception 'RSVP outcome does not match event stage';end if;
  end if;
 elsif kind='community_result' then
  a:=st->'life'->('player-life:community_event:'||(e->>'event_id'));
  if old is not null or not public.nw_home_id(e->'event_id') or a is null or a->>'status'<>'completed' or a->>'actor' is distinct from actor or not public.nw_life_group_member(st,a->>'group_id',actor) or s<>'recorded' or not public.nw_story_text_valid(e->'description',1200) or exists(select 1 from jsonb_each(st->'life') where value->>'life_kind'='community_result' and value->>'event_id'=e->>'event_id') then raise exception 'Result requires completed event and unique recorder';end if;
  if a->>'home_group_id' is not null then
   if not public.nw_life_valid_score(e->'home_score') or not public.nw_life_valid_score(e->'away_score') then raise exception 'Invalid match score';end if;
  elsif e->>'home_score' is not null or e->>'away_score' is not null then raise exception 'Score requires teams';end if;
 elsif kind='community_report' then
  a:=st->'life'->('player-life:community_result:'||(e->>'result_id'));b:=st->'life'->('player-life:community_event:'||(e->>'event_id'));
  if old is not null or not public.nw_home_id(e->'result_id') or not public.nw_home_id(e->'event_id') or not public.nw_story_text_valid(e->'reporter',140) or actor=e->>'reporter' or a is null or b is null or a->>'event_id' is distinct from e->>'event_id' or a->>'actor' is distinct from e->>'reporter' or s<>'received' or not public.nw_story_text_valid(e->'description',1200) or exists(select 1 from jsonb_each(st->'life') where value->>'life_kind'='community_report' and value->>'result_id'=e->>'result_id' and value->>'actor'=actor) then raise exception 'Invalid received report';end if;
  if e->>'home_score' is not null or e->>'away_score' is not null then
   if not public.nw_life_valid_score(e->'home_score') or not public.nw_life_valid_score(e->'away_score') or not public.nw_life_same_fields(a,e,array['home_score','away_score']) then raise exception 'Report score must match actual result';end if;
  end if;
 else raise exception 'Unknown civic/community life type';end if;
 return jsonb_set(st,array['life',k],e,true);
end $cc$;
revoke all on function public.nw_civic_community_step(jsonb,jsonb) from public,anon,authenticated;

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
  or coalesce(kind,'') not in ('need','garment','outfit','letter','preset','appointment','impression','journey','venue_service','service_visit','discovery','work_shift','wage','service_recipe','transit_notice','lease','home_condition','budget','capacity_slot','reservation','enrollment','assessment','practice_record','reputation','invitation','health_episode','estate','estate_sale','estate_condition','transport_ticket','lesson','assignment','market_adjustment','market_observation','furnishing','ticket_payment','study_program','program_enrollment','module_result','qualification','supply_contract','household','household_member','household_contribution','job_requirement','care_record','household_task','career_change','consequence_response','household_expense','expense_share','care_plan','child_birth','child_milestone','shared_goal','shared_goal_member','shared_goal_step','room','civic_office','civic_case','civic_notice','civic_submission','civic_decision','civic_motion','civic_ballot','community_event','community_participation','community_result','community_report') or coalesce(e->>'record_id','') !~ '^[A-Za-z0-9_-]{1,80}$'
  or jsonb_typeof(e->'record_id') is distinct from 'string' or k is distinct from ('player-life:'||kind||':'||(e->>'record_id'))
  or num_nonnulls(e->'world_record_version',e->'social_record_version',e->'interaction_version',e->'activity_version',e->'consequence_version',e->'growth_version',e->'dynamics_version')<>0
  then raise exception 'Invalid player life identity';end if;
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
