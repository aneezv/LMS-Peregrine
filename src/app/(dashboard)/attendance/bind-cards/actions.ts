'use server'

import { createClient } from '@/utils/supabase/server'
import {
  normalizeOfflinePublicCode,
  OFFLINE_ID_CODE_RE,
  type BindOfflineIdCardResult,
  type LookupOfflineIdCardResult,
} from '@/lib/offline-id-card'

async function requireStaffAndCourseAccess(courseId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { supabase, user: null as null, error: 'NOT_SIGNED_IN' as const }
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role ?? 'learner'
  if (role !== 'instructor' && role !== 'admin') {
    return { supabase, user, error: 'FORBIDDEN' as const }
  }

  const { data: course } = await supabase.from('courses').select('instructor_id').eq('id', courseId).single()
  if (!course) {
    return { supabase, user, error: 'FORBIDDEN' as const }
  }
  if (role !== 'admin' && course.instructor_id !== user.id) {
    return { supabase, user, error: 'FORBIDDEN' as const }
  }

  return { supabase, user, error: null as null }
}

export async function lookupOfflineIdCard(publicCode: string): Promise<LookupOfflineIdCardResult> {
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
  const role = profile?.role ?? 'learner'
  if (role !== 'instructor' && role !== 'admin') {
    return { ok: false, code: 'FORBIDDEN', message: 'You do not have access.' }
  }

  const { data: row, error } = await supabase
    .from('offline_learner_id_cards')
    .select('course_id, learner_id')
    .eq('public_code', normalized)
    .maybeSingle()

  if (error) {
    return { ok: false, code: 'DB_ERROR', message: error.message }
  }
  if (!row) {
    return { ok: false, code: 'CARD_NOT_FOUND', message: 'No card found for this code.' }
  }

  const bound = row.learner_id != null
  return {
    ok: true,
    status: bound ? 'bound' : 'unbound',
    courseId: (row.course_id as string | null) ?? null,
    learnerId: (row.learner_id as string | null) ?? null,
  }
}

export async function bindOfflineIdCard(input: {
  publicCode: string
  courseId: string
  learnerId: string
}): Promise<BindOfflineIdCardResult> {
  const normalized = normalizeOfflinePublicCode(input.publicCode)
  if (!OFFLINE_ID_CODE_RE.test(normalized)) {
    return { ok: false, code: 'INVALID_CODE', message: 'Code must look like ID-ABC-XYZ.' }
  }

  const { supabase, user, error: accessErr } = await requireStaffAndCourseAccess(input.courseId)
  if (!user || accessErr) {
    const code = accessErr === 'NOT_SIGNED_IN' ? 'NOT_SIGNED_IN' : 'FORBIDDEN'
    const message =
      accessErr === 'NOT_SIGNED_IN' ? 'Not signed in.' : 'You do not have access to this course.'
    return { ok: false, code, message }
  }

  const { data: enrollment, error: enrErr } = await supabase
    .from('enrollments')
    .select('id')
    .eq('course_id', input.courseId)
    .eq('learner_id', input.learnerId)
    .maybeSingle()

  if (enrErr) {
    return { ok: false, code: 'DB_ERROR', message: enrErr.message }
  }
  if (!enrollment) {
    return {
      ok: false,
      code: 'NOT_ENROLLED',
      message: 'This learner is not enrolled in the selected course.',
    }
  }

  const { data: card, error: cardErr } = await supabase
    .from('offline_learner_id_cards')
    .select('id, course_id, learner_id')
    .eq('public_code', normalized)
    .maybeSingle()

  if (cardErr) {
    return { ok: false, code: 'DB_ERROR', message: cardErr.message }
  }
  if (!card) {
    return { ok: false, code: 'CARD_NOT_FOUND', message: 'No card found for this code.' }
  }

  const existingCourseId = card.course_id as string | null
  if (existingCourseId != null && existingCourseId !== input.courseId) {
    return {
      ok: false,
      code: 'COURSE_MISMATCH',
      message: 'This card is reserved for a different course.',
    }
  }

  const existingLearnerId = card.learner_id as string | null
  if (existingLearnerId != null) {
    if (existingLearnerId === input.learnerId) {
      return { ok: true }
    }
    return {
      ok: false,
      code: 'ALREADY_BOUND',
      message: 'This card is already bound to another learner.',
    }
  }

  const { data: updated, error: upErr } = await supabase
    .from('offline_learner_id_cards')
    .update({
      learner_id: input.learnerId,
      bound_at: new Date().toISOString(),
      bound_by: user.id,
      course_id: input.courseId,
    })
    .eq('public_code', normalized)
    .is('learner_id', null)
    .select('id')
    .maybeSingle()

  if (upErr) {
    if (upErr.code === '23505') {
      return {
        ok: false,
        code: 'ALREADY_BOUND',
        message: 'This learner already has a bound card for this course, or the card was just taken.',
      }
    }
    return { ok: false, code: 'DB_ERROR', message: upErr.message }
  }

  if (!updated) {
    return {
      ok: false,
      code: 'ALREADY_BOUND',
      message: 'This card was bound by someone else just now, or is no longer available.',
    }
  }

  return { ok: true }
}

/** Clear bind fields and release card (course_id cleared so it returns to the global pool). */
export async function unbindOfflineIdCard(input: {
  publicCode: string
  courseId: string
}): Promise<BindOfflineIdCardResult> {
  const normalized = normalizeOfflinePublicCode(input.publicCode)
  if (!OFFLINE_ID_CODE_RE.test(normalized)) {
    return { ok: false, code: 'INVALID_CODE', message: 'Code must look like ID-ABC-XYZ.' }
  }

  const { supabase, user, error: accessErr } = await requireStaffAndCourseAccess(input.courseId)
  if (!user || accessErr) {
    const code = accessErr === 'NOT_SIGNED_IN' ? 'NOT_SIGNED_IN' : 'FORBIDDEN'
    const message =
      accessErr === 'NOT_SIGNED_IN' ? 'Not signed in.' : 'You do not have access to this course.'
    return { ok: false, code, message }
  }

  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = prof?.role === 'admin'

  const { data: card, error: cardErr } = await supabase
    .from('offline_learner_id_cards')
    .select('learner_id, course_id')
    .eq('public_code', normalized)
    .maybeSingle()

  if (cardErr) {
    return { ok: false, code: 'DB_ERROR', message: cardErr.message }
  }
  if (!card) {
    return { ok: false, code: 'CARD_NOT_FOUND', message: 'No card found for this code.' }
  }
  if (!card.learner_id) {
    return { ok: false, code: 'NOT_BOUND', message: 'This card is not bound.' }
  }

  const rowCourseId = card.course_id as string | null
  if (!isAdmin) {
    if (!rowCourseId || rowCourseId !== input.courseId) {
      return {
        ok: false,
        code: 'COURSE_MISMATCH',
        message: 'Select the course this card was bound under, then try again.',
      }
    }
  }

  const { data: updated, error: upErr } = await supabase
    .from('offline_learner_id_cards')
    .update({
      learner_id: null,
      bound_at: null,
      bound_by: null,
      course_id: null,
    })
    .eq('public_code', normalized)
    .not('learner_id', 'is', null)
    .select('id')
    .maybeSingle()

  if (upErr) {
    return { ok: false, code: 'DB_ERROR', message: upErr.message }
  }
  if (!updated) {
    return {
      ok: false,
      code: 'NOT_BOUND',
      message: 'This card is no longer bound (refresh preview).',
    }
  }

  return { ok: true }
}
