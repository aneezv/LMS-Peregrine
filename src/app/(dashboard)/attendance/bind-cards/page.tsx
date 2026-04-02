import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/primitives'
import BindCardsClient from './BindCardsClient'
import type { AttendanceCourseOption } from '../AttendanceClient'

export default async function BindOfflineIdCardsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
  const role = profile?.role ?? 'learner'
  if (role !== 'instructor' && role !== 'admin') {
    redirect('/unauthorized')
  }

  let coursesQuery = supabase.from('courses').select('id, title, course_code').order('title')
  if (role !== 'admin') {
    coursesQuery = coursesQuery.eq('instructor_id', user.id)
  }
  const { data: courses } = await coursesQuery
  const courseList = (courses ?? []) as AttendanceCourseOption[]

  return (
    <div className="space-y-6 p-2">
      <PageHeader
        title="Bind ID cards"
        description="Assign printed offline cards to enrolled learners. Binds are queued when you are offline and sync when you reconnect."
      />
      <BindCardsClient courses={courseList} isAdmin={role === 'admin'} />
    </div>
  )
}
