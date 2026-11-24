-- 011: private stock and production guards. No changes to deployed migration 010.
create or replace function public.nw_assert_stock_lines(lines jsonb,action text)
returns void language plpgsql immutable security invoker set search_path='' as $stock$
declare l jsonb; q numeric; k text; seen text[]:=array[]::text[]; has_input boolean:=false; has_output boolean:=false;
begin
 if jsonb_typeof(lines) is distinct from 'array' then raise exception 'Invalid stock lines'; end if;
 if jsonb_array_length(lines) not between 1 and 20 then raise exception 'Invalid stock line count'; end if;
 for l in select value from jsonb_array_elements(lines) loop
  if jsonb_typeof(l) is distinct from 'object' then raise exception 'Invalid stock line object'; end if;
  if (select count(*) from jsonb_object_keys(l))<>3 then raise exception 'Unexpected stock line fields'; end if;
  if jsonb_typeof(l->'product_id') is distinct from 'string' or coalesce(l->>'product_id','') !~ '^[A-Za-z0-9_-]{1,80}$' or not public.nw_story_text_valid(l->'unit',40) or l->>'unit'<>btrim(l->>'unit') or jsonb_typeof(l->'quantity') is distinct from 'number' or coalesce(l->>'quantity','') !~ '^-?[0-9]{1,16}$' then raise exception 'Invalid stock line'; end if;
  q:=(l->>'quantity')::numeric;k:=jsonb_build_array(l->>'product_id',l->>'unit')::text;
  if k=any(seen) or abs(q)>9007199254740991 then raise exception 'Duplicate or unsafe stock line'; end if;seen:=array_append(seen,k);
  if (action='count' and q<0) or (action in ('receive','transfer') and q<=0) or (action='consume' and q>=0) or (action='produce' and q=0) then raise exception 'Invalid stock quantity sign'; end if;
  has_input:=has_input or q<0;has_output:=has_output or q>0;
 end loop;
 if action='produce' and not(has_input and has_output) then raise exception 'Production requires input and output'; end if;
end $stock$;
revoke all on function public.nw_assert_stock_lines(jsonb,text) from public,anon,authenticated;

