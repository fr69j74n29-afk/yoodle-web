-- ════════════════════════════════════════════════════════════════════════════
-- Live notifications (realtime) — 27 Nov 2026. App code: js/realtime.js, js/contacts.js, js/notifications.js.
--
-- Before: only messages were sent to the app live. A contact request (or "X accepted your request") only showed
-- after a reload: the bell loads on start and when the app comes back to the front, and the Contacts tab loads
-- when tapped. Now new rows in notifications are sent live too, so the bell, the Contacts list and its badge
-- update straight away (Rhea, 27 Nov).
-- Realtime follows the table's read policy (notif_select: profile_id = auth.uid()), so each member only
-- receives their own notifications; the app also filters on profile_id. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
