import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { uploadCourseThumbnailToDrive } from '@/utils/google-drive'

export const runtime = 'nodejs'

const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024

function isAllowedThumbnailType(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name)
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    const role = profile?.role
    if (role !== 'instructor' && role !== 'admin') {
      return NextResponse.json(
        { error: 'Only instructors or admins can upload course thumbnails.' },
        { status: 403 },
      )
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing image file.' }, { status: 400 })
    }

    if (!isAllowedThumbnailType(file)) {
      return NextResponse.json(
        { error: 'Allowed file types: PNG, JPG, JPEG, GIF, WEBP, SVG.' },
        { status: 400 },
      )
    }

    if (file.size > MAX_THUMBNAIL_BYTES) {
      return NextResponse.json({ error: 'Thumbnail must be under 5 MB.' }, { status: 400 })
    }

    const safeSegment = file.name.replace(/[^\w.\-]+/g, '_')
    const fileName = `course_thumbnail_${user.id}_${Date.now()}_${safeSegment}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { webViewLink, fileId } = await uploadCourseThumbnailToDrive({
      buffer,
      fileName,
      mimeType: file.type || 'image/png',
    })

    return NextResponse.json({
      ok: true,
      fileUrl: webViewLink,
      driveFileId: fileId,
    })
  } catch (e) {
    console.error(e)
    const message = e instanceof Error ? e.message : 'Thumbnail upload failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
