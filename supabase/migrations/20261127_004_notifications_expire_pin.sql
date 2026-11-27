-- ════════════════════════════════════════════════════════════════════════════
-- Notifications: gone after 3 days, delete now, pin to keep — 27 Nov 2026 (Rhea). App code: js/notifications.js.
--
-- - A notification leaves the bell 3 days after it arrived, read or not, and is deleted from the table.
-- - Pinned ones stay until unpinned. Unpinning starts a fresh 3 days, as if it had just arrived
--   (notifications.clock_at = when its 3 days started; created_at stays the real arrival time).
-- - Members can delete their own (notification_delete) and pin / unpin them (notification_pin). They still
--   can't touch the table directly (revoked in 20261115_001); only these functions, for their own rows.
-- - Clean-up: pg_cron job 'notifications-expire', every hour. The app also hides anything past 3 days, so
--   nothing old shows between runs.
-- Note: 'invite:%' kinds are one per member (notifications_one_per_kind) so re-running an invite send doesn't
-- notify twice; once deleted, a re-run would notify again.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.notifications add column if not exists pinned_at timestamptz;
alter table public.notifications add column if not exists clock_at timestamptz;
update public.notifications set clock_at = created_at where clock_at is null;
alter table public.notifications alter column clock_at set default now();
alter table public.notifications alter column clock_at set not null;
create index if not exists notifications_expire_idx on public.notifications (clock_at) where pinned_at is null;

create or replace function public.notification_delete(p_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.notifications where id = p_id and profile_id = auth.uid();
$$;

-- Pin: keep it. Unpin: a fresh 3 days from now.
create or replace function public.notification_pin(p_id uuid, p_pin boolean)
returns void language sql security definer set search_path = public as $$
  update public.notifications
     set pinned_at = case when p_pin then coalesce(pinned_at, now()) end,
         clock_at  = case when p_pin then clock_at else now() end
   where id = p_id and profile_id = auth.uid();
$$;

revoke execute on function public.notification_delete(uuid), public.notification_pin(uuid, boolean) from public, anon;
grant execute on function public.notification_delete(uuid), public.notification_pin(uuid, boolean) to authenticated;

create or replace function public.notifications_expire()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from public.notifications where pinned_at is null and clock_at < now() - interval '3 days';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.notifications_expire() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'notifications-expire';
select cron.schedule('notifications-expire', '17 * * * *', 'select public.notifications_expire()');
