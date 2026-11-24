-- 010: extend existing private guards without rewriting deployed 007 or user history.
create or replace function public.nw_assert_story_event_shape(e jsonb)
returns void language plpgsql immutable security invoker set search_path='' as $story$
declare typ text:=e->>'type'; k text; p jsonb; v jsonb; key_name text; n integer;
 fields constant jsonb:='{"trust":["trusted","distrusted","conditional","unknown"],"respect":["respected","disrespected","unknown"],"affection":["affectionate","indifferent","dislike","hatred","unknown"],"fear":["fearful","unafraid","unknown"],"resentment":["resentful","released","unknown"],"cooperation":["cooperating","refuses","conditional","unknown"],"attraction":["attracted","not_attracted","ambivalent","unknown"],"jealousy":["jealous","not_jealous","unknown"],"commitment":["committed","uncertain","withdrawn","unknown"],"boundary":["open","distance","no_contact","unknown"]}';
 statuses constant jsonb:='{"bond":["active","strained","estranged","ended","unknown"],"institution":["operating","restricted","suspended","closed","unknown"],"contest":["open","negotiating","decided","abandoned","unknown"],"development":["scheduled","ongoing","completed","cancelled","unknown"],"family_event":["planned","ongoing","completed","cancelled","unknown"],"family_duty":["active","paused","ended","unknown"],"life_transition":["planned","ongoing","completed","cancelled","unknown"],"employment":["offered","active","suspended","ended","declined","unknown"],"market_offer":["available","reserved","withdrawn","sold","unknown"],"economic_agreement":["proposed","active","disputed","settled","cancelled","unknown"]}';
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
   if k in ('employment','market_offer','economic_agreement') then
    if not public.nw_story_text_valid(e->'actor',140) or not public.nw_story_text_valid(e->'title',140)
     or (k<>'market_offer' and (not public.nw_story_text_valid(e->'counterparty',140) or e->>'actor'=e->>'counterparty'))
     or (k='market_offer' and e->>'counterparty' is not null and (not public.nw_story_text_valid(e->'counterparty',140) or e->>'actor'=e->>'counterparty')) then raise exception 'Invalid economic parties'; end if;
    if e->>'amount' is not null or e->>'currency' is not null then
     if jsonb_typeof(e->'amount') is distinct from 'number' or coalesce(e->>'amount','') !~ '^[0-9]{1,16}$' or not public.nw_story_text_valid(e->'currency',80) then raise exception 'Invalid economic amount'; end if;
     if (e->>'amount')::numeric>9007199254740991 then raise exception 'Unsafe economic amount'; end if;
    end if;
    if k='economic_agreement' and (e->>'amount' is null or (e->>'amount')::numeric<=0 or coalesce(e->>'agreement_kind','') not in ('debt','rent','service','other')) then raise exception 'Invalid agreement'; end if;
    if k='employment' and e->>'pay_period' is not null and (e->>'amount' is null or e->>'pay_period' not in ('hour','day','week','month','task')) then raise exception 'Invalid pay period'; end if;
    if k='market_offer' and (coalesce(e->>'offer_kind','') not in ('goods','service') or (e->>'item_id' is not null and (e->>'offer_kind'<>'goods' or not public.nw_story_text_valid(e->'item_id',180))) or (e->>'status'='reserved' and not public.nw_story_text_valid(e->'counterparty',140))) then raise exception 'Invalid offer'; end if;
    if e->>'group_id' is not null and (jsonb_typeof(e->'group_id') is distinct from 'string' or e->>'group_id' !~ '^[A-Za-z0-9_-]{1,80}$') then raise exception 'Invalid group'; end if;
    if e->>'place' is not null and not public.nw_story_text_valid(e->'place',140) then raise exception 'Invalid place'; end if;
    if ((k='economic_agreement' and e->>'status'='settled') or (k='market_offer' and e->>'status'='sold')) and not public.nw_story_text_valid(e->'outcome',600) then raise exception 'Missing economic outcome'; end if;
   end if;
   if k='life_transition' and (not public.nw_story_text_valid(e->'actor',140) or not public.nw_story_text_valid(e->'title',140)
     or coalesce(e->>'transition_kind','') not in ('education','employment','relocation','retirement','health','other')) then raise exception 'Invalid life transition'; end if;
   if k in ('family_event','family_duty') and (not public.nw_story_text_valid(e->'title',140) or not public.nw_story_actors_valid(e->'actors',1)
    or coalesce(e->>'family_kind','') not in ('birth','care','education','birthday','household','other')) then raise exception 'Invalid family record'; end if;
   if k='family_event' and (e->>'duty_id' is not null or e->>'scheduled_on' is not null) and
    (jsonb_typeof(e->'duty_id') is distinct from 'string' or coalesce(e->>'duty_id','') !~ '^[A-Za-z0-9_-]{1,80}$' or not public.nw_story_date_valid(e->'scheduled_on',true)) then raise exception 'Invalid family occurrence'; end if;
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
    or (kind in ('employment','market_offer','economic_agreement') and (old->'actor' is distinct from e->'actor' or old->>'group_id' is distinct from e->>'group_id'
      or (kind<>'market_offer' and old->'counterparty' is distinct from e->'counterparty')
      or (kind='market_offer' and (old->'offer_kind' is distinct from e->'offer_kind' or old->>'item_id' is distinct from e->>'item_id'))
      or (kind='economic_agreement' and (old->'agreement_kind' is distinct from e->'agreement_kind' or old->'amount' is distinct from e->'amount' or old->'currency' is distinct from e->'currency'))))
    or (kind='life_transition' and (old->'actor' is distinct from e->'actor' or old->'transition_kind' is distinct from e->'transition_kind'))
    or (kind='family_event' and (old->'family_kind' is distinct from e->'family_kind' or old->>'duty_id' is distinct from e->>'duty_id' or old->>'scheduled_on' is distinct from e->>'scheduled_on'))
    or (kind='family_duty' and (old->'family_kind' is distinct from e->'family_kind' or old->'starts_on' is distinct from e->'starts_on' or old->'every_days' is distinct from e->'every_days' or not coalesce((old->'actors') @> (e->'actors') and (e->'actors') @> (old->'actors'),false)))
    then raise exception 'Changed dynamics identity'; end if;
   if kind='market_offer' and old->>'status'='reserved' and e->>'status'='sold' and old->>'counterparty' is distinct from e->>'counterparty' then raise exception 'Reserved offer buyer changed'; end if;
   if old->'status' is distinct from e->'status' and
    ((kind in ('bond','family_duty') and old->>'status'='ended') or
     (kind in ('development','family_event','life_transition') and old->>'status' in ('completed','cancelled')) or
     (kind='contest' and old->>'status' in ('decided','abandoned')) or (kind='employment' and old->>'status' in ('ended','declined')) or (kind='market_offer' and old->>'status' in ('withdrawn','sold')) or (kind='economic_agreement' and old->>'status' in ('settled','cancelled')))
    then raise exception 'Terminal dynamics requires new ID'; end if;
  end if;
  if kind='family_event' and e->>'duty_id' is not null then
   parent:=st->'records'->('dynamics:family_duty:'||(e->>'duty_id'));
   if parent is null or parent->'family_kind' is distinct from e->'family_kind'
    or not coalesce((parent->'actors') @> (e->'actors') and (e->'actors') @> (parent->'actors'),false)
    or (e->>'scheduled_on')<(parent->>'starts_on') or (parent->>'ends_on' is not null and (e->>'scheduled_on')>(parent->>'ends_on'))
    or mod((e->>'scheduled_on')::date-(parent->>'starts_on')::date,(parent->>'every_days')::integer)<>0 then raise exception 'Family occurrence does not match schedule'; end if;
   if exists(select 1 from jsonb_each(st->'records') r where r.key<>k and r.value->>'dynamics_kind'='family_event' and r.value->>'duty_id'=e->>'duty_id' and r.value->>'scheduled_on'=e->>'scheduled_on') then raise exception 'Duplicate family occurrence'; end if;
  end if;
  if kind in ('employment','market_offer','economic_agreement') and e->>'group_id' is not null and not ((st->'records') ? ('social:group:'||(e->>'group_id'))) then raise exception 'Economic record requires existing group'; end if;
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

