import { createClient } from '@/utils/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(s: string) {
  return UUID_RE.test(s)
}

export type InternshipSessionStatus = 'ACTIVE' | 'ON_BREAK' | 'INACTIVE_AUTO' | 'ENDED'

export type InternshipSessionRow = {
  id: string
  user_id: string
  course_id: string | null
  start_time: string
  end_time: string | null
  active_seconds: number
  break_seconds: number
  status: InternshipSessionStatus
  last_tick_at: string
  had_inactivity_auto: boolean
  created_at: string
  updated_at: string
}

export async function requireUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export async function listOpenSessions(
  supabase: SupabaseClient,
  userId: string,
): Promise<InternshipSessionRow[]> {
  const { data, error } = await supabase
    .from('internship_sessions')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'ENDED')
    .order('updated_at', { ascending: false })

  if (error || !data) return []
  return data as InternshipSessionRow[]
}

export async function getOpenSessionForCourse(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
): Promise<InternshipSessionRow | null> {
  const { data, error } = await supabase
    .from('internship_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .neq('status', 'ENDED')
    .maybeSingle()

  if (error || !data) return null
  return data as InternshipSessionRow
}

export async function resolveOpenSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId?: string | null,
): Promise<InternshipSessionRow | null> {
  if (sessionId?.trim()) {
    const { data } = await supabase
      .from('internship_sessions')
      .select('*')
      .eq('id', sessionId.trim())
      .eq('user_id', userId)
      .neq('status', 'ENDED')
      .maybeSingle()
    return (data as InternshipSessionRow) ?? null
  }
  const all = await listOpenSessions(supabase, userId)
  return all[0] ?? null
}

const LOGGABLE = new Set([
  'mouse_move',
  'click',
  'keypress',
  'visibility_hidden',
  'visibility_visible',
  'heartbeat',
  'inactivity_detected',
  'session_start',
  'break_start',
  'resume',
  'session_end',
  'ping_challenge_ok',
])

export async function insertActivityLogs(
  supabase: SupabaseClient,
  sessionId: string,
  types: string[],
) {
  const rows = types
    .filter((t) => LOGGABLE.has(t))
    .slice(0, 15)
    .map((event_type) => ({ session_id: sessionId, event_type }))
  if (rows.length === 0) return
  await supabase.from('internship_activity_logs').insert(rows)
}
