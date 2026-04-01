-- ============================================================
-- Peregrine LMS – Test Accounts Setup (INSERT/UPSERT version)
-- Run this in the Supabase SQL Editor AFTER creating users in Auth
-- ============================================================

INSERT INTO public.profiles (id, full_name, role)
VALUES 
  (
    (SELECT id FROM auth.users WHERE email = 'admin@peregrine.lms'), 
    'Platform Admin', 
    'admin'
  ),
  (
    (SELECT id FROM auth.users WHERE email = 'instructor@peregrine.lms'), 
    'Jane Instructor', 
    'instructor'
  ),
  (
    (SELECT id FROM auth.users WHERE email = 'learner@peregrine.lms'), 
    'John Learner', 
    'learner'
  )
ON CONFLICT (id) 
DO UPDATE SET 
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name;

-- ============================================================
-- Verify the results:
-- ============================================================
SELECT p.full_name, p.role, u.email
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email IN ('admin@peregrine.lms', 'instructor@peregrine.lms', 'learner@peregrine.lms');