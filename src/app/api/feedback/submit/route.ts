import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

type Body = { moduleId?: string; body?: string }

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const moduleId = body.moduleId?.trim()
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!moduleId) {
    return NextResponse.json({ error: 'moduleId required' }, { status: 400 })
  }
  if (!text) {
    return NextResponse.json({ error: 'Feedback text required' }, { status: 400 })
  }

  const { data: mod, error: modErr } = await supabase
    .from('modules')
    .select('id, type, course_id')
    .eq('id', moduleId)
    .single()

  if (modErr || !mod || mod.type !== 'feedback') {
    return NextResponse.json({ error: 'Module not found or not feedback' }, { status: 404 })
  }

  const { data: enr } = await supabase
    .from('enrollments')
    .select('id')
    .eq('course_id', mod.course_id)
    .eq('learner_id', user.id)
    .maybeSingle()

  if (!enr) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 403 })
  }

  const { data: existing } = await supabase
    .from('module_feedback_submissions')
    .select('id')
    .eq('module_id', moduleId)
    .eq('learner_id', user.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Feedback already submitted' }, { status: 409 })
  }

  const { error: insErr } = await supabase.from('module_feedback_submissions').insert({
    module_id: moduleId,
    learner_id: user.id,
    body: text,
  })

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
