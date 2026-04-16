-- ============================================================
-- Peregrine T&C – Sample Course Seed Data
-- Run this AFTER schema.sql in the Supabase SQL Editor
-- Replace 'YOUR_INSTRUCTOR_USER_ID' with a real user UUID
-- from your auth.users table (the logged-in user's ID)
-- ============================================================

-- Step 1: Create instructor profile (if it doesn't exist)
-- Update role to 'instructor' for your account
UPDATE public.profiles
SET role = 'instructor'
WHERE id = (SELECT id FROM auth.users LIMIT 1);

-- Step 2: Ensure General department exists
INSERT INTO public.departments (name, sort_order)
SELECT 'General', 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.departments d WHERE lower(trim(d.name)) = 'general'
);

-- Step 3: Create sample course
INSERT INTO public.courses (id, instructor_id, department_id, title, description, status, enrollment_type)
SELECT
  'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
  p.id,
  (SELECT id FROM public.departments WHERE lower(trim(name)) = 'general' LIMIT 1),
  'Introduction to Web Development',
  'Learn the fundamentals of web development including HTML, CSS, JavaScript, and modern frameworks. This course is perfect for beginners who want to start their journey in web development.',
  'published',
  'open'
FROM public.profiles p LIMIT 1;

-- Step 4: Create sections
INSERT INTO public.sections (id, course_id, title, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000001'::uuid, 'a1b2c3d4-0000-0000-0000-000000000001'::uuid, 'Getting Started', 0),
  ('b1000000-0000-0000-0000-000000000002'::uuid, 'a1b2c3d4-0000-0000-0000-000000000001'::uuid, 'HTML Fundamentals', 1),
  ('b1000000-0000-0000-0000-000000000003'::uuid, 'a1b2c3d4-0000-0000-0000-000000000001'::uuid, 'CSS & Styling', 2);

-- Step 5: Create modules
INSERT INTO public.modules (id, course_id, section_id, type, title, content_url, sort_order, available_from, is_sequential) VALUES
  -- Section 1: Getting Started
  (
    'c1000000-0000-0000-0000-000000000001'::uuid,
    'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'video',
    'Welcome to the Course',
    'https://www.youtube.com/watch?v=qz0aGYrrlhU',  -- HTML Tutorial
    0,
    NULL,  -- unlocked immediately
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
    NULL,
    false
  ),
  -- Section 2: HTML Fundamentals
  (
    'c1000000-0000-0000-0000-000000000003'::uuid,
    'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
    'b1000000-0000-0000-0000-000000000002'::uuid,
    'video',
    'HTML Structure & Tags',
    'https://www.youtube.com/watch?v=UB1O30fR-EE',
    0,
    NULL,
    false
  ),
  (
    'c1000000-0000-0000-0000-000000000004'::uuid,
    'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
    'b1000000-0000-0000-0000-000000000002'::uuid,
    'assignment',
    'Assignment 1: Build Your First HTML Page',
    NULL,
    1,
    NULL,
    false
  ),
  -- Section 3: CSS & Styling (time-locked, unlocks in 7 days)
  (
    'c1000000-0000-0000-0000-000000000005'::uuid,
    'a1b2c3d4-0000-0000-0000-000000000001'::uuid,
    'b1000000-0000-0000-0000-000000000003'::uuid,
    'video',
    'CSS Selectors & Properties',
    'https://www.youtube.com/watch?v=yfoY53QXEnI',
    0,
    NOW() + interval '7 days',  -- locked for 7 days
    false
  );

-- Step 6: Create assignment config for the assignment module
INSERT INTO public.assignments (id, module_id, max_score, passing_score, deadline_at, allow_late, late_penalty_pct)
VALUES (
  'd1000000-0000-0000-0000-000000000001'::uuid,
  'c1000000-0000-0000-0000-000000000004'::uuid,
  100,
  60,
  NOW() + interval '14 days',
  true,
  10
);

-- Step 7: Auto-enroll the first user (your account) in the course
INSERT INTO public.enrollments (course_id, learner_id)
SELECT 'a1b2c3d4-0000-0000-0000-000000000001'::uuid, p.id
FROM public.profiles p LIMIT 1
ON CONFLICT DO NOTHING;

-- Done! Visit http://localhost:3000/courses to see the sample course.

-- ============================================================
-- Peregrine T&C – Test Accounts Setup
-- Run this in the Supabase SQL Editor
-- This sets up 3 role-based test accounts
-- ============================================================

-- NOTE: You must first create these 3 users via the Supabase Dashboard:
-- Auth > Users > "Add User" (inviting via email is recommended)
-- Or use: Authentication > Add user manually
--
-- Email: admin@peregrine.lms / Password: Admin1234!
-- Email: instructor@peregrine.lms / Password: Instr1234!
-- Email: learner@peregrine.lms / Password: Learn1234!
--
-- Once created, run the SQL below to assign their roles:

-- Assign 'admin' role
UPDATE public.profiles
SET role = 'admin', full_name = 'Platform Admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@peregrine.lms');

-- Assign 'instructor' role
UPDATE public.profiles
SET role = 'instructor', full_name = 'Jane Instructor'
WHERE id = (SELECT id FROM auth.users WHERE email = 'instructor@peregrine.lms');

-- Assign 'learner' role (default, but explicit for clarity)
UPDATE public.profiles
SET role = 'learner', full_name = 'John Learner'
WHERE id = (SELECT id FROM auth.users WHERE email = 'learner@peregrine.lms');

-- Verify the results:
SELECT p.full_name, p.role, u.email
FROM public.profiles p
JOIN auth.users u ON u.id = p.id;
