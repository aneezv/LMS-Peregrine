-- ============================================================
-- Peregrine LMS – Refactor Step 2: RLS Policy Performance Fix
-- ============================================================
-- Wraps every bare `auth.uid()` call in `(select auth.uid())`
-- so Postgres evaluates it ONCE per query instead of per-row.
--
-- SAFE ON LIVE DATA: Wrapped in a single transaction — policies
-- are atomically swapped (old dropped + new created in one commit).
-- Zero downtime gap.
--
-- Run in: Supabase SQL Editor  (paste entire file)
-- ============================================================

BEGIN;

-- ╔══════════════════════════════════════════════╗
-- ║  PROFILES                                    ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING ((select auth.uid()) = id);

-- "Admins select profiles" — uses is_admin() which is already SECURITY DEFINER ✓
-- "Staff view learner profiles" — has auth.uid() inside EXISTS subqueries:
DROP POLICY IF EXISTS "Staff view learner profiles" ON public.profiles;
CREATE POLICY "Staff view learner profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.courses c ON c.id = e.course_id
      WHERE e.learner_id = profiles.id AND c.instructor_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      JOIN public.modules m ON m.id = a.module_id
      JOIN public.courses c ON c.id = m.course_id
      WHERE s.learner_id = profiles.id AND c.instructor_id = (select auth.uid())
    )
    OR (
      public.is_coordinator()
      AND EXISTS (SELECT 1 FROM public.enrollments e WHERE e.learner_id = profiles.id)
    )
  );

DROP POLICY IF EXISTS "View instructors of published courses" ON public.profiles;
CREATE POLICY "View instructors of published courses" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.instructor_id = profiles.id AND c.status = 'published'
    )
  );


-- ╔══════════════════════════════════════════════╗
-- ║  COURSES                                     ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Published courses are visible to all" ON public.courses;
CREATE POLICY "Published courses are visible to all" ON public.courses
  FOR SELECT USING (status = 'published' OR instructor_id = (select auth.uid()));

DROP POLICY IF EXISTS "Instructors manage their courses" ON public.courses;
CREATE POLICY "Instructors manage their courses" ON public.courses
  FOR ALL USING (instructor_id = (select auth.uid()));

-- Admin/coordinator select policies use is_admin()/is_coordinator() — already DEFINER ✓


-- ╔══════════════════════════════════════════════╗
-- ║  SECTIONS                                    ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Users view sections" ON public.sections;
CREATE POLICY "Users view sections" ON public.sections
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = sections.course_id
      AND (courses.status = 'published' OR courses.instructor_id = (select auth.uid()))
  ));

DROP POLICY IF EXISTS "Instructors insert sections for their courses" ON public.sections;
CREATE POLICY "Instructors insert sections for their courses" ON public.sections
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = sections.course_id AND c.instructor_id = (select auth.uid())
  ));

-- "Admins manage all sections" uses is_admin() — already DEFINER ✓


-- ╔══════════════════════════════════════════════╗
-- ║  MODULES                                     ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Users view modules" ON public.modules;
CREATE POLICY "Users view modules" ON public.modules
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = modules.course_id
      AND (courses.status = 'published' OR courses.instructor_id = (select auth.uid()))
  ));

-- "Admins and coordinators view all modules" uses is_admin()/is_coordinator() ✓

DROP POLICY IF EXISTS "Instructors insert modules for their courses" ON public.modules;
CREATE POLICY "Instructors insert modules for their courses" ON public.modules
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = modules.course_id AND c.instructor_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Instructors update modules for their courses" ON public.modules;
CREATE POLICY "Instructors update modules for their courses" ON public.modules
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = modules.course_id AND c.instructor_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = modules.course_id AND c.instructor_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Instructors delete modules for their courses" ON public.modules;
CREATE POLICY "Instructors delete modules for their courses" ON public.modules
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = modules.course_id AND c.instructor_id = (select auth.uid())
  ));

-- "Admins manage all modules" uses is_admin() ✓


-- ╔══════════════════════════════════════════════╗
-- ║  ASSIGNMENTS                                 ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Users view assignments" ON public.assignments;
CREATE POLICY "Users view assignments" ON public.assignments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = assignments.module_id
      AND (c.status = 'published' OR c.instructor_id = (select auth.uid()))
  ));

