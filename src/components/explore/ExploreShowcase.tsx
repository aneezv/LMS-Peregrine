import { CourseCard } from '@/components/courses/CourseCard'
import { groupCatalogByDepartment, type CatalogCourse } from '@/lib/catalog-courses'

export function ExploreShowcase({ courses }: { courses: CatalogCourse[] }) {
  if (courses.length === 0) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <p className="text-base text-slate-600">
          No courses are available right now. Please check back soon.
        </p>
      </section>
    )
  }

  const sections = groupCatalogByDepartment(courses)

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="flex flex-col gap-12 sm:gap-16">
        {sections.map(({ department, courses: items }) => (
          <div key={department?.id ?? '_none'} className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {department?.name ?? 'General'}
              </h2>
              <p className="text-sm text-slate-500">
                {items.length} {items.length === 1 ? 'course' : 'courses'}
              </p>
            </div>
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-7">
              {items.map((course, idx) => (
                <li key={course.id} className="min-w-0">
                  <CourseCard
                    course={course}
                    variant="featured"
                    priority={idx === 0 && department === sections[0]?.department}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
