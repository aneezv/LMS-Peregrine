import type { ReactNode } from 'react'
import { createClient } from '@/utils/supabase/server'
import { unwrapSingle } from '@/lib/catalog-courses'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, FileText, Clock, ChevronRight, PlusCircle, Pencil, ArrowRight, Flame } from 'lucide-react'
import { AppButton, AppCard, EmptyState, PageHeader } from '@/components/ui/primitives'
import { formatLocalDisplay } from '@/lib/timestamp'
import { ROLES, isInstructorRole } from '@/lib/roles'
import ContinueLearning from './ContinueLearning'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? ROLES.LEARNER
  const name = profile?.full_name ?? user.email?.split('@')[0] ?? 'there'
  const isAdmin = role === ROLES.ADMIN
  const isInstructor = isInstructorRole(role)

  if (role === ROLES.COORDINATOR) {
    return (
      <div className="space-y-4 px-2 py-2">
        <PageHeader title={`Welcome, ${name}!`} description="Coordinator" />
        <AppCard className="p-6 space-y-3">
          <p className="text-slate-700">
            Use the below tools to manage ID card bindings, take attendance via ID card scanning, and grade assignments for all courses.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/attendance/bind-cards"
              className="border border-blue-600 rounded-lg px-4 py-2 inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
            >
              <ArrowRight className="w-4 h-4" />
              Go to Bind ID cards
            </Link>
            <Link
              href="/attendance/id-card-scan"
              className="border border-blue-600 rounded-lg px-4 py-2 inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
            >
              <ArrowRight className="w-4 h-4" />
              Scan ID attendance
            </Link>
            <Link
              href="/grading"
              className="border border-blue-600 rounded-lg px-4 py-2 inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
            >
              <ArrowRight className="w-4 h-4" />
              Open grading
            </Link>
          </div>
        </AppCard>
      </div>
    )
  }

  // ── Learner data ─────────────────────────────────────────────
  // Fetch enrollments with course + module count
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

  // Fetch completed module IDs for this learner across all courses
  const { data: completedModules } = await supabase
    .from('module_progress')
    .select('module_id')
    .eq('learner_id', user.id)
    .eq('is_completed', true)

  const completedSet = new Set((completedModules ?? []).map((m: any) => m.module_id))

  // Build enrolledCourses with real progress %
  const enrolledCourses = (enrollments ?? [])
    .map((e: any) => e.courses)
    .filter(Boolean)
    .map((course: any) => {
      const totalModules: number = course.modules?.length ?? 0
      const completedCount = (course.modules ?? []).filter(
        (m: any) => completedSet.has(m.id)
      ).length

      const progress = totalModules > 0
        ? Math.round((completedCount / totalModules) * 100)
        : 0

      return {
        id: course.id,
        course_code: course.course_code,
        title: course.title,
        thumbnail_url: course.thumbnail_url ?? null,
        progress,         // 0–100, ready for <Progress value={progress} />
        totalModules,
        completedCount,
      }
    })

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

  let learnerStreak = 0
  if (!isInstructor) {
    const { data: streakRow } = await supabase
      .from('learning_streak_display')
      .select('streak')
      .eq('learner_id', user.id)
      .maybeSingle()
    learnerStreak = (streakRow as { streak: number } | null)?.streak ?? 0
  }

  // ── Instructor data ──────────────────────────────────────────
  let myCourses:
    | {
      id: string
      course_code: string
      title: string
      status: string
      created_at: string
      enrollments: { count: number }[]
      department: { name: string } | null
    }[]
    | null = []

  if (isInstructor) {
    let staffCoursesQuery = supabase
      .from('courses')
      .select('id, course_code, title, status, created_at, enrollments(count), department:department_id ( name )')
      .order('created_at', { ascending: false })

    if (!isAdmin) {
      staffCoursesQuery = staffCoursesQuery.eq('instructor_id', user.id)
    }

    const { data } = await staffCoursesQuery
    myCourses = (data ?? []).map((row) => {
      const r = row as {
        id: string
        course_code: string
        title: string
        status: string
        created_at: string
        enrollments: { count: number }[]
        department: { name: string } | { name: string }[] | null
      }
      return {
        id: r.id,
        course_code: r.course_code,
        title: r.title,
        status: r.status,
        created_at: r.created_at,
        enrollments: r.enrollments,
        department: unwrapSingle(r.department),
      }
    })
  }

  type MetricCard = {
    label: string
    value: number
    icon: ReactNode
    bg: string
    hint?: string
  }

  const metrics: MetricCard[] = [
    {
      label: isInstructor ? (isAdmin ? 'All Courses' : 'My Courses') : 'Day streak',
      value: isInstructor ? (myCourses?.length ?? 0) : learnerStreak,
      icon: isInstructor ? (
        <BookOpen className="w-12.5 h-12.5 text-blue-500" />
      ) : (
        <Flame className="w-12.5 h-12.5 text-orange-500" />
      ),
      bg: isInstructor ? 'bg-blue-50' : 'bg-orange-50',
      hint: !isInstructor && learnerStreak === 0 ? 'Complete a lesson to start' : undefined,
    },
    {
      label: isInstructor ? 'Total Learners' : 'Assignments Due',
      value: isInstructor
        ? (myCourses ?? []).reduce((sum: number, c: any) => sum + (c.enrollments?.[0]?.count ?? 0), 0)
        : dueAssignments.length,
      icon: <FileText className="w-12.5 h-12.5 text-amber-500" />,
      bg: 'bg-amber-50',
    },
  ]

  return (
    <div className="space-y-4 px-2 py-4">
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {metrics.map((m) => (
          <AppCard
            key={m.label}
            className="relative overflow-hidden p-5 flex flex-row justify-between gap-4 rounded-2xl"
          >
            {/* Background icon — contained properly */}
            <div className="pointer-events-none absolute opacity-30 -right-4 -bottom-4 text-slate-200 [&>svg]:w-20 [&>svg]:h-20">
              {m.icon}
            </div>

            <div className="relative z-10 min-w-0 flex flex-col justify-between gap-0.5">
              <p className="text-xs font-bold text-slate-500">{m.label}</p>
              <p className="text-4xl font-bold text-slate-900 tracking-tight">{m.value}</p>
              {m.hint ? (
                <p className="text-[11px] text-slate-400 leading-snug">{m.hint}</p>
              ) : null}
            </div>
          </AppCard>
        ))}
      </div>

      {/* Staff: course list */}
      {isInstructor && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-semibold text-slate-900">{isAdmin ? 'All Courses' : 'Your Courses'}</h3>
            <Link href="/courses" className="text-sm text-blue-600 hover:underline">View all</Link>
          </div>
          {!myCourses || myCourses.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No courses yet"
                description={
                  isAdmin
                    ? 'No courses are available yet.'
                    : 'Create your first course to start teaching.'
                }
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
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {c.department?.name ? (
                            <span className="text-[11px] text-slate-500">{c.department.name}</span>
                          ) : null}
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${c.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                            {c.status}
                          </span>
                        </div>
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
        <ContinueLearning enrolledCourses={enrolledCourses} />
      )}
      {!isInstructor && dueAssignments.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {/* Compact Header */}
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-slate-500 text-[10px] uppercase tracking-wider">Assignments due</h3>
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
              {dueAssignments.length}
            </span>
          </div>

          <ul className="divide-y divide-slate-50">
            {dueAssignments.map((a) => (
              <li key={a.assignmentId}>
                <Link
                  href={`/courses/${a.courseId}/modules/${a.moduleId}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group"
                >
                  {/* Smaller, simpler icon */}
                  <div className="h-8 w-8 rounded-md bg-slate-50 flex items-center justify-center shrink-0 group-hover:bg-amber-50 transition-colors">
                    <FileText className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
                  </div>

                  {/* Content Area */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                          {a.moduleTitle}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate -mt-0.5">
                          {a.courseTitle}
                        </p>
                      </div>

                      {/* Ultra-compact Due Date */}
                      <div className="flex items-center gap-1 mt-1 sm:mt-0">
                        <Clock className="w-3 h-3 text-amber-500/70" />
                        <span className="text-[11px] font-medium text-amber-600/90 whitespace-nowrap">
                          {formatLocalDisplay(a.deadlineAt, true)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Micro Chevron */}
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
