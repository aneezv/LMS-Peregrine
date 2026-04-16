import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

type Body = {
  moduleId?: string
}

const COMPLETABLE_TYPES = new Set(['video', 'external_resource'])

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

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
  if (!moduleId) {
    return NextResponse.json({ error: 'moduleId required' }, { status: 400 })
  }

  const { data: mod, error: modErr } = await supabase
    .from('modules')
    .select('id, type, course_id')
    .eq('id', moduleId)
    .single()

  if (modErr || !mod || !COMPLETABLE_TYPES.has(mod.type)) {
    return NextResponse.json({ error: 'Lesson not found or cannot be auto-completed' }, { status: 404 })
  }

  const { data: enrollment, error: enrollmentErr } = await supabase
    .from('enrollments')
    .select('id')
    .eq('course_id', mod.course_id)
    .eq('learner_id', user.id)
    .maybeSingle()

  if (enrollmentErr) {
    return NextResponse.json({ error: enrollmentErr.message }, { status: 500 })
  }

  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 403 })
  }

  const { error: progressErr } = await supabase.from('module_progress').upsert(
    {
      module_id: moduleId,
      learner_id: user.id,
      watch_pct: 100,
      is_completed: true,
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'module_id,learner_id' },
  )

  if (progressErr) {
    return NextResponse.json({ error: progressErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, completed: true })
}
