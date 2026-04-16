import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { GENERAL_DEPARTMENT_NAME } from '@/lib/course-departments'

export type SheetRowInput = {
  rowNumber: number
  email: string
  password: string
  course_id: string
  full_name: string
}

export type RowSyncDetail = {
  rowNumber: number
  outcome: 'synced' | 'partial' | 'error' | 'skipped'
  message?: string
}

const LIST_USERS_PER_PAGE = 200
const LIST_USERS_MAX_PAGES = 12

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let cachedGeneralDepartmentId: string | null = null

async function getGeneralDepartmentId(admin: SupabaseClient): Promise<string> {
  if (cachedGeneralDepartmentId) return cachedGeneralDepartmentId
  const { data, error } = await admin
    .from('departments')
    .select('id')
    .ilike('name', GENERAL_DEPARTMENT_NAME)
    .limit(1)
    .maybeSingle()
  if (data?.id) {
    cachedGeneralDepartmentId = data.id
    return data.id
  }
  throw new Error(
    `General department not found (required for sheet sync course create): ${error?.message ?? 'unknown'}`,
  )
}

export function parseCourseRefs(raw: string): string[] {
  if (!raw) return []
  const parts = raw.split(/[,;\n]+/)
  const out: string[] = []
  const seen: Record<string, boolean> = {}
  for (const p of parts) {
    const c = p.trim()
    if (!c) continue
    const key = c.toLowerCase()
    if (seen[key]) continue
    seen[key] = true
    out.push(c)
  }
  return out
}

function isLikelyUuid(s: string): boolean {
  return UUID_RE.test(String(s).trim())
}

function looksLikeAdminListUsersPayload(json: Record<string, unknown> | null): boolean {
  return !!(json && Array.isArray(json.users) && json.users.length && !json.user)
}

function pickUserFromAdminCreateResponse(
  json: Record<string, unknown>,
  email: string,
): User | null {
  if (!json) return null
  if (json.user && typeof json.user === 'object' && json.user !== null) {
    const u = json.user as { id?: string }
    if (u.id) return json.user as User
  }
  if (json.id && !json.users) return json as unknown as User
  const target = String(email || '').toLowerCase()
  const users = json.users as User[] | undefined
  if (!users?.length) return null
  for (const u of users) {
    if (String(u.email || '').toLowerCase() === target) return u
    const ids = u.identities || []
    for (const id of ids) {
      const idd = id.identity_data as { email?: string } | undefined
      if (String(idd?.email || '').toLowerCase() === target) return u
    }
  }
  return null
}

function isAuthDuplicateEmail(httpCode: number, body: string): boolean {
  const t = String(body || '')
  const low = t.toLowerCase()
  if (httpCode === 409) return true
  try {
    const j = JSON.parse(t) as { error_code?: string; code?: string; msg?: string; message?: string }
    const errCode = String(j.error_code || j.code || '').toLowerCase()
    const msg = String(j.msg || j.message || '').toLowerCase()
    if (errCode === 'email_exists' || errCode === 'user_already_exists') return true
    if (errCode === 'identity_already_exists') return true
    if (msg.includes('already registered')) return true
    if (msg.includes('already exists') && msg.includes('user')) return true
    if (msg.includes('email') && msg.includes('already')) return true
    if (msg.includes('duplicate')) return true
  } catch {
    /* ignore */
  }
  if (low.includes('already been registered')) return true
  if (low.includes('user already registered')) return true
  if (low.includes('email address is already')) return true
  if (low.includes('email_exists')) return true
  return false
}

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const target = email.toLowerCase()
  for (let page = 1; page <= LIST_USERS_MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: LIST_USERS_PER_PAGE })
    if (error || !data?.users?.length) break
    for (const u of data.users) {
      if (String(u.email || '').toLowerCase() === target) return u
      for (const id of u.identities || []) {
        const idd = id.identity_data as { email?: string } | undefined
        if (String(idd?.email || '').toLowerCase() === target) return u
      }
    }
    if (data.users.length < LIST_USERS_PER_PAGE) break
  }
  return null
}

async function courseExistsById(admin: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await admin.from('courses').select('id').eq('id', id.trim()).limit(1).maybeSingle()
  if (error) return false
  return !!data?.id
}

async function findCourseIdByCode(admin: SupabaseClient, code: string): Promise<string | null> {
  const trimmed = code.trim()
  const { data, error } = await admin
    .from('courses')
    .select('id')
    .ilike('course_code', trimmed)
    .limit(1)
    .maybeSingle()
  if (error || !data?.id) return null
  return data.id
}

async function ensureCourseByCode(admin: SupabaseClient, instructorId: string, code: string): Promise<string> {
  const trimmed = code.trim()
  const existing = await findCourseIdByCode(admin, trimmed)
  if (existing) return existing

  const departmentId = await getGeneralDepartmentId(admin)

  const { data: inserted, error } = await admin
    .from('courses')
    .insert({
      instructor_id: instructorId,
      course_code: trimmed,
      title: `Placeholder: ${trimmed}`,
      description: 'Auto-created from Google Sheet sync. Add modules in the LMS when ready.',
      status: 'draft',
      enrollment_type: 'invite_only',
      department_id: departmentId,
    })
    .select('id')
    .single()

  if (!error && inserted?.id) return inserted.id

  const body = error?.message || ''
  if (
    error?.code === '23505' ||
    body.toLowerCase().includes('duplicate') ||
    body.toLowerCase().includes('unique')
  ) {
    const again = await findCourseIdByCode(admin, trimmed)
    if (again) return again
  }

  throw new Error(`Create course failed: ${body || JSON.stringify(error)}`)
}

