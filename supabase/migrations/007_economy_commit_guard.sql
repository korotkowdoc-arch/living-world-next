-- v0.11.1: economy precondition within the existing expected-head transaction.
-- No table rewrite; historical contradictory annotations remain readable.
-- Apply after 006_restore_archive.sql. Review/run rollback tests before production.
create or replace function public.nw_economy_step(p_state jsonb,p_event jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 st jsonb:=p_state; e jsonb:=p_event; typ text:=e->>'type';
 actor text:=btrim(coalesce(e->>'actor','')); cp text:=btrim(coalesce(e->>'counterparty',''));
 curr text:=btrim(coalesce(e->>'currency','')); op text:=e->>'operation';
 k text; k2 text; old jsonb; other jsonb; d numeric; n numeric; net numeric; n2 numeric; net2 numeric;
 known boolean; known2 boolean; action text:=e->>'action'; iid text:=e->>'item_id';
 status text; holder text; next_status text;
 maxsafe constant numeric:=9007199254740991;
begin
 if typ='money' then
  if actor='' or curr='' or jsonb_typeof(e->'delta') is distinct from 'number'
     or coalesce(e->>'delta','') !~ '^-?[0-9]+$' then raise exception 'Invalid money event'; end if;
  d:=(e->>'delta')::numeric;
  if abs(d)>maxsafe then raise exception 'Money delta outside safe integer range'; end if;
  k:=jsonb_build_array(actor,curr)::text;
  old:=coalesce(st->'balances'->k,'{"known":false,"balance":null,"delta":0}'::jsonb);
  if op='reconcile' then
   if d<>0 or jsonb_typeof(e->'balance') is distinct from 'number'
      or coalesce(e->>'balance','') !~ '^[0-9]+$' then raise exception 'Invalid balance reconciliation'; end if;
   n:=(e->>'balance')::numeric;
   if n>maxsafe then raise exception 'Balance outside safe integer range'; end if;
   return jsonb_set(st,array['balances',k],jsonb_build_object('known',true,'balance',n,'delta',0),true);
  end if;
  known:=(old->>'known')::boolean;
  net:=(old->>'delta')::numeric+d;
  n:=case when known then (old->>'balance')::numeric+d else null end;
  if abs(net)>maxsafe or (known and (n<0 or n>maxsafe)) then raise exception 'Insufficient or overflowing recorded balance'; end if;
  if op='transfer' then
   if cp='' or cp=actor or d>=0 then raise exception 'Invalid money transfer'; end if;
   k2:=jsonb_build_array(cp,curr)::text;
   other:=coalesce(st->'balances'->k2,'{"known":false,"balance":null,"delta":0}'::jsonb);
   known2:=(other->>'known')::boolean;
   net2:=(other->>'delta')::numeric-d;
   n2:=case when known2 then (other->>'balance')::numeric-d else null end;
   if abs(net2)>maxsafe or (known2 and (n2<0 or n2>maxsafe)) then raise exception 'Recipient balance overflow'; end if;
   st:=jsonb_set(st,array['balances',k2],jsonb_build_object('known',known2,'balance',n2,'delta',net2),true);
  end if;
  return jsonb_set(st,array['balances',k],jsonb_build_object('known',known,'balance',n,'delta',net),true);
 elsif typ='item' then
  if nullif(btrim(coalesce(iid,'')),'') is null or nullif(btrim(coalesce(action,'')),'') is null then raise exception 'Invalid item event'; end if;
  old:=coalesce(st->'items'->iid,'{"custody_status":"unknown","holder":null}'::jsonb);
  if e->'custody_version' is distinct from '1'::jsonb then
   return jsonb_set(st,array['items',iid],'{"custody_status":"unknown","holder":null}'::jsonb,true);
  end if;
  if actor='' or action not in ('acquire','transfer','take','drop','destroy','recover','observe') then raise exception 'Invalid custody action'; end if;
  if action in ('transfer','take') and (cp='' or actor=cp) then raise exception 'Invalid custody counterparty'; end if;
  status:=old->>'custody_status'; holder:=old->>'holder';
  if action='observe' then return jsonb_set(st,array['items',iid],old,true); end if;
  if status='destroyed' then raise exception 'Item already destroyed'; end if;
  if action='take' then
   if status='lost' or (status='held' and holder is distinct from cp) then raise exception 'Item not held by the named prior holder'; end if;
  elsif status='held' and holder is distinct from actor then raise exception 'Item held by a different actor';
  end if;
  if action='acquire' and status in ('held','lost') then raise exception 'Item must be transferred or recovered, not acquired again'; end if;
  if action='recover' and status='held' then raise exception 'Item is not lost'; end if;
  if action in ('transfer','drop') and status='lost' then raise exception 'Item must be recovered first'; end if;
  next_status:=case action when 'destroy' then 'destroyed' when 'drop' then 'lost' else 'held' end;
  return jsonb_set(st,array['items',iid],jsonb_build_object('custody_status',next_status,
   'holder',case when next_status='held' then case when action='transfer' then cp else actor end else null end),true);
 end if;
 return st;
end $$;
revoke all on function public.nw_economy_step(jsonb,jsonb) from public,anon,authenticated;

-- Called only after nw_commit_scene locks and verifies world, branch and head.
-- Replay actual parent ancestry oldest-first. Invalid HISTORICAL economy events
-- are skipped (as warnings in JS), but every NEW event must pass.
create or replace function public.nw_assert_economy_append(p_world uuid,p_head uuid,p_events jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
 u uuid:=auth.uid(); state jsonb:='{"balances":{},"items":{}}'::jsonb;
 rec record; ev jsonb; last_parent uuid; seen integer:=0;
begin
 if not exists(select 1 from jsonb_array_elements(p_events) x(value) where x.value->>'type' in ('money','item')) then return; end if;
 if u is null or not exists(select 1 from public.nw_worlds where id=p_world and owner_id=u) then raise exception 'World not found'; end if;
 -- 50,000 is the same explicit safety cap as the MCP memory reader.
 -- The final ancestor must have no parent; missing/cyclic histories fail closed.
 for rec in
  with recursive chain as (
   select s.id,s.parent_scene_id,s.events,1 as depth from public.nw_scenes s where s.id=p_head and s.world_id=p_world and s.owner_id=u
   union all
   select s.id,s.parent_scene_id,s.events,c.depth+1 from chain c join public.nw_scenes s on s.id=c.parent_scene_id
    where s.world_id=p_world and s.owner_id=u and c.depth<50001
  ) select * from chain order by depth desc
 loop
  seen:=seen+1;
  if seen=1 and rec.parent_scene_id is not null then raise exception 'Incomplete or cyclic economy ancestry'; end if;
  if seen>50000 then raise exception 'Economy ancestry exceeds safety cap'; end if;
  for ev in select value from jsonb_array_elements(rec.events) loop
   if ev->>'type' in ('money','item') then
    begin state:=public.nw_economy_step(state,ev);
    exception when raise_exception then null; end;
   end if;
  end loop;
 end loop;
 if p_head is not null and seen=0 then raise exception 'Missing economy ancestry'; end if;
 for ev in select value from jsonb_array_elements(p_events) loop
  if ev->>'type' in ('money','item') then state:=public.nw_economy_step(state,ev); end if;
 end loop;
end $$;
revoke all on function public.nw_assert_economy_append(uuid,uuid,jsonb) from public,anon,authenticated;

-- Private shape checks for newly committed story facts. No historical rewrite.
create or replace function public.nw_story_text_valid(v jsonb,n integer)
returns boolean language sql immutable security invoker set search_path='' as $story$
 select coalesce(jsonb_typeof(v)='string' and char_length(btrim(v#>>'{}'))>0 and char_length(v#>>'{}')<=n,false)
$story$;
create or replace function public.nw_story_date_valid(v jsonb,day_only boolean default false)
returns boolean language plpgsql immutable security invoker set search_path='' as $story$
declare t text; d date;
begin
 if jsonb_typeof(v) is distinct from 'string' then return false; end if;
 t:=v#>>'{}'; if not day_only then t:=btrim(t); end if;
 if t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}([ T]([01][0-9]|2[0-3]):[0-5][0-9])?$' or (day_only and char_length(t)<>10) then return false; end if;
 if left(t,4)='0000' then return false; end if;
 begin
  d:=make_date(substring(t,1,4)::integer,substring(t,6,2)::integer,substring(t,9,2)::integer);
 exception when datetime_field_overflow then return false;
 end;
 return d is not null;
end $story$;
create or replace function public.nw_story_actors_valid(v jsonb,minimum integer)
returns boolean language plpgsql immutable security invoker set search_path='' as $story$
begin
 if jsonb_typeof(v) is distinct from 'array' then return false; end if;
 return jsonb_array_length(v) between minimum and 12
   and not exists(select 1 from jsonb_array_elements(v) a(value) where not public.nw_story_text_valid(a.value,140))
   and not exists(select 1 from jsonb_array_elements(v) a(value) group by a.value having count(*)>1);
end $story$;
create or replace function public.nw_assert_story_event_shape(e jsonb)
returns void language plpgsql immutable security invoker set search_path='' as $story$
declare typ text:=e->>'type'; k text; p jsonb; v jsonb; key_name text; n integer;
 fields constant jsonb:='{"trust":["trusted","distrusted","conditional","unknown"],"respect":["respected","disrespected","unknown"],"affection":["affectionate","indifferent","dislike","hatred","unknown"],"fear":["fearful","unafraid","unknown"],"resentment":["resentful","released","unknown"],"cooperation":["cooperating","refuses","conditional","unknown"],"attraction":["attracted","not_attracted","ambivalent","unknown"],"jealousy":["jealous","not_jealous","unknown"],"commitment":["committed","uncertain","withdrawn","unknown"],"boundary":["open","distance","no_contact","unknown"]}';
 statuses constant jsonb:='{"bond":["active","strained","estranged","ended","unknown"],"institution":["operating","restricted","suspended","closed","unknown"],"contest":["open","negotiating","decided","abandoned","unknown"],"development":["scheduled","ongoing","completed","cancelled","unknown"],"family_event":["planned","ongoing","completed","cancelled","unknown"],"family_duty":["active","paused","ended","unknown"],"life_transition":["planned","ongoing","completed","cancelled","unknown"]}';
begin
 if typ='character' and e?'state_patch' then
  p:=e->'state_patch';
  if not public.nw_story_text_valid(e->'name',100000) or jsonb_typeof(p) is distinct from 'object' or p='{}'::jsonb then raise exception 'Invalid character state'; end if;
  for k,v in select key,value from jsonb_each(p) loop
   if k not in ('location','occupation','condition','birth_date','life_stage','education','career_goal','pregnancy','family_goal','residence','injury','appearance','mood','habit','preference','aversion','affiliation','role','availability','personal_goal','speech_style','register','temperament','values','coping_style','humor')
      or (v<>'null'::jsonb and not public.nw_story_text_valid(v,600))
      or (k='birth_date' and v<>'null'::jsonb and not public.nw_story_date_valid(v,true)) then raise exception 'Invalid character state field: %',k; end if;
  end loop;
 elsif typ='relationship' then
  if not public.nw_story_text_valid(e->'a',100000) or not public.nw_story_text_valid(e->'b',100000) then raise exception 'Relationship requires two names'; end if;
  if e?'relationship_version' and e->'relationship_version' is distinct from '1'::jsonb then raise exception 'Invalid relationship version'; end if;
  if e?'relationship_patch' then
   p:=e->'relationship_patch';
   if e->'relationship_version' is distinct from '1'::jsonb or not public.nw_story_text_valid(e->'a',140) or not public.nw_story_text_valid(e->'b',140)
      or e->>'a'=e->>'b' or jsonb_typeof(p) is distinct from 'object' or p='{}'::jsonb then raise exception 'Invalid directed relationship'; end if;
   for k,v in select key,value from jsonb_each(p) loop
    if not coalesce((fields->k) @> jsonb_build_array(v),false) then raise exception 'Invalid directed relationship field: %',k; end if;
   end loop;
  elsif e->'relationship_version'='1'::jsonb and not public.nw_story_text_valid(e->'stance',80) then raise exception 'Relationship needs a state'; end if;
 elsif typ='world' then
  n:=num_nonnulls(e->'world_record_version',e->'social_record_version',e->'interaction_version',e->'activity_version',e->'consequence_version',e->'growth_version',e->'dynamics_version');
  if n>1 then raise exception 'Mixed world record versions'; end if;
  key_name:=coalesce(e->>'key','');
  if (key_name like 'dynamics:%' and e->'dynamics_version' is distinct from '1'::jsonb)
   or (key_name like 'growth:%' and e->'growth_version' is distinct from '1'::jsonb)
   or (key_name like 'social:%' and e->'social_record_version' is distinct from '1'::jsonb)
   or (key_name like 'activity:%' and e->'activity_version' is distinct from '1'::jsonb)
   or (key_name like 'consequence:%' and e->'consequence_version' is distinct from '1'::jsonb)
   or ((key_name like 'place:%' or key_name like 'routine:%') and e->'world_record_version' is distinct from '1'::jsonb)
   then raise exception 'Reserved world key requires version'; end if;
  if e?'interaction_version' then
   k:=e->>'interaction_kind';
   if e->'interaction_version' is distinct from '1'::jsonb or coalesce(k,'') not in ('meeting','conversation','cooperation','conflict','betrayal','support','competition','shared_activity','date','romantic_milestone','intimacy','separation')
    or not public.nw_story_actors_valid(e->'actors',2) or not public.nw_story_text_valid(e->'description',600) then raise exception 'Invalid interaction episode'; end if;
   if k in ('date','romantic_milestone','intimacy','separation') and jsonb_array_length(e->'actors')<>2 then raise exception 'Personal episode requires two participants'; end if;
   if e->'place' is not null and e->'place'<>'null'::jsonb and not public.nw_story_text_valid(e->'place',140) then raise exception 'Invalid interaction place'; end if;
   if e->'outcome' is not null and e->'outcome'<>'null'::jsonb and not public.nw_story_text_valid(e->'outcome',600) then raise exception 'Invalid interaction outcome'; end if;
  end if;
  if e?'dynamics_version' then
   k:=e->>'dynamics_kind';
   if e->'dynamics_version' is distinct from '1'::jsonb or not coalesce((statuses->k) @> jsonb_build_array(e->'status'),false)
     or jsonb_typeof(e->'record_id') is distinct from 'string' or coalesce(e->>'record_id','') !~ '^[A-Za-z0-9_-]{1,80}$'
     or e->>'key' is distinct from ('dynamics:'||k||':'||(e->>'record_id'))
     or not public.nw_story_text_valid(e->'description',600) then raise exception 'Invalid world dynamics record'; end if;
   if k='bond' and (not public.nw_story_text_valid(e->'actor',140) or not public.nw_story_text_valid(e->'counterparty',140) or e->>'actor'=e->>'counterparty'
    or coalesce(e->>'bond_type','') not in ('family','friendship','professional','mentorship','rivalry','community','romantic','marriage','parenthood','cohabitation','other')) then raise exception 'Invalid social bond'; end if;
   if k='institution' and (not public.nw_story_text_valid(e->'name',140) or not public.nw_story_text_valid(e->'function',300) or not public.nw_story_text_valid(e->'place',140)
    or jsonb_typeof(e->'group_id') is distinct from 'string' or coalesce(e->>'group_id','') !~ '^[A-Za-z0-9_-]{1,80}$') then raise exception 'Invalid institution'; end if;
   if k='contest' and (not public.nw_story_text_valid(e->'resource',300) or not public.nw_story_actors_valid(e->'actors',2) or not public.nw_story_text_valid(e->'title',140)) then raise exception 'Invalid contest'; end if;
   if k='development' and (not public.nw_story_text_valid(e->'title',140) or not public.nw_story_text_valid(e->'place',140) or not public.nw_story_actors_valid(e->'actors',0)) then raise exception 'Invalid development'; end if;
   if k='life_transition' and (not public.nw_story_text_valid(e->'actor',140) or not public.nw_story_text_valid(e->'title',140)
     or coalesce(e->>'transition_kind','') not in ('education','employment','relocation','retirement','health','other')) then raise exception 'Invalid life transition'; end if;
   if k in ('family_event','family_duty') and (not public.nw_story_text_valid(e->'title',140) or not public.nw_story_actors_valid(e->'actors',1)
    or coalesce(e->>'family_kind','') not in ('birth','care','education','birthday','household','other')) then raise exception 'Invalid family record'; end if;
   if k='family_duty' then
    if coalesce(e->>'family_kind','') not in ('care','education','household','other') or not public.nw_story_date_valid(e->'starts_on',true)
     or jsonb_typeof(e->'every_days') is distinct from 'number' or coalesce(e->>'every_days','') !~ '^[0-9]{1,3}$' then raise exception 'Invalid family schedule'; end if;
    if (e->>'every_days')::integer not between 1 and 366 then raise exception 'Invalid family schedule period'; end if;
    if e->'ends_on' is not null and e->'ends_on'<>'null'::jsonb and (not public.nw_story_date_valid(e->'ends_on',true) or (e->>'ends_on')<(e->>'starts_on')) then raise exception 'Invalid family schedule end'; end if;
   end if;
   if e->'due_at' is not null and e->'due_at'<>'null'::jsonb and not public.nw_story_date_valid(e->'due_at') then raise exception 'Invalid dynamics date'; end if;
   foreach key_name in array array['outcome','obstacle','next_step','terms'] loop
    v:=e->key_name;
    if v is not null and v<>'null'::jsonb and not public.nw_story_text_valid(v,600) then raise exception 'Invalid dynamics field: %',key_name; end if;
   end loop;
   if ((k='contest' and e->>'status'='decided') or (k in ('development','family_event','life_transition') and e->>'status'='completed'))
    and not public.nw_story_text_valid(e->'outcome',600) then raise exception 'Completed dynamics needs outcome'; end if;
  end if;
 end if;
end $story$;
revoke all on function public.nw_story_text_valid(jsonb,integer),public.nw_story_date_valid(jsonb,boolean),public.nw_story_actors_valid(jsonb,integer),public.nw_assert_story_event_shape(jsonb) from public,anon,authenticated;

-- Branch-local transitions for plan lifecycles and persistent world records.
-- Pure fold; invalid historic transitions are skipped, never rewritten.
create or replace function public.nw_story_transition_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $transition$
declare k text; kind text; old jsonb; action text; next_status text; field text; parent jsonb;
begin
 if e->>'type'='plan' then
  if not public.nw_story_text_valid(e->'actor',100000) or not public.nw_story_text_valid(e->'plan_id',100000) then raise exception 'Invalid plan identity'; end if;
  k:=jsonb_build_array(e->>'actor',e->>'plan_id')::text; old:=st->'plans'->k; action:=e->>'action';
  if action='start' then
   if old is not null or not public.nw_story_text_valid(e->'goal',100000) then raise exception 'Invalid or duplicate plan start'; end if;
   next_status:='active';
  else
   if old is null or old->>'status' in ('completed','abandoned') or coalesce(action,'') not in ('advance','pause','resume','complete','abandon')
    or (action='resume' and old->>'status'<>'paused') or (action='pause' and old->>'status'<>'active') then raise exception 'Invalid plan transition'; end if;
   next_status:=case action when 'complete' then 'completed' when 'abandon' then 'abandoned' when 'pause' then 'paused' else 'active' end;
  end if;
  return jsonb_set(st,array['plans',k],jsonb_build_object('status',next_status),true);
 end if;
 if e->>'type' is distinct from 'world' or not public.nw_story_text_valid(e->'key',100000) then return st; end if;
 k:=e->>'key'; old:=st->'records'->k;
 perform public.nw_assert_story_event_shape(e);
 if e->'dynamics_version'='1'::jsonb then
  kind:=e->>'dynamics_kind';
  if old is not null then
   foreach field in array array['dynamics_version','dynamics_kind','record_id'] loop
    if old->field is distinct from e->field then raise exception 'Changed dynamics identity'; end if;
   end loop;
   if (kind='bond' and (old->'actor' is distinct from e->'actor' or old->'counterparty' is distinct from e->'counterparty' or old->'bond_type' is distinct from e->'bond_type'))
    or (kind='institution' and old->'group_id' is distinct from e->'group_id')
    or (kind='contest' and old->'resource' is distinct from e->'resource')
    or (kind='life_transition' and (old->'actor' is distinct from e->'actor' or old->'transition_kind' is distinct from e->'transition_kind'))
    or (kind='family_event' and old->'family_kind' is distinct from e->'family_kind')
    or (kind='family_duty' and (old->'family_kind' is distinct from e->'family_kind' or old->'starts_on' is distinct from e->'starts_on' or old->'every_days' is distinct from e->'every_days' or not coalesce(old->'actors' @> e->'actors' and e->'actors' @> old->'actors',false)))
    then raise exception 'Changed dynamics identity'; end if;
   if old->'status' is distinct from e->'status' and
    ((kind in ('bond','family_duty') and old->>'status'='ended') or
     (kind in ('development','family_event','life_transition') and old->>'status' in ('completed','cancelled')) or
     (kind='contest' and old->>'status' in ('decided','abandoned')))
    then raise exception 'Terminal dynamics requires new ID'; end if;
  end if;
  if kind='institution' and not ((st->'records') ? ('social:group:'||(e->>'group_id'))) then raise exception 'Institution requires existing group'; end if;
 elsif e->'social_record_version'='1'::jsonb and old is not null then
  if old->'social_kind' is distinct from e->'social_kind' or old->'record_id' is distinct from e->'record_id'
   or (e->>'social_kind'='membership' and (old->'actor' is distinct from e->'actor' or old->'group_id' is distinct from e->'group_id')) then raise exception 'Changed social identity'; end if;
 elsif e->'activity_version'='1'::jsonb and old is not null then
  if old->'activity_version' is distinct from e->'activity_version' or old->'activity_kind' is distinct from e->'activity_kind' or old->'record_id' is distinct from e->'record_id'
   or (e->>'activity_kind'='habit' and old->'actor' is distinct from e->'actor')
   or (e->>'activity_kind'='activity' and old->>'status' in ('completed','cancelled') and e->>'status' not in ('completed','cancelled')) then raise exception 'Invalid activity transition'; end if;
 elsif e->'consequence_version'='1'::jsonb and old is not null then
  if old->'consequence_version' is distinct from e->'consequence_version' or old->'actor' is distinct from e->'actor' or old->'consequence_kind' is distinct from e->'consequence_kind' or old->'source_incident' is distinct from e->'source_incident'
   or (old->>'status'='resolved' and e->>'status'<>'resolved') then raise exception 'Invalid consequence transition'; end if;
 elsif e->'growth_version'='1'::jsonb then
  kind:=e->>'growth_kind';
  if old is not null then
   if old->'growth_version' is distinct from e->'growth_version' or old->'growth_kind' is distinct from e->'growth_kind' or old->'record_id' is distinct from e->'record_id' or kind='rumor'
    or (kind in ('skill','project') and (old->'actor' is distinct from e->'actor' or (kind='skill' and old->'name' is distinct from e->'name') or (kind='project' and old->'title' is distinct from e->'title')))
    or (kind='project' and old->>'status' in ('completed','abandoned') and old->'status' is distinct from e->'status')
    or (kind='cause' and (old->'from_key' is distinct from e->'from_key' or old->'to_key' is distinct from e->'to_key')) then raise exception 'Invalid growth transition'; end if;
  end if;
  if kind='rumor' and e->>'parent_rumor_id' is not null then
   parent:=st->'records'->('growth:rumor:'||(e->>'parent_rumor_id'));
   if parent is null or parent->'topic_id' is distinct from e->'topic_id' or parent->'recipient' is distinct from e->'sender' then raise exception 'Invalid parent rumor'; end if;
  end if;
  if kind='cause' then
   if not coalesce((st->'records') ? (e->>'from_key') and (st->'records') ? (e->>'to_key'),false) then raise exception 'Missing causal endpoints'; end if;
   if e->>'status'='established' and exists(
    with recursive reachable(node) as (
     select e->>'to_key'
     union
     select edge.value->>'to_key' from reachable r cross join lateral jsonb_each(st->'records') edge
     where edge.key<>k and edge.value->>'growth_kind'='cause' and edge.value->>'status'='established' and edge.value->>'from_key'=r.node
    ) select 1 from reachable where node=e->>'from_key'
   ) then raise exception 'Established causal cycle'; end if;
  end if;
 end if;
 return jsonb_set(st,array['records',k],e,true);
end $transition$;
revoke all on function public.nw_story_transition_step(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.nw_assert_story_transitions(p_world uuid,p_head uuid,p_events jsonb)
returns void language plpgsql security invoker set search_path='' as $transition$
declare u uuid:=auth.uid(); st jsonb:='{"plans":{},"records":{}}'; rec record; e jsonb; seen integer:=0;
begin
 if not exists(select 1 from jsonb_array_elements(p_events) x where x->>'type'='plan' or (x->>'type'='world' and (x?'dynamics_version' or x?'social_record_version' or x?'activity_version' or x?'consequence_version' or x?'growth_version'))) then return; end if;
 if u is null or not exists(select 1 from public.nw_worlds where id=p_world and owner_id=u) then raise exception 'World not found'; end if;
 for rec in with recursive chain as (
  select s.id,s.parent_scene_id,s.events,1 as depth from public.nw_scenes s where s.id=p_head and s.world_id=p_world and s.owner_id=u
  union all select s.id,s.parent_scene_id,s.events,c.depth+1 from chain c join public.nw_scenes s on s.id=c.parent_scene_id where s.world_id=p_world and s.owner_id=u and c.depth<50001
 ) select * from chain order by depth desc loop
  seen:=seen+1;
  if (seen=1 and rec.parent_scene_id is not null) or seen>50000 then raise exception 'Incomplete story transition ancestry'; end if;
  for e in select value from jsonb_array_elements(rec.events) loop
   begin st:=public.nw_story_transition_step(st,e); exception when raise_exception then null; end;
  end loop;
 end loop;
 if p_head is not null and seen=0 then raise exception 'Missing story transition ancestry'; end if;
 for e in select value from jsonb_array_elements(p_events) loop st:=public.nw_story_transition_step(st,e); end loop;
end $transition$;
revoke all on function public.nw_assert_story_transitions(uuid,uuid,jsonb) from public,anon,authenticated;

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
  perform public.nw_assert_story_event_shape(e);
  if e->>'type'='plan' then
    if nullif(trim(e->>'actor'),'') is null or nullif(trim(e->>'plan_id'),'') is null or
       coalesce(e->>'action','') not in ('start','advance','pause','resume','complete','abandon')
       then raise exception 'Invalid actor plan'; end if;
    if e->>'action'='start' and nullif(trim(e->>'goal'),'') is null
       then raise exception 'New plan requires a character goal'; end if;
    if e->>'action'='complete' and not exists(
      select 1 from jsonb_array_elements(p_events) a(value)
      where a.value->>'id'=e->>'performed_event_id' and a.value->>'type' in ('world','offscreen')
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
 insert into public.nw_scenes(id,owner_id,world_id,branch_id,parent_scene_id,request_id,body,world_time,events,rules_version_at_commit)
 values(new_id,u,p_world_id,p_branch_id,current_head,p_request_id,p_body,nullif(trim(p_world_time),''),coalesce(p_events,'[]'::jsonb),actual_rules_version);
 update public.nw_branches set head_scene_id=new_id where id=p_branch_id;
 update public.nw_worlds set updated_at=now() where id=p_world_id;
 return new_id;
end $$;
revoke all on function public.nw_commit_scene(uuid,uuid,uuid,uuid,text,text,jsonb,integer) from public,anon;
grant execute on function public.nw_commit_scene(uuid,uuid,uuid,uuid,text,text,jsonb,integer) to authenticated;
