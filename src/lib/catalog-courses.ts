import type { SupabaseClient } from '@supabase/supabase-js'

export const CATALOG_PAGE_SIZE = 24

/** PostgREST may return a to-one embed as object or single-element array depending on typings. */
export function unwrapSingle<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  if (Array.isArray(v)) return v[0] ?? null
  return v
}

export type CatalogDepartment = {
  id: string
  name: string
  sort_order: number
}

export type CatalogCourse = {
  id: string
  course_code: string
  title: string
  description: string | null
  thumbnail_url: string | null
  enrollment_type: string
  created_at: string
  profiles: unknown
  department: CatalogDepartment | null
}

const catalogSelect = `
  id, course_code, title, description, thumbnail_url, enrollment_type, created_at,
  profiles:instructor_id ( full_name ),
  department:department_id ( id, name, sort_order )
`

function sanitizeCatalogSearch(raw: string): string {
  return raw
    .trim()
    .replace(/[%*,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
}

export type CatalogFetchParams = {
  seesAll: boolean
  enrolledIds: string[]
  page: number
  q: string
  departmentId: string | null
}

export async function fetchCatalogPage(
  supabase: SupabaseClient,
  params: CatalogFetchParams,
): Promise<{ courses: CatalogCourse[]; totalCount: number; error: Error | null }> {
  const { seesAll, enrolledIds, page, q, departmentId } = params
  const safePage = Math.max(1, page)
  const from = (safePage - 1) * CATALOG_PAGE_SIZE
  const to = from + CATALOG_PAGE_SIZE - 1

  let qb = supabase
    .from('courses')
    .select(catalogSelect, { count: 'exact' })
    .eq('status', 'published')

  if (!seesAll) {
    if (enrolledIds.length === 0) {
      qb = qb.eq('enrollment_type', 'open')
    } else {
      const inList = enrolledIds.join(',')
      qb = qb.or(
        `and(enrollment_type.eq.open),and(enrollment_type.eq.invite_only,id.in.(${inList}))`,
      )
    }
  }

  if (departmentId) {
    qb = qb.eq('department_id', departmentId)
  }

  const term = sanitizeCatalogSearch(q)
  if (term.length > 0) {
    const wild = `%${term.replace(/%/g, '')}%`
    qb = qb.or(`title.ilike.${wild},course_code.ilike.${wild},description.ilike.${wild}`)
  }

  qb = qb
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to)

  const { data, error, count } = await qb

  if (error) {
    return { courses: [], totalCount: 0, error: new Error(error.message) }
  }

  const courses: CatalogCourse[] = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: r.id as string,
      course_code: r.course_code as string,
      title: r.title as string,
      description: (r.description as string | null) ?? null,
      thumbnail_url: (r.thumbnail_url as string | null) ?? null,
      enrollment_type: r.enrollment_type as string,
      created_at: r.created_at as string,
      profiles: unwrapSingle(
        r.profiles as { full_name?: string } | { full_name?: string }[] | null,
      ),
      department: unwrapSingle(
        r.department as CatalogDepartment | CatalogDepartment[] | null,
      ),
    }
  })

  return {
    courses,
    totalCount: count ?? 0,
    error: null,
  }
}

export async function fetchDepartmentsForCatalog(
  supabase: SupabaseClient,
): Promise<CatalogDepartment[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('id, name, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return []
  return (data ?? []) as CatalogDepartment[]
}