DROP POLICY IF EXISTS "Instructors insert assignments for their modules" ON public.assignments;
CREATE POLICY "Instructors insert assignments for their modules" ON public.assignments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = assignments.module_id AND c.instructor_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Instructors update assignments for their modules" ON public.assignments;
CREATE POLICY "Instructors update assignments for their modules" ON public.assignments
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = assignments.module_id AND c.instructor_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = assignments.module_id AND c.instructor_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Instructors delete assignments for their modules" ON public.assignments;
CREATE POLICY "Instructors delete assignments for their modules" ON public.assignments
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = assignments.module_id AND c.instructor_id = (select auth.uid())
  ));

-- "Admins manage all assignments" uses is_admin() ✓


-- ╔══════════════════════════════════════════════╗
-- ║  ENROLLMENTS                                 ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Learners see their own enrollments" ON public.enrollments;
CREATE POLICY "Learners see their own enrollments" ON public.enrollments
  FOR SELECT USING (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Learners can enroll themselves" ON public.enrollments;
CREATE POLICY "Learners can enroll themselves" ON public.enrollments
  FOR INSERT WITH CHECK (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Instructors view enrollments for their courses" ON public.enrollments;
CREATE POLICY "Instructors view enrollments for their courses" ON public.enrollments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = enrollments.course_id AND c.instructor_id = (select auth.uid())
  ));

-- "Admins view all enrollments" uses is_admin() ✓
-- "Coordinators view all enrollments" uses is_coordinator() ✓


-- ╔══════════════════════════════════════════════╗
-- ║  SUBMISSIONS                                 ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Learners select own submissions" ON public.submissions;
CREATE POLICY "Learners select own submissions" ON public.submissions
  FOR SELECT TO authenticated
  USING (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Learners insert own submissions" ON public.submissions;
CREATE POLICY "Learners insert own submissions" ON public.submissions
  FOR INSERT TO authenticated
  WITH CHECK (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Learners update own submissions" ON public.submissions;
CREATE POLICY "Learners update own submissions" ON public.submissions
  FOR UPDATE TO authenticated
  USING (learner_id = (select auth.uid()))
  WITH CHECK (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Learners delete own submissions" ON public.submissions;
CREATE POLICY "Learners delete own submissions" ON public.submissions
  FOR DELETE TO authenticated
  USING (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Instructors view course submissions" ON public.submissions;
CREATE POLICY "Instructors view course submissions" ON public.submissions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.assignments a
    JOIN public.modules m ON m.id = a.module_id
    JOIN public.courses c ON c.id = m.course_id
    WHERE a.id = submissions.assignment_id AND c.instructor_id = (select auth.uid())
  ));

-- "Admins view all submissions" uses is_admin() ✓

DROP POLICY IF EXISTS "Instructors grade submissions" ON public.submissions;
CREATE POLICY "Instructors grade submissions" ON public.submissions
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.assignments a
    JOIN public.modules m ON m.id = a.module_id
    JOIN public.courses c ON c.id = m.course_id
    WHERE a.id = submissions.assignment_id AND c.instructor_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.assignments a
    JOIN public.modules m ON m.id = a.module_id
    JOIN public.courses c ON c.id = m.course_id
    WHERE a.id = submissions.assignment_id AND c.instructor_id = (select auth.uid())
  ));

-- "Admins grade submissions" uses is_admin() ✓


-- ╔══════════════════════════════════════════════╗
-- ║  SUBMISSION FILES                            ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Learners own submission files" ON public.submission_files;
CREATE POLICY "Learners own submission files" ON public.submission_files
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.id = submission_files.submission_id AND s.learner_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.id = submission_files.submission_id AND s.learner_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Instructors view submission files" ON public.submission_files;
CREATE POLICY "Instructors view submission files" ON public.submission_files
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.submissions sub
    JOIN public.assignments a ON a.id = sub.assignment_id
    JOIN public.modules m ON m.id = a.module_id
    JOIN public.courses c ON c.id = m.course_id
    WHERE sub.id = submission_files.submission_id AND c.instructor_id = (select auth.uid())
  ));

-- "Admins view all submission files" uses is_admin() ✓


-- ╔══════════════════════════════════════════════╗
-- ║  ATTENDANCE                                  ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Learners manage their attendance" ON public.attendance;
CREATE POLICY "Learners manage their attendance" ON public.attendance
  FOR ALL USING (learner_id = (select auth.uid()));


-- ╔══════════════════════════════════════════════╗
-- ║  MODULE PROGRESS                             ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Learners manage their progress" ON public.module_progress;
CREATE POLICY "Learners manage their progress" ON public.module_progress
  FOR ALL USING (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Staff view module progress for their courses" ON public.module_progress;
CREATE POLICY "Staff view module progress for their courses" ON public.module_progress
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.modules m
      JOIN public.courses c ON c.id = m.course_id
      WHERE m.id = module_progress.module_id AND c.instructor_id = (select auth.uid())
    )
  );


