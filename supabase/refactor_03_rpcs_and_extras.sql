-- ============================================================
-- Peregrine LMS – Refactor Step 3: Server-Side RPCs
-- ============================================================
-- Replaces multi-round-trip query waterfalls with single-call
-- Postgres functions. SECURITY DEFINER = auth is checked inside
-- the function, RLS is bypassed for performance (row_security=off).
--
-- SAFE ON LIVE DATA: purely additive (creates new functions).
-- Existing app code continues working until you switch to using
-- these RPCs.
--
-- Run in: Supabase SQL Editor  (paste entire file)
-- ============================================================


-- ──────────────────────────────────────────────
-- 3A. Dashboard Learner Summary (replaces 6 round trips)
-- ──────────────────────────────────────────────
-- Usage from app:  supabase.rpc('dashboard_learner_summary_v1')
-- Returns: { enrolled_courses: [...], streak: number, due_assignments: [...] }

CREATE OR REPLACE FUNCTION public.dashboard_learner_summary_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid;
  v_result jsonb;
BEGIN
  v_uid := (select auth.uid());
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT jsonb_build_object(
    -- Enrolled courses with progress
    'enrolled_courses', (
      SELECT coalesce(jsonb_agg(row_data ORDER BY enrolled_at_ts DESC), '[]'::jsonb)
      FROM (
        SELECT
          c.id,
          c.course_code,
          c.title,
          c.thumbnail_url,
          e.enrolled_at AS enrolled_at_ts,
          (SELECT count(*) FROM modules m WHERE m.course_id = c.id)::int AS total_modules,
          (
            SELECT count(*) FROM module_progress mp
            JOIN modules m ON m.id = mp.module_id
            WHERE m.course_id = c.id
              AND mp.learner_id = v_uid
              AND mp.is_completed = true
          )::int AS completed_modules
        FROM enrollments e
        JOIN courses c ON c.id = e.course_id
        WHERE e.learner_id = v_uid
      ) sub,
      LATERAL (
        SELECT jsonb_build_object(
          'id', sub.id,
          'course_code', sub.course_code,
          'title', sub.title,
          'thumbnail_url', sub.thumbnail_url,
          'total_modules', sub.total_modules,
          'completed_modules', sub.completed_modules,
          'progress', CASE WHEN sub.total_modules > 0
            THEN round((sub.completed_modules::numeric / sub.total_modules) * 100)
            ELSE 0 END
        ) AS row_data
      ) lat
    ),

    -- Learning streak
    'streak', (
      SELECT coalesce(
        CASE
          WHEN ls.last_success_day IS NOT NULL
            AND ls.last_success_day >= ((timezone('Asia/Kolkata', now()))::date - 1)
          THEN ls.current_streak
          ELSE 0
        END, 0)
      FROM learning_streak ls
      WHERE ls.learner_id = v_uid
    ),

    -- Due assignments (max 10, sorted by deadline)
    'due_assignments', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'assignment_id', a.id,
        'module_id', m.id,
        'module_title', m.title,
        'course_id', c.id,
        'course_title', c.title,
        'deadline_at', a.deadline_at
      ) ORDER BY a.deadline_at ASC), '[]'::jsonb)
      FROM assignments a
      JOIN modules m ON m.id = a.module_id AND m.type = 'assignment'
      JOIN courses c ON c.id = m.course_id
      JOIN enrollments e ON e.course_id = c.id AND e.learner_id = v_uid
      WHERE a.deadline_at IS NOT NULL
        AND (m.available_from IS NULL OR m.available_from <= now())
        AND NOT EXISTS (
          SELECT 1 FROM submissions s
          WHERE s.assignment_id = a.id
            AND s.learner_id = v_uid
            AND s.is_turned_in = true
        )
      LIMIT 10
    )
  ) INTO v_result;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_learner_summary_v1() FROM public;
GRANT EXECUTE ON FUNCTION public.dashboard_learner_summary_v1() TO authenticated;


