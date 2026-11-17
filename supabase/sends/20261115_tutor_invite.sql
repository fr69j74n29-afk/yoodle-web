-- One-off send (NOT a migration — run by hand only after it's approved).
-- Invites every yoodle.ca helper who picked the "Tutoring" category to finish a tutor profile
-- on tutor.yoodle.ca. Skips testers, demo accounts, suspended users and anyone already a tutor
-- on tutor.yoodle.ca. Re-running sends nothing new (unique index on profile_id + 'invite:%' kind).
insert into public.notifications (profile_id, kind, title, body, link, link_label)
select p.id, 'invite:tutor_profile',
       'You offer tutoring. Get listed on Yoodle Tutors',
       'Finish your free tutor profile on tutor.yoodle.ca so students and parents near you can find and book you. Sign in with this same account.',
       'https://tutor.yoodle.ca/?start=tutor', 'Complete tutor profile'
from public.profiles p
where 'Tutoring' = any(p.helper_categories)
  and not coalesce(p.is_tester, false)
  and not coalesce(p.is_demo, false)
  and not exists (select 1 from public.suspended_users s where s.user_id = p.id)
  and not exists (select 1 from public.tutor_members m where m.profile_id = p.id and m.role = 'tutor')
on conflict do nothing;
