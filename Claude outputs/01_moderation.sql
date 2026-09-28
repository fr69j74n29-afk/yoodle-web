-- ============================================================================
-- Yoodle — Report / Block / Moderation (App Store rule 1.2)       28 Sept 2026
-- One migration. Idempotent where practical. Nothing is deleted.
-- ============================================================================

-- ── 1. reports: moderation fields ───────────────────────────────────────────
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS details         text,
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status          text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolved_at     timestamptz,
  ADD COLUMN IF NOT EXISTS admin_note      text;

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_status_chk;
ALTER TABLE public.reports ADD  CONSTRAINT reports_status_chk  CHECK (status IN ('open','resolved','dismissed'));
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_not_self;
ALTER TABLE public.reports ADD  CONSTRAINT reports_not_self    CHECK (reporter_id <> reported_id);
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_details_len;
ALTER TABLE public.reports ADD  CONSTRAINT reports_details_len CHECK (details IS NULL OR length(details) <= 1000);

-- users may only file new, open reports as themselves
DROP POLICY IF EXISTS "Users can insert reports" ON public.reports;
CREATE POLICY "Users can insert reports" ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id AND status = 'open' AND resolved_at IS NULL AND admin_note IS NULL);

-- ── 2. blocks: no self-blocks ───────────────────────────────────────────────
ALTER TABLE public.blocks DROP CONSTRAINT IF EXISTS blocks_not_self;
ALTER TABLE public.blocks ADD  CONSTRAINT blocks_not_self CHECK (blocker_id <> blocked_id);

-- ── 3. profiles: Terms acceptance ───────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

-- ── 4. suspensions (own table so users can't clear it via profile updates) ─
CREATE TABLE IF NOT EXISTS public.suspended_users (
  user_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  suspended_at timestamptz NOT NULL DEFAULT now(),
  reason       text
);
ALTER TABLE public.suspended_users ENABLE ROW LEVEL SECURITY;   -- no policies: functions only

-- ── 5. banned words (edit this table any time in the Supabase dashboard) ───
CREATE TABLE IF NOT EXISTS public.banned_words (word text PRIMARY KEY CHECK (word ~ '^[a-z]+$'));
ALTER TABLE public.banned_words ENABLE ROW LEVEL SECURITY;      -- no policies: functions only
INSERT INTO public.banned_words (word) VALUES
  ('fuck'),('fucking'),('fucker'),('fucked'),('motherfucker'),('cunt'),('asshole'),
  ('bitch'),('whore'),('slut'),
  ('nigger'),('nigga'),('faggot'),('retard'),('kike'),('spic'),('chink'),('wetback'),('tranny'),('paki')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.contains_banned_words(p_text text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_text IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.banned_words b
    WHERE lower(p_text) ~ ('(^|[^a-z])' || b.word || '([^a-z]|$)')
  );
$$;
REVOKE ALL ON FUNCTION public.contains_banned_words(text) FROM PUBLIC, anon, authenticated;

-- ── 6. helper functions ─────────────────────────────────────────────────────
-- everyone I blocked + everyone who blocked me (either direction hides)
CREATE OR REPLACE FUNCTION public.my_blocked_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT blocked_id FROM public.blocks WHERE blocker_id = auth.uid()
  UNION
  SELECT blocker_id FROM public.blocks WHERE blocked_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_blocked_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_blocked_ids() TO anon, authenticated;   -- empty for anon

CREATE OR REPLACE FUNCTION public.is_blocked_pair(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.blocks
                 WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a));
$$;
REVOKE ALL ON FUNCTION public.is_blocked_pair(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.am_i_suspended()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.suspended_users WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.am_i_suspended() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.am_i_suspended() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users a WHERE a.email = (auth.jwt() ->> 'email'));
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public._esc(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(replace(replace(coalesce(t,''), '&','&amp;'), '<','&lt;'), '>','&gt;'), '"','&quot;');
$$;

-- ── 7. hide blocked people in the two feed functions ───────────────────────
-- Patched in place (adds one condition each); fails loudly if the anchor text changed.
DO $mig$
DECLARE d text; a text; b text;
BEGIN
  -- get_conversations: hide conversations with anyone blocked either way
  d := pg_get_functiondef('public.get_conversations(uuid)'::regprocedure);
  IF position('my_blocked_ids' IN d) = 0 THEN
    a := $x$and t.status not in ('cancelled', 'expired')$x$;
    b := a || $x$ and (case when c.poster_id = user_id then c.applicant_id else c.poster_id end) not in (select public.my_blocked_ids())$x$;
    IF (length(d) - length(replace(d, a, ''))) / length(a) <> 1 THEN
      RAISE EXCEPTION 'get_conversations: anchor not found exactly once';
    END IF;
    EXECUTE replace(d, a, b);
  END IF;

  -- get_open_jobs_near: hide jobs posted by anyone blocked either way
  d := pg_get_functiondef('public.get_open_jobs_near(double precision,double precision,double precision,integer,uuid)'::regprocedure);
  IF position('my_blocked_ids' IN d) = 0 THEN
    a := $x$and (exclude_user_id is null or t.poster_id != exclude_user_id)$x$;
    b := a || $x$ and t.poster_id not in (select public.my_blocked_ids())$x$;
    IF (length(d) - length(replace(d, a, ''))) / length(a) <> 1 THEN
      RAISE EXCEPTION 'get_open_jobs_near: anchor not found exactly once';
    END IF;
    EXECUTE replace(d, a, b);
  END IF;
