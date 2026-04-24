import type { ReactNode } from 'react'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  BookOpen,
  FileText,
  Clock,
  ChevronRight,
  PlusCircle,
  Pencil,
  ArrowRight,
  Flame,
} from 'lucide-react'
import { AppButton, AppCard, EmptyState, PageHeader } from '@/components/ui/primitives'
import { formatLocalDisplay } from '@/lib/timestamp'
import { ROLES, isInstructorRole } from '@/lib/roles'
import ContinueLearning from './ContinueLearning'

// ─── Types ───────────────────────────────────────────────────

/** Shape returned by the `dashboard_learner_summary_v1` RPC. */
type LearnerSummary = {
  enrolled_courses: {
    id: string
    course_code: string
    title: string
    thumbnail_url: string | null
    total_modules: number
    completed_modules: number
    progress: number
  }[]
  streak: number
  due_assignments: {
    assignment_id: string
    module_id: string
    module_title: string
    course_id: string
    course_title: string
    deadline_at: string
  }[]
}

/** Shape returned by the `dashboard_instructor_summary_v1` RPC. */
type InstructorSummary = {
  courses: {
    id: string
    course_code: string
    title: string
    status: string
    created_at: string
    enrollment_count: number
    department_name: string | null
  }[]
}

/** A single metric card displayed at the top of the dashboard. */
type MetricCard = {
  label: string
  value: number
  icon: ReactNode
  bg: string
  hint?: string
}

// ─── Coordinator Dashboard ──────────────────────────────────

