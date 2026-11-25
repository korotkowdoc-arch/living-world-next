-- NEXT chat menu: serialize first creation and edits with the story and rules.
-- Uses existing audited directive storage, so exports and old clients remain compatible.
create or replace function public.nw_save_menu_preferences(
 p_world_id uuid,p_branch_id uuid,p_expected_head uuid,p_expected_version integer,p_record jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); w public.nw_worlds%rowtype; h uuid; d public.nw_directives%rowtype;
 found_id uuid; old_record jsonb; kind text; s jsonb; n integer:=0; encoded text; did uuid;
 meta jsonb:='{"tags":["general"],"relationship_lock":null,"relationship_locks":[]}'::jsonb;
begin
 if u is null then raise exception 'Authentication required'; end if;
 select * into w from public.nw_worlds where id=p_world_id and owner_id=u for update;
 if not found then raise exception 'World not found'; end if;
 if w.active_branch_id is distinct from p_branch_id or w.directive_version is distinct from p_expected_version then raise exception 'Stale menu: refresh'; end if;
 select head_scene_id into h from public.nw_branches where id=p_branch_id and world_id=p_world_id and owner_id=u;
 if not found or h is distinct from p_expected_head then raise exception 'Stale menu: refresh'; end if;
 if jsonb_typeof(p_record) is distinct from 'object' then raise exception 'Invalid menu record'; end if;
 kind:=p_record->>'kind';
 if kind='settings' then
  s:=p_record->'settings';
  if jsonb_typeof(s) is distinct from 'object' or (p_record-'kind'-'settings')<>'{}'::jsonb then raise exception 'Invalid settings'; end if;
  if (s-'pace'-'detail'-'agency'-'events'-'choices'-'visibility'-'hud'-'skip_routine')<>'{}'::jsonb
   or coalesce(s->>'pace','') not in ('slow','normal','dynamic','fast')
   or coalesce(s->>'detail','') not in ('brief','normal','high','maximum')
   or coalesce(s->>'agency','') not in ('low','normal','high')
   or coalesce(s->>'events','') not in ('low','normal','high')
   or coalesce(s->>'choices','') not in ('frequent','important','free')
   or coalesce(s->>'visibility','') not in ('immersive','rpg','director')
   or jsonb_typeof(s->'hud') is distinct from 'boolean'
   or jsonb_typeof(s->'skip_routine') is distinct from 'boolean'
   then raise exception 'Invalid menu settings'; end if;
 elsif kind='focus' then
  if (p_record-'kind'-'branch_id'-'priorities')<>'{}'::jsonb or p_record->>'branch_id' is distinct from p_branch_id::text
   or jsonb_typeof(p_record->'priorities') is distinct from 'array' then raise exception 'Invalid branch priorities'; end if;
  if jsonb_array_length(p_record->'priorities')>3 or exists(select 1 from jsonb_array_elements(p_record->'priorities') as x(v) where jsonb_typeof(v)<>'string' or char_length(trim(v#>>'{}')) not between 1 and 200 or trim(v#>>'{}')<>(v#>>'{}')) then raise exception 'Invalid priorities'; end if;
  if (select count(distinct v) from jsonb_array_elements_text(p_record->'priorities') as x(v))<>jsonb_array_length(p_record->'priorities') then raise exception 'Duplicate priority'; end if;
 else raise exception 'Invalid menu kind'; end if;
 for d in select * from public.nw_directives where world_id=p_world_id and owner_id=u and active and left(text,13)='NEXT_MENU_V1:' loop
  old_record:=substring(d.text from 14)::jsonb;
  if old_record->>'kind'=kind and (kind='settings' or old_record->>'branch_id'=p_branch_id::text) then
   n:=n+1;found_id:=d.id;
  end if;
 end loop;
 if n>1 then raise exception 'Conflicting menu directives'; end if;
 encoded:='NEXT_MENU_V1:'||p_record::text;
 if found_id is null then
  did:=public.nw_add_directive(p_world_id,encoded,'general',meta);
 else
  did:=found_id;
  -- JSON semantic equality avoids needless rules-version churn on repeated identical saves.
  select * into d from public.nw_directives where id=did and world_id=p_world_id and owner_id=u;
  if substring(d.text from 14)::jsonb is distinct from p_record then
   perform public.nw_edit_directive(p_world_id,did,encoded,'general',meta,p_expected_version);
  end if;
 end if;
 return jsonb_build_object('saved',true,'directive_id',did,'branch_id',p_branch_id,'head_scene_id',h,
  'directive_version',(select directive_version from public.nw_worlds where id=p_world_id),'record',p_record);
end $$;
revoke all on function public.nw_save_menu_preferences(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.nw_save_menu_preferences(uuid,uuid,uuid,integer,jsonb) to authenticated;
