import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { Button } from '@/components/ui/button'
import { ErrorAlert } from '@/components/ui/error-alert'
import { EmptyState, PageHeader } from '@/components/ui/primitives'
import { ROLES, isStaffRole } from '@/lib/roles'
import type { DueAssignment, DueAssignmentsPage } from '../_types'
import DueAssignmentRow from '../_components/DueAssignmentRow'

const PAGE_SIZE = 25

function parsePage(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw
  const n = Number.parseInt(v ?? '1', 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

function groupByCourse(items: DueAssignment[]) {
  const groups = new Map<string, { course_id: string; course_title: string; course_code?: string | null; items: DueAssignment[] }>()
  for (const it of items) {
    const g = groups.get(it.course_id)
    if (g) {
      g.items.push(it)
    } else {
      groups.set(it.course_id, {
        course_id: it.course_id,
        course_title: it.course_title,
        course_code: it.course_code,
        items: [it],
      })
    }
  }
  return Array.from(groups.values())
}

export default async function DueAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? ROLES.LEARNER
  if (isStaffRole(role)) redirect('/dashboard')

  const { page: pageParam } = await searchParams
  const requestedPage = parsePage(pageParam)
  const offset = (requestedPage - 1) * PAGE_SIZE

  const { data, error } = await supabase.rpc('learner_due_assignments_v1', {
    p_limit: PAGE_SIZE,
    p_offset: offset,
  })

  if (error) {
    console.error('[DueAssignmentsPage] RPC error:', error.message)
    return (
      <div className="p-4">
        <ErrorAlert title="Failed to load assignments">Please refresh the page.</ErrorAlert>
      </div>
    )
  }

  const result = (data ?? { total: 0, items: [], limit: PAGE_SIZE, offset: 0 }) as DueAssignmentsPage
  const total = result.total ?? 0
  const items = result.items ?? []
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(requestedPage, totalPages)
  const groups = groupByCourse(items)

  const hrefFor = (p: number) => (p <= 1 ? '/dashboard/due-assignments' : `/dashboard/due-assignments?page=${p}`)

  return (
    <div className="space-y-5 px-2 py-4">
      <Link
        href="/dashboard"
        className="hidden lg:inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Back to Home
      </Link>

      <PageHeader
        title="Due Assignments"
        description="Assignments awaiting your submission, grouped by course."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 border border-amber-100">
            <FileText className="w-3.5 h-3.5" />
            {total} total
          </span>
        }
      />

      {total === 0 ? (
        <EmptyState
          title="Nothing due"
          description="You're all caught up — no assignments are waiting on a submission."
          action={
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                Back to Home
              </Button>
            </Link>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No assignments on this page"
          description={`Page ${requestedPage} is out of range. Jump back to the first page.`}
          action={
            <Link href={hrefFor(1)}>
              <Button variant="outline" size="sm">
                Go to page 1
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section
              key={g.course_id}
              className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="min-w-0">
                  <Link
                    href={`/courses/${g.course_id}`}
                    className="text-sm font-semibold text-slate-800 hover:text-blue-600 transition-colors truncate block"
                  >
                    {g.course_title}
                  </Link>
                  {g.course_code ? (
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                      {g.course_code}
                    </p>
                  ) : null}
                </div>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded shrink-0">
                  {g.items.length}
                </span>
              </div>
              <ul className="divide-y divide-slate-50">
                {g.items.map((a) => (
                  <li key={a.assignment_id}>
                    <DueAssignmentRow assignment={a} showCourseTitle={false} />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {totalPages > 1 && (
            <nav className="flex items-center justify-between pt-2" aria-label="Pagination">
              <Link
                href={hrefFor(currentPage - 1)}
                aria-disabled={currentPage <= 1}
                tabIndex={currentPage <= 1 ? -1 : 0}
                className={currentPage <= 1 ? 'pointer-events-none' : ''}
              >
                <Button variant="outline" size="sm" disabled={currentPage <= 1}>
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                  Prev
                </Button>
              </Link>

              <p className="text-xs font-medium text-slate-500">
                Page {currentPage} of {totalPages}
              </p>

              <Link
                href={hrefFor(currentPage + 1)}
                aria-disabled={currentPage >= totalPages}
                tabIndex={currentPage >= totalPages ? -1 : 0}
                className={currentPage >= totalPages ? 'pointer-events-none' : ''}
              >
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages}>
                  Next
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </nav>
          )}
        </div>
      )}
    </div>
  )
}