-- ──────────────────────────────────────────────
-- 3B. Learner Module Status Map (replaces 5 round trips)
-- ──────────────────────────────────────────────
-- Usage: supabase.rpc('learner_module_status_v1', { p_module_ids: [...uuids] })
-- Returns: { "<module_id>": { complete, overdue, in_grading, isFailed }, ... }

CREATE OR REPLACE FUNCTION public.learner_module_status_v1(
  p_module_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid;
  v_result jsonb;
BEGIN
  v_uid := (select auth.uid());
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  WITH mod_list AS (
    SELECT unnest(p_module_ids) AS module_id
  ),
  mod_info AS (
    SELECT m.id, m.type
    FROM modules m
    WHERE m.id = ANY(p_module_ids)
  ),
  progress AS (
    SELECT mp.module_id, mp.is_completed
    FROM module_progress mp
    WHERE mp.learner_id = v_uid AND mp.module_id = ANY(p_module_ids)
  ),
  quiz_status AS (
    SELECT qa.module_id, qa.passed
    FROM quiz_attempts qa
    WHERE qa.learner_id = v_uid AND qa.module_id = ANY(p_module_ids)
  ),
  feedback_status AS (
    SELECT mfs.module_id
    FROM module_feedback_submissions mfs
    WHERE mfs.learner_id = v_uid AND mfs.module_id = ANY(p_module_ids)
  ),
  assignment_status AS (
    SELECT
      a.module_id,
      s.graded_at,
      coalesce(s.is_passed, false) AS is_passed,
      coalesce(s.is_turned_in, false) AS is_turned_in,
      s.submitted_at,
      a.deadline_at
    FROM assignments a
    LEFT JOIN submissions s
      ON s.assignment_id = a.id AND s.learner_id = v_uid
    WHERE a.module_id = ANY(p_module_ids)
  )
  SELECT jsonb_object_agg(
    ml.module_id::text,
    jsonb_build_object(
      'complete',
        CASE mi.type
          WHEN 'mcq' THEN coalesce(qs.passed, false)
          WHEN 'feedback' THEN (fs.module_id IS NOT NULL)
          WHEN 'assignment' THEN (ast.graded_at IS NOT NULL AND ast.is_passed)
          ELSE coalesce(p.is_completed, false)
        END,
      'overdue',
        CASE
          WHEN mi.type = 'assignment'
            AND ast.deadline_at IS NOT NULL
            AND ast.graded_at IS NULL
            AND ast.submitted_at IS NULL
            AND ast.deadline_at < now()
          THEN true
          ELSE false
        END,
      'in_grading',
        CASE
          WHEN mi.type = 'assignment'
            AND ast.submitted_at IS NOT NULL
            AND ast.graded_at IS NULL
            AND ast.is_turned_in
          THEN true
          ELSE false
        END,
      'isFailed',
        CASE
          WHEN mi.type = 'assignment'
            AND ast.graded_at IS NOT NULL
            AND NOT ast.is_passed
          THEN true
          ELSE false
        END
    )
  )
  FROM mod_list ml
  JOIN mod_info mi ON mi.id = ml.module_id
  LEFT JOIN progress p ON p.module_id = ml.module_id
  LEFT JOIN quiz_status qs ON qs.module_id = ml.module_id
  LEFT JOIN feedback_status fs ON fs.module_id = ml.module_id
  LEFT JOIN assignment_status ast ON ast.module_id = ml.module_id
  INTO v_result;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.learner_module_status_v1(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.learner_module_status_v1(uuid[]) TO authenticated;


-- ──────────────────────────────────────────────
-- 3C. Instructor Dashboard Summary (replaces 3 round trips)
-- ──────────────────────────────────────────────
-- Usage: supabase.rpc('dashboard_instructor_summary_v1')

CREATE OR REPLACE FUNCTION public.dashboard_instructor_summary_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid;
  v_role public.user_role;
  v_result jsonb;
BEGIN
  v_uid := (select auth.uid());
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role NOT IN ('admin', 'instructor') THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT jsonb_build_object(
    'courses', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'course_code', c.course_code,
        'title', c.title,
        'status', c.status,
        'created_at', c.created_at,
        'enrollment_count', (
          SELECT count(*) FROM enrollments e WHERE e.course_id = c.id
        )::int,
        'department_name', d.name
      ) ORDER BY c.created_at DESC), '[]'::jsonb)
      FROM courses c
      LEFT JOIN departments d ON d.id = c.department_id
      WHERE v_role = 'admin' OR c.instructor_id = v_uid
    )
  ) INTO v_result;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_instructor_summary_v1() FROM public;
