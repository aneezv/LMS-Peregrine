import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { unwrapSingle, type CatalogCourse } from '@/lib/catalog-courses'
import { SiteNavbar } from '@/components/site/SiteNavbar'
import { HeroSection } from '@/components/home/HeroSection'
import { FeaturedCourses } from '@/components/home/FeaturedCourses'
import { FeaturesSection } from '@/components/home/FeaturesSection'
import { CtaBanner } from '@/components/home/CtaBanner'
import { HomeFooter } from '@/components/home/HomeFooter'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  const { data } = await supabase
    .from('courses')
    .select(
      'id, course_code, title, description, thumbnail_url, enrollment_type, created_at, price, discount_percent, profiles:instructor_id(full_name), department:department_id(id, name, sort_order)',
    )
    .eq('status', 'published')
    .eq('enrollment_type', 'open')
    .order('created_at', { ascending: false })
    .limit(6)

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
    profiles: unwrapSingle(r.profiles as { full_name?: string } | { full_name?: string }[] | null),
    department: unwrapSingle(r.department as { id: string; name: string; sort_order: number } | { id: string; name: string; sort_order: number }[] | null),
  }))

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SiteNavbar />
      <main className="flex-1">
        <HeroSection />
        <FeaturedCourses courses={courses} />
        <FeaturesSection />
        <CtaBanner />
      </main>
      <HomeFooter />
    </div>
  )
}
