'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import { queryKeys } from '@/lib/query/query-keys'

/**
 * Headless: opens one Supabase Realtime channel for the signed-in user's
 * notification_recipients rows and invalidates the notification queries on any
 * change. RLS is the security boundary; the filter is an efficiency hint.
 */
export default function NotificationsRealtime() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const supabase = createClient()
    let channel: RealtimeChannel | undefined

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() })
    }

    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (!uid) return

      channel = supabase
        .channel(`notif:${uid}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notification_recipients',
            filter: `recipient_id=eq.${uid}`,
          },
          (payload) => {
            invalidate()
            if (payload.eventType === 'INSERT') {
              const notificationId = (payload.new as { notification_id?: string })
                .notification_id
              if (!notificationId) return
              supabase
                .from('notifications')
                .select('title')
                .eq('id', notificationId)
                .single()
                .then(({ data: n }) => {
                  toast.info(n?.title ?? 'New notification')
                })
            }
          },
        )
        .subscribe()
    })

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [queryClient])

  return null
}
