-- ════════════════════════════════════════════════════════════════════════════
-- Contact support / send feedback from the Profile page — 27 Nov 2026 (Rhea).
-- App: js/feedback.js (box at the bottom of Profile). Admin console: "FEEDBACK & SUPPORT" (admin.html).
--
-- One-way: a member types a message and sends it; it lands in the admin console (no chat, no email). Each one
-- keeps a little context (which app / site, page) to help us reproduce problems. The team marks them done.
-- Members can't read or change the table: send_feedback() only. Limits: 1–2000 characters, 5 an hour, 20 a day.
-- Separate from the Contact support chat (support_chat, reached from Yoodi), which is a two-way conversation.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.feedback (
  id          uuid        primary key default gen_random_uuid(),
  profile_id  uuid        references public.profiles(id) on delete set null,
  body        text        not null check (char_length(body) between 1 and 2000),
  context     jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  done_at     timestamptz,
  done_by     text
);
create index if not exists feedback_new_idx on public.feedback (created_at desc) where done_at is null;
create index if not exists feedback_profile_idx on public.feedback (profile_id, created_at);
alter table public.feedback enable row level security;   -- no policies: send_feedback() and the admin functions only
revoke all on public.feedback from anon, authenticated;

create or replace function public.send_feedback(p_body text, p_context jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_ctx  jsonb := coalesce(p_context, '{}'::jsonb);
begin
  if v_me is null then raise exception 'Please sign in to send feedback.' using errcode = '42501'; end if;
  if v_body = '' then raise exception 'Type a message first.'; end if;
  if char_length(v_body) > 2000 then raise exception 'Please keep it under 2000 characters.'; end if;
  if (select count(*) from public.feedback where profile_id = v_me and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.feedback where profile_id = v_me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Thanks! You''ve sent a lot already. Please try again a bit later.' using hint = 'yoodle_feedback_rate';
  end if;
  if jsonb_typeof(v_ctx) <> 'object' or length(v_ctx::text) > 1000 then v_ctx := '{}'::jsonb; end if;
  insert into public.feedback (profile_id, body, context) values (v_me, v_body, v_ctx);
end $$;
revoke execute on function public.send_feedback(text, jsonb) from public, anon;
grant execute on function public.send_feedback(text, jsonb) to authenticated;

-- ── Admin console ──
create or replace function public.admin_feedback(p_limit integer default 100, p_include_done boolean default false)
returns table (id uuid, profile_id uuid, name text, email text, body text, context jsonb,
               created_at timestamptz, done_at timestamptz, done_by text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query
    select f.id, f.profile_id, p.name, u.email::text, f.body, f.context, f.created_at, f.done_at, f.done_by
      from public.feedback f
      left join public.profiles p on p.id = f.profile_id
      left join auth.users u on u.id = f.profile_id
     where p_include_done or f.done_at is null
     order by f.created_at desc
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

create or replace function public.admin_feedback_new()
returns integer language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return (select count(*) from public.feedback where done_at is null);
end $$;

create or replace function public.admin_feedback_done(p_id uuid, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  update public.feedback
     set done_at = case when p_done then now() end,
         done_by = case when p_done then auth.jwt() ->> 'email' end
   where id = p_id;
end $$;

revoke execute on function public.admin_feedback(integer, boolean), public.admin_feedback_new(),
  public.admin_feedback_done(uuid, boolean) from public, anon;
grant execute on function public.admin_feedback(integer, boolean), public.admin_feedback_new(),
  public.admin_feedback_done(uuid, boolean) to authenticated;
