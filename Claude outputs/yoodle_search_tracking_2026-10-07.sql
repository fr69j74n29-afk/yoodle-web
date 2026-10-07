-- Yoodle: Find-a-helper category tracking (7 Oct 2026). Run once in Supabase SQL Editor.
begin;
-- 1) search_events: one row per Find-a-helper category pick
create table public.search_events (
  id               bigint generated always as identity primary key,
  category         text not null,                 -- category key, e.g. 'cleaning', 'yard & garden'
  viewer_id        uuid not null references public.profiles(id) on delete cascade,
  helpers_nearby   smallint,                      -- helpers in that category inside the radius when picked
  radius_km        smallint,
  viewer_is_helper boolean,
  viewer_open_jobs smallint,
  viewer_area      text,
  viewer_city      text,
  viewer_lat_grid  numeric,
  viewer_lng_grid  numeric,
  created_at       timestamptz not null default now()
);
create index search_events_created_idx  on public.search_events (created_at);
create index search_events_cat_idx      on public.search_events (category, created_at);
create index search_events_viewer_idx   on public.search_events (viewer_id, created_at);
alter table public.search_events enable row level security;
revoke all on public.search_events from anon, authenticated;

-- 2) tap_events: which Find-a-helper filter was on when a helper was tapped
alter table public.tap_events add column filter_category text;

