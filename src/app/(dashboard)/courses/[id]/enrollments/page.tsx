import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import EnrollmentsListClient, { type EnrollmentListItem } from '@/components/EnrollmentsListClient'
import { ROLES } from '@/lib/roles'

type EnrollmentRow = {
  id: string
  learner_id: string
  enrolled_at: string
}

type ProfileRow = {
  id: string
  full_name: string | null
}

type CourseModule = {
  id: string
  type: string | null
}

export default async function CourseEnrollmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
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

  const isAdmin = viewerProfile?.role === ROLES.ADMIN
  const isCourseInstructor = course.instructor_id === user.id
  const isCourseStaff = isAdmin || isCourseInstructor

  if (!isCourseStaff) {
    redirect(`/courses/${courseId}`)
  }

  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('id, learner_id, enrolled_at')
    .eq('course_id', courseId)
    .order('enrolled_at', { ascending: false })

  const rows = (enrollments ?? []) as EnrollmentRow[]
  const learnerIds = [...new Set(rows.map((row) => row.learner_id))]

  const { data: profiles } =
    learnerIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', learnerIds)
      : { data: [] as ProfileRow[] }

  const { data: modules } = await supabase
    .from('modules')
    .select('id, type')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: true })

  const modList = (modules ?? []) as CourseModule[]
  const moduleIds = modList.map((m) => m.id)
  const totalModules = modList.length

  const mcqIds = modList.filter((m) => m.type === 'mcq').map((m) => m.id)
  const feedbackIds = modList.filter((m) => m.type === 'feedback').map((m) => m.id)
  const assignmentModuleIds = modList.filter((m) => m.type === 'assignment').map((m) => m.id)

  const { data: progressRows } =
    learnerIds.length > 0 && moduleIds.length > 0
      ? await supabase
          .from('module_progress')
          .select('learner_id, module_id, is_completed')
          .in('learner_id', learnerIds)
          .in('module_id', moduleIds)
          .eq('is_completed', true)
      : { data: [] as { learner_id: string; module_id: string; is_completed: boolean }[] }

  const { data: quizRows } =
    learnerIds.length > 0 && mcqIds.length > 0
      ? await supabase
          .from('quiz_attempts')
          .select('learner_id, module_id, passed')
          .in('learner_id', learnerIds)
          .in('module_id', mcqIds)
          .eq('passed', true)
      : { data: [] as { learner_id: string; module_id: string; passed: boolean }[] }

  const { data: feedbackRows } =
    learnerIds.length > 0 && feedbackIds.length > 0
      ? await supabase
          .from('module_feedback_submissions')
          .select('learner_id, module_id')
          .in('learner_id', learnerIds)
          .in('module_id', feedbackIds)
      : { data: [] as { learner_id: string; module_id: string }[] }

  const { data: assignmentRows } =
    assignmentModuleIds.length > 0
      ? await supabase.from('assignments').select('id, module_id').in('module_id', assignmentModuleIds)
      : { data: [] as { id: string; module_id: string }[] }

  const assignmentIds = (assignmentRows ?? []).map((a) => a.id as string)
  const assignmentIdByModule = new Map(
    (assignmentRows ?? []).map((a) => [a.module_id as string, a.id as string]),
  )

  const { data: gradedSubmissionRows } =
    learnerIds.length > 0 && assignmentIds.length > 0
      ? await supabase
          .from('submissions')
          .select('learner_id, assignment_id, graded_at')
          .in('learner_id', learnerIds)
          .in('assignment_id', assignmentIds)
          .not('graded_at', 'is', null)
      : { data: [] as { learner_id: string; assignment_id: string; graded_at: string | null }[] }

  const { data: completionRows } =
    learnerIds.length > 0
      ? await supabase
          .from('course_completions')
          .select('learner_id, completed_at')
          .eq('course_id', courseId)
          .in('learner_id', learnerIds)
      : { data: [] as { learner_id: string; completed_at: string }[] }

  const progressDoneByLearner = new Map<string, Set<string>>()
  for (const row of progressRows ?? []) {
    const learnerId = row.learner_id as string
    const set = progressDoneByLearner.get(learnerId) ?? new Set<string>()
    set.add(row.module_id as string)
    progressDoneByLearner.set(learnerId, set)
  }

  const quizPassedByLearner = new Map<string, Set<string>>()
  for (const row of quizRows ?? []) {
    const learnerId = row.learner_id as string
    const set = quizPassedByLearner.get(learnerId) ?? new Set<string>()
    set.add(row.module_id as string)
    quizPassedByLearner.set(learnerId, set)
  }

  const feedbackDoneByLearner = new Map<string, Set<string>>()
  for (const row of feedbackRows ?? []) {
    const learnerId = row.learner_id as string
    const set = feedbackDoneByLearner.get(learnerId) ?? new Set<string>()
    set.add(row.module_id as string)
    feedbackDoneByLearner.set(learnerId, set)
  }

  const gradedByLearnerAssignment = new Map<string, Set<string>>()
  for (const row of gradedSubmissionRows ?? []) {
    const learnerId = row.learner_id as string
    const set = gradedByLearnerAssignment.get(learnerId) ?? new Set<string>()
    set.add(row.assignment_id as string)
    gradedByLearnerAssignment.set(learnerId, set)
  }

  const completedCourseLearners = new Set((completionRows ?? []).map((row) => row.learner_id as string))

  const nameByLearner = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name ?? 'Learner']))
  const enrollmentItems: EnrollmentListItem[] = rows.map((row) => ({
    ...(() => {
      const learnerId = row.learner_id
      const progressSet = progressDoneByLearner.get(learnerId) ?? new Set<string>()
      const quizSet = quizPassedByLearner.get(learnerId) ?? new Set<string>()
      const feedbackSet = feedbackDoneByLearner.get(learnerId) ?? new Set<string>()
      const gradedAssignmentSet = gradedByLearnerAssignment.get(learnerId) ?? new Set<string>()
      let completedModules = 0
      for (const mod of modList) {
        if (mod.type === 'mcq') {
          if (quizSet.has(mod.id)) completedModules += 1
          continue
        }
        if (mod.type === 'feedback') {
          if (feedbackSet.has(mod.id)) completedModules += 1
          continue
        }
        if (mod.type === 'assignment') {
          const aid = assignmentIdByModule.get(mod.id)
          const gradedDone = !!aid && gradedAssignmentSet.has(aid)
          if (progressSet.has(mod.id) || gradedDone) completedModules += 1
          continue
        }
        if (progressSet.has(mod.id)) completedModules += 1
      }
      const remainingModules = Math.max(0, totalModules - completedModules)
      const completionPct = totalModules > 0 ? Math.round((completedModules * 100) / totalModules) : 0
      const isCompleted =
        totalModules > 0
          ? completedModules >= totalModules || completedCourseLearners.has(learnerId)
          : completedCourseLearners.has(learnerId)
      return {
        totalModules,
        completedModules,
        remainingModules,
        completionPct,
        isCompleted,
      }
    })(),
    id: row.id,
    learnerId: row.learner_id,
    learnerName: nameByLearner.get(row.learner_id) ?? 'Unknown learner',
    enrolledAt: row.enrolled_at,
  }))

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4 sm:px-6">
          <Link
            href={`/courses/${courseId}`}
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to course
          </Link>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div className="space-y-2">
            <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
              <Users className="h-5 w-5 text-emerald-600" />
              Enrollments
            </h1>
            <p className="text-slate-600">
              {(course.title as string) ?? courseId}{' '}
              <span className="text-slate-400">({(course.course_code as string) ?? ''})</span>
            </p>
          </div>

          <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            {rows.length} enrolled learner{rows.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <EnrollmentsListClient items={enrollmentItems} />
    </div>
  )
}
