-- ════════════════════════════════════════════════════════════════════════════
-- Private job offers: a cancelled offer shows as cancelled for both people — 26 Nov 2026.
--
-- Before: cancelling an offer cleared private_for, so the contact lost access, and the cancelled job became
-- readable by anyone (cancelled jobs are public like other non-offer jobs).
-- Now: an offer cancelled while it was out keeps private_for, so the contact can still open it (and sees
-- "Job cancelled"), it stays hidden from everyone else, and a "🚫 Job offer cancelled" line is posted in
-- the contact chat. App: js/job-detail.js (cancelled state), js/contacts.js, js/chat.js.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

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
  elsif NEW.status = 'cancelled' and TG_OP = 'UPDATE' and OLD.status in ('offered', 'cancelled') then
    null;  -- keep private_for: the contact can still see that it was cancelled
  elsif NEW.private_for is not null then
    NEW.private_for := null;
  end if;
  return NEW;
end $$;

-- Cancelled offers stay private (only the poster and private_for can read them)
drop policy if exists tasks_read_public_jobs on public.tasks;
create policy tasks_read_public_jobs on public.tasks
  for select to authenticated, anon
  using (coalesce(type, 'job') <> all (array['help_offer', 'admin_note', 'direct', 'yoodi_chat', 'support_chat'])
         and coalesce(status, 'open') <> 'offered'
         and not (status = 'cancelled' and private_for is not null));

-- Tell the contact in the chat when an offer they had is cancelled
create or replace function public.notify_offer_cancelled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if OLD.status = 'offered' and NEW.status = 'cancelled' and OLD.private_for is not null then
    perform public._offer_chat_message(NEW.poster_id, OLD.private_for,
      '🚫 Job offer cancelled: ' || left(NEW.title, 80));
  end if;
  return NEW;
end $$;
drop trigger if exists trg_notify_offer_cancelled on public.tasks;
create trigger trg_notify_offer_cancelled after update on public.tasks
  for each row execute function public.notify_offer_cancelled();
