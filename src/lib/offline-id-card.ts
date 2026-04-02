/** Shared helpers for offline physical ID cards (format matches DB check constraint). */

export const OFFLINE_ID_CODE_RE = /^ID-[A-Z0-9]{3}-[A-Z0-9]{3}$/

export function normalizeOfflinePublicCode(raw: string): string {
  return raw.trim().toUpperCase()
}

export type BindErrorCode =
  | 'INVALID_CODE'
  | 'FORBIDDEN'
  | 'NOT_ENROLLED'
  | 'CARD_NOT_FOUND'
  | 'ALREADY_BOUND'
  | 'NOT_BOUND'
  | 'COURSE_MISMATCH'
  | 'DB_ERROR'
  | 'NOT_SIGNED_IN'

export type BindOfflineIdCardResult =
  | { ok: true }
  | { ok: false; code: BindErrorCode; message: string }

export type LookupOfflineIdCardResult =
  | { ok: true; status: 'unbound' | 'bound'; courseId: string | null; learnerId: string | null }
  | { ok: false; code: BindErrorCode; message: string }
