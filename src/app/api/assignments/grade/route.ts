import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const runtime = 'nodejs'

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = me?.role ?? 'learner'
  if (role !== 'instructor' && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { submissionId?: string; score?: number; feedback?: string | null }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const submissionId = body.submissionId?.trim()
  if (!submissionId) {
    return NextResponse.json({ error: 'submissionId required' }, { status: 400 })
  }

  if (typeof body.score !== 'number' || Number.isNaN(body.score) || body.score < 0) {
    return NextResponse.json({ error: 'Valid score required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const db = admin ?? supabase

  const { data: sub, error: sErr } = await db
    .from('submissions')
    .select('assignment_id')
    .eq('id', submissionId)
    .maybeSingle()

  if (sErr || !sub) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  const { data: asn, error: aErr } = await db
    .from('assignments')
    .select('max_score, passing_score, module_id')
    .eq('id', sub.assignment_id)
    .single()

  if (aErr || !asn) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  const { data: mod, error: mErr } = await db
    .from('modules')
    .select('course_id')
    .eq('id', asn.module_id)
    .single()

  if (mErr || !mod) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  const { data: course, error: cErr } = await db
    .from('courses')
    .select('instructor_id')
    .eq('id', mod.course_id)
    .single()

  if (cErr || !course) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  }

  if (role !== 'admin' && course.instructor_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const maxScore = asn.max_score ?? 100
  const passing = asn.passing_score ?? 60

  if (body.score > maxScore) {
    return NextResponse.json({ error: `Score cannot exceed ${maxScore}` }, { status: 400 })
  }

  const now = new Date().toISOString()
  const isPassed = body.score >= passing

  const { error: uErr } = await db
    .from('submissions')
    .update({
      score: Math.round(body.score),
      feedback: body.feedback ?? null,
      graded_at: now,
      is_passed: isPassed,
    })
    .eq('id', submissionId)

  if (uErr) {
    console.error(uErr)
    return NextResponse.json({ error: uErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, gradedAt: now, isPassed })
}
