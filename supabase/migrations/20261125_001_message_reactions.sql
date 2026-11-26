-- ════════════════════════════════════════════════════════════════════════════
-- Message reactions (👍 / 👎) in every chat, Yoodi's included — 25 Nov 2026.
-- App code: js/reactions.js (double tap a received message = 👍, press and hold = 👎).
--
-- One row per person per message. Who can do what:
--   read   → anyone who can read the message itself (both people in the chat; admins via their messages policy)
--   add / change → only on a message you can read and did NOT send, only as yourself
--   remove → only your own
-- "Can read the message" is checked by a subquery on public.messages, which runs under the caller's own
-- messages RLS, so this table never shows more than the chat already does.
-- Assumes public.messages.id is uuid (Supabase default). Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.message_reactions (
  message_id uuid        not null references public.messages(id) on delete cascade,
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  reaction   text        not null check (reaction in ('up', 'down')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists message_reactions_user_idx on public.message_reactions (user_id);

alter table public.message_reactions enable row level security;

drop policy if exists "reactions: read if you can read the message" on public.message_reactions;
create policy "reactions: read if you can read the message" on public.message_reactions
  for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id));

drop policy if exists "reactions: add on messages sent to you" on public.message_reactions;
create policy "reactions: add on messages sent to you" on public.message_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.messages m where m.id = message_id and m.sender_id <> auth.uid())
  );

drop policy if exists "reactions: change your own" on public.message_reactions;
create policy "reactions: change your own" on public.message_reactions
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.messages m where m.id = message_id and m.sender_id <> auth.uid())
  );

drop policy if exists "reactions: remove your own" on public.message_reactions;
create policy "reactions: remove your own" on public.message_reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- Feedback on Yoodi's replies, for review in the SQL Editor:
--   select r.reaction, r.created_at, m.body
--   from public.message_reactions r join public.messages m on m.id = r.message_id
--   where m.sender_id = '149e5443-528f-4106-871b-890d7fe1f93b' order by r.created_at desc;
