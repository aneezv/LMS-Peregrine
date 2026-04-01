import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import ModuleSidebar from './ModuleSidebar'
import ModulesDrawerShell from './ModulesDrawerShell'
import { groupModulesByWeek } from '@/lib/course-modules'
import { getLearnerModuleStatusMap } from '@/lib/learner-module-status'

export default async function ModulesLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('course_id', id)
    .eq('learner_id', user.id)
    .maybeSingle()

  const isEnrolled = !!enrollment

  const { data: course } = await supabase
    .from('courses')
    .select('title, course_code, instructor_id')
    .eq('id', id)
    .single()

  if (!course) notFound()

  const { data: viewerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const isPreviewStaff =
    course.instructor_id === user.id || viewerProfile?.role === 'admin'

  const { data: modules } = await supabase
    .from('modules')
    .select('id, title, type, available_from, sort_order, week_index')
    .eq('course_id', id)
    .order('sort_order', { ascending: true })

  const sectionGroups = groupModulesByWeek(modules ?? [])

  const moduleUi =
    isEnrolled && user
      ? await getLearnerModuleStatusMap(
          supabase,
          id,
          user.id,
          (modules ?? []).map((m) => ({ id: m.id, type: m.type })),
        )
      : null

  const eligibleForCompletion =
    !!moduleUi && (modules ?? []).length > 0 && (modules ?? []).every((m) => moduleUi[m.id]?.complete)

  if (isEnrolled && eligibleForCompletion) {
    const existing = (
      await supabase
        .from('course_completions')
        .select('id')
        .eq('course_id', id)
        .eq('learner_id', user.id)
        .maybeSingle()
    ).data

    if (!existing) {
      await supabase.from('course_completions').insert({
        course_id: id,
        learner_id: user.id,
      })
    }
  }

  return (
    <ModulesDrawerShell
      sidebar={
        <ModuleSidebar
          courseId={id}
          courseTitle={course.title}
          courseCode={course.course_code}
          sectionGroups={sectionGroups}
          isEnrolled={isEnrolled}
          isPreviewStaff={isPreviewStaff}
          moduleUi={moduleUi}
          courseCompleted={eligibleForCompletion}
        />
      }
    >
      {children}
    </ModulesDrawerShell>
  )
}