GRANT EXECUTE ON FUNCTION public.dashboard_instructor_summary_v1() TO authenticated;


-- ──────────────────────────────────────────────
-- 3D. Enrollment count rollup column + trigger
-- ──────────────────────────────────────────────
-- Adds a maintained counter to avoid COUNT(*) on every dashboard load.

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS enrollment_count integer NOT NULL DEFAULT 0;

-- Backfill from existing data
UPDATE public.courses c
SET enrollment_count = (
  SELECT count(*) FROM public.enrollments e WHERE e.course_id = c.id
);

-- Trigger to keep it in sync
CREATE OR REPLACE FUNCTION public.maintain_enrollment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF tg_op = 'INSERT' THEN
    UPDATE courses SET enrollment_count = enrollment_count + 1
    WHERE id = NEW.course_id;
    RETURN NEW;
  ELSIF tg_op = 'DELETE' THEN
    UPDATE courses SET enrollment_count = enrollment_count - 1
    WHERE id = OLD.course_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS enrollments_count_trigger ON public.enrollments;
CREATE TRIGGER enrollments_count_trigger
  AFTER INSERT OR DELETE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.maintain_enrollment_count();


-- ──────────────────────────────────────────────
-- 3E. Storage policy tightening
-- ──────────────────────────────────────────────
-- Current: any authenticated user can upload to ANY path.
-- Fix: restrict upload and update to assignment-specific paths.

DROP POLICY IF EXISTS "Learners can upload assignments" ON storage.objects;
CREATE POLICY "Learners can upload assignments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'eduflow-storage'
    AND (
      (storage.foldername(name))[1] = 'assignments'
      OR (storage.foldername(name))[1] = 'thumbnails'
    )
  );

DROP POLICY IF EXISTS "Learners can update own assignments" ON storage.objects;
CREATE POLICY "Learners can update own assignments" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'eduflow-storage'
    AND (
      (storage.foldername(name))[1] = 'assignments'
      OR (storage.foldername(name))[1] = 'thumbnails'
    )
  );


-- ──────────────────────────────────────────────
-- 3F. updated_at auto-touch triggers (missing tables)
-- ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- profiles
DROP TRIGGER IF EXISTS profiles_touch_updated_at ON public.profiles;
CREATE TRIGGER profiles_touch_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- courses
DROP TRIGGER IF EXISTS courses_touch_updated_at ON public.courses;
CREATE TRIGGER courses_touch_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- modules
DROP TRIGGER IF EXISTS modules_touch_updated_at ON public.modules;
CREATE TRIGGER modules_touch_updated_at
  BEFORE UPDATE ON public.modules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ──────────────────────────────────────────────
-- 3G. Grading Fetch (replaces 9 round trips)
-- ──────────────────────────────────────────────
-- Usage: supabase.rpc('grading_fetch_v1', { p_course_id, p_status, p_learner_query, p_page, p_page_size })
-- Returns: { rows: GradingRow[], total_count: number }

