export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import AssignmentUpload from '@/components/AssignmentUpload'
import QuizTakeClient, { type QuizQuestionPublic, type QuizResult } from '@/components/QuizTakeClient'
import { shuffleDeterministic } from '@/lib/shuffle-deterministic'
import FeedbackSubmitClient from '@/components/FeedbackSubmitClient'
import ExternalResourceLinks from '@/components/ExternalResourceLinks'
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, MapPin } from 'lucide-react'
import NextLessonButton from './NextLessonButton'
import { ROLES } from '@/lib/roles'
import { firstEmbeddedAssignment } from '@/lib/embedded-assignment'
import { formatLocalDisplay } from '@/lib/timestamp'
import { isLessonPageDiagnosticsEnabled } from '@/lib/lesson-page-diagnostics'
import ModuleLessonDiagnostics from './ModuleLessonDiagnostics'

function sortNested<T extends { sort_order?: number }>(arr: T[] | null | undefined): T[] {
  return [...(arr ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

export default async function ModulePage({ params }: { params: Promise<{ id: string; moduleId: string }> }) {
  const { id: courseId, moduleId } = await params
  const showLessonDiagnostics = isLessonPageDiagnosticsEnabled()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: courseRow } = await supabase
    .from('courses')
    .select('instructor_id')
    .eq('id', courseId)
    .single()

  const { data: viewerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const isAdmin = viewerProfile?.role === ROLES.ADMIN
  const isCourseInstructor = courseRow?.instructor_id === user.id
  const isCourseStaff = isCourseInstructor || isAdmin

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('course_id', courseId)
    .eq('learner_id', user.id)
    .maybeSingle()

  if (!isCourseStaff && !enrollment) redirect(`/courses/${courseId}`)

  const { data: mod, error: modulesQueryError } = await supabase
    .from('modules')
    .select(
      `
      id, title, type, week_index, description, content_url, session_location, available_from,
      session_start_at, session_end_at, quiz_passing_pct, quiz_allow_retest,
      quiz_time_limit_minutes, quiz_randomize_questions,
      module_external_links ( id, label, url, sort_order ),
      quiz_questions ( id, prompt, sort_order, quiz_options ( id, label, is_correct, sort_order ) ),
      assignments(id, description, max_score, passing_score, deadline_at, allow_late)
    `,
    )
    .eq('id', moduleId)
    .single()

  if (!mod) {
    if (modulesQueryError?.code === 'PGRST116') {
      notFound()
    }
    return (
      <>
        {showLessonDiagnostics && (
          <ModuleLessonDiagnostics
            moduleFetchError={modulesQueryError?.message ?? 'Lesson not found.'}
            assignmentEmbedMissing={false}
            secondaryErrorsSummary={null}
          />
        )}
        <div className="mx-auto max-w-lg space-y-3 py-16 text-center">
          <h1 className="text-lg font-semibold text-slate-900">Could not load this lesson</h1>
          <p className="text-sm text-slate-600">{modulesQueryError?.message ?? 'No data returned.'}</p>
          <Link
            href={`/courses/${courseId}`}
            className="inline-block text-sm font-medium text-blue-600 underline"
          >
            Back to course
          </Link>
        </div>
      </>
    )
  }

  const assignmentRow = firstEmbeddedAssignment(mod.assignments)
  const secondaryErrors: string[] = []

  /* TESTING embed-only path: re-enable if nested `assignments` is empty but row exists in DB.
  let ar = firstEmbeddedAssignment(mod.assignments)
  if (mod.type === 'assignment' && !ar) {
    const { data: asn, error: asnErr } = await supabase
      .from('assignments')
      .select('id, description, max_score, passing_score, deadline_at, allow_late')
      .eq('module_id', moduleId)
      .maybeSingle()
    if (asnErr) console.error('[lesson] assignments fallback', asnErr)
    ar = firstEmbeddedAssignment(asn)
  }
  */

  const passingPct =
    typeof mod.quiz_passing_pct === 'number'
      ? mod.quiz_passing_pct
      : parseInt(String(mod.quiz_passing_pct ?? 60), 10) || 60

  const rawLinks = mod.module_external_links as
    | { id: string; label: string | null; url: string; sort_order: number }[]
    | null
  const externalLinks = sortNested(rawLinks)

  const rawQuizQ = mod.quiz_questions as
    | {
        id: string
        prompt: string
        sort_order: number
        quiz_options: { id: string; label: string; is_correct: boolean; sort_order: number }[]
      }[]
    | null
  const quizQuestionsSorted = sortNested(rawQuizQ).map((q) => ({
    id: q.id,
    prompt: q.prompt,
    options: sortNested(q.quiz_options),
  }))

  let quizForLearner: QuizQuestionPublic[] = quizQuestionsSorted.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    options: q.options.map((o) => ({ id: o.id, label: o.label })),
  }))

  const randomizeQuiz =
    mod.type === 'mcq' &&
    !!enrollment &&
    !!(mod.quiz_randomize_questions as boolean | null | undefined)

  if (randomizeQuiz && quizForLearner.length > 1) {
    quizForLearner = shuffleDeterministic(quizForLearner, `${moduleId}:${user.id}`)
  }

  const rawQuizTlim = mod.quiz_time_limit_minutes
  const quizTimeLimitResolved =
    mod.type === 'mcq' &&
    rawQuizTlim != null &&
    Number.isFinite(Number(rawQuizTlim)) &&
    Math.trunc(Number(rawQuizTlim)) >= 1
      ? Math.min(1440, Math.trunc(Number(rawQuizTlim)))
      : null

  let quizInitialResult: QuizResult | null = null
  let feedbackSubmitted = false
  let sessionAttendanceMarked = false
  let progressCompleted = false
  let assignmentGraded = false

  if (enrollment) {
    const { data: progress, error: progressErr } = await supabase
      .from('module_progress')
      .select('is_completed')
      .eq('module_id', moduleId)
      .eq('learner_id', user.id)
      .maybeSingle()
    if (progressErr) secondaryErrors.push(`module_progress: ${progressErr.message}`)
    progressCompleted = !!progress?.is_completed

    if (mod.type === 'mcq') {
      const { data: attempt, error: attemptErr } = await supabase
        .from('quiz_attempts')
        .select('score, max_score, passed')
        .eq('module_id', moduleId)
        .eq('learner_id', user.id)
        .order('score', { ascending: false })
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (attemptErr) secondaryErrors.push(`quiz_attempts: ${attemptErr.message}`)
      if (attempt) {
        const maxScore = (attempt.max_score as number) ?? 0
        const score = (attempt.score as number) ?? 0
        const pct = maxScore > 0 ? Math.round((score * 100) / maxScore) : 0
        quizInitialResult = {
          score,
          maxScore,
          passed: !!(attempt as { passed?: boolean }).passed,
          percentCorrect: pct,
          passingPct,
        }
      }
    }
    if (mod.type === 'feedback') {
      const { data: fb, error: fbErr } = await supabase
        .from('module_feedback_submissions')
        .select('id')
        .eq('module_id', moduleId)
        .eq('learner_id', user.id)
        .maybeSingle()
      if (fbErr) secondaryErrors.push(`module_feedback_submissions: ${fbErr.message}`)
      feedbackSubmitted = !!fb
    }
    if (mod.type === 'live_session' || mod.type === 'offline_session') {
      sessionAttendanceMarked = progressCompleted
    }
    if (mod.type === 'assignment') {
      const assignmentId = assignmentRow?.id
      if (assignmentId) {
        const { data: sub, error: subErr } = await supabase
          .from('submissions')
          .select('graded_at')
          .eq('assignment_id', assignmentId)
          .eq('learner_id', user.id)
          .maybeSingle()
        if (subErr) secondaryErrors.push(`submissions: ${subErr.message}`)
        assignmentGraded = !!sub?.graded_at
      }
    }
  }

  const currentModuleComplete = !!enrollment && (() => {
    if (mod.type === 'mcq') return !!quizInitialResult?.passed
    if (mod.type === 'feedback') return feedbackSubmitted
    if (mod.type === 'assignment') return progressCompleted || assignmentGraded
    return progressCompleted
  })()

  let nextModule: { id: string; title: string; locked: boolean; unlockAt: string | null } | null = null
  if (enrollment && !isCourseStaff) {
    const { data: orderedMods, error: orderedModsErr } = await supabase
      .from('modules')
      .select('id, title, available_from')
      .eq('course_id', courseId)
      .order('sort_order', { ascending: true })
    if (orderedModsErr) secondaryErrors.push(`next-module list: ${orderedModsErr.message}`)

    const list = orderedMods ?? []
    const currentIdx = list.findIndex((m) => m.id === moduleId)
    const nowTs = Date.now()
    if (currentIdx >= 0) {
      const candidate = list[currentIdx + 1]
      if (candidate) {
        const locked =
          candidate.available_from != null &&
          new Date(candidate.available_from as string).getTime() > nowTs
        nextModule = {
          id: candidate.id as string,
          title: candidate.title as string,
          locked,
          unlockAt: (candidate.available_from as string | null) ?? null,
        }
      }
    }
  }

  const canGoNext = !!nextModule && currentModuleComplete && !nextModule.locked
  const showNextButtonForType =
    mod.type !== 'assignment' &&
    mod.type !== 'live_session' &&
    mod.type !== 'offline_session'
  const nextDisabledReason = !nextModule
    ? 'No next lesson in this course.'
    : !currentModuleComplete
      ? 'Complete this lesson first to unlock Next.'
      : nextModule.locked
        ? `Next lesson unlocks on ${nextModule.unlockAt ? new Date(nextModule.unlockAt).toLocaleString() : 'a scheduled date'}.`
        : 'Next lesson unavailable.'

  const assignmentEmbedMissing = mod.type === 'assignment' && !assignmentRow
  const secondaryErrorsSummary =
    secondaryErrors.length > 0 ? secondaryErrors.join('\n') : null

  const diagnosticsProps = {
    // When `mod` is loaded, Supabase typings treat `modulesQueryError` as empty; any fetch warning is in secondaryErrors.
    moduleFetchError: null as string | null,
    assignmentEmbedMissing,
    secondaryErrorsSummary,
  }

  // Time-lock check (learners only; staff can preview)
  if (
    !isCourseStaff &&
    mod.available_from &&
    new Date(mod.available_from) > new Date()
  ) {
    const unlockDate = new Date(mod.available_from).toLocaleString()
    return (
      <>
        {showLessonDiagnostics && <ModuleLessonDiagnostics {...diagnosticsProps} />}
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="text-6xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Lesson Locked</h1>
        <p className="text-slate-500">
          This lesson unlocks on <strong>{unlockDate}</strong>.
        </p>
      </div>
      </>
    )
  }

  const VideoModule = (await import('@/components/VideoModule')).default

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 lg:mt-4">
      {showLessonDiagnostics && <ModuleLessonDiagnostics {...diagnosticsProps} />}
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Week {mod.week_index ?? 1}
      </p>
      {mod.type === 'video' && mod.content_url && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="lg:text-lg text-base font-bold text-slate-900">{mod.title}</h2>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
              Video
            </span>
          </div>
          {mod.description && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm whitespace-pre-wrap text-slate-700">
              {mod.description}
            </div>
          )}
          <VideoModule key={mod.id} moduleId={mod.id} contentUrl={mod.content_url}/>
        </div>
      )}

      {mod.type === 'assignment' && assignmentRow && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="lg:text-lg text-base font-bold text-slate-900">{mod.title}</h2>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
              Assignment
            </span>
          </div>
          {assignmentRow.description && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm whitespace-pre-wrap text-slate-700">
              {assignmentRow.description}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Max score</p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {assignmentRow.max_score ?? '—'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Passing score</p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {assignmentRow.passing_score ?? '—'}
              </p>
            </div>
          </div>
          {assignmentRow.deadline_at && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Deadline</p>
              <p className="mt-1 font-medium">
                {formatLocalDisplay(assignmentRow.deadline_at)}
              </p>
            </div>
          )}
          <AssignmentUpload assignmentId={assignmentRow.id} />
        </div>
      )}

      {mod.type === 'assignment' && !assignmentRow && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Assignment details not in embedded response</p>
          <p className="text-xs text-amber-800">
            Embed-only mode (fallback query disabled). See warning toast — if the row exists in the DB, re-enable the
            fallback block in <code className="rounded bg-amber-100 px-1">page.tsx</code> or fix the nested select.
          </p>
        </div>
      )}

      {mod.type === 'live_session' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="lg:text-lg text-base font-bold text-slate-900">{mod.title}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-purple-700">
                Live session
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-900">
            <p className="font-semibold">Live session instructions</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-indigo-800">
              <li>Join 5-10 minutes before start time.</li>
              <li>Use your real name so attendance is recorded correctly.</li>
              <li>Keep mic muted when not speaking and participate actively.</li>
            </ul>
          </div>
          {enrollment && (
            <div className="flex justify-end">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                  sessionAttendanceMarked
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {sessionAttendanceMarked ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                {sessionAttendanceMarked ? 'Attendance marked' : 'Attendance pending'}
              </span>
            </div>
          )}
          {(mod.session_start_at || mod.session_end_at) && (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Schedule</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {mod.session_start_at && (
                  <div className="rounded-lg border border-purple-200 bg-purple-50/60 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-700">Starts</p>
                    <p className="mt-1 inline-flex items-start gap-2 text-sm text-slate-800">
                      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" />
                      <span>{new Date(mod.session_start_at).toLocaleString()}</span>
                    </p>
                  </div>
                )}
                {mod.session_end_at && (
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Ends</p>
                    <p className="mt-1 inline-flex items-start gap-2 text-sm text-slate-800">
                      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                      <span>{new Date(mod.session_end_at).toLocaleString()}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          {mod.content_url && (
            <a
              href={mod.content_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2 font-semibold text-white transition hover:bg-indigo-700"
            >
              Join Session →
            </a>
          )}
        </div>
      )}

      {mod.type === 'offline_session' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="lg:text-lg text-base font-bold text-slate-900">{mod.title}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                Offline session
              </span>
            </div>
          </div>
          {mod.description && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm whitespace-pre-wrap text-slate-700">
              {mod.description}
            </div>
          )}
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Offline session instructions</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-800">
              <li>Arrive at least 10 minutes early at the venue.</li>
              <li>Bring required materials and keep your ID ready for attendance.</li>
              <li>Follow classroom/lab safety and instructor instructions.</li>
            </ul>
          </div>
          {enrollment && (
            <div className="flex justify-end">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                    sessionAttendanceMarked
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {sessionAttendanceMarked ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                  {sessionAttendanceMarked ? 'Attendance marked' : 'Attendance pending'}
                </span>
              </div>
            )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {mod.session_location && (
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</p>
                <p className="mt-1 inline-flex items-start gap-2 text-sm font-medium text-slate-800">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>{mod.session_location}</span>
                </p>
              </div>
            )}

            {(mod.session_start_at || mod.session_end_at) && (
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Schedule</p>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {mod.session_start_at && (
                    <div className="rounded-lg border border-purple-200 bg-purple-50/60 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-700">Starts</p>
                      <p className="mt-1 inline-flex items-start gap-2 text-sm text-slate-800">
                        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" />
                        <span>{new Date(mod.session_start_at).toLocaleString()}</span>
                      </p>
                    </div>
                  )}
                  {mod.session_end_at && (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Ends</p>
                      <p className="mt-1 inline-flex items-start gap-2 text-sm text-slate-800">
                        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                        <span>{new Date(mod.session_end_at).toLocaleString()}</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {mod.type === 'mcq' && (
        <div className=" space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="lg:text-lg text-base font-bold text-slate-900">{mod.title}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-700">
                MCQ Exam
              </span>
              {!((mod.quiz_allow_retest as boolean | null) ?? true) && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
                  Retest disabled
                </span>
              )}
            </div>
          </div>
          {isCourseStaff && (
            <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              Instructor preview. Edit questions in <strong>Course builder</strong>. Passing bar:{' '}
              {passingPct}% correct.
            </p>
          )}
          {isCourseStaff ? (
            <div className="space-y-4">
              {quizQuestionsSorted.length === 0 ? (
                <p className="text-sm text-amber-700">No questions in this quiz yet.</p>
              ) : (
                quizQuestionsSorted.map((q, i) => (
                  <div key={q.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50/60">
                    <p className="font-medium text-slate-900 mb-2">
                      {i + 1}. {q.prompt}
                    </p>
                    <ul className="text-sm space-y-1">
                      {q.options.map((o) => (
                        <li key={o.id} className={o.is_correct ? 'text-green-700 font-medium' : 'text-slate-600'}>
                          {o.is_correct ? '✓ ' : '· '}
                          {o.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          ) : enrollment ? (
            <QuizTakeClient
              moduleId={mod.id}
              questions={quizForLearner}
              initialResult={quizInitialResult}
              allowRetest={(mod.quiz_allow_retest as boolean | null) ?? true}
              introText={mod.description ?? undefined}
              timeLimitMinutes={quizTimeLimitResolved}
              questionsRandomized={randomizeQuiz}
            />
          ) : null}
        </div>
      )}

      {mod.type === 'feedback' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="lg:text-lg text-base font-bold text-slate-900">{mod.title}</h2>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-700">
              Feedback
            </span>
          </div>
          {mod.description && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm whitespace-pre-wrap text-slate-700">
              {mod.description}
            </div>
          )}
          {enrollment && (
            <FeedbackSubmitClient moduleId={mod.id} submittedInitially={feedbackSubmitted} />
          )}
          {isCourseStaff && !enrollment && (
            <p className="text-sm text-slate-500">Learners enrolled in this course will submit feedback here.</p>
          )}
        </div>
      )}

      {mod.type === 'external_resource' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="lg:text-lg text-base font-bold text-slate-900">{mod.title}</h2>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
              External resource
            </span>
          </div>
          {mod.description && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm whitespace-pre-wrap text-slate-700">
              {mod.description}
            </div>
          )}
          {externalLinks.length > 0 ? (
            <ExternalResourceLinks courseId={courseId} moduleId={moduleId} links={externalLinks} />
          ) : (
            <p className="text-sm text-amber-700">No links have been added for this resource yet.</p>
          )}
        </div>
      )}

      {enrollment && !isCourseStaff && showNextButtonForType && (
        <NextLessonButton 
          courseId={courseId}
          currentModuleId={moduleId}
          nextModule={nextModule}
          initialCompleted={currentModuleComplete}
          nextDisabledReason={nextDisabledReason}
        />
      )}

    </div>
  )
}