function CoordinatorDashboard({ name }: { name: string }) {
  return (
    <div className="space-y-4 px-2 py-2">
      <PageHeader title={`Welcome, ${name}!`} description="Coordinator" />
      <AppCard className="p-6 space-y-3">
        <p className="text-slate-700">
          Use the below tools to manage ID card bindings, take attendance via ID card scanning, and
          grade assignments for all courses.
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

// ─── Instructor / Admin Dashboard ───────────────────────────

function InstructorDashboard({
  name,
  isAdmin,
  courses,
}: {
  name: string
  isAdmin: boolean
  courses: InstructorSummary['courses']
}) {
  const totalLearners = courses.reduce((sum, c) => sum + (c.enrollment_count ?? 0), 0)

  const metrics: MetricCard[] = [
    {
      label: isAdmin ? 'All Courses' : 'My Courses',
      value: courses.length,
      icon: <BookOpen className="w-12.5 h-12.5 text-blue-500" />,
      bg: 'bg-blue-50',
    },
    {
      label: 'Total Learners',
      value: totalLearners,
      icon: <FileText className="w-12.5 h-12.5 text-amber-500" />,
      bg: 'bg-amber-50',
    },
  ]

  return (
    <div className="space-y-4 px-2 py-4">
      <PageHeader
        title={`Welcome back, ${name}!`}
        action={
          <Link href="/admin/courses/new" className="inline-flex">
            <AppButton>
              <PlusCircle className="w-4 h-4" />
              Create Course
            </AppButton>
          </Link>
        }
      />

      {/* Metric Cards */}
      <MetricCardGrid metrics={metrics} />

      {/* Course List */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-semibold text-slate-900">
            {isAdmin ? 'All Courses' : 'Your Courses'}
          </h3>
          <Link href="/courses" className="text-sm text-blue-600 hover:underline">
            View all
          </Link>
        </div>

        {courses.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No courses yet"
              description={
                isAdmin
                  ? 'No courses are available yet.'
                  : 'Create your first course to start teaching.'
              }
              action={
                <Link
                  href="/admin/courses/new"
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  Create your first course
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {courses.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-2 px-6 py-4 hover:bg-slate-50 transition group"
              >
                <Link
                  href={`/courses/${c.id}`}
                  className="flex items-center justify-between flex-1 min-w-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-600 truncate">
                        <em className="not-italic text-slate-500 font-normal mr-1.5">
                          {c.course_code}
                        </em>
                        {c.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {c.department_name ? (
                          <span className="text-[11px] text-slate-500">{c.department_name}</span>
                        ) : null}
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                            c.status === 'published'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
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
    </div>
  )
}

// ─── Learner Dashboard ──────────────────────────────────────

function LearnerDashboard({
  name,
  summary,
}: {
  name: string
  summary: LearnerSummary
}) {
  const { enrolled_courses, streak, due_assignments } = summary

  const metrics: MetricCard[] = [
    {
      label: 'Day streak',
      value: streak,
      icon: <Flame className="w-12.5 h-12.5 text-orange-500" />,
      bg: 'bg-orange-50',
      hint: streak === 0 ? 'Complete a lesson to start' : undefined,
    },
    {
      label: 'Assignments Due',
      value: due_assignments.length,
      icon: <FileText className="w-12.5 h-12.5 text-amber-500" />,
      bg: 'bg-amber-50',
    },
  ]

  // Map RPC shape → ContinueLearning component shape
  const enrolledCourses = enrolled_courses.map((c) => ({
    id: c.id,
    course_code: c.course_code,
    title: c.title,
    thumbnail_url: c.thumbnail_url ?? undefined,
    progress: c.progress,
  }))

  return (
    <div className="space-y-4 px-2 py-4">
      <PageHeader title={`Welcome back, ${name}!`} />

      {/* Metric Cards */}
      <MetricCardGrid metrics={metrics} />

      {/* Enrolled Courses */}
      <ContinueLearning enrolledCourses={enrolledCourses} />

      {/* Due Assignments */}
      {due_assignments.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-slate-500 text-[10px] uppercase tracking-wider">
              Assignments due
            </h3>
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
              {due_assignments.length}
            </span>
          </div>

          {/* Assignment List */}
          <ul className="divide-y divide-slate-50">
            {due_assignments.map((a) => (
              <li key={a.assignment_id}>
                <Link
                  href={`/courses/${a.course_id}/modules/${a.module_id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group"
                >
                  {/* Icon */}
                  <div className="h-8 w-8 rounded-md bg-slate-50 flex items-center justify-center shrink-0 group-hover:bg-amber-50 transition-colors">
                    <FileText className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                          {a.module_title}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate -mt-0.5">
                          {a.course_title}
                        </p>
                      </div>

                      {/* Due Date */}
                      <div className="flex items-center gap-1 mt-1 sm:mt-0">
                        <Clock className="w-3 h-3 text-amber-500/70" />
                        <span className="text-[11px] font-medium text-amber-600/90 whitespace-nowrap">
                          {formatLocalDisplay(a.deadline_at, true)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Chevron */}
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

// ─── Shared: Metric Card Grid ───────────────────────────────

function MetricCardGrid({ metrics }: { metrics: MetricCard[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {metrics.map((m) => (
        <AppCard
          key={m.label}
          className="relative overflow-hidden p-5 flex flex-row justify-between gap-4 rounded-2xl"
        >
          {/* Background icon */}
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
  )
}

// ─── Page Component ─────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()

  // Step 1: Get the current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Step 2: Get the user's profile (role + name)
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? ROLES.LEARNER
  const name = profile?.full_name ?? user.email?.split('@')[0] ?? 'there'
  const isAdmin = role === ROLES.ADMIN
  const isInstructor = isInstructorRole(role)

  // ── Coordinator: simple static page ──────────────────────
  if (role === ROLES.COORDINATOR) {
    return <CoordinatorDashboard name={name} />
  }

  // ── Instructor / Admin: single RPC call ──────────────────
  if (isInstructor) {
    const { data: rpcData, error } = await supabase.rpc('dashboard_instructor_summary_v1')

    if (error) {
      console.error('[DashboardPage] instructor RPC error:', error.message)
      return <div className="p-4 text-red-600">Failed to load dashboard. Please refresh.</div>
    }

    const summary = rpcData as InstructorSummary
    return <InstructorDashboard name={name} isAdmin={isAdmin} courses={summary.courses ?? []} />
  }

  // ── Learner: single RPC call ─────────────────────────────
  const { data: rpcData, error } = await supabase.rpc('dashboard_learner_summary_v1')

  if (error) {
    console.error('[DashboardPage] learner RPC error:', error.message)
    return <div className="p-4 text-red-600">Failed to load dashboard. Please refresh.</div>
  }

  const summary = rpcData as LearnerSummary
  return <LearnerDashboard name={name} summary={summary} />
}
