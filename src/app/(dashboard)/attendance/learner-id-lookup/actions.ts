'use server'

import { createClient } from '@/utils/supabase/server'
import {
  normalizeOfflinePublicCode,
  OFFLINE_ID_CODE_RE,
} from '@/lib/offline-id-card'
import { ROLES, isInstructorRole } from '@/lib/roles'

export type LearnerIdCourseInfo = {
  id: string
  title: string
  course_code: string
}

export type LearnerIdProfileInfo = {
  id: string
  full_name: string | null
  email: string | null
}

export type LookupLearnerByIdCardResult =
  | {
      ok: true
      bound: false
      publicCode: string
    }
  | {
      ok: true
      bound: true
      publicCode: string
      enrolledCourses: LearnerIdCourseInfo[]
      learner: LearnerIdProfileInfo
    }
  | { ok: false; code: string; message: string }

export async function lookupLearnerByIdCard(publicCode: string): Promise<LookupLearnerByIdCardResult> {
  const normalized = normalizeOfflinePublicCode(publicCode)
  if (!OFFLINE_ID_CODE_RE.test(normalized)) {
    return { ok: false, code: 'INVALID_CODE', message: 'Code must look like ID-ABC-XYZ.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, code: 'NOT_SIGNED_IN', message: 'Not signed in.' }
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role ?? ROLES.LEARNER
  if (!isInstructorRole(role)) {
    return { ok: false, code: 'FORBIDDEN', message: 'You do not have access.' }
  }

  const { data: row, error } = await supabase
    .from('offline_learner_id_cards')
    .select('public_code, learner_id')
    .eq('public_code', normalized)
    .maybeSingle()

  if (error) {
    return { ok: false, code: 'DB_ERROR', message: error.message }
  }
  if (!row) {
    return { ok: false, code: 'CARD_NOT_FOUND', message: 'No card found for this code (or you cannot access it).' }
  }

  const learnerId = row.learner_id as string | null
  if (!learnerId) {
    return {
      ok: true,
      bound: false,
      publicCode: normalized,
    }
  }

  const { data: learnerRow, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', learnerId)
    .maybeSingle()

  if (pErr) {
    return { ok: false, code: 'DB_ERROR', message: pErr.message }
  }
  if (!learnerRow) {
    return {
      ok: false,
      code: 'PROFILE_HIDDEN',
      message:
        "This card is bound, but you do not have permission to view this learner's profile (or the profile is missing).",
    }
  }

  const { data: enrRows, error: enrErr } = await supabase
    .from('enrollments')
    .select(
      `
      course_id,
      courses ( id, title, course_code )
    `,
    )
    .eq('learner_id', learnerId)

  if (enrErr) {
    return { ok: false, code: 'DB_ERROR', message: enrErr.message }
  }

  const enrolledCourses: LearnerIdCourseInfo[] = []
  for (const r of enrRows ?? []) {
    const embed = r.courses as unknown
    const c = Array.isArray(embed) ? embed[0] : embed
    if (c && typeof c === 'object' && c !== null && 'id' in c && (c as { id: unknown }).id) {
      enrolledCourses.push({
        id: String((c as { id: unknown }).id),
        title: String((c as { title?: unknown }).title ?? ''),
        course_code: String((c as { course_code?: unknown }).course_code ?? ''),
      })
    }
  }
  enrolledCourses.sort((a, b) => a.title.localeCompare(b.title))

  return {
    ok: true,
    bound: true,
    publicCode: normalized,
    enrolledCourses,
    learner: {
      id: learnerRow.id as string,
      full_name: learnerRow.full_name as string | null,
      email: learnerRow.email as string | null,
    },
  }
}
