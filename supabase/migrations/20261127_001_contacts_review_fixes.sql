-- ════════════════════════════════════════════════════════════════════════════
-- Contacts and private offers: fixes from the 27 Nov 2026 code review. App code: js/contacts.js, js/my-jobs.js,
-- js/map-data.js, js/job-detail.js, js/messages.js.
--
-- 1. A job that started as a private offer (tasks.from_offer) is never public, whatever its status: cancelled,
--    claimed, completed. Before, an offer that ended with no recipient (private_for null) became readable by
--    anyone. Only the poster, the doer (tasks_read_participants) and private_for can read it. Making it public
--    (offer_make_public) clears from_offer, so it's then a normal job for good.
-- 2. A job that started as an offer stays private when anything puts it back to 'open' (unclaim, renew, the
--    expiry email edit): it goes back to 'offered'. Only offer_make_public turns it public.
-- 3. The contact check on offers runs only when an offer is sent (new recipient, or back to 'offered'), not on
--    every update: the contact can still decline, and the poster can still edit, after they stop being contacts.
-- 4. offer_accept checks again that the two are still contacts, not blocked, and neither is suspended.
--    Removing a contact or blocking someone takes back any offer between the two (private, not sent to anyone).
-- 5. _friend_request_core: one at a time per pair (two people connecting at the same moment got a raw error).
-- 6. Invites: every invite is logged (friend_invite_sends), cancelled or not, and existing members get an
--    invite row too. So the 10 a day counts every try, "already invited" looks the same for members and
--    non-members, and cancelling and inviting again can't send a second email within 30 days.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Offers are never public ──
drop policy if exists tasks_read_public_jobs on public.tasks;
create policy tasks_read_public_jobs on public.tasks
  for select to authenticated, anon
  using (coalesce(type, 'job') <> all (array['help_offer', 'admin_note', 'direct', 'yoodi_chat', 'support_chat'])
         and coalesce(status, 'open') <> 'offered'
         and not coalesce(from_offer, false));

-- ── 2 + 3. Guard ──
create or replace function public.guard_private_offer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sent boolean;
begin
  -- started as an offer and something set it back to 'open' (unclaim, renew): it stays private
  if TG_OP = 'UPDATE' and OLD.from_offer and NEW.from_offer and NEW.status = 'open' then
    NEW.status := 'offered';
    if OLD.status = 'claimed' then        -- unclaimed: back with the poster, not sent to anyone
      NEW.private_for := null;
      NEW.offer_declined_at := null;
    end if;
  end if;

  if NEW.status = 'offered' then
    if NEW.private_for is not null then
      v_sent := TG_OP = 'INSERT' or NEW.private_for is distinct from OLD.private_for or OLD.status <> 'offered';
      if v_sent and (NEW.private_for = NEW.poster_id
           or public.is_blocked_pair(NEW.poster_id, NEW.private_for)
           or not exists (select 1 from public.friendships
                           where status = 'accepted'
                             and least(requester_id, addressee_id) = least(NEW.poster_id, NEW.private_for)
                             and greatest(requester_id, addressee_id) = greatest(NEW.poster_id, NEW.private_for))) then
        if TG_OP = 'UPDATE' and NEW.private_for is not distinct from OLD.private_for then
          NEW.private_for := null;        -- back to 'offered' but no longer contacts: keep it with the poster
        else
          raise exception 'Private job offers can only go to your contacts.' using hint = 'yoodle_offer';
        end if;
      end if;
    end if;
  elsif NEW.status = 'cancelled' and TG_OP = 'UPDATE' and OLD.status in ('offered', 'cancelled') then
    null;  -- keep private_for: the contact can still see that it was cancelled
  elsif NEW.private_for is not null then
    NEW.private_for := null;
  end if;
  return NEW;
end $$;

