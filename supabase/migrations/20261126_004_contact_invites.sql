-- ════════════════════════════════════════════════════════════════════════════
-- Contacts: invite someone who isn't on Yoodle yet, by email — 26 Nov 2026. App code: js/contacts.js.
--
-- Flow: Contacts search → full email → "No Yoodle account uses that email" → Invite (confirm) →
--   friend_invite() saves the invite and emails them (Resend; key from Vault 'resend_api_key', never in this repo).
--   When they join with that email, their new profile turns every open invite into a contact request from the
--   inviter (trigger on profiles), with an in-app notification. When they accept, friend_respond() also starts
--   the friend chat and returns it, so the app opens the DM straight away (same for any accepted request).
--
-- Limits: 10 invites a day per member; an address gets at most one invite email per 30 days, whoever sends it
-- (later invites are still saved, so every inviter becomes a request when they join). The answer never says
-- whether an address already has an account: existing accounts are skipped silently (no email, no row).
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.friend_invites (
  id          uuid        primary key default gen_random_uuid(),
  inviter_id  uuid        not null references public.profiles(id) on delete cascade,
  email       text        not null check (email = lower(email) and char_length(email) between 3 and 254),
  created_at  timestamptz not null default now(),
  emailed_at  timestamptz,
  claimed_at  timestamptz,
  claimed_by  uuid        references public.profiles(id) on delete set null,
  unique (inviter_id, email)
);
create index if not exists friend_invites_email_idx on public.friend_invites (email) where claimed_at is null;

alter table public.friend_invites enable row level security;
drop policy if exists "invites: read your own" on public.friend_invites;
create policy "invites: read your own" on public.friend_invites
  for select to authenticated using (inviter_id = auth.uid());
drop policy if exists "invites: cancel your own" on public.friend_invites;
create policy "invites: cancel your own" on public.friend_invites
  for delete to authenticated using (inviter_id = auth.uid() and claimed_at is null);
revoke all on public.friend_invites from anon;
revoke insert, update on public.friend_invites from authenticated;
grant select, delete on public.friend_invites to authenticated;


-- ── Invite by email ──────────────────────────────────────────────────────────
-- Returns { result }: sent | already_invited | self | invalid | too_many
create or replace function public.friend_invite(p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_name   text;
  v_id     uuid;
  v_key    text;
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
  if (select count(*) from public.friend_invites
       where inviter_id = v_me and created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('result', 'too_many');
  end if;
  -- Already a member (including ones we don't reveal: blocked, suspended, test accounts): do nothing, same answer.
  if exists (select 1 from auth.users where lower(email) = v_email) then
    return jsonb_build_object('result', 'sent');
  end if;

  insert into public.friend_invites (inviter_id, email) values (v_me, v_email)
  on conflict (inviter_id, email) do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('result', 'already_invited'); end if;

  select coalesce(nullif(trim(name), ''), 'A friend') into v_name from public.profiles where id = v_me;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key';

  -- One invite email per address per 30 days, and never with a name that fails the word filter.
  if v_key is not null
     and not public.contains_banned_words(v_name)
     and not exists (select 1 from public.friend_invites
                      where email = v_email and id <> v_id and emailed_at > now() - interval '30 days') then
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
  end if;
  return jsonb_build_object('result', 'sent');
end $$;


-- ── New member: open invites for their email become contact requests ─────────
create or replace function public._friend_claim_invites()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  r       record;
begin
  select lower(email) into v_email from auth.users where id = NEW.id;
  if v_email is null then return NEW; end if;
  for r in select * from public.friend_invites where email = v_email and claimed_at is null loop
    update public.friend_invites set claimed_at = now(), claimed_by = NEW.id where id = r.id;
    if r.inviter_id = NEW.id
       or public.is_blocked_pair(r.inviter_id, NEW.id)
       or exists (select 1 from public.suspended_users where user_id = r.inviter_id)
       or public.is_tester(r.inviter_id) <> public.is_tester(NEW.id) then
      continue;
    end if;
    insert into public.friendships (requester_id, addressee_id) values (r.inviter_id, NEW.id)
    on conflict do nothing;
    if found then
      insert into public.notifications (profile_id, kind, title, body)
      values (NEW.id, 'friend_request',
              left(coalesce((select nullif(trim(name), '') from public.profiles where id = r.inviter_id), 'A friend') || ' invited you to Yoodle', 120),
              'Open Messages → Contacts to accept and start chatting.');
    end if;
  end loop;
  return NEW;
end $$;
drop trigger if exists trg_friend_claim_invites on public.profiles;
create trigger trg_friend_claim_invites after insert on public.profiles
  for each row execute function public._friend_claim_invites();


-- ── Accept / decline: accepting also starts the friend chat and returns it ──
drop function if exists public.friend_respond(uuid, boolean);
create function public.friend_respond(p_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_requester uuid;
  v_chat      record;
begin
  if not p_accept then
    delete from public.friendships where id = p_id and addressee_id = auth.uid() and status = 'pending';
    return null;
  end if;
  update public.friendships set status = 'accepted', responded_at = now()
   where id = p_id and addressee_id = auth.uid() and status = 'pending'
   returning requester_id into v_requester;
  if v_requester is null then return null; end if;
  perform public._friend_notify_accepted(v_requester, auth.uid());
  select * into v_chat from public.friend_open_chat(v_requester);
  return jsonb_build_object('other_id', v_requester, 'conversation_id', v_chat.conversation_id,
                            'task_id', v_chat.task_id, 'poster_id', v_chat.poster_id);
end $$;

revoke execute on function public.friend_invite(text), public.friend_respond(uuid, boolean) from public, anon;
grant execute on function public.friend_invite(text), public.friend_respond(uuid, boolean) to authenticated;
revoke execute on function public._friend_claim_invites() from public, anon, authenticated;
