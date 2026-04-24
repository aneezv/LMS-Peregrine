-- ============================================================
-- Peregrine LMS – Refactor Step 1: Missing FK & Composite Indexes
-- ============================================================
-- SAFE ON LIVE DATA: Uses IF NOT EXISTS. Each CREATE INDEX takes
-- a brief ACCESS EXCLUSIVE lock (seconds on < 500K rows).
-- If you have > 500K rows in internship_activity_logs, run those
-- indexes via psql with CONCURRENTLY instead.
--
-- Run in: Supabase SQL Editor  (paste entire file)
-- ============================================================

-- ──────────────────────────────────────────────
-- A. Missing foreign-key indexes
-- ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- sections → courses
CREATE INDEX IF NOT EXISTS sections_course_id_idx
  ON public.sections (course_id);

-- modules → courses  (used in almost every RLS policy exists-subquery)
CREATE INDEX IF NOT EXISTS modules_course_id_idx
  ON public.modules (course_id);

-- modules → sections
CREATE INDEX IF NOT EXISTS modules_section_id_idx
  ON public.modules (section_id)
  WHERE section_id IS NOT NULL;

-- enrollments: unique(course_id, learner_id) covers course-first lookups,
-- but learner-first lookups (dashboard, progress) need the reverse.
CREATE INDEX IF NOT EXISTS enrollments_learner_id_idx
  ON public.enrollments (learner_id);

-- assignments → modules
CREATE INDEX IF NOT EXISTS assignments_module_id_idx
  ON public.assignments (module_id);

-- submissions → assignments
CREATE INDEX IF NOT EXISTS submissions_assignment_id_idx
  ON public.submissions (assignment_id);

-- submissions → profiles (learner)
CREATE INDEX IF NOT EXISTS submissions_learner_id_idx
  ON public.submissions (learner_id);

-- attendance → modules
CREATE INDEX IF NOT EXISTS attendance_module_id_idx
  ON public.attendance (module_id);

-- attendance → profiles (learner)
CREATE INDEX IF NOT EXISTS attendance_learner_id_idx
  ON public.attendance (learner_id);

-- module_progress: unique(module_id, learner_id) covers module-first,
-- but learner-first lookups need the reverse.
CREATE INDEX IF NOT EXISTS module_progress_learner_id_idx
  ON public.module_progress (learner_id);

-- certificates → profiles  and  courses
CREATE INDEX IF NOT EXISTS certificates_learner_id_idx
  ON public.certificates (learner_id);

CREATE INDEX IF NOT EXISTS certificates_course_id_idx
  ON public.certificates (course_id);

-- courses → profiles (instructor) — used in nearly every RLS EXISTS subquery
CREATE INDEX IF NOT EXISTS courses_instructor_id_idx
  ON public.courses (instructor_id);


-- ──────────────────────────────────────────────
-- B. Composite / partial indexes for hot query paths
-- ──────────────────────────────────────────────

-- Dashboard: "all completed module_progress rows for a learner"
CREATE INDEX IF NOT EXISTS module_progress_learner_completed_idx
  ON public.module_progress (learner_id)
  WHERE is_completed = true;

-- Grading page: "turned-in but not yet graded submissions"
CREATE INDEX IF NOT EXISTS submissions_turned_in_ungraded_idx
  ON public.submissions (assignment_id)
  WHERE is_turned_in = true AND graded_at IS NULL;

-- Grading / instructor view: submissions by (assignment, learner)
CREATE INDEX IF NOT EXISTS submissions_assignment_learner_idx
  ON public.submissions (assignment_id, learner_id);

-- Quiz attempts: best covered by the existing unique index on (module_id, learner_id) ✓
-- Module external links: already has module_id_idx ✓
-- Quiz questions: already has module_id_idx ✓
-- Quiz options: already has question_id_idx ✓
-- Module session roster: already has module_id_idx ✓


-- ──────────────────────────────────────────────
-- C. Trigram index for ILIKE catalog search
-- ──────────────────────────────────────────────
-- Requires pg_trgm extension (usually already enabled on Supabase).
-- If not, uncomment the next line:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS courses_title_trgm_idx
  ON public.courses USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS courses_description_trgm_idx
  ON public.courses USING gin (description gin_trgm_ops);


-- ──────────────────────────────────────────────
-- D. Redundant index cleanup
-- ──────────────────────────────────────────────
-- sheet_sync_row_state_lookup_idx is identical to the unique constraint index.
-- Drop the duplicate to save write overhead.
DROP INDEX IF EXISTS public.sheet_sync_row_state_lookup_idx;


-- ============================================================
-- DONE – Verify with:  SELECT indexname, tablename FROM pg_indexes
--                       WHERE schemaname = 'public' ORDER BY tablename;
-- ============================================================
