import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import AttendanceClient, { type AttendanceCourseOption } from './AttendanceClient'
import type { SessionModuleListItem } from './types'
import { PageHeader } from '@/components/ui/primitives'
import { ROLES, isInstructorRole } from '@/lib/roles'

export default async function AttendancePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
  const role = profile?.role ?? ROLES.LEARNER
  if (!isInstructorRole(role)) {
    redirect('/unauthorized')
  }

  let coursesQuery = supabase.from('courses').select('id, title, course_code').order('title')
  if (role !== ROLES.ADMIN) {
    coursesQuery = coursesQuery.eq('instructor_id', user.id)
  }
  const { data: courses } = await coursesQuery
  const courseList = (courses ?? []) as AttendanceCourseOption[]
  const courseIds = courseList.map((c) => c.id)

  let sessionModules: SessionModuleListItem[] = []

  if (courseIds.length > 0) {
    const { data: mods } = await supabase
      .from('modules')
      .select('id, title, type, week_index, course_id, sort_order')
      .in('course_id', courseIds)
      .in('type', ['live_session', 'offline_session'])
      .order('sort_order', { ascending: true })

    const moduleIds = (mods ?? []).map((m) => m.id as string)
    const submittedSet = new Set<string>()
    if (moduleIds.length > 0) {
      const { data: roster } = await supabase
        .from('module_session_roster')
        .select('module_id, roster_submitted_at')
        .in('module_id', moduleIds)

      for (const r of roster ?? []) {
        if (r.roster_submitted_at != null) submittedSet.add(r.module_id as string)
      }
    }

    const courseMeta = new Map(courseList.map((c) => [c.id, c]))

    sessionModules = (mods ?? []).map((m) => {
      const c = courseMeta.get(m.course_id as string)
      return {
        moduleId: m.id as string,
        courseId: m.course_id as string,
        courseTitle: c?.title ?? 'Course',
        courseCode: c?.course_code ?? '',
        moduleTitle: m.title as string,
        moduleType: m.type as string,
        weekIndex: (m.week_index as number) ?? 1,
        attendanceSubmitted: submittedSet.has(m.id as string),
      }
    })
  }

  return (
    <div className="space-y-6 p-2">
      <PageHeader
        title="Session attendance"
        description="Mark attendance for live and offline sessions by course."
      />
      <AttendanceClient
        courses={courseList}
        sessionModules={sessionModules}
        currentUserId={user.id}
      />
    </div>
  )
}
