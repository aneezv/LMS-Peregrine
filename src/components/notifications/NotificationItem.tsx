'use client'

import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { NotificationRow } from '@/lib/notifications/useNotifications'
import { useMarkRead } from '@/lib/notifications/useNotifications'
import { relativeTime, typeDotClass } from './utils'

export default function NotificationItem({
  row,
  onAfterNavigate,
}: {
  row: NotificationRow
  onAfterNavigate?: () => void
}) {
  const router = useRouter()
  const markRead = useMarkRead()
  const n = row.notification
  if (!n) return null

  const handleClick = () => {
    if (!row.is_read) markRead.mutate(row.id)
    if (n.link_url) {
      if (/^https?:\/\//i.test(n.link_url)) {
        window.open(n.link_url, '_blank', 'noopener,noreferrer')
      } else {
        router.push(n.link_url)
      }
    }
    onAfterNavigate?.()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-slate-50',
        !row.is_read && 'bg-blue-50/60',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
          row.is_read ? 'bg-transparent' : typeDotClass[n.type],
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              'truncate text-sm text-slate-800',
              !row.is_read && 'font-semibold',
            )}
          >
            {n.title}
          </span>
          <span className="shrink-0 text-[10px] font-medium text-slate-400">
            {relativeTime(row.created_at)}
          </span>
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">
          {n.body}
        </span>
      </span>
    </button>
  )
}
