'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookOpen, ChevronLeft, Search, X } from 'lucide-react'
import { EmptyState, PageHeader } from '@/components/ui/primitives'
import { CATALOG_PAGE_SIZE, type CatalogCourse, type CatalogDepartment } from '@/lib/catalog-courses'
import { queryKeys } from '@/lib/query/query-keys'
import { CourseCard } from '@/components/courses/CourseCard'

export type { CatalogCourse, CatalogDepartment } from '@/lib/catalog-courses'

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
  const router = useRouter()
  const [draftQ, setDraftQ] = useState(initialQ)
  const [draftDepartmentId, setDraftDepartmentId] = useState(initialDepartmentId)

  useEffect(() => {
    setDraftQ(initialQ)
  }, [initialQ])
  useEffect(() => {
    setDraftDepartmentId(initialDepartmentId)
  }, [initialDepartmentId])

  const params = useMemo(
    () => ({ q: initialQ.trim(), dept: initialDepartmentId.trim(), page: initialPage }),
    [initialDepartmentId, initialPage, initialQ],
  )
  const catalogQuery = useQuery({
    queryKey: queryKeys.coursesCatalog(params),
    queryFn: async () => {
      const urlParams = new URLSearchParams()
      if (params.q) urlParams.set('q', params.q)
      if (params.dept) urlParams.set('dept', params.dept)
      if (params.page > 1) urlParams.set('page', String(params.page))
      const qs = urlParams.toString()
      const url = qs ? `/api/courses/catalog?${qs}` : '/api/courses/catalog'
      const res = await fetch(url, { cache: 'no-store' })
      const json = (await res.json()) as {
        courses?: CatalogCourse[]
        totalCount?: number
        error?: string
      }
      if (!res.ok) throw new Error(json.error || 'Failed to load course catalog.')
      return {
        courses: json.courses ?? [],
        totalCount: json.totalCount ?? 0,
      }
    },
    initialData: {
      courses: initialCourses,
      totalCount: initialTotalCount,
    },
  })

  const courses = useMemo(() => catalogQuery.data?.courses ?? [], [catalogQuery.data?.courses])
  const totalCount = catalogQuery.data?.totalCount ?? 0
  const page = initialPage
  const fetchError = catalogQuery.error instanceof Error ? catalogQuery.error.message : initialFetchError
  const pending = catalogQuery.isFetching
  const sections = useMemo(() => groupCatalogByDepartment(courses), [courses])
  const from = totalCount === 0 ? 0 : (page - 1) * CATALOG_PAGE_SIZE + 1
  const to = Math.min(page * CATALOG_PAGE_SIZE, totalCount)
  const hasMore = page * CATALOG_PAGE_SIZE < totalCount

  function navigate(nextPage: number, nextQuery: string, nextDept: string) {
    const params = new URLSearchParams()
    if (nextQuery.trim()) params.set('q', nextQuery.trim())
    if (nextDept.trim()) params.set('dept', nextDept.trim())
    if (nextPage > 1) params.set('page', String(nextPage))
    const query = params.toString()
    router.push(query ? `/courses?${query}` : '/courses')
  }

  const filtersActive = !!(initialQ.trim() || initialDepartmentId.trim())

  if (fetchError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/80 p-6 text-sm text-red-800">
        {fetchError}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Link
        href="/dashboard"
        className="hidden lg:inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition-colors hover:text-blue-600"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to Home
      </Link>

      <PageHeader
        title="Course catalog"
        description="Browse by department, search, and open a course. Results load in pages for speed."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
            <BookOpen className="h-3.5 w-3.5" />
            {totalCount} {totalCount === 1 ? 'course' : 'courses'}
          </span>
        }
      />

      <form
        className="flex w-full flex-col gap-2 sm:flex-row sm:items-end sm:gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          navigate(1, draftQ, draftDepartmentId)
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
              enterKeyHint="search"
              placeholder="Search title, code…"
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              className="min-h-12 w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 sm:min-h-11"
            />
            {draftQ ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setDraftQ('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2 sm:gap-3">
          <div className="min-w-0 flex-1 sm:w-44 sm:flex-initial">
            <label htmlFor="course-catalog-dept" className="sr-only">
              Department
            </label>
            <select
              id="course-catalog-dept"
              value={draftDepartmentId}
              onChange={(e) => {
                const next = e.target.value
                setDraftDepartmentId(next)
                navigate(1, draftQ, next)
              }}
              className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 sm:min-h-11"
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
            aria-label="Apply search"
            className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60 sm:min-h-11"
          >
            <Search className="h-4 w-4 sm:hidden" aria-hidden />
            <span className="hidden sm:inline">{pending ? 'Applying…' : 'Apply'}</span>
          </button>
          {filtersActive ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setDraftQ('')
                setDraftDepartmentId('')
                navigate(1, '', '')
              }}
              className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:min-h-11 sm:px-4"
            >
              Clear
            </button>
          ) : null}
        </div>
      </form>

      {totalCount === 0 ? (
        initialQ.trim() || initialDepartmentId ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <h3 className="text-base font-semibold text-slate-800 sm:text-lg">No matches</h3>
            <p className="mt-1 text-sm text-slate-500">
              Try different keywords or clear filters.
            </p>
            <button
              type="button"
              onClick={() => {
                setDraftQ('')
                setDraftDepartmentId('')
                navigate(1, '', '')
              }}
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
          <p className="px-1 text-[11px] text-slate-500 sm:px-0 sm:text-sm">
            Showing {from}–{to} of {totalCount}
          </p>

          <div className="space-y-8 sm:space-y-12">
            {sections.map((section) => (
              <section key={section.department?.id ?? '_none'} className="space-y-3 sm:space-y-4">
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 pb-2">
                  <h2 className="text-base font-bold tracking-tight text-slate-900 sm:text-xl">
                    {section.department?.name ?? 'Other'}
                  </h2>
                  <p className="shrink-0 text-[11px] text-slate-500 sm:text-sm">
                    {section.courses.length}{' '}
                    {section.courses.length === 1 ? 'course' : 'courses'}
                  </p>
                </div>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
                  {section.courses.map((course) => (
                    <li key={course.id} className="min-w-0">
                      <CourseCard course={course} variant="compact" />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {page > 1 || hasMore ? (
            <div className="flex items-center justify-between gap-2 pt-2 sm:justify-center sm:gap-3">
              {page > 1 ? (
                <button
                  type="button"
                  onClick={() => navigate(page - 1, initialQ, initialDepartmentId)}
                  disabled={pending}
                  className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 sm:min-h-11 sm:flex-initial sm:px-5"
                >
                  ← Previous
                </button>
              ) : null}
              {hasMore ? (
                <button
                  type="button"
                  onClick={() => navigate(page + 1, initialQ, initialDepartmentId)}
                  disabled={pending}
                  className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60 sm:min-h-11 sm:flex-initial sm:border-slate-300 sm:bg-white sm:px-5 sm:text-slate-800 sm:hover:bg-slate-50"
                >
                  Next →
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
