'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { BookOpen, ChevronRight, Search, Users } from 'lucide-react'
import { EmptyState } from '@/components/ui/primitives'
import { toRenderableImageUrl } from '@/lib/drive-image'
import {
  CATALOG_PAGE_SIZE,
  type CatalogCourse,
  type CatalogDepartment,
} from '@/lib/catalog-courses'

export type { CatalogCourse, CatalogDepartment } from '@/lib/catalog-courses'

function instructorName(course: CatalogCourse): string {
  const p = course.profiles as { full_name?: string } | null | undefined
  return p?.full_name?.trim() || 'Instructor'
}

export function groupCatalogByDepartment(courses: CatalogCourse[]) {
  const map = new Map<
    string,
    { department: CatalogDepartment | null; courses: CatalogCourse[] }
  >()
  for (const c of courses) {
    const d = c.department
    const key = d?.id ?? '_none'
    if (!map.has(key)) {
      map.set(key, { department: d, courses: [] })
    }
    map.get(key)!.courses.push(c)
  }
  const sections = [...map.values()]
  sections.sort((a, b) => {
    const ao = a.department?.sort_order ?? 9999
    const bo = b.department?.sort_order ?? 9999
    if (ao !== bo) return ao - bo
    return (a.department?.name ?? '').localeCompare(b.department?.name ?? '')
  })
  return sections
}

function CourseCard({ course }: { course: CatalogCourse }) {
  const open = course.enrollment_type === 'open'

  return (
    <Link
      href={`/courses/${course.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm ring-slate-200/60 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    >
      <div className="relative aspect-video w-full bg-gradient-to-br from-slate-100 via-slate-50 to-indigo-100">
        {course.thumbnail_url ? (
          <Image
            src={toRenderableImageUrl(course.thumbnail_url)}
            alt={course.title}
            fill
            className="object-cover transition duration-300 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <BookOpen className="h-12 w-12 text-indigo-300 sm:h-14 sm:w-14" aria-hidden />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/35 to-transparent" />
        <span
          className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm backdrop-blur-sm sm:right-3 sm:top-3 ${
            open ? 'bg-emerald-600/90 text-white' : 'bg-amber-500/95 text-white'
          }`}
        >
          {open ? 'Open' : 'Invite only'}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5 sm:p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {course.course_code}
        </p>
        <h2 className="line-clamp-2 min-h-[2.5rem] text-[15px] font-semibold leading-snug text-slate-900 sm:min-h-[2.75rem] sm:text-base sm:leading-snug">
          <span className="group-hover:text-blue-700">{course.title}</span>
        </h2>
        <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-slate-600">
          {course.description?.trim() || 'Explore this course to see lessons and materials.'}
        </p>

        <div className="mt-1 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
            <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <span className="truncate">{instructorName(course)}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-blue-600">
            View
            <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  )
}

