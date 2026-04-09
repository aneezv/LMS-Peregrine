import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { isUuid, requireUser } from '../_helpers'
import { MAX_DAILY_ACTIVE_SECONDS } from '@/lib/internship/constants'
import { ROLES, isInstructorRole } from '@/lib/roles'

function parseDate(s: string | null, fallback: Date): Date {
  if (!s) return fallback
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? fallback : d
}

type SessionRow = {
  id: string
  user_id: string
  course_id: string | null
  course_code?: string | null
  course_title?: string | null
  start_time: string
  end_time: string | null
  active_seconds: number
  break_seconds: number
  status: string
  had_inactivity_auto: boolean
  profiles?: { full_name?: string | null } | null
}

const SESSION_SELECT = `
  id,
  user_id,
  course_id,
  start_time,
  end_time,
  active_seconds,
  break_seconds,
  status,
  had_inactivity_auto,
  profiles ( full_name )
`

function overlapsWindow(row: SessionRow, fromMs: number, toMs: number): boolean {
  const start = new Date(row.start_time as string).getTime()
  if (start > toMs) return false
  if (row.end_time == null) return true
  const end = new Date(row.end_time).getTime()
  return end >= fromMs
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const user = await requireUser(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? ROLES.LEARNER
  if (!isInstructorRole(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const toParam = url.searchParams.get('to')
  const fromParam = url.searchParams.get('from')
  const to = parseDate(toParam, new Date())
  const from = parseDate(fromParam, new Date(to.getTime() - 7 * 86400000))

  if (from.getTime() > to.getTime()) {
    return NextResponse.json({ error: 'from must be before to' }, { status: 400 })
  }

  const fromIso = from.toISOString()
  const toIso = to.toISOString()
  const fromMs = from.getTime()
  const toMs = to.getTime()

  const userIdParam = url.searchParams.get('userId')?.trim() ?? ''
  const filterUserId = userIdParam && isUuid(userIdParam) ? userIdParam : null

  const courseIdParam = url.searchParams.get('courseId')?.trim() ?? ''
  const filterCourseId = courseIdParam && isUuid(courseIdParam) ? courseIdParam : null

  const { data: rawSessions, error: sErr } = await supabase
    .from('internship_sessions')
    .select(SESSION_SELECT)
    .lte('start_time', toIso)
    .order('start_time', { ascending: false })
    .limit(1500)

  if (sErr) {
    return NextResponse.json({ error: sErr.message }, { status: 500 })
  }

  const overlapping = ((rawSessions ?? []) as SessionRow[]).filter((r) => overlapsWindow(r, fromMs, toMs))

  const learnerOptsMap = new Map<string, string>()
  for (const r of overlapping) {
    const uid = r.user_id as string
    const name = (r.profiles as { full_name?: string | null } | null)?.full_name ?? uid
    learnerOptsMap.set(uid, name)
  }

  const learnerOptions = [...learnerOptsMap.entries()]
    .map(([userId, name]) => ({ userId, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  let rows = overlapping
  if (filterUserId) {
    rows = rows.filter((r) => r.user_id === filterUserId)
  }
  const rowsForCourseOptions = rows
  if (filterCourseId) {
    rows = rows.filter((r) => r.course_id === filterCourseId)
  }

  // Enrich sessions with course titles for the admin UI.
  const courseIds = [
    ...new Set(
      rowsForCourseOptions.map((r) => r.course_id).filter((id): id is string => Boolean(id)),
    ),
  ]
  const courseCodeById = new Map<string, string>()
  if (courseIds.length > 0) {
    const { data: courses, error: cErr } = await supabase
      .from('courses')
      .select('id, course_code')
      .in('id', courseIds)
    if (!cErr && courses) {
      for (const c of courses) {
        if (c?.id) courseCodeById.set(c.id, (c as any).course_code ?? '')
      }
    }
  }

  const courseOptions = courseIds
    .map((courseId) => {
      const label = courseCodeById.get(courseId) ?? courseId
      return { courseId, label }
    })
    .sort((a, b) => a.label.localeCompare(b.label))

  rows = rows.map((r) => ({
    ...r,
    course_code: r.course_id ? courseCodeById.get(r.course_id) ?? null : null,
  }))

  type Rollup = {
    userId: string
    name: string
    onlineSeconds: number
    breakSeconds: number
    sessionCount: number
    inactivityFlags: number
  }

  const byUser = new Map<string, Rollup>()
  for (const r of rows) {
    const uid = r.user_id as string
    const name = (r.profiles as { full_name?: string | null } | null)?.full_name ?? uid
    const cur = byUser.get(uid) ?? {
      userId: uid,
      name,
      onlineSeconds: 0,
      breakSeconds: 0,
      sessionCount: 0,
      inactivityFlags: 0,
    }
    cur.onlineSeconds += (r.active_seconds as number) ?? 0
    cur.breakSeconds += (r.break_seconds as number) ?? 0
    cur.sessionCount += 1
    if (r.had_inactivity_auto) cur.inactivityFlags += 1
    byUser.set(uid, cur)
  }

  type DayUser = {
    date: string
    userId: string
    name: string
    onlineSeconds: number
    breakSeconds: number
    sessionCount: number
    inactivityFlags: number
  }

  const dayUserMap = new Map<string, DayUser>()
  for (const r of rows) {
    const d = (r.start_time as string).slice(0, 10)
    const uid = r.user_id as string
    const name = (r.profiles as { full_name?: string | null } | null)?.full_name ?? uid
    const key = `${d}|${uid}`
    const cur = dayUserMap.get(key) ?? {
      date: d,
      userId: uid,
      name,
      onlineSeconds: 0,
      breakSeconds: 0,
      sessionCount: 0,
      inactivityFlags: 0,
    }
    cur.onlineSeconds += (r.active_seconds as number) ?? 0
    cur.breakSeconds += (r.break_seconds as number) ?? 0
    cur.sessionCount += 1
    if (r.had_inactivity_auto) cur.inactivityFlags += 1
    dayUserMap.set(key, cur)
  }

  const dailyByUser = [...dayUserMap.values()].sort((a, b) => {
    const c = b.date.localeCompare(a.date)
    return c !== 0 ? c : a.name.localeCompare(b.name)
  })

  const dailyMap = new Map<
    string,
    { date: string; onlineSeconds: number; sessions: number; uniqueLearners: Set<string> }
  >()
  for (const r of rows) {
    const d = (r.start_time as string).slice(0, 10)
    const x = dailyMap.get(d) ?? { date: d, onlineSeconds: 0, sessions: 0, uniqueLearners: new Set<string>() }
    x.onlineSeconds += (r.active_seconds as number) ?? 0
    x.sessions += 1
    x.uniqueLearners.add(r.user_id as string)
    dailyMap.set(d, x)
  }

  const dailySummary = [...dailyMap.values()]
    .map(({ date, onlineSeconds, sessions, uniqueLearners }) => ({
      date,
      onlineSeconds,
      sessions,
      uniqueLearners: uniqueLearners.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const sessionIds = rows.map((r) => r.id as string)
  const { data: logs } =
    sessionIds.length === 0
      ? { data: [] as { session_id: string; event_type: string; logged_at: string }[] }
      : await supabase
          .from('internship_activity_logs')
          .select('session_id, event_type, logged_at')
          .in('session_id', sessionIds)
          .order('logged_at', { ascending: false })
          .limit(2000)

  const uniqueLearnersInResults = new Set(rows.map((r) => r.user_id as string)).size

  return NextResponse.json({
    from: fromIso,
    to: toIso,
    filterUserId,
    filterCourseId,
    maxDailyCreditSeconds: MAX_DAILY_ACTIVE_SECONDS,
    learnerOptions,
    courseOptions,
    uniqueLearnersInResults,
    sessions: rows,
    activityLogs: logs ?? [],
    rollup: [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name)),
    dailySummary,
    dailyByUser,
  })
}
