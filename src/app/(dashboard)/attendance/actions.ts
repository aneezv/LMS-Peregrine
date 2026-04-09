'use server'

import { createClient } from '@/utils/supabase/server'
import { ensureSessionRosterRows } from '@/lib/ensure-session-roster'
import type { RosterRow } from './SessionAttendanceClient'
import { ROLES, isInstructorRole } from '@/lib/roles'

export async function prepareSessionRoster(courseId: string, moduleId: string): Promise<{ rows: RosterRow[] } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role ?? ROLES.LEARNER
  if (!isInstructorRole(role)) return { error: 'Forbidden' }

  const { data: course } = await supabase.from('courses').select('instructor_id').eq('id', courseId).single()
  if (!course) return { error: 'Course not found' }
  if (role !== ROLES.ADMIN && course.instructor_id !== user.id) return { error: 'Forbidden' }

  const { data: mod } = await supabase
    .from('modules')
    .select('id, type')
    .eq('id', moduleId)
    .eq('course_id', courseId)
    .single()
  if (!mod || (mod.type !== 'live_session' && mod.type !== 'offline_session')) {
    return { error: 'Invalid session lesson' }
  }

  const ensured = await ensureSessionRosterRows(supabase, moduleId, courseId)
  if (ensured.error) return { error: ensured.error }

  const { data: roster, error: rErr } = await supabase
    .from('module_session_roster')
    .select('id, learner_id, is_present, roster_submitted_at, updated_at')
    .eq('module_id', moduleId)
    .order('learner_id')

  if (rErr) return { error: rErr.message }

  const learnerIds = (roster ?? []).map((r) => r.learner_id as string)
  const { data: profs } =
    learnerIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', learnerIds)
      : { data: [] as { id: string; full_name: string | null }[] }

  const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name]))

  const rows: RosterRow[] = (roster ?? []).map((r) => ({
    id: r.id as string,
    learner_id: r.learner_id as string,
    learner_name: nameById.get(r.learner_id as string) ?? null,
    is_present: r.is_present as boolean,
    roster_submitted_at: (r.roster_submitted_at as string | null) ?? null,
    updated_at: (r.updated_at as string | null) ?? null,
  }))

  return { rows }
}
