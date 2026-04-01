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

  if (open.status === 'ENDED') {
    return NextResponse.json({ error: 'session_ended' }, { status: 400 })
  }

  if (open.status === 'ACTIVE') {
    return NextResponse.json({ session: open, noop: true })
  }

  if (open.status !== 'ON_BREAK' && open.status !== 'INACTIVE_AUTO') {
    return NextResponse.json({ error: 'nothing_to_resume', status: open.status }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data: session, error } = await supabase
    .from('internship_sessions')
    .update({
      status: 'ACTIVE',
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

  await insertActivityLogs(supabase, open.id, ['resume'])

  return NextResponse.json({ session })
}