-- 3) log_search()
create or replace function public.log_search(p_category text, p_helpers int default null, p_radius int default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v uuid := auth.uid(); k text := lower(trim(coalesce(p_category,'')));
        v_helper boolean; v_jobs int; v_addr text; v_area text; v_city text; v_la double precision; v_lg double precision;
begin
  if v is null or k = '' then return; end if;
  if not exists (select 1 from helper_categories hc where lower(hc.name) = k) then return; end if;
  if exists (select 1 from search_events e where e.viewer_id = v and e.category = k
             and e.created_at > now() - interval '10 minutes') then return; end if;
  select coalesce(p.visible_on_map,false) and (p.helper_expires_at is null or p.helper_expires_at > now()),
         nullif(p.helper_address,''), p.last_lat, p.last_lng
    into v_helper, v_addr, v_la, v_lg from profiles p where p.id = v;
  if not found then return; end if;
  select count(*) into v_jobs from tasks t where t.poster_id = v and t.status in ('open','claimed');
  if v_addr is null then
    select t.address into v_addr from tasks t where t.poster_id = v and t.address is not null order by t.created_at desc limit 1;
  end if;
  select x.area, x.city into v_area, v_city from _addr_area_city(v_addr) x;
  insert into search_events (category, viewer_id, helpers_nearby, radius_km, viewer_is_helper, viewer_open_jobs,
                             viewer_area, viewer_city, viewer_lat_grid, viewer_lng_grid)
  values (k, v, least(greatest(p_helpers,0),32767), least(greatest(p_radius,0),32767), coalesce(v_helper,false),
          least(v_jobs,32767), v_area, v_city, round(v_la::numeric,2), round(v_lg::numeric,2));
end $function$;
revoke all on function public.log_search(text,int,int) from public, anon;
grant execute on function public.log_search(text,int,int) to authenticated;

-- 4) log_tap(): same as before + optional p_filter (old 3-arg calls keep working via the default)
drop function public.log_tap(text,uuid,text);
create function public.log_tap(p_kind text, p_target uuid, p_src text, p_filter text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v uuid := auth.uid(); a text; c text; la double precision; lg double precision; own_id uuid;
        v_helper boolean; v_jobs int; v_addr text; v_area text; v_city text; v_la double precision; v_lg double precision;
        f text := nullif(left(lower(trim(coalesce(p_filter,''))),40),'');
begin
  if v is null or p_target is null or p_kind not in ('job','helper') or p_src not in ('pin','card') then return; end if;
  if p_kind = 'job' then
    select t.poster_id, t.address, t.lat, t.lng into own_id, a, la, lg from tasks t where t.id = p_target;
    f := null;
  else
    select p.id, p.helper_address, p.last_lat, p.last_lng into own_id, a, la, lg from profiles p where p.id = p_target;
  end if;
  if own_id is null or own_id = v then return; end if;
  if exists (select 1 from tap_events e
             where e.viewer_id = v and e.created_at > now() - interval '10 minutes'
               and (case when p_kind='job' then e.task_id else e.helper_id end) = p_target) then return; end if;
  select x.area, x.city into a, c from _addr_area_city(a) x;

  -- viewer context, snapshotted at tap time
  select coalesce(p.visible_on_map,false) and (p.helper_expires_at is null or p.helper_expires_at > now()),
         nullif(p.helper_address,''), p.last_lat, p.last_lng
    into v_helper, v_addr, v_la, v_lg
    from profiles p where p.id = v;
  select count(*) into v_jobs from tasks t where t.poster_id = v and t.status in ('open','claimed');
  if v_addr is null then
    select t.address into v_addr from tasks t where t.poster_id = v and t.address is not null order by t.created_at desc limit 1;
  end if;
  select x.area, x.city into v_area, v_city from _addr_area_city(v_addr) x;

  insert into tap_events (kind, task_id, helper_id, viewer_id, src, area, city, lat_grid, lng_grid,
                          viewer_is_helper, viewer_open_jobs, viewer_area, viewer_city, viewer_lat_grid, viewer_lng_grid, filter_category)
  values (p_kind,
          case when p_kind='job' then p_target end,
          case when p_kind='helper' then p_target end,
          v, p_src, a, c, round(la::numeric,2), round(lg::numeric,2),
          coalesce(v_helper,false), least(v_jobs, 32767), v_area, v_city, round(v_la::numeric,2), round(v_lg::numeric,2), f);
end $function$;
revoke all on function public.log_tap(text,uuid,text,text) from public, anon;
grant execute on function public.log_tap(text,uuid,text,text) to authenticated;

-- 5) admin_search_top(): most-picked categories (admin-only; admins + demo excluded at read time)
create or replace function public.admin_search_top(p_days int default 30, p_limit int default 15)
returns table(category text, emoji text, searches bigint, people bigint, no_helpers bigint, helper_taps bigint)
language plpgsql security definer set search_path to 'public' as $function$
#variable_conflict use_column
declare d int := least(greatest(p_days,1),365);
begin
  if not exists (select 1 from admin_users a where a.email = (auth.jwt() ->> 'email')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
  with s as (
    select e.* from search_events e
    join profiles vp on vp.id = e.viewer_id and coalesce(vp.is_demo,false) = false
    left join auth.users u on u.id = e.viewer_id
    where e.created_at >= now() - make_interval(days => d)
      and not exists (select 1 from admin_users ad where ad.email = u.email)
  ), t as (
    select e.filter_category k, count(*) n from tap_events e
    join profiles vp on vp.id = e.viewer_id and coalesce(vp.is_demo,false) = false
    left join auth.users u on u.id = e.viewer_id
    where e.kind = 'helper' and e.filter_category is not null
      and e.created_at >= now() - make_interval(days => d)
      and not exists (select 1 from admin_users ad where ad.email = u.email)
    group by 1
  )
  select coalesce(hc.name, s.category)::text, hc.emoji::text, count(*)::bigint, count(distinct s.viewer_id)::bigint,
         count(*) filter (where s.helpers_nearby = 0)::bigint, coalesce(max(t.n),0)::bigint
  from s left join helper_categories hc on lower(hc.name) = s.category
         left join t on t.k = s.category
  group by s.category, hc.name, hc.emoji
  order by 3 desc, 4 desc limit least(greatest(p_limit,1),50);
end $function$;
revoke all on function public.admin_search_top(int,int) from public, anon;
grant execute on function public.admin_search_top(int,int) to authenticated;
commit;

-- Check (should return: search_events, 1, and the 4-arg log_tap):
-- select to_regclass('public.search_events'),
--  (select count(*) from information_schema.columns where table_name='tap_events' and column_name='filter_category'),
--  (select string_agg(pg_get_function_identity_arguments(oid),' | ') from pg_proc where proname='log_tap');

-- Rollback:
-- drop function public.admin_search_top(int,int); drop function public.log_search(text,int,int); drop table public.search_events;
-- drop function public.log_tap(text,uuid,text,text);  then re-create the 3-arg log_tap from migration tap_events_viewer_context;
-- alter table public.tap_events drop column filter_category;
