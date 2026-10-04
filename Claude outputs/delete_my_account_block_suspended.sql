-- Yoodle: stop suspended accounts from deleting themselves (4 Oct 2026)
-- Run in Supabase → SQL Editor. Identical to the live delete_my_account() except the
-- new "Suspended accounts can't delete themselves" block. CREATE OR REPLACE keeps the
-- existing grants (authenticated only, no anon).

CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_rated uuid[];
  v_id    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  -- Protect the two admin/auto-reply accounts
  IF v_uid IN ('c89896db-b2ab-4c4c-88fa-650823e63303','efa6b2c4-74cd-4ff7-9ce1-488156ba69b2') THEN
    RAISE EXCEPTION 'This account cannot be deleted from the app';
  END IF;

  -- NEW: suspended accounts can't delete themselves (deleting would clear the suspension and free the email)
  IF EXISTS (SELECT 1 FROM public.suspended_users WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'Your account is suspended. Contact support@yoodle.ca.' USING ERRCODE = '42501';
  END IF;

  -- People whose star rating must be recalculated afterwards
  SELECT coalesce(array_agg(DISTINCT r.rated_id), '{}') INTO v_rated
  FROM ratings r
  WHERE r.rated_id <> v_uid
    AND (r.rater_id = v_uid OR r.task_id IN (SELECT id FROM tasks WHERE poster_id = v_uid));

  -- Other people's jobs this user was helping on (doer_id → auth.users and claimer_id → profiles are NO ACTION)
  UPDATE tasks SET status = 'cancelled', doer_id = NULL, claimer_id = NULL
   WHERE poster_id <> v_uid AND (doer_id = v_uid OR claimer_id = v_uid)
     AND status IN ('open','claimed') AND type = 'help_offer';

  UPDATE tasks SET status = 'open', doer_id = NULL, claimer_id = NULL
   WHERE poster_id <> v_uid AND (doer_id = v_uid OR claimer_id = v_uid)
     AND status IN ('open','claimed') AND coalesce(type,'job') <> 'help_offer';

  UPDATE tasks SET doer_id = NULL, claimer_id = NULL
   WHERE poster_id <> v_uid AND (doer_id = v_uid OR claimer_id = v_uid);

  -- Rows that would block the profile delete (NO ACTION links)
  DELETE FROM messages        WHERE sender_id = v_uid OR receiver_id = v_uid;
  DELETE FROM conversations   WHERE poster_id = v_uid OR applicant_id = v_uid;   -- cascades their messages
  DELETE FROM ratings         WHERE rater_id  = v_uid OR rated_id     = v_uid;
  DELETE FROM referrals       WHERE referrer_id = v_uid OR referred_id = v_uid;
  DELETE FROM business_events WHERE viewer_id = v_uid;

  -- Their own jobs (cascades applications, conversations, messages, ratings, acknowledgements on those jobs)
  DELETE FROM tasks WHERE poster_id = v_uid;

  -- Login account → cascades profiles → cascades applications, reports, blocks, acknowledgements
  DELETE FROM auth.users WHERE id = v_uid;

  -- Keep everyone else's stars correct
  FOREACH v_id IN ARRAY v_rated LOOP
    PERFORM update_profile_rating(v_id);
  END LOOP;

  RETURN json_build_object('ok', true);
END;
$function$;
