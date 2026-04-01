import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const runtime = 'nodejs'

/** Learner: current submission + files for an assignment (for Assignment UI). */
export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const assignmentId = searchParams.get('assignmentId')?.trim()
  if (!assignmentId) {
    return NextResponse.json({ error: 'assignmentId required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const db = admin ?? supabase

  const { data: sub, error: subErr } = await db
    .from('submissions')
    .select(
      'id, file_url, drive_file_id, assignment_id, is_turned_in, turned_in_at, submitted_at, score, feedback, graded_at, is_passed',
    )
    .eq('assignment_id', assignmentId)
    .eq('learner_id', user.id)
    .maybeSingle()

  if (subErr) {
    console.error(subErr)
    return NextResponse.json({ error: subErr.message }, { status: 500 })
  }

  if (!sub) {
    return NextResponse.json({ submission: null, files: [] })
  }

  const { data: asn } = await db
    .from('assignments')
    .select('max_score, passing_score')
    .eq('id', sub.assignment_id)
    .maybeSingle()

  const { data: files, error: fErr } = await db
    .from('submission_files')
    .select('id, file_url, drive_file_id, original_name, created_at, sort_order')
    .eq('submission_id', sub.id)
    .order('sort_order', { ascending: true })

  if (fErr) {
    console.error(fErr)
    return NextResponse.json({ error: fErr.message }, { status: 500 })
  }

  const list = files ?? []
  const legacy =
    sub.file_url && list.length === 0
      ? [
          {
            id: 'legacy',
            file_url: sub.file_url,
            drive_file_id: sub.drive_file_id ?? null,
            original_name: 'Submission',
            created_at: sub.submitted_at,
            sort_order: 0,
          },
        ]
      : []

  const merged = list.length > 0 ? list : legacy

  return NextResponse.json({
    submission: {
      id: sub.id,
      isTurnedIn: sub.is_turned_in,
      turnedInAt: sub.turned_in_at,
      submittedAt: sub.submitted_at,
      score: sub.score,
      feedback: sub.feedback,
      gradedAt: sub.graded_at,
      isPassed: sub.is_passed,
      maxScore: asn?.max_score ?? null,
      passingScore: asn?.passing_score ?? null,
    },
    files: merged,
  })
}
