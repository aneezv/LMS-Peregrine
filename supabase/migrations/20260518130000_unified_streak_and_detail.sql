-- Unified learning streak: count ALL learner activity (module/lesson completion,
-- quiz pass, feedback submission, graded+passed assignment) as a "streak day",
-- bucketed by Asia/Kolkata calendar day. The streak is now computed on-read from
-- this single shared definition so the dashboard KPI, the new streak detail
-- page, and its calendar always agree.
--
-- The legacy `learning_streak` rollup table + `private.maintain_learning_streak`
-- trigger are intentionally left untouched but are no longer the display source
-- (only `module_progress` ever fed them). Flagged for later cleanup; not dropped
-- here to keep blast radius small.

-- ── Helper: distinct IST activity days for a learner ───────────────────────
CREATE OR REPLACE FUNCTION private.learner_activity_days(p_uid uuid)
RETURNS SETOF date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT d FROM (
    SELECT (timezone('Asia/Kolkata', mp.completed_at))::date AS d
    FROM module_progress mp
    WHERE mp.learner_id = p_uid
      AND mp.is_completed = true
      AND mp.completed_at IS NOT NULL
    UNION ALL
    SELECT (timezone('Asia/Kolkata', qa.submitted_at))::date
    FROM quiz_attempts qa
    WHERE qa.learner_id = p_uid AND qa.passed = true
    UNION ALL
    SELECT (timezone('Asia/Kolkata', mfs.submitted_at))::date
    FROM module_feedback_submissions mfs
    WHERE mfs.learner_id = p_uid
    UNION ALL
    SELECT (timezone('Asia/Kolkata', s.graded_at))::date
    FROM submissions s
    WHERE s.learner_id = p_uid
      AND s.graded_at IS NOT NULL
      AND coalesce(s.is_passed, false)
  ) u
  WHERE d IS NOT NULL;
$$;

-- ── Helper: current / longest streak + last active day (gaps-and-islands) ──
-- current_streak respects the existing IST display grace: it is 0 unless the
-- last active day is today or yesterday (IST).
CREATE OR REPLACE FUNCTION private.learner_streak_summary(p_uid uuid)
RETURNS TABLE(current_streak int, longest_streak int, last_active_day date)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH days AS (
    SELECT d FROM private.learner_activity_days(p_uid) AS t(d)
  ),
  grp AS (
    SELECT d, d - (row_number() OVER (ORDER BY d))::int AS g
    FROM days
  ),
  runs AS (
    SELECT count(*)::int AS len, max(d) AS end_d
    FROM grp
    GROUP BY g
  ),
  agg AS (
    SELECT coalesce(max(len), 0) AS longest,
           (SELECT max(d) FROM days) AS last_d
    FROM runs
  )
  SELECT
    CASE
      WHEN a.last_d IS NOT NULL
        AND a.last_d >= ((timezone('Asia/Kolkata', now()))::date - 1)
      THEN coalesce((SELECT r.len FROM runs r WHERE r.end_d = a.last_d), 0)
      ELSE 0
    END AS current_streak,
    a.longest AS longest_streak,
    a.last_d  AS last_active_day
  FROM agg a;
$$;

-- ── Public RPC: full streak detail for the streak page ─────────────────────
CREATE OR REPLACE FUNCTION public.learner_streak_detail_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid;
  v_summary record;
  v_result jsonb;
BEGIN
  v_uid := (select auth.uid());
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT * INTO v_summary FROM private.learner_streak_summary(v_uid);

  SELECT jsonb_build_object(
    'current_streak', coalesce(v_summary.current_streak, 0),
    'longest_streak', coalesce(v_summary.longest_streak, 0),
    'last_active_day', v_summary.last_active_day,

    'active_days', (
      SELECT coalesce(jsonb_agg(to_char(d, 'YYYY-MM-DD') ORDER BY d), '[]'::jsonb)
      FROM private.learner_activity_days(v_uid) AS t(d)
      WHERE d >= ((timezone('Asia/Kolkata', now()))::date - 97)
    ),

    'recent_activity', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'kind', ev.kind,
          'course_title', ev.course_title,
          'item_title', ev.item_title,
          'occurred_at', ev.occurred_at
        ) ORDER BY ev.occurred_at DESC
      ), '[]'::jsonb)
      FROM (
        SELECT 'lesson'::text AS kind, c.title AS course_title,
               m.title AS item_title, mp.completed_at AS occurred_at
        FROM module_progress mp
        JOIN modules m ON m.id = mp.module_id
        JOIN courses c ON c.id = m.course_id
        WHERE mp.learner_id = v_uid
          AND mp.is_completed = true
          AND mp.completed_at IS NOT NULL
        UNION ALL
        SELECT 'quiz', c.title, m.title, qa.submitted_at
        FROM quiz_attempts qa
        JOIN modules m ON m.id = qa.module_id
        JOIN courses c ON c.id = m.course_id
        WHERE qa.learner_id = v_uid AND qa.passed = true
        UNION ALL
        SELECT 'feedback', c.title, m.title, mfs.submitted_at
        FROM module_feedback_submissions mfs
        JOIN modules m ON m.id = mfs.module_id
        JOIN courses c ON c.id = m.course_id
        WHERE mfs.learner_id = v_uid
        UNION ALL
        SELECT 'assignment', c.title, m.title, s.graded_at
        FROM submissions s
        JOIN assignments a ON a.id = s.assignment_id
        JOIN modules m ON m.id = a.module_id
        JOIN courses c ON c.id = m.course_id
        WHERE s.learner_id = v_uid
          AND s.graded_at IS NOT NULL
          AND coalesce(s.is_passed, false)
        ORDER BY occurred_at DESC
        LIMIT 7
      ) ev
    )
  ) INTO v_result;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.learner_streak_detail_v1() FROM public;
