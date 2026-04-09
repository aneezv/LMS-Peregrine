import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/primitives'
import AttendanceReportClient from './AttendanceReportClient'
import type { AttendanceReportCourseOption } from './types'
import { ROLES, isInstructorRole } from '@/lib/roles'

export default async function AttendanceReportPage() {
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
  if (!isInstructorRole(role)) {
    redirect('/unauthorized')
  }

  let coursesQuery = supabase.from('courses').select('id, title, course_code').order('title')
  if (role !== ROLES.ADMIN) {
    coursesQuery = coursesQuery.eq('instructor_id', user.id)
  }
  const { data: courses } = await coursesQuery

  return (
    <div className="space-y-6 p-2">
      <PageHeader
        title="Attendance report"
        description="Filter attendance by course, session type, submission date, learner, and presence."
      />
      <AttendanceReportClient courses={(courses ?? []) as AttendanceReportCourseOption[]} />
    </div>
  )
}

