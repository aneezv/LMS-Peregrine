import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { runSheetSync } from '@/lib/integrations/google-sheets/syncFromRows'
import { ROLES } from '@/lib/roles'

export const runtime = 'nodejs'

/**
 * Vercel / Next: platform max (e.g. 300s on Pro). Reduce load per request with
 * env SHEET_SYNC_MAX_WORK_ROWS (default 25; idempotent skips do not count).
 */
export const maxDuration = 300

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return out === 0
}

export async function POST(request: Request) {
  const cronSecret = process.env.SHEET_SYNC_CRON_SECRET
  const authHeader = request.headers.get('authorization') || ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  const cronOk = !!(cronSecret && bearer && timingSafeEqual(bearer, cronSecret))

  if (!cronOk) {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const role = profile?.role ?? ROLES.LEARNER
    if (role !== ROLES.ADMIN) {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured: admin client unavailable' }, { status: 500 })
  }

  const webAppUrl = process.env.GOOGLE_APPS_SCRIPT_WEBAPP_URL
  const exportSecret = process.env.SHEETS_EXPORT_SECRET
  const instructorId = process.env.SHEET_SYNC_DEFAULT_INSTRUCTOR_ID

  if (!webAppUrl || !exportSecret || !instructorId) {
    return NextResponse.json(
      {
        error:
          'Missing env: GOOGLE_APPS_SCRIPT_WEBAPP_URL, SHEETS_EXPORT_SECRET, SHEET_SYNC_DEFAULT_INSTRUCTOR_ID',
      },
      { status: 500 },
    )
  }

  let force = false
  try {
    const url = new URL(request.url)
    force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true'
  } catch {
    /* ignore */
  }
  try {
    const body = await request.json().catch(() => ({}))
    if (body && typeof body === 'object' && 'force' in body) {
      force = Boolean((body as { force?: boolean }).force)
    }
  } catch {
    /* ignore */
  }

  try {
    const result = await runSheetSync({
      admin,
      instructorId,
      webAppUrl,
      exportSecret,
      force,
    })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
