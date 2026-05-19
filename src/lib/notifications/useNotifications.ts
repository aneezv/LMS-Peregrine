'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { queryKeys } from '@/lib/query/query-keys'
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '@/components/notifications/actions'

export type NotificationType = 'info' | 'success' | 'warning' | 'announcement'

export type NotificationRow = {
  id: string
  is_read: boolean
  read_at: string | null
  created_at: string
  notification: {
    id: string
    title: string
    body: string
    type: NotificationType
    link_url: string | null
    created_at: string
  } | null
}

const SELECT =
  'id,is_read,read_at,created_at,notification:notifications(id,title,body,type,link_url,created_at)'

export function useNotificationsList(limit = 15) {
  return useQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: async (): Promise<NotificationRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('notification_recipients')
        .select(SELECT)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as unknown as NotificationRow[]
    },
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: async (): Promise<number> => {
      const supabase = createClient()
      const { count, error } = await supabase
        .from('notification_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      if (error) throw error
      return count ?? 0
    },
  })
}

function useInvalidateNotifications() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.notifications.list() })
    qc.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() })
  }
}

export function useMarkRead() {
  const invalidate = useInvalidateNotifications()
  return useMutation({
    mutationFn: async (rowId: string) => {
      const res = await markNotificationRead(rowId)
      if (!res.ok) throw new Error(res.error)
    },
    onSuccess: invalidate,
  })
}

export function useMarkAllRead() {
  const invalidate = useInvalidateNotifications()
  return useMutation({
    mutationFn: async () => {
      const res = await markAllNotificationsRead()
      if (!res.ok) throw new Error(res.error)
    },
    onSuccess: invalidate,
  })
}

