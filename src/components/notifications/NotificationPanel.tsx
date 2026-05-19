'use client'

import Link from 'next/link'
import { CheckCheck } from 'lucide-react'
import {
  useMarkAllRead,
  useNotificationsList,
  useUnreadCount,
} from '@/lib/notifications/useNotifications'
import NotificationItem from './NotificationItem'

export default function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { data: rows, isLoading } = useNotificationsList()
  const { data: unread = 0 } = useUnreadCount()
  const markAll = useMarkAllRead()

  return (
    <div className="flex w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
        <p className="text-sm font-semibold text-slate-800">Notifications</p>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-[60vh] divide-y divide-slate-50 overflow-y-auto">
        {isLoading ? (
          <p className="px-3 py-6 text-center text-sm text-slate-400">Loading…</p>
        ) : !rows || rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-slate-400">
            You&apos;re all caught up.
          </p>
        ) : (
          rows.map((row) => (
            <NotificationItem key={row.id} row={row} onAfterNavigate={onClose} />
          ))
        )}
      </div>

      <div className="border-t border-slate-100 px-3 py-2 text-center">
        <Link
          href="/dashboard/notifications"
          onClick={onClose}
          className="text-xs font-semibold text-slate-600 hover:text-blue-600"
        >
          View all
        </Link>
      </div>
    </div>
  )
}
