import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import AssignmentUpload from '@/components/AssignmentUpload'
import QuizTakeClient, { type QuizQuestionPublic, type QuizResult } from '@/components/QuizTakeClient'
import FeedbackSubmitClient from '@/components/FeedbackSubmitClient'
import ExternalResourceLinks from '@/components/ExternalResourceLinks'
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, MapPin } from 'lucide-react'

function sortNested<T extends { sort_order?: number }>(arr: T[] | null | undefined): T[] {
  return [...(arr ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

export default async function ModulePage({ params }: { params: Promise<{ id: string; moduleId: string }> }) {
  const { id: courseId, moduleId } = await params
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

  const isAdmin = viewerProfile?.role === 'admin'
  const isCourseInstructor = courseRow?.instructor_id === user.id
  const isCourseStaff = isCourseInstructor || isAdmin

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('course_id', courseId)
    .eq('learner_id', user.id)
    .maybeSingle()

  if (!isCourseStaff && !enrollment) redirect(`/courses/${courseId}`)

  const { data: mod } = await supabase
    .from('modules')
    .select(
      `
      id, title, type, week_index, description, content_url, session_location, available_from,
      session_start_at, session_end_at, quiz_passing_pct, quiz_allow_retest,
      module_external_links ( id, label, url, sort_order ),
      quiz_questions ( id, prompt, sort_order, quiz_options ( id, label, is_correct, sort_order ) ),
      assignments(id, description, max_score, passing_score, deadline_at, allow_late)
    `,
    )
    .eq('id', moduleId)
    .single()

  if (!mod) notFound()

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

  const quizForLearner: QuizQuestionPublic[] = quizQuestionsSorted.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    options: q.options.map((o) => ({ id: o.id, label: o.label })),
  }))

  let quizInitialResult: QuizResult | null = null
  let feedbackSubmitted = false
  let sessionAttendanceMarked = false
  let progressCompleted = false
  let assignmentGraded = false

  if (enrollment) {
    const { data: progress } = await supabase
      .from('module_progress')
      .select('is_completed')
      .eq('module_id', moduleId)
      .eq('learner_id', user.id)
      .maybeSingle()
    progressCompleted = !!progress?.is_completed

    if (mod.type === 'mcq') {
      const { data: attempt } = await supabase
        .from('quiz_attempts')
        .select('score, max_score, passed')
        .eq('module_id', moduleId)
        .eq('learner_id', user.id)
        .order('score', { ascending: false })
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()
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
      const { data: fb } = await supabase
        .from('module_feedback_submissions')
        .select('id')
        .eq('module_id', moduleId)
        .eq('learner_id', user.id)
        .maybeSingle()
      feedbackSubmitted = !!fb
    }
    if (mod.type === 'live_session' || mod.type === 'offline_session') {
      sessionAttendanceMarked = progressCompleted
    }
    if (mod.type === 'assignment') {
      const assignmentId = (mod.assignments as { id: string }[] | null)?.[0]?.id
      if (assignmentId) {
        const { data: sub } = await supabase
          .from('submissions')
          .select('graded_at')
          .eq('assignment_id', assignmentId)
          .eq('learner_id', user.id)
          .maybeSingle()
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
    const { data: orderedMods } = await supabase
      .from('modules')
      .select('id, title, available_from')
      .eq('course_id', courseId)
      .order('sort_order', { ascending: true })

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
    ? 'No next module in this course.'
    : !currentModuleComplete
      ? 'Complete this module first to unlock Next.'
      : nextModule.locked
        ? `Next module unlocks on ${nextModule.unlockAt ? new Date(nextModule.unlockAt).toLocaleString() : 'a scheduled date'}.`
        : 'Next module unavailable.'

  // Time-lock check (learners only; staff can preview)
  if (
    !isCourseStaff &&
    mod.available_from &&
    new Date(mod.available_from) > new Date()
  ) {
    const unlockDate = new Date(mod.available_from).toLocaleString()
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="text-6xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Module Locked</h1>
        <p className="text-slate-500">
          This module unlocks on <strong>{unlockDate}</strong>.
        </p>
      </div>
    )
  }

  const VideoModule = (await import('@/components/VideoModule')).default

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 lg:mt-4">
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
          <VideoModule moduleId={mod.id} contentUrl={mod.content_url}/>
        </div>
      )}

      {mod.type === 'assignment' && (mod.assignments as { id: string }[] | null)?.[0] && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="lg:text-lg text-base font-bold text-slate-900">{mod.title}</h2>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
              Assignment
            </span>
          </div>
          {(mod.assignments as { description?: string }[])[0].description && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm whitespace-pre-wrap text-slate-700">
              {(mod.assignments as { description?: string }[])[0].description}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Max score</p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {(mod.assignments as { max_score: number }[])[0].max_score}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Passing score</p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {(mod.assignments as { passing_score: number }[])[0].passing_score}
              </p>
            </div>
          </div>
          {(mod.assignments as { deadline_at?: string }[])[0].deadline_at && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Deadline</p>
              <p className="mt-1 font-medium">
                {new Date((mod.assignments as { deadline_at: string }[])[0].deadline_at).toLocaleString()}
              </p>
            </div>
          )}
          <AssignmentUpload assignmentId={(mod.assignments as { id: string }[])[0].id} />
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
        <div className="space-y-2 pt-2">
          <div className="flex justify-end">
          {canGoNext ? (
            <Link
              href={`/courses/${courseId}/modules/${nextModule!.id}`}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Next module
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600"
              title={nextDisabledReason}
            >
              Next module
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
          </div>
          {!canGoNext && (
            <p className="text-right text-xs text-slate-500">{nextDisabledReason}</p>
          )}
        </div>
      )}

    </div>
  )
}
