import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleApi } from '@/lib/auth/require-role'

export const runtime = 'nodejs'
export const maxDuration = 60

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return out === 0
}

/**
 * Notification retention sweep. Triggered on a schedule by an external cron
 * (Bearer NOTIFICATIONS_PURGE_CRON_SECRET) or manually by an admin. Mirrors the
 * google-sheets sync cron contract. Optional ?read_retention=30d&hard_cap=90d
 * (Postgres interval strings) override the defaults.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.NOTIFICATIONS_PURGE_CRON_SECRET
  const authHeader = request.headers.get('authorization') || ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const cronOk = !!(cronSecret && bearer && timingSafeEqual(bearer, cronSecret))

  if (!cronOk) {
    const gate = await requireRoleApi('admin')
    if (!gate.ok) return gate.response
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json(
      { error: 'Server misconfigured: admin client unavailable' },
      { status: 500 },
    )
  }

  const url = new URL(request.url)
  const readRetention = url.searchParams.get('read_retention') || '30 days'
  const hardCap = url.searchParams.get('hard_cap') || '90 days'

  const { data, error } = await admin.rpc('fn_purge_notifications', {
    p_read_retention: readRetention,
    p_hard_cap: hardCap,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
