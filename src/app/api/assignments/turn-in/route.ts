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
    .select('id, graded_at, file_url, is_turned_in, is_passed')
    .eq('assignment_id', assignmentId)
    .eq('learner_id', user.id)
    .maybeSingle()

  if (sErr) {
    console.error(sErr)
    return NextResponse.json({ error: sErr.message }, { status: 500 })
  }

  if (!sub) {
    return NextResponse.json({ error: 'Add at least one file before turning in.' }, { status: 400 })
  }

  if (sub.graded_at && sub.is_passed) {
    return NextResponse.json({ error: 'Already graded.' }, { status: 400 })
  }

  if (sub.is_turned_in) {
    return NextResponse.json({ error: 'Already turned in.' }, { status: 400 })
  }

  const { count } = await db
    .from('submission_files')
    .select('*', { count: 'exact', head: true })
    .eq('submission_id', sub.id)

  const hasFiles = (count ?? 0) > 0 || !!sub.file_url
  if (!hasFiles) {
    return NextResponse.json({ error: 'Add at least one file before turning in.' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { error: uErr } = await db
    .from('submissions')
    .update({
      is_turned_in: true,
      turned_in_at: now,
      submitted_at: now,
    })
    .eq('id', sub.id)

  if (uErr) {
    console.error(uErr)
    return NextResponse.json({ error: uErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, turnedInAt: now })
}
