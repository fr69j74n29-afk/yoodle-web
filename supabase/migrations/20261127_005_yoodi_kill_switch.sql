-- ════════════════════════════════════════════════════════════════════════════
-- Yoodi kill switch — 27 Nov 2026 (Rhea). Admin console: "Kill switches" (admin.html). App: js/yoodi.js.
--
-- feature_flags 'yoodi' (on by default). Turned off in the admin console, Yoodi is out of view and out of use
-- everywhere, including app builds that don't know about the switch:
--  - yoodi_ask (members' messages) and yoodi_take_draft (her drafts) refuse: "Yoodi is taking a break".
--  - guard_yoodi_off: no message to or from the Yoodi account can be written, so her replies stop too
--    (the Halo box's inserts are refused while she's off).
--  - yoodi_online() returns null instead of true/false: newer app code hides her (map button, Post a Job and
--    bio shortcuts, her chat in Messages) and shows a Contact support button in her place on the map, since
--    support is otherwise reached from her chat. Older builds show her greyed out, and sending fails politely.
-- Turning her back on undoes all of it; nothing is deleted.
-- admin_feature_flags() / admin_set_feature_flag(): admins only (is_admin()), existing keys only, records who.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.feature_flags add column if not exists updated_by text;
insert into public.feature_flags (key, enabled, updated_at) values ('yoodi', true, now()) on conflict (key) do nothing;

-- Is Yoodi switched on? (missing row = on)
create or replace function public.yoodi_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from public.feature_flags where key = 'yoodi'), true);
$$;
revoke execute on function public.yoodi_enabled() from public;
grant execute on function public.yoodi_enabled() to anon, authenticated;

-- null = switched off (app hides her); true / false = online / resting, as before
create or replace function public.yoodi_online()
returns boolean language sql stable security definer set search_path = public as $$
  select case when not public.yoodi_enabled() then null
              else coalesce((select last_seen > now() - interval '3 minutes' from public.yoodi_live_status where id = 1), false) end;
$$;

-- No message to or from Yoodi while she's switched off (members' sends, and her replies)
create or replace function public.guard_yoodi_off()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.yoodi_enabled() then
    raise exception 'Yoodi is taking a break right now. Please try again later.' using hint = 'yoodle_yoodi_off';
  end if;
  return NEW;
end $$;
drop trigger if exists trg_guard_yoodi_off on public.messages;
create trigger trg_guard_yoodi_off before insert on public.messages
  for each row when (NEW.sender_id = '149e5443-528f-4106-871b-890d7fe1f93b'::uuid or NEW.receiver_id = '149e5443-528f-4106-871b-890d7fe1f93b'::uuid)
  execute function public.guard_yoodi_off();

-- Admin console
create or replace function public.admin_feature_flags()
returns table (key text, enabled boolean, updated_at timestamptz, updated_by text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query select f.key, f.enabled, f.updated_at, f.updated_by from public.feature_flags f order by f.key;
end $$;

create or replace function public.admin_set_feature_flag(p_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  update public.feature_flags set enabled = p_enabled, updated_at = now(), updated_by = auth.jwt() ->> 'email'
   where key = p_key;
  if not found then raise exception 'Unknown switch: %', p_key; end if;
end $$;
revoke execute on function public.admin_feature_flags(), public.admin_set_feature_flag(text, boolean) from public, anon;
grant execute on function public.admin_feature_flags(), public.admin_set_feature_flag(text, boolean) to authenticated;

-- Members' messages and drafts: refused while she's off (same functions otherwise)
CREATE OR REPLACE FUNCTION public.yoodi_ask(p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c_yoodi constant uuid := public.yoodi_account_id();
  v_me   uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_task uuid; v_conv uuid;
  v_lat double precision; v_lng double precision;
begin
  if v_me is null then raise exception 'Please sign in to chat with Yoodi.' using errcode = '42501'; end if;
  if v_me = c_yoodi then raise exception 'This is the Yoodi account.'; end if;
  if not public.yoodi_enabled() then raise exception 'Yoodi is taking a break right now. Please try again later.' using hint = 'yoodle_yoodi_off'; end if;   -- admin kill switch
  if v_body = '' then raise exception 'Message is empty'; end if;
  if length(v_body) > 1000 then raise exception 'Message is too long (max 1000 characters)'; end if;
  if (select count(*) from public.messages
       where sender_id = v_me and receiver_id = c_yoodi
         and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Yoodi needs a short break. Please try again a bit later.' using hint = 'yoodle_yoodi_rate';
  end if;

  select c.id, t.id into v_conv, v_task
    from public.conversations c join public.tasks t on t.id = c.task_id
   where t.type = 'yoodi_chat' and t.poster_id = c_yoodi and c.applicant_id = v_me
     and t.status = 'claimed' and c.status = 'active'
   order by c.created_at desc limit 1;

  if v_conv is null then
    select coalesce(helper_lat, last_lat, 43.6532), coalesce(helper_lng, last_lng, -79.3832)
      into v_lat, v_lng from public.profiles where id = v_me;
    insert into public.tasks (poster_id, title, description, price, category, lat, lng, status, doer_id, type, show_on_map)
    values (c_yoodi, 'Chat with Yoodi', null, 0, 'Other',
            coalesce(v_lat, 43.6532), coalesce(v_lng, -79.3832), 'claimed', v_me, 'yoodi_chat', false)
    returning id into v_task;
    insert into public.conversations (task_id, poster_id, applicant_id, status, poster_last_read_at, applicant_last_read_at)
    values (v_task, c_yoodi, v_me, 'active', now(), now())
    returning id into v_conv;
  end if;

  -- guard_message still applies: suspended members, banned words, closed chats
  insert into public.messages (conversation_id, task_id, sender_id, receiver_id, body)
  values (v_conv, v_task, v_me, c_yoodi, v_body);
  update public.conversations set applicant_last_read_at = now() where id = v_conv;

  return jsonb_build_object('conversation_id', v_conv, 'task_id', v_task, 'online', public.yoodi_online());
end $function$;

CREATE OR REPLACE FUNCTION public.yoodi_take_draft(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_kind text; v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Please sign in.' using errcode = '42501'; end if;
  if not public.yoodi_enabled() then raise exception 'Yoodi is taking a break right now. Please try again later.' using hint = 'yoodle_yoodi_off'; end if;   -- admin kill switch
  update public.yoodi_drafts
     set used_at = now()
   where id = p_id and member_id = auth.uid() and used_at is null and expires_at > now()
  returning kind, payload into v_kind, v_payload;
  if v_kind is null then
    raise exception 'This Yoodi draft has expired or was already used.' using hint = 'yoodle_draft_gone';
  end if;
  return jsonb_build_object('kind', v_kind, 'payload', v_payload);
end $function$;
