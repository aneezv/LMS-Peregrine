-- ============================================================
-- Peregrine T&C – seed data (local, staging, optional demo on production)
--
-- Prerequisites
--   • Apply all migrations OR load supabase/schema.sql on a greenfield DB.
--   • Many inserts expect auth.users + profiles (trigger handle_new_user).
--
-- Production (Supabase hosted)
--   • Prefer: Dashboard → SQL → run Section 1 only, OR `supabase db push`
--     then run chosen parts in SQL Editor.
--   • Create your admin/instructor accounts in Authentication first.
--   • Skip Section 2 (demo course) if you want an empty catalog, or run it
--     on a staging project only.
--   • sheet_sync_runs / sheet_sync_row_state: no rows required; API fills them.
--
-- Local: `supabase db reset` applies migrations + runs this entire file.
--
-- ============================================================

-- ┌─────────────────────────────────────────────────────────────
-- │ Section 1 — Always safe: mirror auth email onto profiles
-- └─────────────────────────────────────────────────────────────
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and (p.email is null or p.email is distinct from u.email);

-- ┌─────────────────────────────────────────────────────────────
-- │ Section 2 — Demo catalog (skip on empty production DB)
-- │ Promotes earliest auth user to instructor for sample course owner.
-- └─────────────────────────────────────────────────────────────

-- Promote the first signed-up user to instructor (sample course owner)
UPDATE public.profiles
SET role = 'instructor'
WHERE id = (SELECT id FROM auth.users ORDER BY created_at ASC NULLS LAST LIMIT 1);

INSERT INTO public.departments (name, sort_order)
SELECT 'General', 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.departments d WHERE lower(trim(d.name)) = 'general'
);