END
$mig$;

-- ── 8. guards (server-side, cannot be bypassed from the browser) ───────────
CREATE OR REPLACE FUNCTION public.guard_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.suspended_users WHERE user_id = NEW.sender_id) THEN
    RAISE EXCEPTION 'Your account is suspended.' USING HINT = 'yoodle_suspended';
  END IF;
  IF NEW.receiver_id IS NOT NULL AND public.is_blocked_pair(NEW.sender_id, NEW.receiver_id) THEN
    RAISE EXCEPTION 'You can''t message this user.' USING HINT = 'yoodle_blocked';
  END IF;
  IF public.contains_banned_words(NEW.body) THEN
    RAISE EXCEPTION 'Your message contains words that aren''t allowed on Yoodle.' USING HINT = 'yoodle_banned_words';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_message ON public.messages;
CREATE TRIGGER trg_guard_message BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_message();

CREATE OR REPLACE FUNCTION public.guard_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM public.suspended_users WHERE user_id = NEW.poster_id) THEN
    RAISE EXCEPTION 'Your account is suspended.' USING HINT = 'yoodle_suspended';
  END IF;
  IF public.contains_banned_words(NEW.title) OR public.contains_banned_words(NEW.description) THEN
    RAISE EXCEPTION 'Your post contains words that aren''t allowed on Yoodle.' USING HINT = 'yoodle_banned_words';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_task ON public.tasks;
CREATE TRIGGER trg_guard_task BEFORE INSERT OR UPDATE OF title, description ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_task();

CREATE OR REPLACE FUNCTION public.guard_profile_text()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.contains_banned_words(NEW.name) OR public.contains_banned_words(NEW.bio)
     OR public.contains_banned_words(NEW.helper_bio) THEN
    RAISE EXCEPTION 'Your profile contains words that aren''t allowed on Yoodle.' USING HINT = 'yoodle_banned_words';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_profile_text ON public.profiles;
CREATE TRIGGER trg_guard_profile_text BEFORE UPDATE OF name, bio, helper_bio ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_text();

-- ── 9. email support@ on every new report (Resend key copied from the
--       existing send_unread_message_emails() — never printed) ─────────────
DO $mig$
DECLARE k text; src text;
BEGIN
  SELECT substring(prosrc FROM 're_[A-Za-z0-9_]+') INTO k
    FROM pg_proc WHERE oid = 'public.send_unread_message_emails'::regproc;
  IF k IS NULL THEN RAISE EXCEPTION 'Resend key not found'; END IF;

  src := $f$
