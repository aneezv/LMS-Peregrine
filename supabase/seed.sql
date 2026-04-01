-- ============================================================
-- Peregrine LMS – sample data + optional test-account roles
--
-- Order: run supabase/schema.sql (or `supabase db reset`) first.
-- Requires at least one auth user so profiles exist (sign up once,
-- or add a user in Dashboard → Authentication → Users).
--
-- Local CLI: migrations apply first; this file runs as [db.seed].
-- ============================================================

-- Promote the first signed-up user to instructor (sample course owner)
UPDATE public.profiles
SET role = 'instructor'
WHERE id = (SELECT id FROM auth.users ORDER BY created_at ASC NULLS LAST LIMIT 1);

-- Sample course (idempotent on primary key)
INSERT INTO public.courses (
  id,
  instructor_id,
  course_code,
  title,
  description,
  status,
  enrollment_type
)
SELECT
  'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
  p.id,
  'WEB-DEV-101',
  'Introduction to Web Development',
  'Learn the fundamentals of web development including HTML, CSS, JavaScript, and modern frameworks. This course is perfect for beginners who want to start their journey in web development.',
  'published',
  'open'
FROM public.profiles p
ORDER BY p.created_at ASC NULLS LAST
LIMIT 1
ON CONFLICT (id) DO UPDATE SET
  instructor_id = excluded.instructor_id,
  course_code = excluded.course_code,
  title = excluded.title,
  description = excluded.description,
  status = excluded.status,
  enrollment_type = excluded.enrollment_type;

-- Syllabus rows require the sample course (skipped when no profile / instructor above)
INSERT INTO public.sections (id, course_id, title, sort_order)
SELECT id, course_id, title, sort_order
FROM (VALUES
  ('b1000000-0000-0000-0000-000000000001'::uuid, 'a1b2c3d4-0000-0000-0000-000000000001'::uuid, 'Getting Started', 0),
  ('b1000000-0000-0000-0000-000000000002'::uuid, 'a1b2c3d4-0000-0000-0000-000000000001'::uuid, 'HTML Fundamentals', 1),
  ('b1000000-0000-0000-0000-000000000003'::uuid, 'a1b2c3d4-0000-0000-0000-000000000001'::uuid, 'CSS & Styling', 2)
) AS v(id, course_id, title, sort_order)
WHERE EXISTS (
  SELECT 1 FROM public.courses c WHERE c.id = 'a1b2c3d4-0000-0000-0000-000000000001'::uuid
)
ON CONFLICT (id) DO UPDATE SET
  title = excluded.title,
  sort_order = excluded.sort_order;

INSERT INTO public.modules (
  id,
  course_id,
  section_id,
  type,
  title,
  content_url,
  sort_order,
  week_index,
  available_from,
  is_sequential
)
SELECT
  v.id,
  v.course_id,
  v.section_id,
  v.type::module_type,
  v.title,
  v.content_url,
  v.sort_order,
  v.week_index,
  v.available_from,
  v.is_sequential
FROM (VALUES
  (
    'c1000000-0000-0000-0000-000000000001'::uuid,
    'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'video',
    'Welcome to the Course',
    'https://www.youtube.com/watch?v=qz0aGYrrlhU',
    0,
    1,
    NULL::timestamptz,
    false
  ),
  (
    'c1000000-0000-0000-0000-000000000002'::uuid,
    'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'live_session',
    'Week 1 – Orientation Live Session',
    'https://meet.google.com/example-link',
    1,
    1,
    NULL::timestamptz,
    false
  ),
  (
    'c1000000-0000-0000-0000-000000000003'::uuid,
    'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
    'b1000000-0000-0000-0000-000000000002'::uuid,
    'video',
    'HTML Structure & Tags',
    'https://www.youtube.com/watch?v=UB1O30fR-EE',
    0,
    2,
    NULL::timestamptz,
    false
  ),
  (
    'c1000000-0000-0000-0000-000000000004'::uuid,
    'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
    'b1000000-0000-0000-0000-000000000002'::uuid,
    'assignment',
    'Assignment 1: Build Your First HTML Page',
    NULL::text,
    1,
    2,
    NULL::timestamptz,
    false
  ),
  (
    'c1000000-0000-0000-0000-000000000005'::uuid,
    'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
    'b1000000-0000-0000-0000-000000000003'::uuid,
    'video',
    'CSS Selectors & Properties',
    'https://www.youtube.com/watch?v=yfoY53QXEnI',
    0,
    3,
    (NOW() + interval '7 days'),
    false
  ),
  (
    'c1000000-0000-0000-0000-000000000006'::uuid,
    'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
    'b1000000-0000-0000-0000-000000000002'::uuid,
    'mcq',
    'HTML quick check (sample quiz)',
    NULL::text,
    2,
    2,
    NULL::timestamptz,
    false
  )
) AS v(
  id,
  course_id,
  section_id,
  type,
  title,
  content_url,
  sort_order,
  week_index,
  available_from,
  is_sequential
)
WHERE EXISTS (
  SELECT 1 FROM public.courses c WHERE c.id = 'a1b2c3d4-0000-0000-0000-000000000001'::uuid
)
ON CONFLICT (id) DO UPDATE SET
  course_id = excluded.course_id,
  section_id = excluded.section_id,
  type = excluded.type,
  title = excluded.title,
  content_url = excluded.content_url,
  sort_order = excluded.sort_order,
  week_index = excluded.week_index,
  available_from = excluded.available_from,
  is_sequential = excluded.is_sequential;