-- Sample course (idempotent on primary key)
INSERT INTO public.courses (
  id,
  instructor_id,
  department_id,
  course_code,
  title,
  description,
  status,
  enrollment_type
)
SELECT
  'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
  p.id,
  (SELECT id FROM public.departments WHERE lower(trim(name)) = 'general' LIMIT 1),
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
  department_id = excluded.department_id,
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
  ),
  (
    'c1000000-0000-0000-0000-000000000007'::uuid,
    'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
    'b1000000-0000-0000-0000-000000000003'::uuid,
    'feedback',
    'Week 3 Feedback Checkpoint',
    NULL::text,
    1,
    3,
    NULL::timestamptz,
    false
  ),
  (
    'c1000000-0000-0000-0000-000000000008'::uuid,
    'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
    'b1000000-0000-0000-0000-000000000003'::uuid,
    'external_resource',
    'Extra Learning Resources',
    NULL::text,
    2,
    3,
    NULL::timestamptz,
    false
  ),
  (
    'c1000000-0000-0000-0000-000000000009'::uuid,
    'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
    'b1000000-0000-0000-0000-000000000003'::uuid,
    'offline_session',
    'In-person Lab Session',
    NULL::text,
    3,
    3,
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

-- Extra content fields for non-video module types
UPDATE public.modules
SET description = 'Share what you learned this week and where you got stuck.'
WHERE id = 'c1000000-0000-0000-0000-000000000007'::uuid;

UPDATE public.modules
SET description = 'Helpful links for deeper learning and practice tasks.'
WHERE id = 'c1000000-0000-0000-0000-000000000008'::uuid;

UPDATE public.modules
SET
  description = 'Bring your laptop. We will build a mini project together.',
  session_location = 'Lab A-201, Main Campus',
  session_start_at = now() + interval '10 days',
  session_end_at = now() + interval '10 days 2 hours'
WHERE id = 'c1000000-0000-0000-0000-000000000009'::uuid;

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

INSERT INTO public.module_external_links (id, module_id, label, url, sort_order)
SELECT * FROM (VALUES
  (
    'f1000000-0000-0000-0000-000000000001'::uuid,
    'c1000000-0000-0000-0000-000000000008'::uuid,
    'MDN HTML Guide',
    'https://developer.mozilla.org/en-US/docs/Learn/HTML',
    0
  ),
  (
    'f1000000-0000-0000-0000-000000000002'::uuid,
    'c1000000-0000-0000-0000-000000000008'::uuid,
    'CSS Tricks Almanac',
    'https://css-tricks.com/almanac/',
    1
  )
) AS v(id, module_id, label, url, sort_order)
WHERE EXISTS (
  SELECT 1 FROM public.modules m WHERE m.id = 'c1000000-0000-0000-0000-000000000008'::uuid
)
ON CONFLICT (id) DO UPDATE SET
  module_id = excluded.module_id,
  label = excluded.label,
  url = excluded.url,
  sort_order = excluded.sort_order;

INSERT INTO public.enrollments (course_id, learner_id)
SELECT 'a1b2c3d4-0000-0000-0000-000000000001'::uuid, p.id
FROM public.profiles p
ORDER BY p.created_at ASC NULLS LAST
LIMIT 1
ON CONFLICT (course_id, learner_id) DO NOTHING;

-- ┌─────────────────────────────────────────────────────────────
-- │ Section 3 — Optional named test accounts
-- │ Create users in Dashboard (Authentication) with these emails first,
-- │ or these UPDATEs are no-ops. Do NOT use weak passwords in production.
-- └─────────────────────────────────────────────────────────────
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

-- Ensure named learner is enrolled in the sample course (if account exists).
INSERT INTO public.enrollments (course_id, learner_id)
SELECT
  'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
  u.id
FROM auth.users u
WHERE u.email = 'learner@peregrine.lms'
ON CONFLICT (course_id, learner_id) DO NOTHING;

-- Sample learner progress for testing dashboards / instructor views.
INSERT INTO public.module_progress (module_id, learner_id, watch_pct, is_completed, completed_at)
SELECT
  m.id,
  u.id,
  100,
  true,
  now()
FROM auth.users u
JOIN public.modules m ON m.id IN (
  'c1000000-0000-0000-0000-000000000001'::uuid, -- video
  'c1000000-0000-0000-0000-000000000008'::uuid  -- external_resource
)
WHERE u.email = 'learner@peregrine.lms'
ON CONFLICT (module_id, learner_id) DO UPDATE SET
  watch_pct = excluded.watch_pct,
  is_completed = excluded.is_completed,
  completed_at = coalesce(public.module_progress.completed_at, excluded.completed_at);

-- Sample passed quiz attempt so MCQ completion can be tested.
INSERT INTO public.quiz_attempts (id, module_id, learner_id, score, max_score, passed, submitted_at)
SELECT
  'f2000000-0000-0000-0000-000000000001'::uuid,
  'c1000000-0000-0000-0000-000000000006'::uuid,
  u.id,
  1,
  1,
  true,
  now()
FROM auth.users u
WHERE u.email = 'learner@peregrine.lms'
ON CONFLICT (module_id, learner_id) DO UPDATE SET
  score = excluded.score,
  max_score = excluded.max_score,
  passed = excluded.passed,
  submitted_at = excluded.submitted_at;

-- Sample feedback submission for the feedback module.
INSERT INTO public.module_feedback_submissions (id, module_id, learner_id, body, submitted_at)
SELECT
  'f3000000-0000-0000-0000-000000000001'::uuid,
  'c1000000-0000-0000-0000-000000000007'::uuid,
  u.id,
  'Great module flow. I would love one more practice exercise before the final quiz.',
  now()
FROM auth.users u
WHERE u.email = 'learner@peregrine.lms'
ON CONFLICT (module_id, learner_id) DO UPDATE SET
  body = excluded.body,
  submitted_at = excluded.submitted_at;

-- ┌─────────────────────────────────────────────────────────────
-- │ Section 4 — Production hand-off (run manually as needed)
-- └─────────────────────────────────────────────────────────────
-- After creating the first admin in Authentication (Dashboard):
--   UPDATE public.profiles
--   SET role = 'admin', full_name = 'Your Name'
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'you@yourdomain.com' LIMIT 1);
--
-- Sheet sync integration: env on app + migration for sheet_sync_* tables; no seed rows.
--
-- Verbose check (SQL Editor):
--   SELECT p.full_name, p.role, u.email
--   FROM public.profiles p
--   JOIN auth.users u ON u.id = p.id;
