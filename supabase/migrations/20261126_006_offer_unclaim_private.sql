-- ════════════════════════════════════════════════════════════════════════════
-- Private job offers: an unclaimed offer stays private — 26 Nov 2026. App code: js/contacts.js, js/my-jobs.js.
--
-- Before: accepting an offer made it a normal job, so Unclaim (by either person) set it to 'open' = public.
-- Now: jobs that started as an offer remember it (tasks.from_offer). Unclaiming one puts it back to
-- status 'offered' with no recipient (private_for null): only the poster can see it. In Activity the poster
-- can Edit it (stays private), Send it to a contact (offer_send, same person or someone else), Make public,
-- or Remove it. offered_at = when it was last sent (for the "no answer after 3 days" prompt).
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.tasks add column if not exists from_offer boolean not null default false;
alter table public.tasks add column if not exists offered_at timestamptz;
update public.tasks set from_offer = true, offered_at = coalesce(offered_at, created_at)
 where status = 'offered' and not from_offer;
-- accepted offers made before this change: their contact chat card points at them
update public.tasks t set from_offer = true
 where not t.from_offer and t.status = 'claimed'
   and exists (select 1 from public.messages m where m.body like '📋 Job offer:%' and m.body like '%task_id=' || t.id::text || '%');

-- Offers: to an accepted contact, or to nobody (private, only the poster sees it). Unclaiming a job that
-- started as an offer keeps it private instead of making it public.
create or replace function public.guard_private_offer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'UPDATE' and OLD.status = 'claimed' and NEW.status = 'open' and OLD.from_offer then
    NEW.status := 'offered';
    NEW.private_for := null;
    NEW.offer_declined_at := null;
  end if;
  if NEW.status = 'offered' then
    if NEW.private_for is not null and (
         NEW.private_for = NEW.poster_id
         or not exists (select 1 from public.friendships
                         where status = 'accepted'
                           and least(requester_id, addressee_id) = least(NEW.poster_id, NEW.private_for)
                           and greatest(requester_id, addressee_id) = greatest(NEW.poster_id, NEW.private_for))) then
      raise exception 'Private job offers can only go to your contacts.' using hint = 'yoodle_offer';
    end if;
  elsif NEW.private_for is not null then
    NEW.private_for := null;
  end if;
  return NEW;
end $$;

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
  select * into v_chat from public.friend_open_chat(p_other);
  insert into public.tasks (poster_id, title, description, category, price, address, lat, lng, location_verified,
                            status, type, show_on_map, private_for, expires_at, end_date_chosen, from_offer, offered_at)
  values (v_me, trim(p_title), trim(p_description), p_category, coalesce(p_price, 0), p_address, p_lat, p_lng,
          coalesce(p_location_verified, false), 'offered', 'job', true, p_other, p_expires_at, coalesce(p_end_date_chosen, false),
          true, now())
  returning id into v_task;
  perform public._offer_chat_message(v_me, p_other,
    '📋 Job offer: ' || left(trim(p_title), 80) || ' · $' || coalesce(p_price, 0)::text ||
    E'\nOnly the two of you can see it. Open it to accept or decline: https://yoodle.ca/?task_id=' || v_task::text);
  return jsonb_build_object('task_id', v_task, 'conversation_id', v_chat.conversation_id);
end $$;

-- Send a private job (unclaimed, declined, or still waiting) to a contact: same person or someone else.
-- The previous recipient can no longer see it.
create or replace function public.offer_send(p_task uuid, p_other uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_t    public.tasks;
  v_chat record;
begin
  select * into v_t from public.tasks where id = p_task and poster_id = v_me and status = 'offered' for update;
  if not found then raise exception 'This job can''t be sent as an offer.' using hint = 'yoodle_offer_gone'; end if;
  select * into v_chat from public.friend_open_chat(p_other);   -- checks we're contacts and not blocked
  update public.tasks set private_for = p_other, offer_declined_at = null, offered_at = now() where id = p_task;
  perform public._offer_chat_message(v_me, p_other,
    '📋 Job offer: ' || left(v_t.title, 80) || ' · $' || coalesce(v_t.price, 0)::text ||
    E'\nOnly the two of you can see it. Open it to accept or decline: https://yoodle.ca/?task_id=' || p_task::text);
  return jsonb_build_object('task_id', p_task, 'conversation_id', v_chat.conversation_id);
end $$;

-- After the poster edits an offer that's out with a contact: tell them in the chat (the card links to the live job).
create or replace function public.offer_updated(p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_t public.tasks;
begin
  select * into v_t from public.tasks where id = p_task and poster_id = auth.uid() and status = 'offered' and private_for is not null;
  if not found then return; end if;
  perform public._offer_chat_message(auth.uid(), v_t.private_for,
    '✏️ Job offer updated: ' || left(v_t.title, 80) || ' · $' || coalesce(v_t.price, 0)::text ||
    E'\nOpen it to see the changes: https://yoodle.ca/?task_id=' || p_task::text);
end $$;

revoke execute on function public.offer_send(uuid, uuid), public.offer_updated(uuid) from public, anon;
grant execute on function public.offer_send(uuid, uuid), public.offer_updated(uuid) to authenticated;
