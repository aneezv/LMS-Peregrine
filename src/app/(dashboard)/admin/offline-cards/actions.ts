'use server'

import { createClient } from '@/utils/supabase/server'
import { normalizeOfflinePublicCode, OFFLINE_ID_CODE_RE } from '@/lib/offline-id-card'
import { ROLES } from '@/lib/roles'

const MAX_CODES = 5000
const LOOKUP_CHUNK = 150
const INSERT_BATCH = 80

export type ImportOfflineIdCardsResult =
  | {
      ok: true
      totalSubmitted: number
      validUnique: number
      invalidFormat: number
      duplicateInUpload: number
      alreadyInDatabase: number
      inserted: number
      insertErrors: string[]
    }
  | { ok: false; message: string }

export async function importOfflineIdCards(input: {
  codes: string[]
  batchLabel?: string | null
}): Promise<ImportOfflineIdCardsResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Not signed in.' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== ROLES.ADMIN) {
    return { ok: false, message: 'Only administrators can import card codes.' }
  }

  const raw = input.codes ?? []
  if (raw.length === 0) return { ok: false, message: 'No codes provided.' }
  if (raw.length > MAX_CODES) {
    return { ok: false, message: `Too many codes at once (max ${MAX_CODES}).` }
  }

  let invalidFormat = 0
  let duplicateInUpload = 0
  const seen = new Set<string>()
  const validUnique: string[] = []

  for (const line of raw) {
    const n = normalizeOfflinePublicCode(line)
    if (!n) continue
    if (!OFFLINE_ID_CODE_RE.test(n)) {
      invalidFormat++
      continue
    }
    if (seen.has(n)) {
      duplicateInUpload++
      continue
    }
    seen.add(n)
    validUnique.push(n)
  }

  const batchLabel = input.batchLabel?.trim() || null

  let alreadyInDatabase = 0
  const toInsert: { public_code: string; batch_label: string | null }[] = []

  for (let i = 0; i < validUnique.length; i += LOOKUP_CHUNK) {
    const chunk = validUnique.slice(i, i + LOOKUP_CHUNK)
    const { data: existing, error: exErr } = await supabase
      .from('offline_learner_id_cards')
      .select('public_code')
      .in('public_code', chunk)

    if (exErr) return { ok: false, message: `Lookup failed: ${exErr.message}` }

    const existingSet = new Set((existing ?? []).map((r) => r.public_code as string))
    for (const code of chunk) {
      if (existingSet.has(code)) {
        alreadyInDatabase++
      } else {
        toInsert.push({ public_code: code, batch_label: batchLabel })
      }
    }
  }

  let inserted = 0
  const insertErrors: string[] = []

  for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
    const batch = toInsert.slice(i, i + INSERT_BATCH)
    const { data: insData, error: insErr } = await supabase
      .from('offline_learner_id_cards')
      .insert(batch)
      .select('public_code')

    if (!insErr && insData) {
      inserted += insData.length
      continue
    }

    for (const row of batch) {
      const { error: e2 } = await supabase.from('offline_learner_id_cards').insert(row).select('id')
      if (!e2) {
        inserted++
      } else if (e2.code === '23505') {
        alreadyInDatabase++
      } else if (insertErrors.length < 25) {
        insertErrors.push(`${row.public_code}: ${e2.message}`)
      }
    }
  }

  const nonEmptyLines = raw.filter((x) => normalizeOfflinePublicCode(x) !== '').length

  return {
    ok: true,
    totalSubmitted: nonEmptyLines > 0 ? nonEmptyLines : raw.length,
    validUnique: validUnique.length,
    invalidFormat,
    duplicateInUpload,
    alreadyInDatabase,
    inserted,
    insertErrors,
  }
}
