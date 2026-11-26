-- ════════════════════════════════════════════════════════════════════════════
-- Contacts fixes from the staging code review — 26 Nov 2026. Replaces three functions from
-- 20261126_001_contacts.sql. Safe to re-run.
--   friend_open_chat: (a) a lock on the pair, so two friends opening their chat at the same moment get
--                     one chat, not two; (b) the hidden task gets fixed placeholder coordinates instead of
--                     the opener's saved location (the friend can read the task row; tasks.lat/lng are
--                     NOT NULL). Fixed coordinates = downtown Toronto, same fallback Yoodi's chat uses.
--   friend_request / friend_respond: the person who sent a request gets a notification when it's accepted.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public._friend_notify_accepted(p_requester uuid, p_accepter uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (profile_id, kind, title, body)
  values (p_requester, 'friend_request',
          left(coalesce((select nullif(trim(name), '') from public.profiles where id = p_accepter), 'Someone') || ' accepted your contact request', 120),
          'You can message them from Messages → Contacts.');
$$;
revoke execute on function public._friend_notify_accepted(uuid, uuid) from public, anon, authenticated;

create or replace function public.friend_request(p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_other uuid;
  v_name  text;
  v_row   public.friendships;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from public.suspended_users where user_id = v_me) then
    raise exception 'Your account is suspended.' using hint = 'yoodle_suspended';
  end if;
  if (select count(*) from public.friend_lookups
       where profile_id = v_me and created_at > now() - interval '1 day') >= 30 then
    return jsonb_build_object('result', 'too_many');
  end if;
  insert into public.friend_lookups (profile_id) values (v_me);

  select u.id into v_other from auth.users u
   where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_other = v_me then return jsonb_build_object('result', 'self'); end if;
  if v_other is null
     or not exists (select 1 from public.profiles where id = v_other)
     or v_other = public.yoodi_account_id()
     or public.is_blocked_pair(v_me, v_other)
     or exists (select 1 from public.suspended_users where user_id = v_other)
     or public.is_tester(v_me) <> public.is_tester(v_other) then
    return jsonb_build_object('result', 'not_found');
  end if;
  select coalesce(nullif(trim(name), ''), 'A Yoodle member') into v_name from public.profiles where id = v_other;

  select * into v_row from public.friendships
   where least(requester_id, addressee_id) = least(v_me, v_other)
     and greatest(requester_id, addressee_id) = greatest(v_me, v_other);
  if found then
    if v_row.status = 'accepted' then return jsonb_build_object('result', 'already_friends', 'name', v_name); end if;
    if v_row.requester_id = v_me then return jsonb_build_object('result', 'already_sent', 'name', v_name); end if;
    update public.friendships set status = 'accepted', responded_at = now() where id = v_row.id;  -- they asked first
    perform public._friend_notify_accepted(v_other, v_me);
    return jsonb_build_object('result', 'accepted', 'name', v_name);
  end if;

  insert into public.friendships (requester_id, addressee_id) values (v_me, v_other);
  insert into public.notifications (profile_id, kind, title, body)
  values (v_other, 'friend_request',
          left(coalesce((select nullif(trim(name), '') from public.profiles where id = v_me), 'Someone') || ' wants to add you as a contact', 120),
          'Open Messages → Contacts to accept or decline.');
  return jsonb_build_object('result', 'sent', 'name', v_name);
end $$;

create or replace function public.friend_respond(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_requester uuid;
begin
  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now()
     where id = p_id and addressee_id = auth.uid() and status = 'pending'
     returning requester_id into v_requester;
    if v_requester is not null then perform public._friend_notify_accepted(v_requester, auth.uid()); end if;
  else
    delete from public.friendships where id = p_id and addressee_id = auth.uid() and status = 'pending';
  end if;
end $$;

create or replace function public.friend_open_chat(p_other uuid)
returns table (conversation_id uuid, task_id uuid, poster_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_conv   uuid;
  v_task   uuid;
  v_poster uuid;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from public.friendships
                  where status = 'accepted'
                    and least(requester_id, addressee_id) = least(v_me, p_other)
                    and greatest(requester_id, addressee_id) = greatest(v_me, p_other)) then
    raise exception 'You can only message your contacts here.' using hint = 'yoodle_not_friends';
  end if;
  if public.is_blocked_pair(v_me, p_other) then
    raise exception 'You can''t message this user.' using hint = 'yoodle_blocked';
  end if;

  -- one opener at a time per pair (released at the end of the transaction); the second waits, then finds the chat
  perform pg_advisory_xact_lock(hashtextextended('friend_chat:' || least(v_me, p_other)::text || ':' || greatest(v_me, p_other)::text, 0));

  select c.id, c.task_id, c.poster_id into v_conv, v_task, v_poster
    from public.conversations c join public.tasks t on t.id = c.task_id
   where t.type = 'direct' and c.status = 'active'
     and ((c.poster_id = v_me and c.applicant_id = p_other) or (c.poster_id = p_other and c.applicant_id = v_me))
   order by c.created_at desc limit 1;

  if v_conv is null then
    insert into public.tasks (poster_id, title, description, price, category, lat, lng, status, doer_id, type, show_on_map)
    values (v_me, 'Message', null, 0, 'Other', 43.6532, -79.3832, 'claimed', p_other, 'direct', false)
    returning id into v_task;
    insert into public.conversations (task_id, poster_id, applicant_id, status, poster_last_read_at, applicant_last_read_at)
    values (v_task, v_me, p_other, 'active', now(), now())
    returning id into v_conv;
    v_poster := v_me;
  end if;

  return query select v_conv, v_task, v_poster;
end $$;

revoke execute on function public.friend_request(text), public.friend_respond(uuid, boolean),
  public.friend_open_chat(uuid) from public, anon;
grant execute on function public.friend_request(text), public.friend_respond(uuid, boolean),
  public.friend_open_chat(uuid) to authenticated;