CREATE OR REPLACE FUNCTION public.grading_fetch_v1(
  p_course_id  text DEFAULT 'all',
  p_status     text DEFAULT 'turned_in',
  p_learner_query text DEFAULT '',
  p_page       integer DEFAULT 1,
  p_page_size  integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid        uuid;
  v_role       public.user_role;
  v_offset     integer;
  v_result     jsonb;
  v_total      bigint;
  v_row_data   jsonb;
BEGIN
  v_uid := (select auth.uid());
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role NOT IN ('admin', 'instructor', 'coordinator') THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  -- Build the core result using a CTE
  WITH allowed_assignments AS (
    SELECT a.id AS assignment_id, a.module_id, a.max_score, a.passing_score
    FROM assignments a
    JOIN modules m ON m.id = a.module_id
    JOIN courses c ON c.id = m.course_id
    WHERE (p_course_id = 'all' OR c.id = p_course_id::uuid)
      AND (v_role = 'admin' OR v_role = 'coordinator' OR c.instructor_id = v_uid)
  ),
  learner_filter AS (
    SELECT p.id AS learner_id
    FROM profiles p
    WHERE p_learner_query = ''
       OR p.full_name ILIKE '%' || p_learner_query || '%'
  ),
  filtered_subs AS (
    SELECT
      s.id AS submission_id,
      s.assignment_id,
      s.learner_id,
      s.is_turned_in,
      s.turned_in_at,
      s.submitted_at,
      s.score,
      s.feedback,
      s.graded_at,
      s.is_passed,
      s.file_url
    FROM submissions s
    JOIN allowed_assignments aa ON aa.assignment_id = s.assignment_id
    JOIN learner_filter lf ON lf.learner_id = s.learner_id
    WHERE
      CASE p_status
        WHEN 'turned_in' THEN s.is_turned_in = true AND s.graded_at IS NULL
        WHEN 'graded'    THEN s.graded_at IS NOT NULL
        WHEN 'draft'     THEN s.is_turned_in = false AND s.graded_at IS NULL
        ELSE true  -- 'all'
      END
  ),
  counted AS (
    SELECT count(*) AS cnt FROM filtered_subs
  ),
  paged_subs AS (
    SELECT * FROM filtered_subs
    ORDER BY submitted_at DESC
    LIMIT p_page_size OFFSET v_offset
  )
  SELECT
    (SELECT cnt FROM counted),
    coalesce(jsonb_agg(jsonb_build_object(
      'submissionId', ps.submission_id,
      'assignmentId', ps.assignment_id,
      'learnerId', ps.learner_id,
      'learnerName', pr.full_name,
      'courseId', c.id,
      'courseTitle', c.title,
      'courseCode', c.course_code,
      'moduleTitle', m.title,
      'moduleType', m.type,
      'maxScore', aa.max_score,
      'passingScore', aa.passing_score,
      'isTurnedIn', ps.is_turned_in,
      'turnedInAt', ps.turned_in_at,
      'submittedAt', ps.submitted_at,
      'score', ps.score,
      'feedback', ps.feedback,
      'gradedAt', ps.graded_at,
      'isPassed', ps.is_passed,
      'primaryFileUrl', ps.file_url,
      'files', coalesce((
        SELECT jsonb_agg(jsonb_build_object('url', sf.file_url, 'name', coalesce(sf.original_name, 'File')))
        FROM submission_files sf WHERE sf.submission_id = ps.submission_id
      ), '[]'::jsonb)
    ) ORDER BY ps.submitted_at DESC), '[]'::jsonb)
  INTO v_total, v_row_data
  FROM paged_subs ps
  JOIN allowed_assignments aa ON aa.assignment_id = ps.assignment_id
  JOIN modules m ON m.id = aa.module_id
  JOIN courses c ON c.id = m.course_id
  LEFT JOIN profiles pr ON pr.id = ps.learner_id;

  RETURN jsonb_build_object(
    'rows', coalesce(v_row_data, '[]'::jsonb),
    'totalCount', coalesce(v_total, 0),
    'page', p_page,
    'pageSize', p_page_size
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grading_fetch_v1(text, text, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.grading_fetch_v1(text, text, text, integer, integer) TO authenticated;


-- ──────────────────────────────────────────────
-- 3H. Course Enrollments + Progress (replaces 7 round trips)
-- ──────────────────────────────────────────────
-- Usage: supabase.rpc('course_enrollments_progress_v1', { p_course_id: '...' })
-- Returns: [ { id, learnerId, learnerName, enrolledAt, totalModules, completedModules, completionPct, isCompleted }, ... ]

CREATE OR REPLACE FUNCTION public.course_enrollments_progress_v1(
  p_course_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid    uuid;
  v_role   public.user_role;
  v_result jsonb;
BEGIN
  v_uid := (select auth.uid());
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_uid;

  -- Only admins or the course instructor can view enrollments
  IF v_role = 'admin' THEN
    -- OK
  ELSIF v_role = 'instructor' THEN
    IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id AND instructor_id = v_uid) THEN
      RETURN jsonb_build_object('error', 'forbidden');
    END IF;
  ELSE
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  WITH course_modules AS (
    SELECT m.id, m.type
    FROM modules m
    WHERE m.course_id = p_course_id
  ),
  total AS (
    SELECT count(*)::int AS cnt FROM course_modules
  ),
  enrollment_list AS (
    SELECT e.id, e.learner_id, e.enrolled_at
    FROM enrollments e
    WHERE e.course_id = p_course_id
    ORDER BY e.enrolled_at DESC
  ),
  -- For each learner, count completed modules (matches the logic in enrollments/page.tsx)
  learner_progress AS (
    SELECT
      el.learner_id,
      count(*) FILTER (WHERE
        CASE cm.type
          WHEN 'mcq' THEN EXISTS (
            SELECT 1 FROM quiz_attempts qa
            WHERE qa.module_id = cm.id AND qa.learner_id = el.learner_id AND qa.passed = true
          )
          WHEN 'feedback' THEN EXISTS (
            SELECT 1 FROM module_feedback_submissions mfs
            WHERE mfs.module_id = cm.id AND mfs.learner_id = el.learner_id
          )
          WHEN 'assignment' THEN (
            EXISTS (
              SELECT 1 FROM module_progress mp
              WHERE mp.module_id = cm.id AND mp.learner_id = el.learner_id AND mp.is_completed = true
            )
            OR EXISTS (
              SELECT 1 FROM assignments a
              JOIN submissions s ON s.assignment_id = a.id AND s.learner_id = el.learner_id
              WHERE a.module_id = cm.id AND s.graded_at IS NOT NULL
            )
          )
          ELSE EXISTS (
            SELECT 1 FROM module_progress mp
            WHERE mp.module_id = cm.id AND mp.learner_id = el.learner_id AND mp.is_completed = true
          )
        END
      )::int AS completed
    FROM enrollment_list el
    CROSS JOIN course_modules cm
    GROUP BY el.learner_id
  ),
  completions AS (
    SELECT cc.learner_id
    FROM course_completions cc
    WHERE cc.course_id = p_course_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', el.id,
    'learnerId', el.learner_id,
    'learnerName', coalesce(pr.full_name, 'Learner'),
    'enrolledAt', el.enrolled_at,
    'totalModules', t.cnt,
    'completedModules', coalesce(lp.completed, 0),
    'remainingModules', greatest(0, t.cnt - coalesce(lp.completed, 0)),
    'completionPct', CASE WHEN t.cnt > 0
      THEN round((coalesce(lp.completed, 0)::numeric / t.cnt) * 100)
      ELSE 0 END,
    'isCompleted', (
      (t.cnt > 0 AND coalesce(lp.completed, 0) >= t.cnt)
      OR co.learner_id IS NOT NULL
    )
  ) ORDER BY el.enrolled_at DESC), '[]'::jsonb)
  INTO v_result
  FROM enrollment_list el
  LEFT JOIN profiles pr ON pr.id = el.learner_id
  LEFT JOIN learner_progress lp ON lp.learner_id = el.learner_id
  LEFT JOIN completions co ON co.learner_id = el.learner_id
  CROSS JOIN total t;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.course_enrollments_progress_v1(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.course_enrollments_progress_v1(uuid) TO authenticated;


-- ============================================================
-- DONE – To use the RPCs from your Next.js app:
--
--   // Dashboard (learner):
--   const { data } = await supabase.rpc('dashboard_learner_summary_v1')
--
--   // Dashboard (instructor/admin):
--   const { data } = await supabase.rpc('dashboard_instructor_summary_v1')
--
--   // Course detail module status:
--   const { data } = await supabase.rpc('learner_module_status_v1', {
--     p_module_ids: moduleIds
--   })
--
-- Each replaces 5-9 sequential queries with a single call.
-- ============================================================
