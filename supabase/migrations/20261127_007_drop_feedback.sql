-- ════════════════════════════════════════════════════════════════════════════
-- Feedback and support in one place — 27 Nov 2026 (Rhea: "feedback and support queries should be in the same table").
--
-- The Profile box (js/feedback.js) now sends through support_send() into the member's "Yoodle support" chat,
-- like Contact support from Yoodi or the map: stored in messages (thread = tasks type 'support_chat'), read and
-- answered in the admin console under CONTACT SUPPORT. The separate feedback table from 20261127_006 is no
-- longer used, so it and its functions go. It only ever held one test message (Rhea, "hello", 27 Nov).
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

drop function if exists public.send_feedback(text, jsonb);
drop function if exists public.admin_feedback(integer, boolean);
drop function if exists public.admin_feedback_new();
drop function if exists public.admin_feedback_done(uuid, boolean);
drop table if exists public.feedback;
