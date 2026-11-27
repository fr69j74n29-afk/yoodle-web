-- ════════════════════════════════════════════════════════════════════════════
-- Contacts round 2 (Roman's plan, yoodle-docs ideas/2026-11-26-contacts-plan.md, as agreed with Rhea) — 26 Nov 2026.
-- App code: js/contacts.js, js/chat.js, js/job-detail.js, js/job-post.js, js/my-jobs.js, js/map-data.js, js/map-pins.js.
--
-- 1. Connect from a chat: friend_connect(conversation). Only in a job chat (not Yoodi / support / team /
--    contact chats) where BOTH people have sent at least one message. Counts toward the same 30 a day as
--    email lookups. Remembers the job it came from (friendships.source_task_id) for the auto note.
-- 2. Declines (Roman's guard rails): declining is silent (status 'declined'; the asker still sees "Request
--    sent"), requests expire after 30 days, and the same person can't ask again for 60 days after asking.
--    Cancelling your own request ('withdrawn') counts too. Removing a contact (accepted) is immediate.
-- 3. Contacts list: suspended members hidden; last active, "not taking jobs", the job you connected on,
--    and a private note only you can see (friend_notes).
-- 4. Private job offers between contacts: tasks.status 'offered' + tasks.private_for. Every public read path
--    shows only status 'open' (checked 26 Nov: get_open_jobs_near, job-pages lists, social posts, Brevo,
--    expiry emails), and the public read policy now excludes 'offered'. Only the poster and private_for can
--    read an offer. offer_create / offer_accept / offer_decline / offer_make_public; a guard trigger checks
--    offers only go to accepted contacts. Accepting makes it a normal claimed job with its own chat.
-- Consent levels (Anytime / Only when active) from the plan: left out on purpose (Rhea, 26 Nov).
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── friendships: declined / withdrawn, and where the connection came from ──
alter table public.friendships drop constraint if exists friendships_status_check;
alter table public.friendships add constraint friendships_status_check
  check (status in ('pending', 'accepted', 'declined', 'withdrawn'));
alter table public.friendships add column if not exists source_task_id uuid references public.tasks(id) on delete set null;

-- Private notes about a contact (only the owner can read or change them)
create table if not exists public.friend_notes (
  owner_id   uuid        not null references public.profiles(id) on delete cascade,
  other_id   uuid        not null references public.profiles(id) on delete cascade,
  note       text        not null check (char_length(note) <= 300),
  updated_at timestamptz not null default now(),
  primary key (owner_id, other_id)
);
alter table public.friend_notes enable row level security;
drop policy if exists "notes: your own" on public.friend_notes;
create policy "notes: your own" on public.friend_notes
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.friend_notes from anon;
grant select, insert, update, delete on public.friend_notes to authenticated;


-- ── Shared request logic (email add, chat Connect) ──
-- Returns { result, name }: sent | accepted | already_friends | already_sent
create or replace function public._friend_request_core(p_me uuid, p_other uuid, p_source uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row  public.friendships;
  v_name text;
begin
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

create or replace function public.friend_request(p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_other uuid;
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
  select u.id into v_other from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_other = v_me then return jsonb_build_object('result', 'self'); end if;
  if v_other is null
     or not exists (select 1 from public.profiles where id = v_other)
     or v_other = public.yoodi_account_id()
     or public.is_blocked_pair(v_me, v_other)
     or exists (select 1 from public.suspended_users where user_id = v_other)
     or public.is_tester(v_me) <> public.is_tester(v_other) then
    return jsonb_build_object('result', 'not_found');
  end if;
  return public._friend_request_core(v_me, v_other, null);
end $$;

-- ── Connect from a chat ──
-- Returns { result, name }: sent | accepted | already_friends | already_sent | not_available | too_many
create or replace function public.friend_connect(p_conversation uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_conv  record;
  v_other uuid;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from public.suspended_users where user_id = v_me) then
    raise exception 'Your account is suspended.' using hint = 'yoodle_suspended';
  end if;
  select c.id, c.task_id, c.poster_id, c.applicant_id, t.type into v_conv
    from public.conversations c join public.tasks t on t.id = c.task_id
   where c.id = p_conversation and v_me in (c.poster_id, c.applicant_id);
  if not found or coalesce(v_conv.type, 'job') in ('direct', 'yoodi_chat', 'support_chat', 'admin_note') then
    return jsonb_build_object('result', 'not_available');
  end if;
  v_other := case when v_conv.poster_id = v_me then v_conv.applicant_id else v_conv.poster_id end;
  if not exists (select 1 from public.messages where conversation_id = p_conversation and sender_id = v_me)
     or not exists (select 1 from public.messages where conversation_id = p_conversation and sender_id = v_other)
     or v_other = public.yoodi_account_id()
     or public.is_blocked_pair(v_me, v_other)
     or exists (select 1 from public.suspended_users where user_id = v_other)
     or public.is_tester(v_me) <> public.is_tester(v_other) then
    return jsonb_build_object('result', 'not_available');
  end if;
  if (select count(*) from public.friend_lookups
       where profile_id = v_me and created_at > now() - interval '1 day') >= 30 then
    return jsonb_build_object('result', 'too_many');
  end if;
  insert into public.friend_lookups (profile_id) values (v_me);
  return public._friend_request_core(v_me, v_other, v_conv.task_id);
end $$;

-- ── Accept (opens the chat) / decline (silent) ──
create or replace function public.friend_respond(p_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_requester uuid;
  v_chat      record;
begin
  if not p_accept then
    update public.friendships set status = 'declined', responded_at = now()
     where id = p_id and addressee_id = auth.uid() and status = 'pending';
    return null;
  end if;
  update public.friendships set status = 'accepted', responded_at = now()
   where id = p_id and addressee_id = auth.uid() and status = 'pending'
     and created_at > now() - interval '30 days'
   returning requester_id into v_requester;
  if v_requester is null then return null; end if;
  perform public._friend_notify_accepted(v_requester, auth.uid());
  select * into v_chat from public.friend_open_chat(v_requester);
  return jsonb_build_object('other_id', v_requester, 'conversation_id', v_chat.conversation_id,
                            'task_id', v_chat.task_id, 'poster_id', v_chat.poster_id);
end $$;

-- ── Remove a contact (immediate) / cancel my request (counts toward 60 days) / decline theirs ──
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
  elsif v_row.requester_id = auth.uid() then
    update public.friendships set status = 'withdrawn' where id = v_row.id;
  elsif v_row.status = 'pending' then
    update public.friendships set status = 'declined', responded_at = now() where id = v_row.id;
  end if;
end $$;

-- ── Private note ──
create or replace function public.friend_set_note(p_other uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if nullif(trim(coalesce(p_note, '')), '') is null then
    delete from public.friend_notes where owner_id = auth.uid() and other_id = p_other;
  else
    insert into public.friend_notes (owner_id, other_id, note) values (auth.uid(), p_other, left(trim(p_note), 300))
    on conflict (owner_id, other_id) do update set note = excluded.note, updated_at = now();
  end if;
end $$;

-- ── My contacts (v2) ──
drop function if exists public.get_friends();
create function public.get_friends()
returns table (friendship_id uuid, other_id uuid, other_name text, avatar_color text, status text,
               incoming boolean, created_at timestamptz, connected_at timestamptz,
               conversation_id uuid, task_id uuid, last_active text, taking_jobs boolean,
               source_task_id uuid, source_title text, note text)
language sql stable security definer set search_path = public as $$
  select f.id,
         o.id,
         coalesce(nullif(trim(o.name), ''), 'Yoodle member'),
         o.avatar_color,
         case when f.status = 'accepted' then 'accepted' else 'pending' end,   -- a decline stays "pending" for the asker
         f.addressee_id = auth.uid(),
         f.created_at,
         coalesce(f.responded_at, f.created_at),
         dc.id,
         dc.task_id,
         case when f.status = 'accepted' then public.get_last_active(o.id) end,
         coalesce(o.visible_on_map, false)
           or exists (select 1 from public.tasks jt where jt.poster_id = o.id and jt.status = 'open'),
         st.id,
         st.title,
         n.note
  from public.friendships f
  join public.profiles o on o.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  left join public.tasks st on st.id = f.source_task_id
       and coalesce(st.type, 'job') not in ('direct', 'yoodi_chat', 'support_chat', 'admin_note')
  left join public.friend_notes n on n.owner_id = auth.uid() and n.other_id = o.id and f.status = 'accepted'
  left join lateral (
    select c.id, c.task_id from public.conversations c join public.tasks t on t.id = c.task_id
     where t.type = 'direct' and c.status = 'active'
       and ((c.poster_id = auth.uid() and c.applicant_id = o.id) or (c.poster_id = o.id and c.applicant_id = auth.uid()))
     order by c.created_at desc limit 1
  ) dc on f.status = 'accepted'
  where auth.uid() in (f.requester_id, f.addressee_id)
    and (f.status = 'accepted'
         or (f.status = 'pending' and f.created_at > now() - interval '30 days')
         or (f.status = 'declined' and f.requester_id = auth.uid() and f.created_at > now() - interval '30 days'))
    and o.id not in (select public.my_blocked_ids())
    and not exists (select 1 from public.suspended_users s where s.user_id = o.id)
  order by (f.status = 'accepted') desc, lower(coalesce(o.name, ''));
$$;


-- ══ Private job offers ══
alter table public.tasks add column if not exists private_for uuid references public.profiles(id) on delete set null;
alter table public.tasks add column if not exists offer_declined_at timestamptz;

drop policy if exists tasks_read_public_jobs on public.tasks;
create policy tasks_read_public_jobs on public.tasks
  for select to authenticated, anon
  using (coalesce(type, 'job') <> all (array['help_offer', 'admin_note', 'direct', 'yoodi_chat', 'support_chat'])
         and coalesce(status, 'open') <> 'offered');
drop policy if exists tasks_read_private_offer on public.tasks;
create policy tasks_read_private_offer on public.tasks
  for select to authenticated using (private_for = auth.uid());

-- Offers only to accepted contacts; private_for only means something while the job is an offer.
create or replace function public.guard_private_offer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.status = 'offered' then
    if NEW.private_for is null or NEW.private_for = NEW.poster_id
       or not exists (select 1 from public.friendships
                       where status = 'accepted'
                         and least(requester_id, addressee_id) = least(NEW.poster_id, NEW.private_for)
                         and greatest(requester_id, addressee_id) = greatest(NEW.poster_id, NEW.private_for)) then
      raise exception 'Private job offers can only go to your contacts.' using hint = 'yoodle_offer';
    end if;
  elsif NEW.private_for is not null then
    NEW.private_for := null;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_guard_private_offer on public.tasks;
create trigger trg_guard_private_offer before insert or update on public.tasks
  for each row execute function public.guard_private_offer();

-- A message in our contact chat, from p_from to p_to (offer cards and answers)
create or replace function public._offer_chat_message(p_from uuid, p_to uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_conv uuid; v_task uuid;
begin
  select c.id, c.task_id into v_conv, v_task
    from public.conversations c join public.tasks t on t.id = c.task_id
   where t.type = 'direct' and c.status = 'active'
     and ((c.poster_id = p_from and c.applicant_id = p_to) or (c.poster_id = p_to and c.applicant_id = p_from))
   order by c.created_at desc limit 1;
  if v_conv is null then return; end if;
  insert into public.messages (conversation_id, task_id, sender_id, receiver_id, body)
  values (v_conv, v_task, p_from, p_to, p_body);
end $$;
revoke execute on function public._offer_chat_message(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.offer_create(p_other uuid, p_title text, p_description text, p_category text,
  p_price numeric, p_address text, p_lat double precision, p_lng double precision, p_location_verified boolean,
  p_expires_at timestamptz, p_end_date_chosen boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_task uuid;
  v_chat record;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from public.suspended_users where user_id = v_me) then
    raise exception 'Your account is suspended.' using hint = 'yoodle_suspended';
  end if;
  -- friend_open_chat checks we're contacts and not blocked (and makes the contact chat if there isn't one yet)
  select * into v_chat from public.friend_open_chat(p_other);
  insert into public.tasks (poster_id, title, description, category, price, address, lat, lng, location_verified,
                            status, type, show_on_map, private_for, expires_at, end_date_chosen)
  values (v_me, trim(p_title), trim(p_description), p_category, coalesce(p_price, 0), p_address, p_lat, p_lng,
          coalesce(p_location_verified, false), 'offered', 'job', true, p_other, p_expires_at, coalesce(p_end_date_chosen, false))
  returning id into v_task;
  perform public._offer_chat_message(v_me, p_other,
    '📋 Job offer: ' || left(trim(p_title), 80) || ' · $' || coalesce(p_price, 0)::text ||
    E'\nOnly the two of you can see it. Open it to accept or decline: https://yoodle.ca/?task_id=' || v_task::text);
  return jsonb_build_object('task_id', v_task, 'conversation_id', v_chat.conversation_id);
end $$;

create or replace function public.offer_accept(p_task uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_t    public.tasks;
  v_conv uuid;
  v_name text;
begin
  select * into v_t from public.tasks where id = p_task and status = 'offered' and private_for = v_me for update;
  if not found then raise exception 'This offer is no longer available.' using hint = 'yoodle_offer_gone'; end if;
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

create or replace function public.offer_decline(p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_t public.tasks; v_name text;
begin
  select * into v_t from public.tasks where id = p_task and status = 'offered' and private_for = auth.uid();
  if not found then return; end if;
  update public.tasks set offer_declined_at = now() where id = p_task;
  select coalesce(nullif(trim(name), ''), 'Your contact') into v_name from public.profiles where id = auth.uid();
  perform public._offer_chat_message(auth.uid(), v_t.poster_id, '↩️ ' || v_name || ' can''t take the job offer: ' || left(v_t.title, 80));
end $$;

create or replace function public.offer_make_public(p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.tasks set status = 'open', private_for = null, offer_declined_at = null
   where id = p_task and poster_id = auth.uid() and status = 'offered';
end $$;

-- Accepting an offer isn't "You got the job!" (the doer accepted it themselves): same function, one more check.
create or replace function public.notify_assigned()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_doer_token text;
begin
  if NEW.status != 'claimed' or OLD.status = 'claimed' or OLD.status = 'offered' or NEW.doer_id is null then
    return NEW;
  end if;
  select onesignal_id into v_doer_token from profiles where id = NEW.doer_id;
  perform net.http_post(
    url := 'https://api.onesignal.com/notifications?c=push',
    headers := public._onesignal_headers(),
    body := jsonb_build_object(
      'app_id', '258cf4ad-768d-4775-a8ce-4f79a5c2de04',
      'include_aliases', jsonb_build_object('external_id', jsonb_build_array(NEW.doer_id::text)), 'target_channel', 'push',
      'headings', jsonb_build_object('en', '🎉 You got the job!'),
      'contents', jsonb_build_object('en', 'You''ve been assigned to "' || NEW.title || '" — open Yoodle to coordinate.'),
      'url', 'https://yoodle.ca',
      'ttl', 86400
    )
  );
  return NEW;
end;
$function$;

revoke execute on function public.friend_request(text), public.friend_connect(uuid), public.friend_respond(uuid, boolean),
  public.friend_remove(uuid), public.friend_set_note(uuid, text), public.get_friends(),
  public.offer_create(uuid, text, text, text, numeric, text, double precision, double precision, boolean, timestamptz, boolean),
  public.offer_accept(uuid), public.offer_decline(uuid), public.offer_make_public(uuid) from public, anon;
grant execute on function public.friend_request(text), public.friend_connect(uuid), public.friend_respond(uuid, boolean),
  public.friend_remove(uuid), public.friend_set_note(uuid, text), public.get_friends(),
  public.offer_create(uuid, text, text, text, numeric, text, double precision, double precision, boolean, timestamptz, boolean),
  public.offer_accept(uuid), public.offer_decline(uuid), public.offer_make_public(uuid) to authenticated;

-- Pro opportunity glow: leave out contact chats and private offers (same function otherwise)
CREATE OR REPLACE FUNCTION public.get_pro_opportunity_glow(p_radius_km integer DEFAULT 30)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_lat double precision;
  v_lng double precision;
  v_km  double precision;
  v_r   double precision;
  v_n   integer;
  v_cells json;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select lat, lng, service_radius_km into v_lat, v_lng, v_km from public.pro_profiles where profile_id = v_uid;
  if v_lat is null or v_lng is null then return json_build_object('cells', '[]'::json, 'members', null); end if;
  v_r  := least(greatest(coalesce(p_radius_km, 30), 5), 150);
  v_km := least(greatest(coalesce(v_km, 25), 10), 150);

  -- Glow (Roman, 30 Oct: "every member to glow", "members alone to be shown"): ALL members with a saved area
  -- (on the map or not) + jobs from the last 90 days. ~2 km cells (cell centre), weight only, every cell shown.
  -- The app fades the glow past neighbourhood zoom.
  with m as (
    select coalesce(p.helper_lat, p.last_lat) lat, coalesce(p.helper_lng, p.last_lng) lng
    from public.profiles p
    where coalesce(p.helper_lat, p.last_lat) is not null
      and not coalesce(p.is_demo, false)
      and not exists (select 1 from public.suspended_users s where s.user_id = p.id)
  ), j as (
    select t.lat, t.lng from public.tasks t
    where t.lat is not null and t.lng is not null
      and t.created_at > now() - interval '90 days'
      and coalesce(t.type, 'job') not in ('admin_note', 'agency_job', 'help_offer', 'yoodi_chat', 'support_chat', 'direct')
      and t.status <> 'offered'  -- private job offers (26 Nov 2026)
      and t.poster_id <> 'c89896db-b2ab-4c4c-88fa-650823e63303'
  ), pts as (
    select lat, lng, 1 is_m, 0 is_j from m
    union all select lat, lng, 0, 1 from j
  ), inside as (
    select *, sqrt(power((lat - v_lat) * 110.574, 2) + power((lng - v_lng) * 111.32 * cos(radians(v_lat)), 2)) km from pts
  ), cells as (
    select round((floor(lat / 0.02) * 0.02 + 0.01)::numeric, 3) clat, round((floor(lng / 0.02) * 0.02 + 0.01)::numeric, 3) clng,
           sum(is_m) mem, sum(is_j) jobs
    from inside where km <= v_r group by 1, 2
  )
  select coalesce(json_agg(json_build_object('lat', clat, 'lng', clng, 'w', least(30, mem + 3 * jobs))), '[]'::json)
  into v_cells from cells;

  -- Total: all members within the pro's travel radius, rounded down to 10s; under 20 → null.
  select count(*) into v_n
  from public.profiles p
  where coalesce(p.helper_lat, p.last_lat) is not null
    and not coalesce(p.is_demo, false)
    and not exists (select 1 from public.suspended_users s where s.user_id = p.id)
    and sqrt(power((coalesce(p.helper_lat, p.last_lat) - v_lat) * 110.574, 2)
           + power((coalesce(p.helper_lng, p.last_lng) - v_lng) * 111.32 * cos(radians(v_lat)), 2)) <= v_km;

  return json_build_object('cells', v_cells, 'members', case when v_n >= 20 then (v_n / 10) * 10 else null end);
end $function$;