INSERT INTO public.assignments (id, module_id, max_score, passing_score, deadline_at, allow_late, late_penalty_pct)
SELECT
  'd1000000-0000-0000-0000-000000000001'::uuid,
  'c1000000-0000-0000-0000-000000000004'::uuid,
  100,
  60,
  NOW() + interval '14 days',
  true,
  10
WHERE EXISTS (
  SELECT 1 FROM public.modules m WHERE m.id = 'c1000000-0000-0000-0000-000000000004'::uuid
)
ON CONFLICT (id) DO UPDATE SET
  module_id = excluded.module_id,
  max_score = excluded.max_score,
  passing_score = excluded.passing_score,
  deadline_at = excluded.deadline_at,
  allow_late = excluded.allow_late,
  late_penalty_pct = excluded.late_penalty_pct;

-- Sample built-in quiz for mcq module c1000000-0000-0000-0000-000000000006
INSERT INTO public.quiz_questions (id, module_id, prompt, sort_order)
SELECT
  'e1000000-0000-0000-0000-000000000001'::uuid,
  'c1000000-0000-0000-0000-000000000006'::uuid,
  'What does HTML stand for?',
  0
WHERE EXISTS (SELECT 1 FROM public.modules m WHERE m.id = 'c1000000-0000-0000-0000-000000000006'::uuid)
ON CONFLICT (id) DO UPDATE SET
  module_id = excluded.module_id,
  prompt = excluded.prompt,
  sort_order = excluded.sort_order;

INSERT INTO public.quiz_options (id, question_id, label, is_correct, sort_order)
SELECT * FROM (VALUES
  (
    'e1000000-0000-0000-0000-000000000011'::uuid,
    'e1000000-0000-0000-0000-000000000001'::uuid,
    'HyperText Markup Language',
    true,
    0
  ),
  (
    'e1000000-0000-0000-0000-000000000012'::uuid,
    'e1000000-0000-0000-0000-000000000001'::uuid,
    'High Transfer Metal Link',
    false,
    1
  ),
  (
    'e1000000-0000-0000-0000-000000000013'::uuid,
    'e1000000-0000-0000-0000-000000000001'::uuid,
    'Home Tool Markup Language',
    false,
    2
  )
) AS v(id, question_id, label, is_correct, sort_order)
WHERE EXISTS (
  SELECT 1 FROM public.quiz_questions q WHERE q.id = 'e1000000-0000-0000-0000-000000000001'::uuid
)
ON CONFLICT (id) DO UPDATE SET
  question_id = excluded.question_id,
  label = excluded.label,
  is_correct = excluded.is_correct,
  sort_order = excluded.sort_order;

INSERT INTO public.enrollments (course_id, learner_id)
SELECT 'a1b2c3d4-0000-0000-0000-000000000001'::uuid, p.id
FROM public.profiles p
ORDER BY p.created_at ASC NULLS LAST
LIMIT 1
ON CONFLICT (course_id, learner_id) DO NOTHING;

-- ============================================================
-- Optional: named test accounts (create users in Dashboard first)
-- ============================================================
-- admin@peregrine.lms    / Admin1234!
-- instructor@peregrine.lms / Instr1234!
-- learner@peregrine.lms  / Learn1234!

UPDATE public.profiles
SET role = 'admin', full_name = 'Platform Admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@peregrine.lms' LIMIT 1);

UPDATE public.profiles
SET role = 'instructor', full_name = 'Jane Instructor'
WHERE id = (SELECT id FROM auth.users WHERE email = 'instructor@peregrine.lms' LIMIT 1);

UPDATE public.profiles
SET role = 'learner', full_name = 'John Learner'
WHERE id = (SELECT id FROM auth.users WHERE email = 'learner@peregrine.lms' LIMIT 1);

-- Verbose check (safe to run in SQL Editor)
-- SELECT p.full_name, p.role, u.email
-- FROM public.profiles p
-- JOIN auth.users u ON u.id = p.id;