-- ╔══════════════════════════════════════════════╗
-- ║  LEARNING STREAK                             ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "learner reads own streak" ON public.learning_streak;
CREATE POLICY "learner reads own streak" ON public.learning_streak
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = learner_id);


-- ╔══════════════════════════════════════════════╗
-- ║  MODULE SESSION ROSTER                       ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Learners read own session roster row" ON public.module_session_roster;
CREATE POLICY "Learners read own session roster row" ON public.module_session_roster
  FOR SELECT TO authenticated
  USING (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Staff manage session roster" ON public.module_session_roster;
CREATE POLICY "Staff manage session roster" ON public.module_session_roster
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.modules m
      JOIN public.courses c ON c.id = m.course_id
      WHERE m.id = module_session_roster.module_id AND c.instructor_id = (select auth.uid())
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.modules m
      JOIN public.courses c ON c.id = m.course_id
      WHERE m.id = module_session_roster.module_id AND c.instructor_id = (select auth.uid())
    )
  );

-- "Coordinators manage session roster" uses is_coordinator() ✓


-- ╔══════════════════════════════════════════════╗
-- ║  MODULE EXTERNAL LINKS                       ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "View external links with modules" ON public.module_external_links;
CREATE POLICY "View external links with modules" ON public.module_external_links
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = module_external_links.module_id
      AND (c.status = 'published' OR c.instructor_id = (select auth.uid()) OR public.is_admin())
  ));

DROP POLICY IF EXISTS "Staff manage external links" ON public.module_external_links;
CREATE POLICY "Staff manage external links" ON public.module_external_links
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.modules m
      JOIN public.courses c ON c.id = m.course_id
      WHERE m.id = module_external_links.module_id AND c.instructor_id = (select auth.uid())
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.modules m
      JOIN public.courses c ON c.id = m.course_id
      WHERE m.id = module_external_links.module_id AND c.instructor_id = (select auth.uid())
    )
  );


-- ╔══════════════════════════════════════════════╗
-- ║  QUIZ QUESTIONS                              ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "View quiz questions with modules" ON public.quiz_questions;
CREATE POLICY "View quiz questions with modules" ON public.quiz_questions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.modules m
    JOIN public.courses c ON c.id = m.course_id
    WHERE m.id = quiz_questions.module_id
      AND (c.status = 'published' OR c.instructor_id = (select auth.uid()) OR public.is_admin())
  ));

DROP POLICY IF EXISTS "Staff manage quiz questions" ON public.quiz_questions;
CREATE POLICY "Staff manage quiz questions" ON public.quiz_questions
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.modules m
      JOIN public.courses c ON c.id = m.course_id
      WHERE m.id = quiz_questions.module_id AND c.instructor_id = (select auth.uid())
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.modules m
      JOIN public.courses c ON c.id = m.course_id
      WHERE m.id = quiz_questions.module_id AND c.instructor_id = (select auth.uid())
    )
  );


-- ╔══════════════════════════════════════════════╗
-- ║  QUIZ OPTIONS                                ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "View quiz options with question" ON public.quiz_options;
CREATE POLICY "View quiz options with question" ON public.quiz_options
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quiz_questions q
    JOIN public.modules m ON m.id = q.module_id
    JOIN public.courses c ON c.id = m.course_id
    WHERE q.id = quiz_options.question_id
      AND (c.status = 'published' OR c.instructor_id = (select auth.uid()) OR public.is_admin())
  ));

DROP POLICY IF EXISTS "Staff manage quiz options" ON public.quiz_options;
CREATE POLICY "Staff manage quiz options" ON public.quiz_options
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.quiz_questions q
      JOIN public.modules m ON m.id = q.module_id
      JOIN public.courses c ON c.id = m.course_id
      WHERE q.id = quiz_options.question_id AND c.instructor_id = (select auth.uid())
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.quiz_questions q
      JOIN public.modules m ON m.id = q.module_id
      JOIN public.courses c ON c.id = m.course_id
      WHERE q.id = quiz_options.question_id AND c.instructor_id = (select auth.uid())
    )
  );