CREATE OR REPLACE FUNCTION public.notify_new_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $fn$
DECLARE v_reporter text; v_reported text; v_reported_email text; v_task text; v_count int;
BEGIN
  SELECT name INTO v_reporter FROM public.profiles WHERE id = NEW.reporter_id;
  SELECT p.name, u.email INTO v_reported, v_reported_email
    FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE p.id = NEW.reported_id;
  SELECT title INTO v_task FROM public.tasks WHERE id = NEW.task_id;
  SELECT count(*) INTO v_count FROM public.reports WHERE reported_id = NEW.reported_id;

  PERFORM net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer __RESEND_KEY__',
      'Idempotency-Key', 'report/' || NEW.id::text),
    body    := jsonb_build_object(
      'from', 'Yoodle <notifications@yoodle.ca>',
      'to', 'support@yoodle.ca',
      'subject', '[Yoodle report] ' || NEW.reason || ' - ' || coalesce(v_reported, 'a user'),
      'html',
        '<p><strong>New report on Yoodle</strong> - please review within 24 hours.</p><ul>' ||
        '<li><b>Reason:</b> '   || public._esc(NEW.reason) || '</li>' ||
        '<li><b>Details:</b> '  || public._esc(coalesce(NEW.details, '-')) || '</li>' ||
        '<li><b>Reported:</b> ' || public._esc(coalesce(v_reported, '?')) || ' (' || public._esc(coalesce(v_reported_email, '?')) || ') - ' || v_count || ' report(s) total</li>' ||
        '<li><b>Reported by:</b> ' || public._esc(coalesce(v_reporter, '?')) || '</li>' ||
        '<li><b>Job:</b> '      || public._esc(coalesce(v_task, '-')) || '</li></ul>' ||
        '<p><a href="https://yoodle.ca/admin.html">Open the admin dashboard to act</a></p>'
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;   -- never lose a report because the email failed
END $fn$;
$f$;
  EXECUTE replace(src, '__RESEND_KEY__', k);
END
$mig$;
REVOKE ALL ON FUNCTION public.notify_new_report() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_new_report ON public.reports;
CREATE TRIGGER trg_notify_new_report AFTER INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_report();

-- ── 10. admin moderation functions (admin_users only) ──────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_reports(p_status text DEFAULT 'open')
RETURNS TABLE (
  id uuid, created_at timestamptz, reason text, details text, status text, admin_note text, resolved_at timestamptz,
  reporter_id uuid, reporter_name text, reporter_email text,
  reported_id uuid, reported_name text, reported_email text, reported_suspended boolean, reported_report_count bigint,
  task_id uuid, task_title text, task_status text, conversation_id uuid, recent_messages jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT r.id, r.created_at, r.reason, r.details, r.status, r.admin_note, r.resolved_at,
         r.reporter_id, rp.name, ru.email::text,
         r.reported_id, dp.name, du.email::text,
         EXISTS (SELECT 1 FROM public.suspended_users s WHERE s.user_id = r.reported_id),
         (SELECT count(*) FROM public.reports r2 WHERE r2.reported_id = r.reported_id),
         r.task_id, t.title, t.status, r.conversation_id,
         (SELECT coalesce(jsonb_agg(x ORDER BY x.created_at), '[]'::jsonb) FROM (
            SELECT m.created_at, m.body, sp.name AS sender_name, (m.sender_id = r.reported_id) AS from_reported
            FROM public.messages m LEFT JOIN public.profiles sp ON sp.id = m.sender_id
            WHERE (r.conversation_id IS NOT NULL AND m.conversation_id = r.conversation_id)
               OR (r.conversation_id IS NULL AND r.task_id IS NOT NULL AND m.task_id = r.task_id
                   AND m.sender_id IN (r.reporter_id, r.reported_id) AND m.receiver_id IN (r.reporter_id, r.reported_id))
            ORDER BY m.created_at DESC LIMIT 10) x)
  FROM public.reports r
  LEFT JOIN public.profiles rp ON rp.id = r.reporter_id
  LEFT JOIN auth.users      ru ON ru.id = r.reporter_id
  LEFT JOIN public.profiles dp ON dp.id = r.reported_id
  LEFT JOIN auth.users      du ON du.id = r.reported_id
  LEFT JOIN public.tasks    t  ON t.id  = r.task_id
  WHERE p_status = 'all' OR r.status = p_status
  ORDER BY r.created_at DESC
  LIMIT 200;
END $$;

CREATE OR REPLACE FUNCTION public.admin_resolve_report(p_report_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('open','resolved','dismissed') THEN RAISE EXCEPTION 'bad status'; END IF;
  UPDATE public.reports
     SET status = p_status,
         admin_note = coalesce(p_note, admin_note),
         resolved_at = CASE WHEN p_status = 'open' THEN NULL ELSE now() END
   WHERE id = p_report_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_remove_task(p_task_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  UPDATE public.tasks SET status = 'cancelled' WHERE id = p_task_id AND status IN ('open','claimed');
END $$;

CREATE OR REPLACE FUNCTION public.admin_suspend_user(p_user_id uuid, p_suspend boolean, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF p_user_id IN ('c89896db-b2ab-4c4c-88fa-650823e63303','efa6b2c4-74cd-4ff7-9ce1-488156ba69b2')
     OR EXISTS (SELECT 1 FROM auth.users u JOIN public.admin_users a ON a.email = u.email WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'cannot suspend an admin account';
  END IF;
  IF p_suspend THEN
    INSERT INTO public.suspended_users (user_id, reason) VALUES (p_user_id, p_reason)
      ON CONFLICT (user_id) DO UPDATE SET reason = EXCLUDED.reason, suspended_at = now();
    UPDATE public.profiles SET visible_on_map = false WHERE id = p_user_id;           -- hide helper listing
    UPDATE public.tasks SET status = 'cancelled' WHERE poster_id = p_user_id AND status = 'open';  -- remove open jobs
  ELSE
    DELETE FROM public.suspended_users WHERE user_id = p_user_id;
  END IF;
END $$;

DO $mig$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.admin_list_reports(text)',
    'public.admin_resolve_report(uuid,text,text)',
    'public.admin_remove_task(uuid)',
    'public.admin_suspend_user(uuid,boolean,text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END
$mig$;
