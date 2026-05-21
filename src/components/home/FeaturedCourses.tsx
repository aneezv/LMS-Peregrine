import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import type { CatalogCourse } from '@/lib/catalog-courses'
import { CourseCard } from '@/components/courses/CourseCard'

export function FeaturedCourses({ courses }: { courses: CatalogCourse[] }) {
  if (courses.length === 0) return null

  return (
    <section className="relative overflow-hidden py-16 sm:py-24">
      {/* Decorative background — soft gradient + subtle radial glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-50 via-white to-white"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-10 h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Featured
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Courses worth your time
            </h2>
            <p className="mt-2 text-sm text-slate-600 sm:text-base">
              Hand-picked, recently published programs across departments. Browse, enroll, and start learning today.
            </p>
          </div>

          <Link
            href="/explore"
            className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
          >
            View all courses
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>

        {/* Course grid */}
        <ul className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-7">
          {courses.map((course, idx) => (
            <li
              key={course.id}
              className={`min-w-0 ${idx >= 3 ? 'hidden lg:block' : idx >= 2 ? 'hidden sm:block' : ''}`}
            >
              <CourseCard course={course} variant="featured" priority={idx === 0} />
            </li>
          ))}
        </ul>

        {/* Bottom CTA — softer, mobile-friendly */}
        <div className="mt-12 flex justify-center">
          <Link
            href="/explore"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 transition hover:text-emerald-800"
          >
            Explore the full catalog
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  )
}
