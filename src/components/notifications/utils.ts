import type { NotificationType } from '@/lib/notifications/useNotifications'

export function relativeTime(fromIso: string, now = Date.now()): string {
  const diff = now - new Date(fromIso).getTime()
  const abs = Math.abs(diff)
  const min = Math.round(abs / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  const wk = Math.round(day / 7)
  if (wk < 5) return `${wk}w ago`
  return new Date(fromIso).toLocaleDateString()
}

export const typeDotClass: Record<NotificationType, string> = {
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  announcement: 'bg-violet-500',
}