-- ╔══════════════════════════════════════════════╗
-- ║  QUIZ ATTEMPTS                               ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Learners view own quiz attempts" ON public.quiz_attempts;
CREATE POLICY "Learners view own quiz attempts" ON public.quiz_attempts
  FOR SELECT TO authenticated
  USING (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Staff view quiz attempts for their courses" ON public.quiz_attempts;
CREATE POLICY "Staff view quiz attempts for their courses" ON public.quiz_attempts
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.modules m
      JOIN public.courses c ON c.id = m.course_id
      WHERE m.id = quiz_attempts.module_id AND c.instructor_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Enrolled learners insert quiz attempts" ON public.quiz_attempts;
CREATE POLICY "Enrolled learners insert quiz attempts" ON public.quiz_attempts
  FOR INSERT TO authenticated
  WITH CHECK (
    learner_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.modules mod
      JOIN public.enrollments e ON e.course_id = mod.course_id
      WHERE mod.id = quiz_attempts.module_id
        AND e.learner_id = (select auth.uid())
        AND mod.type = 'mcq'
    )
  );

DROP POLICY IF EXISTS "Learners update own quiz attempts" ON public.quiz_attempts;
CREATE POLICY "Learners update own quiz attempts" ON public.quiz_attempts
  FOR UPDATE TO authenticated
  USING (learner_id = (select auth.uid()))
  WITH CHECK (learner_id = (select auth.uid()));


-- ╔══════════════════════════════════════════════╗
-- ║  QUIZ ATTEMPT ANSWERS                        ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Learners view own quiz attempt answers" ON public.quiz_attempt_answers;
CREATE POLICY "Learners view own quiz attempt answers" ON public.quiz_attempt_answers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quiz_attempts a
    WHERE a.id = quiz_attempt_answers.attempt_id AND a.learner_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Staff view quiz attempt answers" ON public.quiz_attempt_answers;
CREATE POLICY "Staff view quiz attempt answers" ON public.quiz_attempt_answers
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.quiz_attempts att
      JOIN public.modules m ON m.id = att.module_id
      JOIN public.courses c ON c.id = m.course_id
      WHERE att.id = quiz_attempt_answers.attempt_id AND c.instructor_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Learners insert answers for own attempt" ON public.quiz_attempt_answers;
CREATE POLICY "Learners insert answers for own attempt" ON public.quiz_attempt_answers
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quiz_attempts a
    WHERE a.id = quiz_attempt_answers.attempt_id AND a.learner_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Learners update own quiz attempt answers" ON public.quiz_attempt_answers;
CREATE POLICY "Learners update own quiz attempt answers" ON public.quiz_attempt_answers
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quiz_attempts a
    WHERE a.id = quiz_attempt_answers.attempt_id AND a.learner_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quiz_attempts a
    WHERE a.id = quiz_attempt_answers.attempt_id AND a.learner_id = (select auth.uid())
  ));


-- ╔══════════════════════════════════════════════╗
-- ║  MODULE FEEDBACK SUBMISSIONS                 ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Learners view own feedback" ON public.module_feedback_submissions;
CREATE POLICY "Learners view own feedback" ON public.module_feedback_submissions
  FOR SELECT TO authenticated
  USING (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Staff view feedback for their courses" ON public.module_feedback_submissions;
CREATE POLICY "Staff view feedback for their courses" ON public.module_feedback_submissions
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.modules m
      JOIN public.courses c ON c.id = m.course_id
      WHERE m.id = module_feedback_submissions.module_id AND c.instructor_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Enrolled learners submit feedback once" ON public.module_feedback_submissions;
CREATE POLICY "Enrolled learners submit feedback once" ON public.module_feedback_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    learner_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.modules mod
      JOIN public.enrollments e ON e.course_id = mod.course_id
      WHERE mod.id = module_feedback_submissions.module_id
        AND e.learner_id = (select auth.uid())
        AND mod.type = 'feedback'
    )
  );


-- ╔══════════════════════════════════════════════╗
-- ║  COURSE COMPLETIONS                          ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Learners view own course completion" ON public.course_completions;
CREATE POLICY "Learners view own course completion" ON public.course_completions
  FOR SELECT TO authenticated
  USING (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Learners insert own course completion when enrolled" ON public.course_completions;
CREATE POLICY "Learners insert own course completion when enrolled" ON public.course_completions
  FOR INSERT TO authenticated
  WITH CHECK (
    learner_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.course_id = course_completions.course_id
        AND e.learner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Staff view course completions for their courses" ON public.course_completions;
CREATE POLICY "Staff view course completions for their courses" ON public.course_completions
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_completions.course_id AND c.instructor_id = (select auth.uid())
    )
  );


-- ╔══════════════════════════════════════════════╗
-- ║  CERTIFICATES                                ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Learners see their certificates" ON public.certificates;
CREATE POLICY "Learners see their certificates" ON public.certificates
  FOR SELECT USING (learner_id = (select auth.uid()));


