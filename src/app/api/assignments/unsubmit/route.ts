import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { assignmentId?: string }
  try {
    body = (await request.json()) as { assignmentId?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const assignmentId = body.assignmentId?.trim()
  if (!assignmentId) {
    return NextResponse.json({ error: 'assignmentId required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const db = admin ?? supabase

  const { data: sub, error: sErr } = await db
    .from('submissions')
    .select('id, graded_at, is_turned_in')
    .eq('assignment_id', assignmentId)
    .eq('learner_id', user.id)
    .maybeSingle()

  if (sErr) {
    console.error(sErr)
    return NextResponse.json({ error: sErr.message }, { status: 500 })
  }

  if (!sub) {
    return NextResponse.json({ error: 'Nothing to unsubmit.' }, { status: 400 })
  }

  if (sub.graded_at) {
    return NextResponse.json({ error: 'Graded work cannot be unsubmitted.' }, { status: 400 })
  }

  if (!sub.is_turned_in) {
    return NextResponse.json({ error: 'Not turned in yet.' }, { status: 400 })
  }

  const { error: uErr } = await db
    .from('submissions')
    .update({
      is_turned_in: false,
      turned_in_at: null,
    })
    .eq('id', sub.id)

  if (uErr) {
    console.error(uErr)
    return NextResponse.json({ error: uErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
