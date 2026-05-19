'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

type ActionResult = { ok: true } | { ok: false; error: string }

export async function markNotificationRead(rowId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }

  const { error } = await supabase
    .from('notification_recipients')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', rowId)
    .eq('recipient_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/dashboard/notifications')
  return { ok: true }
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }

  const { error } = await supabase
    .from('notification_recipients')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('recipient_id', user.id)
    .eq('is_read', false)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/dashboard/notifications')
  return { ok: true }
}
