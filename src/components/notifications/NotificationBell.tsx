'use client'

import { useState } from 'react'
import { Bell } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { useUnreadCount } from '@/lib/notifications/useNotifications'
import NotificationsRealtime from './NotificationsRealtime'
import NotificationPanel from './NotificationPanel'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { data: unread = 0 } = useUnreadCount()

  return (
    <>
      <NotificationsRealtime />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label="Notifications"
          title="Notifications"
          className="relative flex items-center rounded-lg px-2 py-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <Bell className="h-4 w-4 shrink-0" />
          {unread > 0 && (
            <Badge className="absolute -top-0.5 -right-0.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none">
              {unread > 99 ? '99+' : unread}
            </Badge>
          )}
        </PopoverTrigger>
        <PopoverContent>
          <NotificationPanel onClose={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
    </>
  )
}