create or replace function public.nw_stock_step(st jsonb,e jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $stock$
declare inventory jsonb:=coalesce(st->'stock','{}'::jsonb); l jsonb; actor text; k text; old jsonb; q numeric; net numeric; qty numeric; known boolean; action text:=e->>'stock_action'; side integer; sides integer:=case when e->>'stock_action'='transfer' then 2 else 1 end;
begin
 perform public.nw_assert_stock_lines(e->'stock_lines',action);
 for l in select value from jsonb_array_elements(e->'stock_lines') loop
  for side in 1..sides loop
   actor:=case when side=1 then e->>'actor' else e->>'counterparty' end;
   q:=(l->>'quantity')::numeric; if action='transfer' and side=1 then q:=-q; end if;
   k:=jsonb_build_array(actor,l->>'product_id',l->>'unit')::text;
   old:=inventory->k;known:=coalesce((old->>'known')::boolean,false);
   if action='count' then known:=true;qty:=q;net:=0;
   else
    if q<0 and (not known or (old->>'quantity')::numeric< -q) then raise exception 'Insufficient confirmed stock'; end if;
    net:=coalesce((old->>'delta')::numeric,0)+q;qty:=case when known then (old->>'quantity')::numeric+q else null end;
    if abs(net)>9007199254740991 or abs(qty)>9007199254740991 then raise exception 'Stock overflow'; end if;
   end if;
   inventory:=jsonb_set(inventory,array[k],jsonb_build_object('holder',actor,'product_id',l->>'product_id','unit',l->>'unit','known',known,'quantity',qty,'delta',net),true);
  end loop;
 end loop;
 return jsonb_set(st,array['stock'],inventory,true);
end $stock$;
revoke all on function public.nw_stock_step(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.nw_assert_story_event_shape(e jsonb)
returns void language plpgsql immutable security invoker set search_path='' as $story$
declare typ text:=e->>'type'; k text; p jsonb; v jsonb; key_name text; n integer;
 fields constant jsonb:='{"trust":["trusted","distrusted","conditional","unknown"],"respect":["respected","disrespected","unknown"],"affection":["affectionate","indifferent","dislike","hatred","unknown"],"fear":["fearful","unafraid","unknown"],"resentment":["resentful","released","unknown"],"cooperation":["cooperating","refuses","conditional","unknown"],"attraction":["attracted","not_attracted","ambivalent","unknown"],"jealousy":["jealous","not_jealous","unknown"],"commitment":["committed","uncertain","withdrawn","unknown"],"boundary":["open","distance","no_contact","unknown"]}';
 statuses constant jsonb:='{"bond":["active","strained","estranged","ended","unknown"],"institution":["operating","restricted","suspended","closed","unknown"],"contest":["open","negotiating","decided","abandoned","unknown"],"development":["scheduled","ongoing","completed","cancelled","unknown"],"family_event":["planned","ongoing","completed","cancelled","unknown"],"family_duty":["active","paused","ended","unknown"],"life_transition":["planned","ongoing","completed","cancelled","unknown"],"employment":["offered","active","suspended","ended","declined","unknown"],"market_offer":["available","reserved","withdrawn","sold","unknown"],"economic_agreement":["proposed","active","disputed","settled","cancelled","unknown"],"payment_schedule":["active","paused","ended"],"payment_occurrence":["paid","waived"],"enterprise":["planned","operating","suspended","closed"],"production_order":["planned","ongoing","completed","cancelled"],"stock_operation":["recorded"],"player_choice":["pending","answered"]}';
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
   if k='player_choice' then
    if not public.nw_story_text_valid(e->'actor',140) then raise exception 'Missing player character'; end if;
    if e->>'status'='pending' then
     if not public.nw_story_text_valid(e->'question',600) or jsonb_typeof(e->'options') is distinct from 'array' or e->>'selected_option' is not null or e->>'action_text' is not null then raise exception 'Invalid pending choice'; end if;
     if jsonb_array_length(e->'options') not between 2 and 5 then raise exception 'Invalid number of choices'; end if;
     for v in select value from jsonb_array_elements(e->'options') loop
      if jsonb_typeof(v) is distinct from 'object' then raise exception 'Invalid option'; end if;
      if (select count(*) from jsonb_object_keys(v))<>2 or jsonb_typeof(v->'id') is distinct from 'string' or coalesce(v->>'id','') !~ '^[A-Za-z0-9_-]{1,80}$' or v->>'id'='custom' or not public.nw_story_text_valid(v->'text',600) then raise exception 'Invalid option'; end if;
     end loop;
     if exists(select 1 from jsonb_array_elements(e->'options') o group by o->>'id' having count(*)>1) or exists(select 1 from jsonb_array_elements(e->'options') o group by btrim(o->>'text') having count(*)>1) then raise exception 'Duplicate options'; end if;
    elsif jsonb_typeof(e->'selected_option') is distinct from 'string' or coalesce(e->>'selected_option','') !~ '^[A-Za-z0-9_-]{1,80}$' or not public.nw_story_text_valid(e->'action_text',5000) or e->>'options' is not null or e->>'question' is not null then raise exception 'Invalid player answer'; end if;
   end if;
   if k='enterprise' and (not public.nw_story_text_valid(e->'actor',140) or not public.nw_story_text_valid(e->'title',140) or not public.nw_story_text_valid(e->'place',140) or not public.nw_story_text_valid(e->'business_kind',140) or coalesce(e->>'group_id','') !~ '^[A-Za-z0-9_-]{1,80}$') then raise exception 'Invalid enterprise'; end if;
   if k='stock_operation' then
    if not public.nw_story_text_valid(e->'actor',140) or e->>'actor'<>btrim(e->>'actor') or coalesce(e->>'stock_action','') not in ('count','receive','consume','transfer','produce') then raise exception 'Invalid stock holder or action'; end if;
    if e->>'stock_action'='transfer' then
     if not public.nw_story_text_valid(e->'counterparty',140) or e->>'counterparty'<>btrim(e->>'counterparty') or e->>'actor'=e->>'counterparty' then raise exception 'Invalid stock recipient'; end if;
    elsif e->>'counterparty' is not null then raise exception 'Unexpected stock recipient'; end if;
    perform public.nw_assert_stock_lines(e->'stock_lines',e->>'stock_action');
   end if;
   if k='production_order' then
    if not public.nw_story_text_valid(e->'actor',140) or not public.nw_story_text_valid(e->'title',140) or coalesce(e->>'enterprise_id','') !~ '^[A-Za-z0-9_-]{1,80}$' then raise exception 'Invalid production order'; end if;
    perform public.nw_assert_stock_lines(e->'stock_lines','produce');
    if (e->>'status'='completed' and (coalesce(e->>'stock_record_id','') !~ '^[A-Za-z0-9_-]{1,80}$' or not public.nw_story_text_valid(e->'outcome',600))) or (e->>'status'<>'completed' and e->>'stock_record_id' is not null) then raise exception 'Missing production result'; end if;
   end if;
   if k in ('payment_schedule','payment_occurrence') then
    if not public.nw_story_text_valid(e->'actor',140) or not public.nw_story_text_valid(e->'counterparty',140) or e->>'actor'=e->>'counterparty' or not public.nw_story_text_valid(e->'title',140)
     or jsonb_typeof(e->'amount') is distinct from 'number' or coalesce(e->>'amount','') !~ '^[0-9]{1,16}$' or not public.nw_story_text_valid(e->'currency',80) then raise exception 'Invalid payment terms'; end if;
    if (e->>'amount')::numeric not between 1 and 9007199254740991 then raise exception 'Invalid payment amount'; end if;
    if k='payment_schedule' then
     if coalesce(e->>'payment_kind','') not in ('wage','rent','debt','service','other') or not public.nw_story_date_valid(e->'starts_on',true) or jsonb_typeof(e->'every_days') is distinct from 'number' or coalesce(e->>'every_days','') !~ '^[0-9]{1,3}$' then raise exception 'Invalid payment schedule'; end if;
     if (e->>'every_days')::integer not between 1 and 366 or (e->>'ends_on' is not null and (not public.nw_story_date_valid(e->'ends_on',true) or (e->>'ends_on')<(e->>'starts_on'))) then raise exception 'Invalid payment period'; end if;
    else
     if jsonb_typeof(e->'schedule_id') is distinct from 'string' or coalesce(e->>'schedule_id','') !~ '^[A-Za-z0-9_-]{1,80}$' or not public.nw_story_date_valid(e->'scheduled_on',true) or not public.nw_story_text_valid(e->'outcome',600)
       or (e->>'status'='paid' and not public.nw_story_text_valid(e->'transfer_event_id',180)) or (e->>'status'='waived' and e->>'transfer_event_id' is not null) then raise exception 'Invalid payment occurrence'; end if;
    end if;
   end if;
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
  if kind='player_choice' then
   if e->>'status'='pending' then
    if old is not null or exists(select 1 from jsonb_each(st->'records') r where r.value->>'dynamics_kind'='player_choice' and r.value->>'status'='pending') then raise exception 'Current choice unresolved or reused'; end if;
   else
    if old is null or old->>'dynamics_kind'<>'player_choice' or old->>'status'<>'pending' or old->'actor' is distinct from e->'actor' then raise exception 'No matching pending choice'; end if;
    if e->>'selected_option'<>'custom' and not exists(select 1 from jsonb_array_elements(old->'options') o where o->>'id'=e->>'selected_option' and o->>'text'=e->>'action_text') then raise exception 'Altered choice answer'; end if;
   end if;
  end if;
  if old is not null then
   foreach field in array array['dynamics_version','dynamics_kind','record_id'] loop
    if old->field is distinct from e->field then raise exception 'Changed dynamics identity'; end if;
   end loop;
   if kind='stock_operation' or (kind='production_order' and old->>'status' in ('completed','cancelled')) then raise exception 'Immutable stock operation or closed order'; end if;
   if kind='enterprise' and (old->'actor' is distinct from e->'actor' or old->'group_id' is distinct from e->'group_id') then raise exception 'Enterprise identity changed'; end if;
   if kind='production_order' and (old->'actor' is distinct from e->'actor' or old->'enterprise_id' is distinct from e->'enterprise_id' or old->'stock_lines' is distinct from e->'stock_lines') then raise exception 'Production order identity changed'; end if;
   if kind='payment_occurrence' then raise exception 'Payment occurrence already closed'; end if;
   if kind='payment_schedule' then
    foreach field in array array['actor','counterparty','amount','currency','payment_kind','starts_on','every_days'] loop
     if old->field is distinct from e->field then raise exception 'Payment schedule identity changed'; end if;
    end loop;
   end if;
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
    ((kind='enterprise' and old->>'status'='closed') or (kind in ('bond','family_duty','payment_schedule') and old->>'status'='ended') or
     (kind in ('development','family_event','life_transition') and old->>'status' in ('completed','cancelled')) or
     (kind='contest' and old->>'status' in ('decided','abandoned')) or (kind='employment' and old->>'status' in ('ended','declined')) or (kind='market_offer' and old->>'status' in ('withdrawn','sold')) or (kind='economic_agreement' and old->>'status' in ('settled','cancelled')))
    then raise exception 'Terminal dynamics requires new ID'; end if;
  end if;
  if kind='enterprise' and not ((st->'records') ? ('social:group:'||(e->>'group_id'))) then raise exception 'Missing enterprise group'; end if;
  if kind='stock_operation' then st:=public.nw_stock_step(st,e); end if;
  if kind='production_order' then
   parent:=st->'records'->('dynamics:enterprise:'||(e->>'enterprise_id'));
   if parent is null or parent->'actor' is distinct from e->'actor' then raise exception 'Missing enterprise or mismatched holder'; end if;
   if e->>'status'='completed' then
    if parent->>'status'<>'operating' then raise exception 'Enterprise is not operating'; end if;
    parent:=st->'records'->('dynamics:stock_operation:'||(e->>'stock_record_id'));
    if parent is null or parent->>'stock_action'<>'produce' or parent->'actor' is distinct from e->'actor' or parent->'stock_lines' is distinct from e->'stock_lines' then raise exception 'Production output not established'; end if;
    if exists(select 1 from jsonb_each(st->'records') r where r.value->>'dynamics_kind'='production_order' and r.value->>'stock_record_id'=e->>'stock_record_id') then raise exception 'Production batch reused'; end if;
   end if;
  end if;
  if kind='payment_occurrence' then
   parent:=st->'records'->('dynamics:payment_schedule:'||(e->>'schedule_id'));
   if parent is null then raise exception 'Missing payment schedule'; end if;
   foreach field in array array['actor','counterparty','amount','currency'] loop
    if parent->field is distinct from e->field then raise exception 'Payment terms differ'; end if;
   end loop;
   if (e->>'scheduled_on')<(parent->>'starts_on') or (parent->>'ends_on' is not null and (e->>'scheduled_on')>(parent->>'ends_on')) or mod((e->>'scheduled_on')::date-(parent->>'starts_on')::date,(parent->>'every_days')::integer)<>0 then raise exception 'Payment date off schedule'; end if;
   if exists(select 1 from jsonb_each(st->'records') r where r.value->>'dynamics_kind'='payment_occurrence' and r.value->>'schedule_id'=e->>'schedule_id' and r.value->>'scheduled_on'=e->>'scheduled_on') then raise exception 'Duplicate payment date'; end if;
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


create or replace function public.nw_assert_story_transitions(p_world uuid,p_head uuid,p_events jsonb)
returns void language plpgsql security invoker set search_path='' as $transition$
declare u uuid:=auth.uid(); st jsonb:='{"plans":{},"records":{}}'; rec record; e jsonb; seen integer:=0; previous_choice jsonb;
begin
 -- Pending choice is always the final event of the saved head. No silent bypass even with empty events.
 select s.events->-1 into previous_choice from public.nw_scenes s where s.id=p_head and s.world_id=p_world and s.owner_id=u;
 if previous_choice->>'dynamics_kind'='player_choice' and previous_choice->>'status'='pending' and
  (p_events->0->>'type' is distinct from 'world' or p_events->0->'dynamics_version' is distinct from '1'::jsonb or p_events->0->>'dynamics_kind' is distinct from 'player_choice' or p_events->0->>'status' is distinct from 'answered' or p_events->0->>'key' is distinct from previous_choice->>'key') then raise exception 'Pending player choice requires answer'; end if;
 if exists(select 1 from jsonb_array_elements(p_events) with ordinality x(e,i) where x.e->>'dynamics_kind'='player_choice' and
  ((x.e->>'status'='pending' and x.i<>jsonb_array_length(p_events)) or (x.e->>'status'='answered' and x.i<>1))) then raise exception 'Invalid player choice position'; end if;
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
 -- Paid dates are tied to a distinct actual transfer in this same append.
 if exists(select 1 from jsonb_array_elements(p_events) x where x->>'dynamics_kind'='payment_occurrence' and x->>'status'='paid' and not exists(
  select 1 from jsonb_array_elements(p_events) m where m->>'id'=x->>'transfer_event_id' and m->>'type'='money' and m->>'operation'='transfer'
   and m->'actor'=x->'actor' and m->'counterparty'=x->'counterparty' and m->'currency'=x->'currency' and (m->>'delta')::numeric=-(x->>'amount')::numeric
 )) or exists(select 1 from jsonb_array_elements(p_events) x where x->>'dynamics_kind'='payment_occurrence' and x->>'status'='paid' group by x->>'transfer_event_id' having count(*)>1)
 then raise exception 'Payment requires distinct matching scene transfer'; end if;
 for e in select value from jsonb_array_elements(p_events) loop st:=public.nw_story_transition_step(st,e); end loop;
end $transition$;
revoke all on function public.nw_assert_story_transitions(uuid,uuid,jsonb) from public,anon,authenticated;


-- Guard the literal scene boundary on the direct RPC as well.
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
 insert into public.nw_scenes(id,owner_id,world_id,branch_id,parent_scene_id,request_id,body,world_time,events,rules_version_at_commit)
 values(new_id,u,p_world_id,p_branch_id,current_head,p_request_id,p_body,nullif(trim(p_world_time),''),coalesce(p_events,'[]'::jsonb),actual_rules_version);
 update public.nw_branches set head_scene_id=new_id where id=p_branch_id;
 update public.nw_worlds set updated_at=now() where id=p_world_id;
 return new_id;
end $$;
revoke all on function public.nw_commit_scene(uuid,uuid,uuid,uuid,text,text,jsonb,integer) from public,anon;
grant execute on function public.nw_commit_scene(uuid,uuid,uuid,uuid,text,text,jsonb,integer) to authenticated;
