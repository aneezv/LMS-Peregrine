import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { insertActivityLogs, requireUser, resolveOpenSession } from '../_helpers'

type Body = { sessionId?: string }

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

  const open = await resolveOpenSession(supabase, user.id, body.sessionId)
  if (!open) {
    return NextResponse.json({ error: 'no_open_session' }, { status: 400 })
  }

  if (open.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'must_be_active_for_break', status: open.status }, { status: 400 })
  }

  const now = new Date().toISOString()

  const { data: tick, error: rpcErr } = await supabase.rpc('internship_process_heartbeat', {
    p_session_id: open.id,
    p_now: now,
    p_tab_visible: true,
    p_on_course_page: true,
  })
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }
  const tickPayload = tick as Record<string, unknown> | null
  if (tickPayload && typeof tickPayload === 'object' && tickPayload.error) {
    return NextResponse.json({ error: String(tickPayload.error), detail: tickPayload }, { status: 400 })
  }

  const { data: session, error } = await supabase
    .from('internship_sessions')
    .update({
      status: 'ON_BREAK',
      last_tick_at: now,
      updated_at: now,
    })
    .eq('id', open.id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await insertActivityLogs(supabase, open.id, ['break_start'])

  return NextResponse.json({ session })
}
