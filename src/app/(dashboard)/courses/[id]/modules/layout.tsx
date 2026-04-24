import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import ModuleSidebar from './ModuleSidebar'
import ModulesDrawerShell from './ModulesDrawerShell'
import { groupModulesByWeek } from '@/lib/course-modules'
import { getLearnerModuleStatusMap } from '@/lib/learner-module-status'
import { ROLES } from '@/lib/roles'

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

  // Step 1: Run all independent queries in parallel
  const [enrollmentResult, courseResult, profileResult, modulesResult] = await Promise.all([
    supabase.from('enrollments').select('id').eq('course_id', id).eq('learner_id', user.id).maybeSingle(),
    supabase.from('courses').select('title, course_code, instructor_id').eq('id', id).single(),
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase
      .from('modules')
      .select('id, title, type, available_from, sort_order, week_index')
      .eq('course_id', id)
      .order('sort_order', { ascending: true }),
  ])

  const course = courseResult.data
  if (!course) notFound()

  const isEnrolled = !!enrollmentResult.data
  const isPreviewStaff =
    course.instructor_id === user.id || profileResult.data?.role === ROLES.ADMIN

  const modules = modulesResult.data ?? []
  const sectionGroups = groupModulesByWeek(modules)

  // Step 2: Module status RPC (depends on enrollment check + modules)
  const moduleUi =
    isEnrolled && user
      ? await getLearnerModuleStatusMap(
          supabase,
          id,
          user.id,
          modules.map((m) => ({ id: m.id, type: m.type })),
        )
      : null

  const eligibleForCompletion =
    !!moduleUi && modules.length > 0 && modules.every((m) => moduleUi[m.id]?.complete)

  // Step 3: Auto-insert course completion (depends on step 2)
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
