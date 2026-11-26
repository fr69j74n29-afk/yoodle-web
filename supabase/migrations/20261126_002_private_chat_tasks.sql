-- ════════════════════════════════════════════════════════════════════════════
-- Keep Yoodi and support chats private — 26 Nov 2026.
-- Their anchor tasks (type 'yoodi_chat' / 'support_chat') were readable by anyone, signed in or not,
-- through tasks_read_public_jobs — including the member's id and the location saved when the chat started.
-- Now hidden like help_offer / admin_note / direct. Who can still read them:
--   the member and the Yoodi / Yoodle team account (tasks_read_participants), admins (tasks_read_admin),
--   and the security-definer functions that run these chats (yoodi_*, support_*, admin_support_*).
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

drop policy if exists tasks_read_public_jobs on public.tasks;
create policy tasks_read_public_jobs on public.tasks
  for select to authenticated, anon
  using (coalesce(type, 'job') <> all (array['help_offer', 'admin_note', 'direct', 'yoodi_chat', 'support_chat']));
