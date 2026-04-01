import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { listOpenSessions, isUuid, requireUser, type InternshipSessionRow } from '../_helpers'
import { MAX_DAILY_ACTIVE_SECONDS } from '@/lib/internship/constants'

export async function GET(req: Request) {
  const supabase = await createClient()
  const user = await requireUser(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const courseParam = url.searchParams.get('courseId')?.trim() ?? ''
  const filterCourseId = courseParam && isUuid(courseParam) ? courseParam : null

  const sessions = await listOpenSessions(supabase, user.id)

  // Enrich sessions with course titles for better UX in the floating widget.
  // We do this with a secondary query so we don't need a DB join in every helper.
  const courseIds = [...new Set((sessions ?? []).map((s) => s.course_id).filter((id): id is string => Boolean(id)))]
  const titlesById = new Map<string, string>()
  if (courseIds.length > 0) {
    const { data: courses, error: cErr } = await supabase
      .from('courses')
      .select('id, title')
      .in('id', courseIds)
    if (!cErr && courses) {
      for (const c of courses) {
        if (c?.id) titlesById.set(c.id, (c as any).title ?? '')
      }
    }
  }

  type SessionWithTitle = InternshipSessionRow & { course_title: string | null }
  const sessionsWithTitle = (sessions ?? []).map((s) => {
    const courseTitle = s.course_id ? titlesById.get(s.course_id) ?? null : null
    return { ...s, course_title: courseTitle } as SessionWithTitle
  })

  let session: SessionWithTitle | null = sessionsWithTitle[0] ?? null
  if (filterCourseId) {
    session = sessionsWithTitle.find((s) => s.course_id === filterCourseId) ?? null
  }

  const dayUtc = new Date().toISOString().slice(0, 10)
  const courseIdForDaily = filterCourseId ?? session?.course_id ?? null

  let dailyActiveSeconds = 0
  if (courseIdForDaily) {
    const { data: dailyRow } = await supabase
      .from('internship_daily_activity_course')
      .select('active_seconds')
      .eq('user_id', user.id)
      .eq('course_id', courseIdForDaily)
      .eq('day_utc', dayUtc)
      .maybeSingle()
    dailyActiveSeconds = (dailyRow?.active_seconds as number | undefined) ?? 0
  } else {
    const { data: dailyRow } = await supabase
      .from('internship_daily_activity')
      .select('active_seconds')
      .eq('user_id', user.id)
      .eq('day_utc', dayUtc)
      .maybeSingle()
    dailyActiveSeconds = (dailyRow?.active_seconds as number | undefined) ?? 0
  }

  const dailyRemainingActive = Math.max(0, MAX_DAILY_ACTIVE_SECONDS - dailyActiveSeconds)

  return NextResponse.json({
    session,
    sessions: sessionsWithTitle,
    dailyActiveSeconds,
    dailyRemainingActive,
    maxDailyActiveSeconds: MAX_DAILY_ACTIVE_SECONDS,
  })
}