export function CourseCatalog({
  courses: initialCourses,
  departments,
  totalCount: initialTotalCount,
  page: initialPage,
  q: initialQ,
  departmentId: initialDepartmentId,
  fetchError: initialFetchError,
}: {
  courses: CatalogCourse[]
  departments: CatalogDepartment[]
  totalCount: number
  page: number
  q: string
  departmentId: string
  fetchError: string | null
}) {
  const [courses, setCourses] = useState(initialCourses)
  const [totalCount, setTotalCount] = useState(initialTotalCount)
  const [page, setPage] = useState(initialPage)
  const [q, setQ] = useState(initialQ)
  const [departmentId, setDepartmentId] = useState(initialDepartmentId)
  const [fetchError, setFetchError] = useState<string | null>(initialFetchError)
  const [pending, startTransition] = useTransition()

  const sections = useMemo(() => groupCatalogByDepartment(courses), [courses])
  const from = totalCount === 0 ? 0 : (page - 1) * CATALOG_PAGE_SIZE + 1
  const to = Math.min(page * CATALOG_PAGE_SIZE, totalCount)
  const hasMore = page * CATALOG_PAGE_SIZE < totalCount
  const countLabel =
    totalCount === 1 ? '1 course matches' : `${totalCount} courses match`

  if (fetchError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/80 p-6 text-sm text-red-800">
        {fetchError}
      </div>
    )
  }

  async function loadPage(nextPage: number, nextQuery: string, nextDept: string) {
    startTransition(async () => {
      setFetchError(null)
      const params = new URLSearchParams()
      if (nextQuery.trim()) params.set('q', nextQuery.trim())
      if (nextDept.trim()) params.set('dept', nextDept.trim())
      if (nextPage > 1) params.set('page', String(nextPage))
      const query = params.toString()
      const url = query ? `/api/courses/catalog?${query}` : '/api/courses/catalog'
      const pageUrl = query ? `/courses?${query}` : '/courses'

      try {
        const res = await fetch(url, { cache: 'no-store' })
        const json = (await res.json()) as {
          courses?: CatalogCourse[]
          totalCount?: number
          error?: string
        }
        if (!res.ok) {
          throw new Error(json.error || 'Failed to load course catalog.')
        }
        setCourses(json.courses ?? [])
        setTotalCount(json.totalCount ?? 0)
        setPage(nextPage)
        setQ(nextQuery)
        setDepartmentId(nextDept)
        window.history.replaceState(null, '', pageUrl)
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : 'Failed to load course catalog.')
      }
    })
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/80 to-indigo-50/60 px-4 py-5 shadow-sm sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Course catalog
            </h1>
            <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
              Browse by department, search, and open a course. Results load in pages for speed.
            </p>
            <p className="text-xs font-medium text-slate-500 sm:text-sm">{countLabel}</p>
          </div>

          <form
            className="flex w-full flex-col gap-3 sm:flex-row sm:items-end lg:max-w-xl"
            onSubmit={(e) => {
              e.preventDefault()
              loadPage(1, q, departmentId)
            }}
          >
            <div className="min-w-0 flex-1">
              <label htmlFor="course-catalog-search" className="sr-only">
                Search courses
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <input
                  id="course-catalog-search"
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  placeholder="Title, code, description…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            </div>
            <div className="w-full sm:w-44">
              <label htmlFor="course-catalog-dept" className="sr-only">
                Department
              </label>
              <select
                id="course-catalog-dept"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              {pending ? 'Applying…' : 'Apply'}
            </button>
          </form>
        </div>
      </section>

      {totalCount === 0 ? (
        q.trim() || departmentId ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <h3 className="text-base font-semibold text-slate-800 sm:text-lg">No matches</h3>
            <p className="mt-1 text-sm text-slate-500">
              Try different keywords or clear filters.
            </p>
            <button
              type="button"
              onClick={() => loadPage(1, '', '')}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <EmptyState
            title="No published courses yet"
            description="Check back soon for new learning paths."
          />
        )
      ) : (
        <>
          <p className="text-xs text-slate-500 sm:text-sm">
            Showing {from}–{to} of {totalCount}
          </p>

          <div className="space-y-10 sm:space-y-12">
            {sections.map((section) => (
              <section key={section.department?.id ?? '_none'} className="space-y-4">
                <div className="border-b border-slate-200 pb-2">
                  <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                    {section.department?.name ?? 'Other'}
                  </h2>
                  <p className="text-xs text-slate-500 sm:text-sm">
                    {section.courses.length}{' '}
                    {section.courses.length === 1 ? 'course' : 'courses'}
                  </p>
                </div>
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
                  {section.courses.map((course) => (
                    <li key={course.id} className="min-w-0">
                      <CourseCard course={course} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {page > 1 || hasMore ? (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {page > 1 ? (
                <button
                  type="button"
                  onClick={() => loadPage(page - 1, q, departmentId)}
                  disabled={pending}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                >
                  Previous page
                </button>
              ) : null}
              {hasMore ? (
                <button
                  type="button"
                  onClick={() => loadPage(page + 1, q, departmentId)}
                  disabled={pending}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                >
                  Next page
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
