-- =============================================================================
-- Peregrine LMS — RLS policy repair
-- =============================================================================
-- Run the whole script in: Supabase Dashboard → SQL → New query → Paste → Run.
-- (Or: psql "$DATABASE_URL" -f supabase/fix_rls_policies.sql)
-- Do NOT use `supabase db query -f` for this file; it may reject multi-statement batches.
-- =============================================================================
-- Fixes:
-- 1) Infinite recursion on `profiles` when policies subquery `profiles` to
--    detect admin — breaks dashboard (role), course catalog (instructor name), etc.
-- 2) Missing SELECT on other users' rows for course instructors on published
--    courses (catalog joins `profiles` via instructor_id).
--
-- Safe to run multiple times (drops/recreates named policies; replaces function).
-- =============================================================================

-- Helper: read role without triggering RLS recursion on profiles
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Staff view learner profiles" ON public.profiles;

-- Recreate without subquerying profiles for admin (use is_admin())
CREATE POLICY "Staff view learner profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.courses c ON c.id = e.course_id
      WHERE e.learner_id = profiles.id AND c.instructor_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      JOIN public.modules m ON m.id = a.module_id
      JOIN public.courses c ON c.id = m.course_id
      WHERE s.learner_id = profiles.id AND c.instructor_id = auth.uid()
    )
  );

-- Any signed-in user can read instructor rows for published courses (catalog / detail UI)
DROP POLICY IF EXISTS "View instructors of published courses" ON public.profiles;

CREATE POLICY "View instructors of published courses" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.instructor_id = profiles.id AND c.status = 'published'
    )
  );

-- ---------------------------------------------------------------------------
-- courses (admin SELECT)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins view all courses" ON public.courses;

CREATE POLICY "Admins view all courses" ON public.courses
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- submissions (admin SELECT / UPDATE)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins view all submissions" ON public.submissions;

CREATE POLICY "Admins view all submissions" ON public.submissions
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins grade submissions" ON public.submissions;

CREATE POLICY "Admins grade submissions" ON public.submissions
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- submission_files (admin SELECT)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins view all submission files" ON public.submission_files;

CREATE POLICY "Admins view all submission files" ON public.submission_files
  FOR SELECT TO authenticated
  USING (public.is_admin());
