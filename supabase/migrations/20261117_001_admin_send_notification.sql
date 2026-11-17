-- ════════════════════════════════════════════════════════════════════════════
-- Admin "Send notification" form (admin.html → SEND NOTIFICATION), 17 Nov 2026.
-- notifications has no insert policy, so the form goes through this admin-only function.
-- Audiences:
--   'user'    → one member, found by sign-in email (p_email)
--   'all'     → every member
--   'helpers' → members with at least one helper category, or only p_category if given
-- 'all' and 'helpers' skip testers, demo accounts and suspended users.
-- p_dry_run = true sends nothing and returns how many people would get it.
-- Returns the number of rows inserted (or that would be). Kinds starting with 'invite:'
-- are one per person (unique index), so sending one again only reaches people who don't have it yet.
-- Depends on public.is_admin() (already used by admin RLS). Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.admin_send_notification(
  p_audience   text,
  p_kind       text,
  p_title      text,
  p_body       text default null,
  p_link       text default null,
  p_link_label text default null,
  p_email      text default null,
  p_category   text default null,
  p_dry_run    boolean default false
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_n   integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;

  p_kind       := nullif(trim(p_kind), '');
  p_title      := nullif(trim(p_title), '');
  p_body       := nullif(trim(p_body), '');
  p_link       := nullif(trim(p_link), '');
  p_link_label := nullif(trim(p_link_label), '');
  p_category   := nullif(trim(p_category), '');

  if p_kind is null or p_title is null then
    raise exception 'Kind and title are required';
  end if;
  if (p_link is null) <> (p_link_label is null) then
    raise exception 'Give both a link and a button label, or neither';
  end if;

  if p_audience = 'user' then
    select array_agg(u.id) into v_ids
    from auth.users u
    join public.profiles p on p.id = u.id
    where lower(u.email) = lower(trim(coalesce(p_email, '')));
    if v_ids is null then
      raise exception 'No member with the email %', p_email;
    end if;
  elsif p_audience in ('all', 'helpers') then
    select array_agg(p.id) into v_ids
    from public.profiles p
    where not coalesce(p.is_tester, false)
      and not coalesce(p.is_demo, false)
      and not exists (select 1 from public.suspended_users s where s.user_id = p.id)
      and (p_audience = 'all'
           or (p_category is null and coalesce(cardinality(p.helper_categories), 0) > 0)
           or (p_category is not null and p_category = any(p.helper_categories)));
  else
    raise exception 'Unknown audience %', p_audience;
  end if;

  if v_ids is null then
    return 0;
  end if;

  if p_dry_run then
    -- Count people who would actually get a new row (an invite: kind skips people who already have it).
    select count(*) into v_n from unnest(v_ids) as t(id)
    where p_kind not like 'invite:%'
       or not exists (select 1 from public.notifications n where n.profile_id = t.id and n.kind = p_kind);
    return v_n;
  end if;

  insert into public.notifications (profile_id, kind, title, body, link, link_label)
  select t.id, p_kind, p_title, p_body, p_link, p_link_label
  from unnest(v_ids) as t(id)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.admin_send_notification(text, text, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_send_notification(text, text, text, text, text, text, text, text, boolean) to authenticated;
