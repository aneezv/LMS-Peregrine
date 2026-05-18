-- Recreate dashboard_learner_summary_v1 to change ONLY the `enrolled_courses` block:
--
--   1) Sort by most recent lesson-completion activity (falling back to the
--      enrollment date for never-started courses) instead of enrolled_at.
--
--   2) Drop completed courses from the dashboard the day AFTER they were
--      completed. A course is treated as complete when a course_completions
--      row exists OR progress = 100% (total_modules > 0 AND
--      completed_modules >= total_modules) using the existing type-aware
--      completion logic. Its completion timestamp is course_completions
--      .completed_at when present, else the timestamp of the last completion
--      event across the course's modules — so a finished course always
--      disappears the day after completion through every completion path,
--      even when no course_completions row was ever written.
--
-- `streak`, `due_assignments_count`, and `due_assignments` (LIMIT 3) are
-- byte-identical to 20260517120100_dashboard_summary_due_count.sql.
-- The enrolled_courses JSON row shape is unchanged.

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
