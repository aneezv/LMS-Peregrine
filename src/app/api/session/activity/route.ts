import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { insertActivityLogs, requireUser, resolveOpenSession } from '../_helpers'
import { MAX_DAILY_ACTIVE_SECONDS } from '@/lib/internship/constants'

type Body = {
  sessionId?: string
  tabVisible?: boolean
  onCoursePage?: boolean
  events?: { type: string }[]
  clientInactivity?: boolean
  pingChallenge?: boolean
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const user = await requireUser(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    body = {}
  }

  const tabVisible = body.tabVisible !== false
  const onCoursePage = body.onCoursePage !== false

  const open = await resolveOpenSession(supabase, user.id, body.sessionId)

  if (!open) {
    return NextResponse.json({ error: 'no_open_session' }, { status: 400 })
  }

  const sessionId = open.id as string

  if (body.clientInactivity) {
    if (open.status === 'ACTIVE') {
      const now = new Date().toISOString()
      const { error: updErr } = await supabase
        .from('internship_sessions')
        .update({
          status: 'INACTIVE_AUTO',
          had_inactivity_auto: true,
          last_tick_at: now,
          updated_at: now,
        })
        .eq('id', sessionId)
        .eq('user_id', user.id)

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 })
      }

      await insertActivityLogs(supabase, sessionId, ['inactivity_detected'])
    }

    const { data: fresh } = await supabase
      .from('internship_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    const dayUtc = new Date().toISOString().slice(0, 10)
    const courseIdForDaily = fresh.course_id ?? open.course_id ?? null

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

    return NextResponse.json({
      session: fresh,
      tick: { client_inactive: true },
      dailyActiveSeconds,
      dailyRemainingActive: Math.max(0, MAX_DAILY_ACTIVE_SECONDS - dailyActiveSeconds),
    })
  }

  if (body.pingChallenge) {
    await insertActivityLogs(supabase, sessionId, ['ping_challenge_ok'])
    const { data: fresh } = await supabase
      .from('internship_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
    const dayUtc = new Date().toISOString().slice(0, 10)
    const courseIdForDaily = fresh.course_id ?? open.course_id ?? null

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
    return NextResponse.json({
      session: fresh,
      tick: { ping: true },
      dailyActiveSeconds,
      dailyRemainingActive: Math.max(0, MAX_DAILY_ACTIVE_SECONDS - dailyActiveSeconds),
    })
  }

  const now = new Date().toISOString()
  const { data: tick, error: rpcErr } = await supabase.rpc('internship_process_heartbeat', {
    p_session_id: sessionId,
    p_now: now,
    p_tab_visible: tabVisible,
    p_on_course_page: onCoursePage,
  })

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }

  const payload = tick as Record<string, unknown> | null
  if (payload && typeof payload === 'object' && payload.error) {
    return NextResponse.json({ error: String(payload.error), detail: payload }, { status: 400 })
  }

  const eventTypes = ['heartbeat', ...(body.events ?? []).map((e) => e.type)]
  await insertActivityLogs(supabase, sessionId, eventTypes)

  const { data: fresh } = await supabase
    .from('internship_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  const dayUtc = new Date().toISOString().slice(0, 10)
  const courseIdForDaily = fresh.course_id ?? open.course_id ?? null

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

  return NextResponse.json({
    session: fresh,
    tick: payload,
    dailyActiveSeconds,
    dailyRemainingActive: Math.max(0, MAX_DAILY_ACTIVE_SECONDS - dailyActiveSeconds),
  })
}
