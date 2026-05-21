import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { CourseCatalog } from '@/components/courses/course-catalog'
import { fetchCatalogPage, fetchDepartmentsForCatalog } from '@/lib/catalog-courses'
import { isInstructorRole } from '@/lib/roles'

function parsePage(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw
  const n = parseInt(v ?? '1', 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

function parseString(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  return typeof v === 'string' ? v : ''
}

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; page?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?redirect=/courses')
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

  const page = parsePage(sp.page)
  const q = parseString(sp.q)
  const departmentId = parseString(sp.dept)

  const [deptRes, catalogRes] = await Promise.all([
    fetchDepartmentsForCatalog(supabase),
    fetchCatalogPage(supabase, {
      seesAll: seesAllCatalog,
      enrolledIds,
      page,
      q,
      departmentId: departmentId || null,
    }),
  ])

  return (
    <div className="px-3 pb-10 pt-3 sm:px-0 sm:pb-10 sm:pt-0">
      <CourseCatalog
        key={`${page}-${q}-${departmentId}`}
        courses={catalogRes.courses}
        departments={deptRes}
        totalCount={catalogRes.totalCount}
        page={page}
        q={q}
        departmentId={departmentId}
        fetchError={catalogRes.error?.message ?? null}
      />
    </div>
  )
}
