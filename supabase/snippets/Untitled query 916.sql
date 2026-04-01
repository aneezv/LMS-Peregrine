-- ============================================================
-- Peregrine LMS — sample data for local testing
-- ============================================================
-- 1) Create auth users (Authentication → Add user) for:
--      admin@peregrine.lms / instructor@peregrine.lms / learner@peregrine.lms
-- 2) Run `test_accounts.sql` to set roles + names on public.profiles
-- 3) Run this file (Studio SQL Editor or psql)
--
-- `supabase db reset` runs migrations then this seed before users exist —
-- those runs may insert nothing for the course; re-run this file after step 2.
-- ============================================================

insert into public.courses (
  id,
  instructor_id,
  title,
  description,
  status,
  enrollment_type
)
select
  'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
  u.id,
  'Introduction to Web Development',
  'Learn the fundamentals of web development including HTML, CSS, JavaScript, and modern frameworks.',
  'published',
  'open'
from auth.users u
where u.email = 'instructor@peregrine.lms'
on conflict (id) do update set
  instructor_id = excluded.instructor_id,
  title = excluded.title,
  description = excluded.description,
  status = excluded.status,
  enrollment_type = excluded.enrollment_type;

insert into public.sections (id, course_id, title, sort_order)
select v.id, v.course_id, v.title, v.sort_order
from (
  values
    ('b1000000-0000-0000-0000-000000000001'::uuid, 'a1b2c3d4-0000-0000-0000-000000000001'::uuid, 'Getting Started', 0),
    ('b1000000-0000-0000-0000-000000000002'::uuid, 'a1b2c3d4-0000-0000-0000-000000000001'::uuid, 'HTML Fundamentals', 1),
    ('b1000000-0000-0000-0000-000000000003'::uuid, 'a1b2c3d4-0000-0000-0000-000000000001'::uuid, 'CSS & Styling', 2)
) as v(id, course_id, title, sort_order)
inner join public.courses c on c.id = v.course_id
on conflict (id) do update set
  course_id = excluded.course_id,
  title = excluded.title,
  sort_order = excluded.sort_order;

insert into public.modules (
  id, course_id, section_id, type, title, content_url, sort_order, available_from, is_sequential
)
select
  v.id, v.course_id, v.section_id, v.type, v.title, v.content_url, v.sort_order, v.available_from, v.is_sequential
from (
  values
    ('c1000000-0000-0000-0000-000000000001'::uuid, 'a1b2c3d4-0000-0000-0000-000000000001'::uuid, 'b1000000-0000-0000-0000-000000000001'::uuid, 'video'::public.module_type, 'Welcome to the Course', 'https://www.youtube.com/watch?v=qz0aGYrrlhU', 0, null::timestamptz, false),
    ('c1000000-0000-0000-0000-000000000002'::uuid, 'a1b2c3d4-0000-0000-0000-000000000001'::uuid, 'b1000000-0000-0000-0000-000000000001'::uuid, 'live_session'::public.module_type, 'Week 1 – Orientation Live Session', 'https://meet.google.com/example-link', 1, null::timestamptz, false),
    ('c1000000-0000-0000-0000-000000000003'::uuid, 'a1b2c3d4-0000-0000-0000-000000000001'::uuid, 'b1000000-0000-0000-0000-000000000002'::uuid, 'video'::public.module_type, 'HTML Structure & Tags', 'https://www.youtube.com/watch?v=UB1O30fR-EE', 0, null::timestamptz, false),
    ('c1000000-0000-0000-0000-000000000004'::uuid, 'a1b2c3d4-0000-0000-0000-000000000001'::uuid, 'b1000000-0000-0000-0000-000000000002'::uuid, 'assignment'::public.module_type, 'Assignment 1: Build Your First HTML Page', null, 1, null::timestamptz, false),
    ('c1000000-0000-0000-0000-000000000005'::uuid, 'a1b2c3d4-0000-0000-0000-000000000001'::uuid, 'b1000000-0000-0000-0000-000000000003'::uuid, 'video'::public.module_type, 'CSS Selectors & Properties', 'https://www.youtube.com/watch?v=yfoY53QXEnI', 0, now() + interval '7 days', false)
) as v(id, course_id, section_id, type, title, content_url, sort_order, available_from, is_sequential)
inner join public.courses c on c.id = v.course_id
on conflict (id) do update set
  course_id = excluded.course_id,
  section_id = excluded.section_id,
  type = excluded.type,
  title = excluded.title,
  content_url = excluded.content_url,
  sort_order = excluded.sort_order,
  available_from = excluded.available_from,
  is_sequential = excluded.is_sequential;

insert into public.assignments (id, module_id, max_score, passing_score, deadline_at, allow_late, late_penalty_pct)
select
  'd1000000-0000-0000-0000-000000000001'::uuid,
  'c1000000-0000-0000-0000-000000000004'::uuid,
  100,
  60,
  now() + interval '14 days',
  true,
  10
from public.modules m
where m.id = 'c1000000-0000-0000-0000-000000000004'::uuid
on conflict (id) do update set
  module_id = excluded.module_id,
  max_score = excluded.max_score,
  passing_score = excluded.passing_score,
  deadline_at = excluded.deadline_at,
  allow_late = excluded.allow_late,
  late_penalty_pct = excluded.late_penalty_pct;

insert into public.enrollments (course_id, learner_id)
select c.id, u.id
from auth.users u
cross join public.courses c
where u.email = 'learner@peregrine.lms'
  and c.id = 'a1b2c3d4-0000-0000-0000-000000000001'::uuid
on conflict (course_id, learner_id) do nothing;
