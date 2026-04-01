import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import {
  BookOpen,
  Lock,
  CalendarDays,
  FileText,
  Video,
  ChevronRight,
  MapPin,
  Check,
  ListChecks,
  MessageSquare,
  ExternalLink,
  Info,
} from 'lucide-react'
import Link from 'next/link'
import EnrollButton from '@/components/EnrollButton'
import CourseManageBar from '@/components/CourseManageBar'
import { groupModulesByWeek } from '@/lib/course-modules'
import { getLearnerModuleStatusMap } from '@/lib/learner-module-status'
import { toRenderableImageUrl } from '@/lib/drive-image'

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch course + instructor
  const { data: course } = await supabase
    .from('courses')
    .select(`
      id, instructor_id, course_code, title, description, thumbnail_url, starts_at, enrollment_type,
      profiles:instructor_id ( full_name )
    `)
    .eq('id', id)
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
  const canManageCourse = isCourseInstructor || isAdmin

  const { data: modules } = await supabase
    .from('modules')
    .select('id, title, type, available_from, is_sequential, sort_order, week_index')
    .eq('course_id', id)
    .order('sort_order', { ascending: true })

  // Check enrollment
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('course_id', id)
    .eq('learner_id', user.id)
    .maybeSingle()

  const isEnrolled = !!enrollment

  if (course.enrollment_type === 'invite_only' && !isCourseStaff && !isEnrolled) {
    redirect('/courses')
  }

  const sectionGroups = groupModulesByWeek(modules ?? [])

  const moduleUi = isEnrolled
    ? await getLearnerModuleStatusMap(
        supabase,
        id,
        user.id,
        (modules ?? []).map((m) => ({ id: m.id, type: m.type })),
      )
    : null

  const totalModules = modules?.length ?? 0

  const eligibleForCompletion =
    !!moduleUi && (modules ?? []).length > 0 && (modules ?? []).every((m) => moduleUi[m.id]?.complete)

  const completedModules = moduleUi
    ? (modules ?? []).reduce((acc, m) => acc + (moduleUi[m.id]?.complete ? 1 : 0), 0)
    : 0

  const completionPct = totalModules > 0 ? Math.round((completedModules * 100) / totalModules) : 0

  let completionRow = isEnrolled
    ? (
        await supabase
          .from('course_completions')
          .select('completed_at')
          .eq('course_id', id)
          .eq('learner_id', user.id)
          .maybeSingle()
      ).data
    : null

  if (isEnrolled && eligibleForCompletion && !completionRow?.completed_at) {
    await supabase.from('course_completions').insert({
      course_id: id,
      learner_id: user.id,
    })
    completionRow = { completed_at: new Date().toISOString() }
  }

  const completedInternship = !!completionRow?.completed_at

  const now = new Date()

  const moduleIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video className="w-4 h-4 text-blue-500" />
      case 'assignment': return <FileText className="w-4 h-4 text-green-500" />
      case 'live_session': return <CalendarDays className="w-4 h-4 text-purple-500" />
      case 'offline_session': return <MapPin className="w-4 h-4 text-amber-500" />
      case 'mcq': return <ListChecks className="w-4 h-4 text-cyan-600" />
      case 'feedback': return <MessageSquare className="w-4 h-4 text-rose-500" />
      case 'external_resource': return <ExternalLink className="w-4 h-4 text-indigo-500" />
      default: return <BookOpen className="w-4 h-4 text-slate-400" />
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-2">
      {/* Header Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {course.thumbnail_url && (
          <div className="relative">
            <img
              src={toRenderableImageUrl(course.thumbnail_url)}
              alt=""
              className="h-44 w-full object-cover sm:h-56"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/35 to-transparent" />
          </div>
        )}

        <div className="space-y-5 p-5 sm:space-y-6 sm:p-8">
          <div className="space-y-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{course.title}</h1>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                Code: {course.course_code}
              </span>
              <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                {totalModules} lesson{totalModules !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {course.starts_at && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Starts</p>
                <p className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-slate-800">
                  <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden />
                  {new Date(course.starts_at).toLocaleString()}
                </p>
              </div>
            )}
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Instructor</p>
              <p className="mt-1 text-sm font-medium text-slate-800">
                {(course.profiles as any)?.full_name ?? 'Unknown'}
              </p>
            </div>
          </div>

          {course.description && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm leading-relaxed text-slate-600">{course.description}</p>
            </div>
          )}

          {isEnrolled && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p className="font-semibold text-slate-800">Progress</p>
                <p className="text-slate-600">
                  <span className="font-semibold text-slate-900">{completedModules}</span>/{totalModules}{' '}
                  lessons complete
                </p>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${completionPct}%` }}
                  aria-hidden
                />
              </div>
              <p className="text-xs text-slate-500">{completionPct}% complete</p>

              {(completedInternship || eligibleForCompletion) && (
                <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                  <Check className="h-4 w-4" aria-hidden />
                  You completed the internship
                </div>
              )}
            </div>
          )}

          {!isCourseStaff && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {isEnrolled ? (
                <span className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700">
                  ✓ You are enrolled
                </span>
              ) : (
                <EnrollButton courseId={id} />
              )}
            </div>
          )}

          {isCourseStaff && (
            <div className="flex justify-end">
              <p className="flex flex-row items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              <Info className="w-4 h-4 text-amber-500" />
                  <strong>Preview</strong>
              </p>
            </div>
          )}

          {canManageCourse && <CourseManageBar courseId={id} />}
        </div>
      </div>

      {/* Syllabus Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-8 sm:py-5">
          <h2 className="text-xl font-semibold text-slate-800">Course Syllabus</h2>
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
            {sectionGroups.length} week{sectionGroups.length === 1 ? '' : 's'}
          </span>
        </div>

        {sectionGroups.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <BookOpen className="mx-auto h-10 w-10 mb-3 text-slate-300" />
            <p>No lessons have been added yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sectionGroups.map((section) => (
              <section key={section.id} className="space-y-3 px-5 py-4 sm:px-8 sm:py-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    {section.title}
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {section.mods.length} lesson{section.mods.length === 1 ? '' : 's'}
                  </span>
                </div>

                {section.mods.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    No lessons in this week.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {section.mods.map((mod: any) => {
                      const isTimeLocked =
                        mod.available_from && new Date(mod.available_from) > now
                      const learnerBlocked =
                        !isEnrolled || isTimeLocked
                      const ui = moduleUi?.[mod.id]

                      if (isCourseStaff) {
                        return (
                          <Link
                            key={mod.id}
                            href={`/courses/${id}/modules/${mod.id}`}
                            className="group flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 transition hover:border-amber-300 hover:bg-amber-50 sm:flex-row sm:items-center sm:gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {moduleIcon(mod.type)}
                              <span className="flex-1 text-sm font-medium text-slate-800 group-hover:text-amber-900 truncate">
                                {mod.title}
                              </span>
                              {ui?.complete && (
                                <span
                                  className="text-emerald-600 shrink-0"
                                  title="Your progress: completed"
                                  aria-label="Completed"
                                >
                                  <Check className="w-4 h-4" />
                                </span>
                              )}
                              {ui?.overdue && !ui?.complete && (
                                <span className="text-xs font-medium text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">
                                  Overdue
                                </span>
                              )}
                              <ChevronRight className="w-4 h-4 text-amber-400 group-hover:text-amber-600 flex-shrink-0 hidden sm:block" />
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pl-7 text-xs text-slate-600 sm:pl-0">
                              {isTimeLocked && (
                                <span className="inline-flex items-center gap-1 text-slate-600">
                                  <Lock className="w-3 h-3" />
                                  Learners locked until{' '}
                                  {new Date(mod.available_from).toLocaleString()}
                                </span>
                              )}
                              {!isTimeLocked && !isEnrolled && (
                                <span className="inline-flex items-center gap-1 text-slate-600">
                                  <Lock className="w-3 h-3" />
                                  Learners need to enroll
                                </span>
                              )}
                              {!isTimeLocked && isEnrolled && (
                                <span className="text-slate-500">Learners can open this</span>
                              )}
                            </div>
                          </Link>
                        )
                      }

                      return learnerBlocked ? (
                        <div
                          key={mod.id}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                        >
                          {moduleIcon(mod.type)}
                          <span className="flex-1 text-sm text-slate-400 truncate">{mod.title}</span>
                          <Lock className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                          {isTimeLocked && (
                            <span className="text-xs text-slate-400 flex-shrink-0">
                              Unlocks {new Date(mod.available_from).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Link
                          key={mod.id}
                          href={`/courses/${id}/modules/${mod.id}`}
                          className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-blue-300 hover:bg-blue-50"
                        >
                          {moduleIcon(mod.type)}
                          <span className="flex-1 text-sm font-medium text-slate-700 group-hover:text-blue-700 truncate">
                            {mod.title}
                          </span>
                          {ui?.complete && (
                            <span className="text-emerald-600 shrink-0" title="Completed" aria-label="Completed">
                              <Check className="w-4 h-4" />
                            </span>
                          )}
                          {ui?.overdue && !ui?.complete && (
                            <span className="text-xs font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">
                              Overdue
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 flex-shrink-0" />
                        </Link>
                      )
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
