import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import EnrollmentsListClient, { type EnrollmentListItem } from '@/components/EnrollmentsListClient'
import { ROLES } from '@/lib/roles'

// ─── Page Component ─────────────────────────────────────────

/**
 * Displays the enrollment list + per-learner progress for a course.
 *
 * Uses the `course_enrollments_progress_v1` Postgres RPC which computes
 * all progress server-side in a single query. This replaced 7 sequential
 * queries + a massive client-side cross-join.
 */
export default async function CourseEnrollmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = await params
  const supabase = await createClient()

  // Step 1: Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Step 2: Fetch course + profile in parallel (independent queries)
  const [courseResult, profileResult] = await Promise.all([
    supabase.from('courses').select('id, title, course_code, instructor_id').eq('id', courseId).single(),
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
  ])

  const course = courseResult.data
  if (!course) notFound()

  const isAdmin = profileResult.data?.role === ROLES.ADMIN
  const isCourseInstructor = course.instructor_id === user.id
  if (!isAdmin && !isCourseInstructor) redirect(`/courses/${courseId}`)

  // Step 3: Single RPC call — replaces 7 queries + JS cross-join
  const { data: rpcData, error: rpcError } = await supabase.rpc('course_enrollments_progress_v1', {
    p_course_id: courseId,
  })

  if (rpcError) {
    console.error('[CourseEnrollmentsPage] RPC error:', rpcError.message)
    return <div className="p-4 text-red-600">Failed to load enrollments. Please refresh.</div>
  }

  // Check for embedded error from the RPC
  if (rpcData && typeof rpcData === 'object' && 'error' in rpcData) {
    return <div className="p-4 text-red-600">{String((rpcData as { error: string }).error)}</div>
  }

  // Parse the RPC response into EnrollmentListItem[]
  const rpcRows = (Array.isArray(rpcData) ? rpcData : []) as {
    id: string
    learnerId: string
    learnerName: string
    enrolledAt: string
    totalModules: number
    completedModules: number
    remainingModules: number
    completionPct: number
    isCompleted: boolean
  }[]

  const enrollmentItems: EnrollmentListItem[] = rpcRows.map((row) => ({
    id: row.id,
    learnerId: row.learnerId,
    learnerName: row.learnerName,
    enrolledAt: row.enrolledAt,
    totalModules: row.totalModules,
    completedModules: row.completedModules,
    remainingModules: row.remainingModules,
    completionPct: row.completionPct,
    isCompleted: row.isCompleted,
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
            {enrollmentItems.length} enrolled learner{enrollmentItems.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <EnrollmentsListClient items={enrollmentItems} />
    </div>
  )
}
