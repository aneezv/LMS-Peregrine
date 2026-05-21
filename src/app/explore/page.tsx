import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { unwrapSingle, type CatalogCourse, type CatalogDepartment } from '@/lib/catalog-courses'
import { ExploreHero } from '@/components/explore/ExploreHero'
import { ExploreShowcase } from '@/components/explore/ExploreShowcase'
import { CtaBanner } from '@/components/home/CtaBanner'

const EXPLORE_LIMIT = 60

export const metadata = {
  title: 'Explore Courses | Peregrine T&C',
  description:
    'Browse our published programs across departments. Open a course to see the syllabus, instructor, and what you will learn.',
}

export default async function ExplorePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/courses')
  }

  const { data } = await supabase
    .from('courses')
    .select(
      'id, course_code, title, description, thumbnail_url, enrollment_type, created_at, price, discount_percent, profiles:instructor_id(full_name), department:department_id(id, name, sort_order)',
    )
    .eq('status', 'published')
    .eq('enrollment_type', 'open')
    .order('created_at', { ascending: false })
    .limit(EXPLORE_LIMIT)

  type RawRow = Record<string, unknown>
  const courses: CatalogCourse[] = ((data as RawRow[] | null) ?? []).map((r) => ({
    id: r.id as string,
    course_code: r.course_code as string,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    thumbnail_url: (r.thumbnail_url as string | null) ?? null,
    enrollment_type: r.enrollment_type as string,
    created_at: r.created_at as string,
    price: Number(r.price ?? 0),
    discount_percent: Number(r.discount_percent ?? 0),
    profiles: unwrapSingle(
      r.profiles as { full_name?: string } | { full_name?: string }[] | null,
    ),
    department: unwrapSingle(
      r.department as CatalogDepartment | CatalogDepartment[] | null,
    ),
  }))

  return (
    <>
      <ExploreHero />
      <ExploreShowcase courses={courses} />
      <CtaBanner />
    </>
  )
}
