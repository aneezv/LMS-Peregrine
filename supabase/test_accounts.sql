-- ============================================================
-- Peregrine LMS – Test Accounts Setup
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
