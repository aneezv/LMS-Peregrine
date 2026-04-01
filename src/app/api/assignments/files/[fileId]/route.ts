import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { deleteFileFromDrive } from '@/utils/google-drive'

export const runtime = 'nodejs'

export async function DELETE(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await context.params

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const db = admin ?? supabase

  if (fileId === 'legacy') {
    const assignmentId = new URL(request.url).searchParams.get('assignmentId')?.trim()
    if (!assignmentId) {
      return NextResponse.json({ error: 'assignmentId required for legacy file' }, { status: 400 })
    }

    const { data: sub, error: sErr } = await db
      .from('submissions')
      .select('id, drive_file_id, file_url, is_turned_in, graded_at')
      .eq('assignment_id', assignmentId)
      .eq('learner_id', user.id)
      .maybeSingle()

    if (sErr || !sub?.file_url) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (sub.graded_at) {
      return NextResponse.json({ error: 'Graded work cannot be edited.' }, { status: 400 })
    }
    if (sub.is_turned_in) {
      return NextResponse.json({ error: 'Unsubmit before removing files.' }, { status: 400 })
    }

    if (sub.drive_file_id) {
      try {
        await deleteFileFromDrive(sub.drive_file_id)
      } catch (e) {
        console.error(e)
      }
    }

    const { error: uErr } = await db
      .from('submissions')
      .update({ file_url: null, drive_file_id: null })
      .eq('id', sub.id)

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  const { data: fileRow, error: fileErr } = await db
    .from('submission_files')
    .select('id, submission_id, drive_file_id')
    .eq('id', fileId)
    .maybeSingle()

  if (fileErr || !fileRow) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const { data: sub, error: subErr } = await db
    .from('submissions')
    .select('learner_id, is_turned_in, graded_at')
    .eq('id', fileRow.submission_id)
    .single()

  if (subErr || !sub) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (sub.learner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (sub.graded_at) {
    return NextResponse.json({ error: 'Graded work cannot be edited.' }, { status: 400 })
  }
  if (sub.is_turned_in) {
    return NextResponse.json({ error: 'Unsubmit before removing files.' }, { status: 400 })
  }

  if (fileRow.drive_file_id) {
    try {
      await deleteFileFromDrive(fileRow.drive_file_id)
    } catch (e) {
      console.error(e)
    }
  }

  const { error: delErr } = await db.from('submission_files').delete().eq('id', fileId)
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  const { data: first } = await db
    .from('submission_files')
    .select('file_url, drive_file_id')
    .eq('submission_id', fileRow.submission_id)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { error: upErr } = await db
    .from('submissions')
    .update({
      file_url: first?.file_url ?? null,
      drive_file_id: first?.drive_file_id ?? null,
    })
    .eq('id', fileRow.submission_id)

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
