import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { fetchCatalogPage } from '@/lib/catalog-courses'
import { isInstructorRole } from '@/lib/roles'

function parsePage(raw: string | null): number {
  const n = parseInt(raw ?? '1', 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: viewerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const seesAllCatalog = isInstructorRole(viewerProfile?.role)

  const enrolledIds: string[] = []
  if (!seesAllCatalog) {
    const { data: ens } = await supabase
      .from('enrollments')
      .select('course_id')
      .eq('learner_id', user.id)
    for (const row of ens ?? []) {
      enrolledIds.push((row as { course_id: string }).course_id)
    }
  }

  const url = new URL(req.url)
  const page = parsePage(url.searchParams.get('page'))
  const q = url.searchParams.get('q') ?? ''
  const departmentId = url.searchParams.get('dept') ?? ''

  const res = await fetchCatalogPage(supabase, {
    seesAll: seesAllCatalog,
    enrolledIds,
    page,
    q,
    departmentId: departmentId || null,
  })

  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 500 })
  }

  return NextResponse.json({
    courses: res.courses,
    totalCount: res.totalCount,
  })
}
