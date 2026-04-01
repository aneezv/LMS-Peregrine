import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import { BookOpen, Users } from 'lucide-react'
import { EmptyState, PageHeader } from '@/components/ui/primitives'
import { toRenderableImageUrl } from '@/lib/drive-image'

export default async function CoursesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: viewerProfile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null as { role: string } | null }

  const seesAllCatalog =
    viewerProfile?.role === 'instructor' || viewerProfile?.role === 'admin'

  const catalogSelect = `
    id, course_code, title, description, thumbnail_url, enrollment_type, created_at,
    profiles:instructor_id ( full_name )
  `

  let courses: {
    id: string
    course_code: string
    title: string
    description: string | null
    thumbnail_url: string | null
    enrollment_type: string
    created_at: string
    profiles: unknown
  }[] = []

  if (seesAllCatalog) {
    const { data } = await supabase
      .from('courses')
      .select(catalogSelect)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
    courses = data ?? []
  } else {
    /** Learners: open catalog + invite-only courses they are enrolled in (e.g. via Apps Script). */
    const enrolledIds: string[] = []
    if (user) {
      const { data: ens } = await supabase
        .from('enrollments')
        .select('course_id')
        .eq('learner_id', user.id)
      for (const row of ens ?? []) {
        enrolledIds.push((row as { course_id: string }).course_id)
      }
    }

    const { data: openCourses } = await supabase
      .from('courses')
      .select(catalogSelect)
      .eq('status', 'published')
      .eq('enrollment_type', 'open')
      .order('created_at', { ascending: false })

    let invitedCourses: typeof courses = []
    if (enrolledIds.length > 0) {
      const { data: inv } = await supabase
        .from('courses')
        .select(catalogSelect)
        .eq('status', 'published')
        .eq('enrollment_type', 'invite_only')
        .in('id', enrolledIds)
        .order('created_at', { ascending: false })
      invitedCourses = (inv ?? []) as typeof courses
    }

    const byId = new Map<string, (typeof courses)[0]>()
    for (const c of [...(openCourses ?? []), ...invitedCourses] as typeof courses) {
      byId.set(c.id, c)
    }
    courses = [...byId.values()].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Course Catalog" description="Browse available courses and start learning" />

      {(!courses || courses.length === 0) ? (
        <EmptyState title="No published courses yet" description="Check back soon for new learning paths." />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course: any) => (
            <Link
              key={course.id}
              href={`/courses/${course.id}`}
              className="group bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md hover:border-blue-300 transition-all duration-200"
            >
              <div className="relative h-40 bg-gradient-to-br from-blue-100 to-indigo-200 flex items-center justify-center">
                {course.thumbnail_url ? (
                  <Image
                    src={toRenderableImageUrl(course.thumbnail_url)}
                    alt={course.title}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <BookOpen className="h-16 w-16 text-blue-400" />
                )}
              </div>
              <div className="p-5">
                <h3 className="font-semibold text-slate-800 group-hover:text-blue-600 text-lg truncate">
                  {course.title}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  <em className="not-italic font-medium text-slate-600">{course.course_code}</em>
                </p>
                <p className="text-sm text-slate-500 mt-1 line-clamp-2 min-h-[2.5rem]">
                  {course.description ?? 'No description provided.'}
                </p>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {(course.profiles as any)?.full_name ?? 'Unknown'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    course.enrollment_type === 'open'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {course.enrollment_type === 'open' ? 'Open' : 'Invite Only'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
