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

  const now = new Date().toISOString()

  if (open.status === 'ACTIVE' || open.status === 'ON_BREAK') {
    const { data: tick, error: rpcErr } = await supabase.rpc('internship_process_heartbeat', {
      p_session_id: open.id,
      p_now: now,
      p_tab_visible: true,
      p_on_course_page: true,
    })
    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 500 })
    }
    const payload = tick as { error?: string } | null
    if (payload && typeof payload === 'object' && 'error' in payload && payload.error === 'session_ended') {
      // ignore
    }
  }

  const { data: session, error } = await supabase
    .from('internship_sessions')
    .update({
      status: 'ENDED',
      end_time: now,
      updated_at: now,
    })
    .eq('id', open.id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await insertActivityLogs(supabase, open.id, ['session_end'])

  return NextResponse.json({ session })
}
