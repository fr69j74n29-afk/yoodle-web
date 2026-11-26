-- ════════════════════════════════════════════════════════════════════════════
-- Contacts (friends) + friend chats — 26 Nov 2026. App code: js/contacts.js (Messages → Contacts tab).
--
-- Friend requests: add someone by their sign-in email → they accept or decline. Only accepted friends
-- can open a friend chat with each other from the Contacts tab.
--
-- A friend chat is a normal conversation anchored on a hidden task, the same way Yoodi's chat is:
--   tasks.type = 'direct', status = 'claimed', show_on_map = false, poster = whoever opened it first.
-- So messages, pushes, unread dots, blocking, reactions and the Messages list all work unchanged.
--
-- Everything goes through the security-definer functions below; the table itself is read-only to members
-- (and only their own rows). Blocked pairs, suspended members, Yoodi and tester/non-tester mixes can't
-- be added: they get the same "no Yoodle account with that email" answer as an unknown email.
-- Email lookups are capped at 30 a day per member so the box can't be used to test lists of emails.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.friendships (
  id           uuid        primary key default gen_random_uuid(),
  requester_id uuid        not null references public.profiles(id) on delete cascade,
  addressee_id uuid        not null references public.profiles(id) on delete cascade,
  status       text        not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
-- one row per pair, whichever way round
create unique index if not exists friendships_pair_uq
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

alter table public.friendships enable row level security;
drop policy if exists "friendships: read your own" on public.friendships;
create policy "friendships: read your own" on public.friendships
  for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));
revoke all on public.friendships from anon;
revoke insert, update, delete on public.friendships from authenticated;
grant select on public.friendships to authenticated;

-- Email lookups (rate limit only; no other use). Members can't read or write it directly.
create table if not exists public.friend_lookups (
  profile_id uuid        not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists friend_lookups_idx on public.friend_lookups (profile_id, created_at desc);
alter table public.friend_lookups enable row level security;
revoke all on public.friend_lookups from anon, authenticated;

-- Friend chats stay private, like help_offer / admin_note threads.
drop policy if exists tasks_read_public_jobs on public.tasks;
create policy tasks_read_public_jobs on public.tasks
  for select to authenticated, anon
  using (coalesce(type, 'job') <> all (array['help_offer', 'admin_note', 'direct']));


-- ── Send a friend request by email ───────────────────────────────────────────
-- Returns { result, name }. result: sent | accepted (they had already asked you) | already_friends |
-- already_sent | self | not_found | too_many
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
    return jsonb_build_object('result', 'accepted', 'name', v_name);
  end if;

  insert into public.friendships (requester_id, addressee_id) values (v_me, v_other);
  insert into public.notifications (profile_id, kind, title, body)
  values (v_other, 'friend_request',
          left(coalesce((select nullif(trim(name), '') from public.profiles where id = v_me), 'Someone') || ' wants to add you as a contact', 120),
          'Open Messages → Contacts to accept or decline.');
  return jsonb_build_object('result', 'sent', 'name', v_name);
end $$;

-- ── Accept or decline a request sent to me ───────────────────────────────────
create or replace function public.friend_respond(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now()
     where id = p_id and addressee_id = auth.uid() and status = 'pending';
  else
    delete from public.friendships where id = p_id and addressee_id = auth.uid() and status = 'pending';
  end if;
end $$;

-- ── Remove a friend, or cancel a request I sent ──────────────────────────────
-- Also closes our friend chat (archived: hidden from Messages, no new messages). Adding each other
-- again later starts a fresh chat.
create or replace function public.friend_remove(p_other uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships
   where least(requester_id, addressee_id) = least(auth.uid(), p_other)
     and greatest(requester_id, addressee_id) = greatest(auth.uid(), p_other);
  update public.conversations c set status = 'archived'
    from public.tasks t
   where t.id = c.task_id and t.type = 'direct' and c.status = 'active'
     and ((c.poster_id = auth.uid() and c.applicant_id = p_other) or (c.poster_id = p_other and c.applicant_id = auth.uid()));
end $$;

-- ── My contacts: friends + requests both ways, with the friend chat if there is one ──
create or replace function public.get_friends()
returns table (friendship_id uuid, other_id uuid, other_name text, avatar_color text, status text,
               incoming boolean, created_at timestamptz, conversation_id uuid, task_id uuid)
language sql stable security definer set search_path = public as $$
  select f.id,
         o.id,
         coalesce(nullif(trim(o.name), ''), 'Yoodle member'),
         o.avatar_color,
         f.status,
         f.addressee_id = auth.uid(),
         f.created_at,
         dc.id,
         dc.task_id
  from public.friendships f
  join public.profiles o on o.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  left join lateral (
    select c.id, c.task_id from public.conversations c join public.tasks t on t.id = c.task_id
     where t.type = 'direct' and c.status = 'active'
       and ((c.poster_id = auth.uid() and c.applicant_id = o.id) or (c.poster_id = o.id and c.applicant_id = auth.uid()))
     order by c.created_at desc limit 1
  ) dc on f.status = 'accepted'
  where auth.uid() in (f.requester_id, f.addressee_id)
    and o.id not in (select public.my_blocked_ids())
  order by f.status desc, lower(coalesce(o.name, ''));
$$;

-- ── Open (or start) my friend chat with someone ──────────────────────────────
create or replace function public.friend_open_chat(p_other uuid)
returns table (conversation_id uuid, task_id uuid, poster_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_conv uuid;
  v_task uuid;
  v_poster uuid;
  v_lat  double precision;
  v_lng  double precision;
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

  select c.id, c.task_id, c.poster_id into v_conv, v_task, v_poster
    from public.conversations c join public.tasks t on t.id = c.task_id
   where t.type = 'direct' and c.status = 'active'
     and ((c.poster_id = v_me and c.applicant_id = p_other) or (c.poster_id = p_other and c.applicant_id = v_me))
   order by c.created_at desc limit 1;

  if v_conv is null then
    select last_lat, last_lng into v_lat, v_lng from public.profiles where id = v_me;
    insert into public.tasks (poster_id, title, description, price, category, lat, lng, status, doer_id, type, show_on_map)
    values (v_me, 'Message', null, 0, 'Other', coalesce(v_lat, 43.6532), coalesce(v_lng, -79.3832),
            'claimed', p_other, 'direct', false)
    returning id into v_task;
    insert into public.conversations (task_id, poster_id, applicant_id, status, poster_last_read_at, applicant_last_read_at)
    values (v_task, v_me, p_other, 'active', now(), now())
    returning id into v_conv;
    v_poster := v_me;
  end if;

  return query select v_conv, v_task, v_poster;
end $$;

revoke execute on function public.friend_request(text), public.friend_respond(uuid, boolean),
  public.friend_remove(uuid), public.get_friends(), public.friend_open_chat(uuid) from public, anon;
grant execute on function public.friend_request(text), public.friend_respond(uuid, boolean),
  public.friend_remove(uuid), public.get_friends(), public.friend_open_chat(uuid) to authenticated;
