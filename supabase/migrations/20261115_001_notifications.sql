-- ════════════════════════════════════════════════════════════════════════════
-- yoodle.ca in-app notifications (15 Nov 2026)
-- Shown in the notifications bar at the top of the app (index.html → loadNotifications).
-- Rows are written only by admins / the service role (no insert policy). People can read
-- their own rows and dismiss them through notification_dismiss(); nothing else.
-- link must be an https://yoodle.ca or https://*.yoodle.ca address (checked here and in the app).
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (char_length(kind) between 1 and 40),
  title       text not null check (char_length(title) between 1 and 120),
  body        text check (char_length(body) <= 400),
  link        text check (link is null or link ~ '^https://([a-z0-9-]+\.)*yoodle\.ca(/|$)'),
  link_label  text check (char_length(link_label) <= 40),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists notifications_unread_idx
  on public.notifications (profile_id, created_at desc) where read_at is null;
-- One invite of each kind per person, so a send can be re-run without duplicates.
create unique index if not exists notifications_one_per_kind
  on public.notifications (profile_id, kind) where kind like 'invite:%';

alter table public.notifications enable row level security;
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select
  using (profile_id = auth.uid());

revoke all on public.notifications from anon;
revoke insert, update, delete on public.notifications from authenticated;
grant select on public.notifications to authenticated;

-- Dismiss (mark read) one of my notifications.
create or replace function public.notification_dismiss(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where id = p_id and profile_id = auth.uid() and read_at is null;
$$;
revoke execute on function public.notification_dismiss(uuid) from public, anon;
grant execute on function public.notification_dismiss(uuid) to authenticated;
