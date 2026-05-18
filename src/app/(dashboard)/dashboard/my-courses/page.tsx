import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, GraduationCap } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { Button } from '@/components/ui/button'
import { ErrorAlert } from '@/components/ui/error-alert'
import { EmptyState, PageHeader } from '@/components/ui/primitives'
import { ROLES, isStaffRole } from '@/lib/roles'
import { CourseProgressCard, type Course } from '../_components/CourseProgressCard'

type EnrolledCourse = {
  id: string
  course_code: string
  title: string
  thumbnail_url: string | null
}

type EnrollmentRow = {
  id: string
  course_id: string
  enrolled_at: string
  courses: EnrolledCourse | EnrolledCourse[] | null
}

type ProgressRow = {
  course_id: string
  total_modules: number
  completed_modules: number
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default async function MyCoursesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? ROLES.LEARNER
  if (isStaffRole(role)) redirect('/dashboard')

  const { data: enrollRows, error: enrollErr } = await supabase
    .from('enrollments')
    .select('id, course_id, enrolled_at, courses(id, course_code, title, thumbnail_url)')
    .eq('learner_id', user.id)
    .order('enrolled_at', { ascending: false })

  if (enrollErr) {
    console.error('[MyCoursesPage] enrollments error:', enrollErr.message)
    return (
      <div className="p-4">
        <ErrorAlert title="Failed to load your courses">Please refresh the page.</ErrorAlert>
      </div>
    )
  }

  const rows = (enrollRows ?? []) as EnrollmentRow[]
  const enrollmentIds = rows.map((r) => r.id)

  const progressByCourse = new Map<string, { total: number; completed: number }>()
  if (enrollmentIds.length > 0) {
    const { data: progRows, error: progErr } = await supabase.rpc(
      'learner_progress_by_enrollment_v1',
      { p_enrollment_ids: enrollmentIds },
    )
    if (progErr) {
      console.error('[MyCoursesPage] progress RPC error:', progErr.message)
    } else {
      for (const p of (progRows ?? []) as ProgressRow[]) {
        progressByCourse.set(p.course_id, {
          total: Number(p.total_modules ?? 0),
          completed: Number(p.completed_modules ?? 0),
        })
      }
    }
  }

  const courses: Course[] = rows
    .map((r): Course | null => {
      const c = unwrap(r.courses)
      if (!c) return null
      const pr = progressByCourse.get(r.course_id)
      const progress =
        pr && pr.total > 0 ? Math.round((pr.completed / pr.total) * 100) : 0
      return {
        id: c.id,
        course_code: c.course_code,
        title: c.title,
        thumbnail_url: c.thumbnail_url ?? undefined,
        progress,
      }
    })
    .filter((c): c is Course => c !== null)

  return (
    <div className="space-y-5 px-2 py-4">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Back to dashboard
      </Link>

      <PageHeader
        title="My Courses"
        description="Every course you're enrolled in, with your progress."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 border border-blue-100">
            <GraduationCap className="w-3.5 h-3.5" />
            {courses.length} total
          </span>
        }
      />

      {courses.length === 0 ? (
        <EmptyState
          title="No enrolled courses"
          description="Browse the catalog to enroll and start learning."
          action={
            <Link href="/courses">
              <Button variant="outline" size="sm">
                Explore catalog
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {courses.map((course, i) => (
            <li key={course.id} className="min-w-0">
              <CourseProgressCard course={course} index={i} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
