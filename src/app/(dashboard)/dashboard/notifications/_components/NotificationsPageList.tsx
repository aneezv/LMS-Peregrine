'use client'

import { CheckCheck } from 'lucide-react'
import type { NotificationRow } from '@/lib/notifications/useNotifications'
import { useMarkAllRead } from '@/lib/notifications/useNotifications'
import NotificationItem from '@/components/notifications/NotificationItem'

export default function NotificationsPageList({
  rows,
}: {
  rows: NotificationRow[]
}) {
  const markAll = useMarkAllRead()
  const hasUnread = rows.some((r) => !r.is_read)

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {hasUnread && (
        <div className="flex justify-end border-b border-slate-100 bg-slate-50/50 px-4 py-2">
          <button
            type="button"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        </div>
      )}
      <ul className="divide-y divide-slate-50">
        {rows.map((row) => (
          <li key={row.id}>
            <NotificationItem row={row} />
          </li>
        ))}
      </ul>
    </section>
  )
}
