import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight, Bell } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { Button } from '@/components/ui/button'
import { ErrorAlert } from '@/components/ui/error-alert'
import { EmptyState, PageHeader } from '@/components/ui/primitives'
import type { NotificationRow } from '@/lib/notifications/useNotifications'
import NotificationsPageList from './_components/NotificationsPageList'

const PAGE_SIZE = 25

const SELECT =
  'id,is_read,read_at,created_at,notification:notifications(id,title,body,type,link_url,created_at)'

function parsePage(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw
  const n = Number.parseInt(v ?? '1', 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { page: pageParam } = await searchParams
  const requestedPage = parsePage(pageParam)
  const offset = (requestedPage - 1) * PAGE_SIZE

  const { data, error, count } = await supabase
    .from('notification_recipients')
    .select(SELECT, { count: 'exact' })
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (error) {
    console.error('[NotificationsPage] query error:', error.message)
    return (
      <div className="p-4">
        <ErrorAlert title="Failed to load notifications">
          Please refresh the page.
        </ErrorAlert>
      </div>
    )
  }

  const total = count ?? 0
  const rows = (data ?? []) as unknown as NotificationRow[]
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(requestedPage, totalPages)

  const hrefFor = (p: number) =>
    p <= 1 ? '/dashboard/notifications' : `/dashboard/notifications?page=${p}`

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
        title="Notifications"
        description="Announcements and updates sent to you."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 border border-blue-100">
            <Bell className="w-3.5 h-3.5" />
            {total} total
          </span>
        }
      />

      {total === 0 ? (
        <EmptyState
          title="No notifications"
          description="You're all caught up — nothing has been sent your way yet."
          action={
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                Back to Home
              </Button>
            </Link>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No notifications on this page"
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
          <NotificationsPageList rows={rows} />

          {totalPages > 1 && (
            <nav
              className="flex items-center justify-between pt-2"
              aria-label="Pagination"
            >
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
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                >
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