-- ╔══════════════════════════════════════════════╗
-- ║  OFFLINE LEARNER ID CARDS                    ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "Learners read own offline id card" ON public.offline_learner_id_cards;
CREATE POLICY "Learners read own offline id card" ON public.offline_learner_id_cards
  FOR SELECT TO authenticated
  USING (learner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Staff read offline id cards" ON public.offline_learner_id_cards;
CREATE POLICY "Staff read offline id cards" ON public.offline_learner_id_cards
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_coordinator()
    OR (
      learner_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.enrollments e
        JOIN public.courses c ON c.id = e.course_id
        WHERE e.learner_id = offline_learner_id_cards.learner_id
          AND c.instructor_id = (select auth.uid())
      )
    )
  );

-- "Admin manage offline id cards" uses is_admin() ✓

DROP POLICY IF EXISTS "Instructors update offline id cards for their courses" ON public.offline_learner_id_cards;
CREATE POLICY "Instructors update offline id cards for their courses" ON public.offline_learner_id_cards
  FOR UPDATE TO authenticated
  USING (
    NOT public.is_admin()
    AND (
      learner_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.enrollments e
        JOIN public.courses c ON c.id = e.course_id
        WHERE e.learner_id = offline_learner_id_cards.learner_id
          AND c.instructor_id = (select auth.uid())
      )
    )
  )
  WITH CHECK (
    NOT public.is_admin()
    AND (
      (learner_id IS NULL AND bound_at IS NULL AND bound_by IS NULL)
      OR EXISTS (
        SELECT 1 FROM public.enrollments e
        JOIN public.courses c ON c.id = e.course_id
        WHERE e.learner_id = offline_learner_id_cards.learner_id
          AND c.instructor_id = (select auth.uid())
      )
    )
  );

-- "Coordinators update offline id cards for binding" uses is_coordinator() ✓


-- ╔══════════════════════════════════════════════╗
-- ║  INTERNSHIP SESSIONS                         ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "internship_sessions learner full access" ON public.internship_sessions;
CREATE POLICY "internship_sessions learner full access" ON public.internship_sessions
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (
    user_id = (select auth.uid())
    AND (
      course_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.course_id = internship_sessions.course_id
          AND e.learner_id = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "internship_sessions staff select" ON public.internship_sessions;
CREATE POLICY "internship_sessions staff select" ON public.internship_sessions
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.courses c ON c.id = e.course_id
      WHERE e.learner_id = internship_sessions.user_id
        AND c.instructor_id = (select auth.uid())
    )
  );


-- ╔══════════════════════════════════════════════╗
-- ║  INTERNSHIP ACTIVITY LOGS                    ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "internship_activity learner insert" ON public.internship_activity_logs;
CREATE POLICY "internship_activity learner insert" ON public.internship_activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.internship_sessions s
    WHERE s.id = session_id AND s.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "internship_activity learner select" ON public.internship_activity_logs;
CREATE POLICY "internship_activity learner select" ON public.internship_activity_logs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.internship_sessions s
    WHERE s.id = session_id AND s.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "internship_activity staff select" ON public.internship_activity_logs;
CREATE POLICY "internship_activity staff select" ON public.internship_activity_logs
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.internship_sessions s
      JOIN public.enrollments e ON e.learner_id = s.user_id
      JOIN public.courses c ON c.id = e.course_id
      WHERE s.id = internship_activity_logs.session_id
        AND c.instructor_id = (select auth.uid())
    )
  );


-- ╔══════════════════════════════════════════════╗
-- ║  INTERNSHIP DAILY ACTIVITY                   ║
-- ╚══════════════════════════════════════════════╝

DROP POLICY IF EXISTS "internship_daily learner read own" ON public.internship_daily_activity;
CREATE POLICY "internship_daily learner read own" ON public.internship_daily_activity
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- "internship_daily admin read all" uses is_admin() ✓

DROP POLICY IF EXISTS "internship_daily_course learner read own" ON public.internship_daily_activity_course;
CREATE POLICY "internship_daily_course learner read own" ON public.internship_daily_activity_course
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- "internship_daily_course admin read all" uses is_admin() ✓


COMMIT;

-- ============================================================
-- DONE – All RLS policies now use (select auth.uid()) instead
-- of bare auth.uid().  Verify with:
--
--   SELECT policyname, tablename, qual, with_check
--   FROM pg_policies WHERE schemaname = 'public'
--   ORDER BY tablename, policyname;
-- ============================================================
