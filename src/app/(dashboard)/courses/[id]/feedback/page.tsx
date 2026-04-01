import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { AppCard } from '@/components/ui/primitives'

export default async function CourseFeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: course } = await supabase
    .from('courses')
    .select('id, title, course_code, instructor_id')
    .eq('id', courseId)
    .single()

  if (!course) notFound()

  const { data: viewerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const isAdmin = viewerProfile?.role === 'admin'
  const isCourseInstructor = course.instructor_id === user.id
  const isCourseStaff = isCourseInstructor || isAdmin

  if (!isCourseStaff) {
    redirect(`/courses/${courseId}`)
  }

  const { data: feedbackModules } = await supabase
    .from('modules')
    .select('id, title, week_index')
    .eq('course_id', courseId)
    .eq('type', 'feedback')
    .order('sort_order', { ascending: true })

  const feedbackModuleIds = (feedbackModules ?? []).map((m) => m.id as string)
  const modMeta = new Map(
    (feedbackModules ?? []).map((m) => [
      m.id as string,
      { title: (m.title as string) ?? '', week: (m.week_index as number) ?? 1 },
    ]),
  )

  const { data: subs } =
    feedbackModuleIds.length > 0
      ? await supabase
          .from('module_feedback_submissions')
          .select('id, body, submitted_at, learner_id, module_id')
          .in('module_id', feedbackModuleIds)
          .order('submitted_at', { ascending: false })
      : { data: [] as { id: string; body: string; submitted_at: string; learner_id: string; module_id: string }[] }

  const learnerIds = [...new Set((subs ?? []).map((s) => s.learner_id))]
  const { data: profs } =
    learnerIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', learnerIds)
      : { data: [] as { id: string; full_name: string | null }[] }

  const nameByLearner = new Map((profs ?? []).map((p) => [p.id as string, p.full_name ?? 'Learner']))

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href={`/courses/${courseId}`}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to course
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <MessageSquare className="w-7 h-7 text-rose-600" />
          Feedback submissions
        </h1>
        <p className="text-slate-600 mt-1">
          {(course.title as string) ?? courseId}{' '}
          <span className="text-slate-400">({(course.course_code as string) ?? ''})</span>
        </p>
      </div>

      {feedbackModuleIds.length === 0 ? (
        <AppCard className="bg-amber-50 border-amber-200 p-6 text-amber-900 text-sm">
          This course has no feedback modules yet. Add a <strong>Feedback</strong> module in the course builder.
        </AppCard>
      ) : (subs ?? []).length === 0 ? (
        <AppCard className="p-8 text-center text-slate-500">
          No submissions yet for {feedbackModuleIds.length} feedback module
          {feedbackModuleIds.length !== 1 ? 's' : ''}.
        </AppCard>
      ) : (
        <ul className="space-y-4">
          {(subs ?? []).map((row) => {
            const mod = modMeta.get(row.module_id)
            return (
              <li
                key={row.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-900">{mod?.title ?? 'Feedback module'}</span>
                  <span className="text-slate-500 text-xs">Week {mod?.week ?? '—'}</span>
                </div>
                <p className="text-xs text-slate-500">
                  From{' '}
                  <span className="font-medium text-slate-700">
                    {nameByLearner.get(row.learner_id) ?? 'Unknown'}
                  </span>
                  {' · '}
                  {new Date(row.submitted_at).toLocaleString()}
                </p>
                <div className="text-sm text-slate-800 whitespace-pre-wrap border-l-4 border-rose-100 pl-3">
                  {row.body}
                </div>
                <Link
                  href={`/courses/${courseId}/modules/${row.module_id}`}
                  className="text-xs font-medium text-rose-700 hover:underline"
                >
                  Open module →
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
