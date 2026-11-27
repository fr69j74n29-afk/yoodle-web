-- ════════════════════════════════════════════════════════════════════════════
-- Messages: get_conversations also returns the chat type (task_type) — 27 Nov 2026. App code: js/messages.js, js/contacts.js.
--
-- The Chats tab shows job chats only; contact chats (task_type 'direct') are shown in the Contacts tab, with their
-- last message and unread marker from this same result. Before, the app loaded the friend list (get_friends) on
-- every Messages visit only to tell contact chats apart. Idea board #9 (yoodle-docs ideas/2026-11-27-tab-loading-plan.md).
-- Same function otherwise; one column added at the end (older app builds ignore it). The return type changes, so
-- it's dropped and created again, with the same grants. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

drop function if exists public.get_conversations(uuid);
CREATE FUNCTION public.get_conversations(user_id uuid)
 RETURNS TABLE(conversation_id uuid, task_id uuid, title text, task_status text, poster_id uuid, applicant_id uuid, other_id uuid, other_name text, other_rating numeric, last_msg_body text, last_msg_sender_id uuid, last_msg_created_at timestamp with time zone, has_unread boolean, app_status text, category text, task_type text)
 LANGUAGE sql
AS $function$
  with last_msgs as (
    select distinct on (conversation_id)
      conversation_id, body, sender_id, created_at
    from messages
    order by conversation_id, created_at desc
  ),
  user_apps as (
    select task_id, status from applications
    where applicant_id = user_id
  )
  select
    c.id                as conversation_id,
    c.task_id,
    t.title,
    t.status            as task_status,
    c.poster_id,
    c.applicant_id,
    case when c.poster_id = user_id then c.applicant_id else c.poster_id end as other_id,
    case when c.poster_id = user_id then ap.name else pp.name end as other_name,
    case when c.poster_id = user_id then ap.rating else pp.rating end as other_rating,
    lm.body             as last_msg_body,
    lm.sender_id        as last_msg_sender_id,
    lm.created_at       as last_msg_created_at,
    case
      when t.status = 'completed' then false          -- finished jobs never show unread
      when c.poster_id = user_id
        then exists(
          select 1 from messages m
          where m.conversation_id = c.id
            and m.sender_id = c.applicant_id
            and m.created_at > c.poster_last_read_at
        )
      else exists(
          select 1 from messages m
          where m.conversation_id = c.id
            and m.sender_id = c.poster_id
            and m.created_at > c.applicant_last_read_at
        )
    end                 as has_unread,
    ua.status           as app_status,
    t.category,
    coalesce(t.type, 'job') as task_type                                     -- NEW 27 Nov: 'direct' = contact chat (js/contacts.js)
  from conversations c
  join tasks t on t.id = c.task_id
  join profiles pp on pp.id = c.poster_id
  join profiles ap on ap.id = c.applicant_id
  left join last_msgs lm on lm.conversation_id = c.id
  left join user_apps ua on ua.task_id = c.task_id
  where c.status = 'active'
    and (c.poster_id = user_id or c.applicant_id = user_id)
    and not (t.status = 'open' and t.expires_at < now())
    and t.status not in ('cancelled', 'expired')                                   -- hide cancelled jobs
    and (case when c.poster_id = user_id then c.applicant_id else c.poster_id end) not in (select public.my_blocked_ids())
    and (case when c.poster_id = user_id then c.applicant_id else c.poster_id end) not in (select public.my_suspended_contacts())
    and coalesce(lm.created_at, c.created_at) > now() - interval '21 days'          -- NEW 23 Nov: quiet 21 days → hidden; a new message brings it back
    and not (c.poster_id = user_id and c.poster_hidden_at is not null
             and coalesce(lm.created_at, c.created_at) <= c.poster_hidden_at)       -- NEW 23 Nov: Yoodle team "Hide"; a newer message brings it back
  order by lm.created_at desc nulls last
$function$;

grant execute on function public.get_conversations(uuid) to anon, authenticated, service_role;