GRANT EXECUTE ON FUNCTION public.learner_streak_detail_v1() TO authenticated;

-- ── Recreate dashboard_learner_summary_v1: ONLY the `streak` field changes ──
-- (copied verbatim from 20260518120000_dashboard_summary_completed_filter_sort.sql;
--  enrolled_courses / due_assignments_count / due_assignments unchanged.)
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
    'enrolled_courses', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'course_code', x.course_code,
          'title', x.title,
          'thumbnail_url', x.thumbnail_url,
          'total_modules', x.total_modules,
          'completed_modules', x.completed_modules,
          'progress', CASE WHEN x.total_modules > 0
            THEN round((x.completed_modules::numeric / x.total_modules) * 100)
            ELSE 0 END
        ) ORDER BY x.sort_at DESC, x.enrolled_at DESC
      ), '[]'::jsonb)
      FROM (
        SELECT
          c.id,
          c.course_code,
          c.title,
          c.thumbnail_url,
          e.enrolled_at,
          tm.total_modules,
          cm.completed_modules,
          la.last_completion_at,
          GREATEST(
            e.enrolled_at,
            COALESCE(la.last_completion_at, e.enrolled_at)
          ) AS sort_at,
          (
            cc.id IS NOT NULL
            OR (tm.total_modules > 0 AND cm.completed_modules >= tm.total_modules)
          ) AS is_complete,
          COALESCE(cc.completed_at, la.last_completion_at) AS completed_at_effective
        FROM enrollments e
        JOIN courses c ON c.id = e.course_id
        LEFT JOIN course_completions cc
          ON cc.course_id = c.id AND cc.learner_id = v_uid
        CROSS JOIN LATERAL (
          SELECT count(*)::int AS total_modules
          FROM modules m WHERE m.course_id = c.id
        ) tm
        CROSS JOIN LATERAL (
          SELECT count(*)::int AS completed_modules
          FROM modules m
          WHERE m.course_id = c.id
            AND CASE m.type
              WHEN 'mcq' THEN EXISTS (
                SELECT 1 FROM quiz_attempts qa
                WHERE qa.module_id = m.id AND qa.learner_id = v_uid AND qa.passed = true
              )
              WHEN 'feedback' THEN EXISTS (
                SELECT 1 FROM module_feedback_submissions mfs
                WHERE mfs.module_id = m.id AND mfs.learner_id = v_uid
              )
              WHEN 'assignment' THEN (
                EXISTS (
                  SELECT 1 FROM module_progress mp
                  WHERE mp.module_id = m.id AND mp.learner_id = v_uid AND mp.is_completed = true
                )
                OR EXISTS (
                  SELECT 1 FROM assignments a
                  JOIN submissions s ON s.assignment_id = a.id AND s.learner_id = v_uid
                  WHERE a.module_id = m.id AND s.graded_at IS NOT NULL AND coalesce(s.is_passed, false)
                )
              )
              ELSE EXISTS (
                SELECT 1 FROM module_progress mp
                WHERE mp.module_id = m.id AND mp.learner_id = v_uid AND mp.is_completed = true
              )
            END
        ) cm
        CROSS JOIN LATERAL (
          SELECT max(t) AS last_completion_at FROM (
            SELECT max(mp.completed_at) AS t
              FROM module_progress mp
              JOIN modules m ON m.id = mp.module_id
              WHERE m.course_id = c.id AND mp.learner_id = v_uid AND mp.is_completed = true
            UNION ALL
            SELECT max(qa.submitted_at)
              FROM quiz_attempts qa
              JOIN modules m ON m.id = qa.module_id
              WHERE m.course_id = c.id AND qa.learner_id = v_uid AND qa.passed = true
            UNION ALL
            SELECT max(mfs.submitted_at)
              FROM module_feedback_submissions mfs
              JOIN modules m ON m.id = mfs.module_id
              WHERE m.course_id = c.id AND mfs.learner_id = v_uid
            UNION ALL
            SELECT max(s.graded_at)
              FROM submissions s
              JOIN assignments a ON a.id = s.assignment_id
              JOIN modules m ON m.id = a.module_id
              WHERE m.course_id = c.id AND s.learner_id = v_uid
                AND s.graded_at IS NOT NULL AND coalesce(s.is_passed, false)
          ) u
        ) la
        WHERE e.learner_id = v_uid
      ) x
      WHERE NOT (
        x.is_complete
        AND x.completed_at_effective IS NOT NULL
        AND (timezone('Asia/Kolkata', x.completed_at_effective))::date
            < (timezone('Asia/Kolkata', now()))::date
      )
    ),

    'streak', coalesce(
      (SELECT current_streak FROM private.learner_streak_summary(v_uid)), 0
    ),

    'due_assignments_count', (
      SELECT count(*)::int
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
    ),

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
      LIMIT 3
    )
  ) INTO v_result;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_learner_summary_v1() FROM public;
GRANT EXECUTE ON FUNCTION public.dashboard_learner_summary_v1() TO authenticated;