-- ── 4. Accept: still contacts, not blocked, nobody suspended ──
create or replace function public.offer_accept(p_task uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_t    public.tasks;
  v_conv uuid;
  v_name text;
begin
  select * into v_t from public.tasks where id = p_task and status = 'offered' and private_for = v_me for update;
  if not found
     or public.is_blocked_pair(v_me, v_t.poster_id)
     or exists (select 1 from public.suspended_users where user_id in (v_me, v_t.poster_id))
     or not exists (select 1 from public.friendships
                     where status = 'accepted'
                       and least(requester_id, addressee_id) = least(v_me, v_t.poster_id)
                       and greatest(requester_id, addressee_id) = greatest(v_me, v_t.poster_id)) then
    raise exception 'This offer is no longer available.' using hint = 'yoodle_offer_gone';
  end if;
  update public.tasks set status = 'claimed', doer_id = v_me, offer_declined_at = null where id = p_task;
  insert into public.applications (task_id, applicant_id, status) values (p_task, v_me, 'assigned')
  on conflict (task_id, applicant_id) do update set status = 'assigned';
  select id into v_conv from public.conversations where task_id = p_task and applicant_id = v_me and status = 'active' limit 1;
  if v_conv is null then
    insert into public.conversations (task_id, poster_id, applicant_id, status, poster_last_read_at, applicant_last_read_at)
    values (p_task, v_t.poster_id, v_me, 'active', now(), now()) returning id into v_conv;
  end if;
  select coalesce(nullif(trim(name), ''), 'Your contact') into v_name from public.profiles where id = v_me;
  perform public._offer_chat_message(v_me, v_t.poster_id, '✅ ' || v_name || ' accepted the job offer: ' || left(v_t.title, 80));
  return jsonb_build_object('task_id', p_task, 'conversation_id', v_conv, 'poster_id', v_t.poster_id, 'title', v_t.title);
end $$;

-- Make public: a normal job from now on (unclaiming it later makes it open, like any job)
create or replace function public.offer_make_public(p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.tasks set status = 'open', private_for = null, offer_declined_at = null, from_offer = false
   where id = p_task and poster_id = auth.uid() and status = 'offered';
end $$;

-- Take back offers between two people (removed as a contact, or blocked)
create or replace function public._offer_retract_pair(p_a uuid, p_b uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.tasks set private_for = null, offer_declined_at = null
   where status = 'offered'
     and ((poster_id = p_a and private_for = p_b) or (poster_id = p_b and private_for = p_a));
end $$;
revoke execute on function public._offer_retract_pair(uuid, uuid) from public, anon, authenticated;

create or replace function public.friend_remove(p_other uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_row public.friendships;
begin
  select * into v_row from public.friendships
   where least(requester_id, addressee_id) = least(auth.uid(), p_other)
     and greatest(requester_id, addressee_id) = greatest(auth.uid(), p_other);
  if not found then return; end if;
  if v_row.status = 'accepted' then
    delete from public.friendships where id = v_row.id;
    update public.conversations c set status = 'archived'
      from public.tasks t
     where t.id = c.task_id and t.type = 'direct' and c.status = 'active'
       and ((c.poster_id = auth.uid() and c.applicant_id = p_other) or (c.poster_id = p_other and c.applicant_id = auth.uid()));
    delete from public.friend_notes where owner_id = auth.uid() and other_id = p_other;
    perform public._offer_retract_pair(auth.uid(), p_other);
  elsif v_row.requester_id = auth.uid() then
    update public.friendships set status = 'withdrawn' where id = v_row.id;
  elsif v_row.status = 'pending' then
    update public.friendships set status = 'declined', responded_at = now() where id = v_row.id;
  end if;
end $$;

create or replace function public._block_retract_offers()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._offer_retract_pair(NEW.blocker_id, NEW.blocked_id);
  return NEW;
end $$;
revoke execute on function public._block_retract_offers() from public, anon, authenticated;
drop trigger if exists trg_block_retract_offers on public.blocks;
create trigger trg_block_retract_offers after insert on public.blocks
  for each row execute function public._block_retract_offers();

-- ── 5. One request at a time per pair ──
create or replace function public._friend_request_core(p_me uuid, p_other uuid, p_source uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row  public.friendships;
  v_name text;
begin
  perform pg_advisory_xact_lock(hashtextextended('friendship:' || least(p_me, p_other)::text || ':' || greatest(p_me, p_other)::text, 0));
  select coalesce(nullif(trim(name), ''), 'A Yoodle member') into v_name from public.profiles where id = p_other;
  select * into v_row from public.friendships
   where least(requester_id, addressee_id) = least(p_me, p_other)
     and greatest(requester_id, addressee_id) = greatest(p_me, p_other);
  if found then
    if v_row.status = 'accepted' then return jsonb_build_object('result', 'already_friends', 'name', v_name); end if;
    if v_row.requester_id = p_me and v_row.created_at > now() - interval '60 days' then
      return jsonb_build_object('result', 'already_sent', 'name', v_name);       -- silent: pending, declined or withdrawn
    end if;
    if v_row.requester_id = p_other and v_row.status = 'pending' and v_row.created_at > now() - interval '30 days' then
      update public.friendships set status = 'accepted', responded_at = now(),
             source_task_id = coalesce(source_task_id, p_source) where id = v_row.id;   -- they asked first
      perform public._friend_notify_accepted(p_other, p_me);
      return jsonb_build_object('result', 'accepted', 'name', v_name);
    end if;
    -- an old request (either direction) that's over: start a fresh one from me
    update public.friendships set requester_id = p_me, addressee_id = p_other, status = 'pending',
           created_at = now(), responded_at = null, source_task_id = p_source where id = v_row.id;
  else
    insert into public.friendships (requester_id, addressee_id, source_task_id) values (p_me, p_other, p_source);
  end if;
  insert into public.notifications (profile_id, kind, title, body)
  values (p_other, 'friend_request',
          left(coalesce((select nullif(trim(name), '') from public.profiles where id = p_me), 'Someone') || ' wants to add you as a contact', 120),
          'Open Messages → Contacts to accept or decline.');
  return jsonb_build_object('result', 'sent', 'name', v_name);
end $$;
revoke execute on function public._friend_request_core(uuid, uuid, uuid) from public, anon, authenticated;

-- ── 6. Invites: a log that cancelling doesn't touch ──
create table if not exists public.friend_invite_sends (
  id          bigint      generated always as identity primary key,
  inviter_id  uuid        not null references public.profiles(id) on delete cascade,
  email       text        not null,
  created_at  timestamptz not null default now(),
  emailed     boolean     not null default false
);
create index if not exists friend_invite_sends_inviter_idx on public.friend_invite_sends (inviter_id, created_at);
create index if not exists friend_invite_sends_email_idx on public.friend_invite_sends (email, created_at) where emailed;
alter table public.friend_invite_sends enable row level security;   -- no policies: only friend_invite() uses it
revoke all on public.friend_invite_sends from anon, authenticated;
insert into public.friend_invite_sends (inviter_id, email, created_at, emailed)
select i.inviter_id, i.email, i.created_at, i.emailed_at is not null from public.friend_invites i
 where not exists (select 1 from public.friend_invite_sends s);

-- Returns { result }: sent | already_invited | self | invalid | too_many
create or replace function public.friend_invite(p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_name   text;
  v_id     uuid;
  v_key    text;
  v_send   bigint;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from public.suspended_users where user_id = v_me) then
    raise exception 'Your account is suspended.' using hint = 'yoodle_suspended';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or char_length(v_email) > 254 then
    return jsonb_build_object('result', 'invalid');
  end if;
  if exists (select 1 from auth.users where id = v_me and lower(email) = v_email) then
    return jsonb_build_object('result', 'self');
  end if;
  if exists (select 1 from public.friend_invites where inviter_id = v_me and email = v_email) then
    return jsonb_build_object('result', 'already_invited');   -- same answer for members and non-members
  end if;
  if (select count(*) from public.friend_invite_sends
       where inviter_id = v_me and created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('result', 'too_many');
  end if;

  insert into public.friend_invites (inviter_id, email) values (v_me, v_email)
  on conflict (inviter_id, email) do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('result', 'already_invited'); end if;
  insert into public.friend_invite_sends (inviter_id, email) values (v_me, v_email) returning id into v_send;

  -- Already a member (including ones we don't reveal: blocked, suspended, test accounts): no email, same answer.
  if exists (select 1 from auth.users where lower(email) = v_email) then
    return jsonb_build_object('result', 'sent');
  end if;

  select coalesce(nullif(trim(name), ''), 'A friend') into v_name from public.profiles where id = v_me;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key';

  -- One invite email per address per 30 days (cancelled invites count), never with a name that fails the word filter.
  if v_key is not null
     and not public.contains_banned_words(v_name)
     and not exists (select 1 from public.friend_invite_sends
                      where email = v_email and emailed and created_at > now() - interval '30 days') then
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key,
                                    'Idempotency-Key', 'friend-invite/' || v_id::text),
      body := jsonb_build_object(
        'from', 'Yoodle <notifications@yoodle.ca>',
        'to', v_email,
        'reply_to', 'support@yoodle.ca',
        'headers', jsonb_build_object('List-Unsubscribe', '<mailto:unsubscribe@yoodle.ca?subject=unsubscribe>'),
        'subject', left(v_name, 60) || ' invited you to Yoodle',
        'html', '<p>Hi there,</p>' ||
                '<p><strong>' || public._esc(v_name) || '</strong> wants to add you as a contact on Yoodle, the neighbourhood app ' ||
                'for finding local help and earning money helping neighbours.</p>' ||
                '<p>Join with this email address (<strong>' || public._esc(v_email) || '</strong>) and you''ll find ' ||
                public._esc(v_name) || '''s request waiting in <strong>Messages → Contacts</strong>. Accept it to start chatting.</p>' ||
                '<p><a href="https://yoodle.ca/?s=invite" style="display:inline-block;padding:10px 18px;background:#178A52;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Join ' ||
                public._esc(left(v_name, 40)) || ' on Yoodle</a></p>' ||
                '<hr><p style="font-size:12px;color:#666">You got this email because ' || public._esc(v_name) ||
                ', a Yoodle member, entered your address. It''s a one-time invite: we won''t email you again unless another friend invites you. ' ||
                'Not interested? Just ignore it, or reply "unsubscribe".</p>',
        'text', 'Hi there,' || E'\n\n' || v_name || ' wants to add you as a contact on Yoodle, the neighbourhood app for finding local help and earning money helping neighbours.' ||
                E'\n\nJoin with this email address (' || v_email || ') and you''ll find ' || v_name || '''s request waiting in Messages → Contacts. Accept it to start chatting.' ||
                E'\n\nJoin: https://yoodle.ca/?s=invite' ||
                E'\n\n--\nYou got this email because ' || v_name || ', a Yoodle member, entered your address. It''s a one-time invite: we won''t email you again unless another friend invites you. Not interested? Just ignore it, or reply "unsubscribe".'
      )
    );
    update public.friend_invites set emailed_at = now() where id = v_id;
    update public.friend_invite_sends set emailed = true where id = v_send;
  end if;
  return jsonb_build_object('result', 'sent');
end $$;
revoke execute on function public.friend_invite(text) from public, anon;
grant execute on function public.friend_invite(text) to authenticated;