async function resolveCourseRef(admin: SupabaseClient, instructorId: string, token: string): Promise<string> {
  const t = token.trim()
  if (isLikelyUuid(t)) {
    if (await courseExistsById(admin, t)) return t
    throw new Error('no course with this id')
  }
  return ensureCourseByCode(admin, instructorId, t)
}

async function updateProfileFullName(admin: SupabaseClient, profileId: string, fullName: string): Promise<void> {
  if (!fullName) return
  const { error } = await admin.from('profiles').update({ full_name: fullName }).eq('id', profileId)
  if (error) {
    console.warn('profile full_name patch:', error.message)
  }
}

async function ensureProfileExists(admin: SupabaseClient, userId: string, fullName: string): Promise<void> {
  // Check if profile already exists
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()
  
  if (existingProfile) {
    // Profile exists, update full_name if provided
    if (fullName) {
      await updateProfileFullName(admin, userId, fullName)
    }
    return
  }
  
  // Create profile for the user
  const { error } = await admin
    .from('profiles')
    .insert({
      id: userId,
      full_name: fullName || null,
      role: 'learner', // Default role for sheet-synced users
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  
  if (error) {
    // Check if it's a duplicate key error (profile was created concurrently)
    if (error.code === '23505' || error.message?.toLowerCase().includes('duplicate')) {
      // Profile was created by another process, try to update full_name
      if (fullName) {
        await updateProfileFullName(admin, userId, fullName)
      }
      return
    }
    throw new Error(`Failed to create profile for user ${userId}: ${error.message}`)
  }
}

async function adminCreateUser(
  admin: SupabaseClient,
  email: string,
  password: string,
  fullName: string,
): Promise<User | null> {
  const user_metadata: Record<string, string> = { source: 'google_sheet_sync' }
  if (fullName) user_metadata.full_name = fullName

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata,
  })

  if (error) {
    const msg = error.message || ''
    const status = (error as { status?: number }).status ?? 0
    if (isAuthDuplicateEmail(status, msg)) return null
    throw new Error(`Auth create failed (${status}): ${msg}`)
  }

  if (data?.user?.id) return data.user

  const raw = data as unknown as Record<string, unknown> | null
  if (raw) {
    const u = pickUserFromAdminCreateResponse(raw, email)
    if (u?.id) return u
    if (looksLikeAdminListUsersPayload(raw)) {
      throw new Error(
        'POST /admin/users returned a user list instead of create payload. Check Supabase URL and server client.',
      )
    }
  }
  const found = await findUserByEmail(admin, email)
  if (found?.id) return found
  throw new Error(`Auth returned success but could not resolve user id for ${email}`)
}

async function ensureAuthUser(
  admin: SupabaseClient,
  email: string,
  password: string,
  fullName: string,
): Promise<string> {
  const created = await adminCreateUser(admin, email, password, fullName)
  if (created?.id) {
    // Ensure profile is created for the new user
    await ensureProfileExists(admin, created.id, fullName)
    return created.id
  }

  const existing = await findUserByEmail(admin, email)
  if (existing?.id) {
    if (fullName) await updateProfileFullName(admin, existing.id, fullName)
    return existing.id
  }

  throw new Error(
    `Could not create or find user for ${email}. Confirm service role key and Auth settings.`,
  )
}

async function enrollLearner(admin: SupabaseClient, courseId: string, learnerId: string): Promise<void> {
  const { error } = await admin.from('enrollments').insert({
    course_id: courseId,
    learner_id: learnerId,
  })
  if (!error) return
  if (error.code === '23505') return
  const msg = error.message || JSON.stringify(error)
  if (msg.toLowerCase().includes('duplicate') || msg.includes('409')) return
  
  // Provide more specific error messages for common issues
  if (msg.includes('violates foreign key constraint') && msg.includes('learner_id')) {
    throw new Error(`Learner profile not found for user ${learnerId}. User may not have a profile record.`)
  }
  if (msg.includes('violates foreign key constraint') && msg.includes('course_id')) {
    throw new Error(`Course not found: ${courseId}`)
  }
  
  throw new Error(`enrollments: ${msg}`)
}

/**
 * Sync one sheet row: create/find user, resolve courses, enroll.
 */
export async function syncOneRow(
  admin: SupabaseClient,
  instructorId: string,
  row: SheetRowInput,
): Promise<RowSyncDetail> {
  const email = row.email.trim()
  const password = String(row.password || '').trim()
  const courseRaw = String(row.course_id || '').trim()
  const fullName = String(row.full_name || '').trim()

  if (!email) {
    return { rowNumber: row.rowNumber, outcome: 'skipped', message: 'skipped: no email' }
  }
  if (!password) {
    return { rowNumber: row.rowNumber, outcome: 'skipped', message: 'skipped: no password' }
  }

  try {
    const userId = await ensureAuthUser(admin, email, password, fullName)
    const refs = parseCourseRefs(courseRaw)

    if (refs.length === 0) {
      return { rowNumber: row.rowNumber, outcome: 'synced', message: 'synced (no courses)' }
    }

    const errors: string[] = []
    for (const ref of refs) {
      try {
        const courseId = await resolveCourseRef(admin, instructorId, ref)
        await enrollLearner(admin, courseId, userId)
      } catch (ex) {
        errors.push(`${ref}: ${ex instanceof Error ? ex.message : String(ex)}`)
      }
    }

    if (errors.length) {
      return {
        rowNumber: row.rowNumber,
        outcome: 'partial',
        message: `partial: ${errors.join(' | ')}`,
      }
    }
    return { rowNumber: row.rowNumber, outcome: 'synced', message: 'synced' }
  } catch (e) {
    return {
      rowNumber: row.rowNumber,
      outcome: 'error',
      message: e instanceof Error ? e.message : String(e),
    }
  }
}
