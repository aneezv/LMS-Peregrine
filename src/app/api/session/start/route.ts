import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import {
  getOpenSessionForCourse,
  insertActivityLogs,
  isUuid,
  requireUser,
} from '../_helpers'

type Body = { courseId?: string }

export async function POST(req: Request) {
  const supabase = await createClient()
  const user = await requireUser(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    body = {}
  }

  const courseId = typeof body.courseId === 'string' ? body.courseId.trim() : ''
  if (!courseId || !isUuid(courseId)) {
    return NextResponse.json({ error: 'courseId required' }, { status: 400 })
  }

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('course_id')
    .eq('course_id', courseId)
    .eq('learner_id', user.id)
    .maybeSingle()

  if (!enrollment) {
    return NextResponse.json({ error: 'not_enrolled' }, { status: 403 })
  }

  const existing = await getOpenSessionForCourse(supabase, user.id, courseId)
  if (existing) {
    return NextResponse.json(
      {
        error: 'already_has_open_session',
        session: existing,
      },
      { status: 409 },
    )
  }

  const now = new Date().toISOString()
  const { data: session, error } = await supabase
    .from('internship_sessions')
    .insert({
      user_id: user.id,
      course_id: courseId,
      start_time: now,
      last_tick_at: now,
      status: 'ACTIVE',
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await insertActivityLogs(supabase, session.id as string, ['session_start'])

  return NextResponse.json({ session })
}
