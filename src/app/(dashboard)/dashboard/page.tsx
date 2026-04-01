import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, FileText, Award, Clock, ChevronRight, PlusCircle, Pencil } from 'lucide-react'
import { AppButton, AppCard, EmptyState, PageHeader } from '@/components/ui/primitives'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'learner'
  const name = profile?.full_name ?? user.email?.split('@')[0] ?? 'there'
  const isInstructor = role === 'instructor' || role === 'admin'

  // ── Learner data ─────────────────────────────────────────────
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select(`
      enrolled_at,
      courses (
        id, course_code, title, description, status, thumbnail_url,
        modules ( id )
      )
    `)
    .eq('learner_id', user.id)
    .order('enrolled_at', { ascending: false })

  const enrolledCourses = (enrollments ?? []).map((e: any) => e.courses).filter(Boolean)

  type DueAssignment = {
    assignmentId: string
    moduleId: string
    courseId: string
    courseTitle: string
    moduleTitle: string
    deadlineAt: string
  }

  let dueAssignments: DueAssignment[] = []

  if (!isInstructor && enrolledCourses.length > 0) {
    const courseIds = enrolledCourses.map((c: any) => c.id as string)
    const { data: modRows } = await supabase
      .from('modules')
      .select(
        `
        id,
        title,
        course_id,
        available_from,
        assignments ( id, deadline_at )
      `,
      )
      .eq('type', 'assignment')
      .in('course_id', courseIds)

    const candidates: {
      aid: string
      mid: string
      mtitle: string
      cid: string
      avail: string | null
      deadline: string | null
    }[] = []

    for (const m of modRows ?? []) {
      const row = m as {
        id: string
        title: string
        course_id: string
        available_from: string | null
        assignments: { id: string; deadline_at: string | null }[] | { id: string; deadline_at: string | null } | null
      }
      const raw = row.assignments
      const list = Array.isArray(raw) ? raw : raw ? [raw] : []
      for (const a of list) {
        if (!a?.id || !a.deadline_at) continue
        candidates.push({
          aid: a.id,
          mid: row.id,
          mtitle: row.title,
          cid: row.course_id,
          avail: row.available_from,
          deadline: a.deadline_at,
        })
      }
    }

    const aids = [...new Set(candidates.map((c) => c.aid))]
    const subByAssignment = new Map<string, { is_turned_in: boolean }>()
    if (aids.length > 0) {
      const { data: subs } = await supabase
        .from('submissions')
        .select('assignment_id, is_turned_in')
        .eq('learner_id', user.id)
        .in('assignment_id', aids)
      for (const s of subs ?? []) {
        subByAssignment.set(s.assignment_id, { is_turned_in: s.is_turned_in })
      }
    }

    const courseTitleMap = new Map(
      enrolledCourses.map((c: any) => [c.id as string, c.title as string]),
    )
    const nowMs = Date.now()

    for (const c of candidates) {
      if (c.avail && new Date(c.avail).getTime() > nowMs) continue
      const sub = subByAssignment.get(c.aid)
      if (sub?.is_turned_in) continue
      dueAssignments.push({
        assignmentId: c.aid,
        moduleId: c.mid,
        courseId: c.cid,
        courseTitle: courseTitleMap.get(c.cid) ?? 'Course',
        moduleTitle: c.mtitle,
        deadlineAt: c.deadline!,
      })
    }

    dueAssignments.sort(
      (a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime(),
    )
    dueAssignments = dueAssignments.slice(0, 10)
  }

  const { data: certificates } = await supabase
    .from('certificates')
    .select('id')
    .eq('learner_id', user.id)
    .eq('status', 'valid')

  // ── Instructor data ──────────────────────────────────────────
  const { data: myCourses } = isInstructor
    ? await supabase
        .from('courses')
        .select('id, course_code, title, status, created_at, enrollments(count)')
        .eq('instructor_id', user.id)
        .order('created_at', { ascending: false })
    : { data: [] }

  const metrics = [
    {
      label: isInstructor ? 'My Courses' : 'Enrolled Courses',
      value: isInstructor ? (myCourses?.length ?? 0) : enrolledCourses.length,
      icon: <BookOpen className="w-5 h-5 text-blue-500" />,
      bg: 'bg-blue-50',
    },
    {
      label: isInstructor ? 'Total Learners' : 'Assignments Due',
      value: isInstructor
        ? (myCourses ?? []).reduce((sum: number, c: any) => sum + (c.enrollments?.[0]?.count ?? 0), 0)
        : dueAssignments.length,
      icon: <FileText className="w-5 h-5 text-amber-500" />,
      bg: 'bg-amber-50',
    },
    {
      label: 'Certificates Earned',
      value: certificates?.length ?? 0,
      icon: <Award className="w-5 h-5 text-green-500" />,
      bg: 'bg-green-50',
    },
  ]

  return (
    <div className="space-y-4 px-2 py-2">
      <PageHeader
        title={`Welcome back, ${name}!`}
        // description={`${role} account`} ONLY IN DEV
        action={
          isInstructor ? (
            <Link href="/admin/courses/new" className="inline-flex">
              <AppButton><PlusCircle className="w-4 h-4" />Create Course</AppButton>
            </Link>
          ) : undefined
        }
      />

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {metrics.map((m) => (
          <AppCard key={m.label} className="p-5 flex items-center gap-3">
            <div className={`${m.bg} p-3 rounded-lg`}>{m.icon}</div>
            <div>
              <p className="text-sm text-slate-500 font-medium">{m.label}</p>
              <p className="text-3xl font-bold text-slate-900 mt-0.5">{m.value}</p>
            </div>
          </AppCard>
        ))}
      </div>

      {/* Instructor: My Courses */}
      {isInstructor && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-semibold text-slate-900">Your Courses</h3>
            <Link href="/courses" className="text-sm text-blue-600 hover:underline">View all</Link>
          </div>
          {!myCourses || myCourses.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No courses yet"
                description="Create your first course to start teaching."
                action={<Link href="/admin/courses/new" className="text-sm font-medium text-blue-600 hover:underline">Create your first course</Link>}
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {myCourses.map((c: any) => (
                <li key={c.id} className="flex items-center gap-2 px-6 py-4 hover:bg-slate-50 transition group">
                  <Link href={`/courses/${c.id}`} className="flex items-center justify-between flex-1 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-600 truncate">
                          <em className="not-italic text-slate-500 font-normal mr-1.5">{c.course_code}</em>
                          {c.title}
                        </p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                          c.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {c.status}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0" />
                  </Link>
                  <Link
                    href={`/admin/courses/${c.id}/edit`}
                    className="shrink-0 p-2 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition"
                    title="Edit course"
                    aria-label={`Edit ${c.title}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Learner: Enrolled Courses */}
      {!isInstructor && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-semibold text-slate-900">Your Enrolled Courses</h3>
            <Link href="/courses" className="text-sm text-blue-600 hover:underline">Browse all</Link>
          </div>

          {enrolledCourses.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No enrolled courses"
                description="Browse the catalog to enroll and begin learning."
                action={<Link href="/courses" className="text-sm font-medium text-blue-600 hover:underline">Browse courses</Link>}
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {enrolledCourses.map((course: any) => (
                <li key={course.id}>
                  <Link
                    href={`/courses/${course.id}`}
                    className="flex flex-col gap-3 px-6 py-4 hover:bg-slate-50 transition group sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="bg-blue-50 p-2 rounded-lg flex-shrink-0">
                        <BookOpen className="w-4 h-4 text-blue-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-600 sm:truncate">
                          {course.title}
                        </p>
                        <div className="mt-0.5 flex flex-col gap-1 text-xs text-slate-500 sm:flex-row sm:items-center sm:gap-2">
                          <em className="not-italic font-medium text-slate-600">{course.course_code}</em>
                          <span className="hidden text-slate-300 sm:inline" aria-hidden>
                            ·
                          </span>
                          <span className="text-slate-400 line-clamp-2 sm:line-clamp-1">
                            {course.description ?? 'No description'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center flex-1 sm:ml-4 justify-end">
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Learner: assignments due (week unlocked, not turned in) */}
      {!isInstructor && dueAssignments.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Assignments due</h3>
          </div>
          <ul className="divide-y divide-slate-100">
            {dueAssignments.map((a) => (
              <li key={a.assignmentId}>
                <Link
                  href={`/courses/${a.courseId}/modules/${a.moduleId}`}
                  className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50 transition group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 group-hover:text-blue-700 truncate">
                        {a.moduleTitle}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{a.courseTitle}</p>
                    </div>
                  </div>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Due {new Date(a.deadlineAt).toLocaleString()}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
