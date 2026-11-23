-- LIVING WORLD NEXT 0.3.1: single-transaction genesis.
-- Apply AFTER 002_memory_retrieval.sql. Older nw_create_world RPC stays available.
-- If rule metadata validation fails, the whole world + branch creation rolls back.
create or replace function public.nw_create_world_v2(
 p_title text,p_seed text,p_start_marker text default null,
 p_rule_text text default null,p_rule_category text default 'general',
 p_rule_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare wid uuid;
begin
 wid := public.nw_create_world(p_title,p_seed,p_start_marker);
 if nullif(btrim(coalesce(p_rule_text,'')),'') is not null then
  perform public.nw_add_directive(wid,p_rule_text,p_rule_category,p_rule_metadata);
 end if;
 return wid;
end $$;
revoke all on function public.nw_create_world_v2(text,text,text,text,text,jsonb) from public,anon;
grant execute on function public.nw_create_world_v2(text,text,text,text,text,jsonb) to authenticated;
