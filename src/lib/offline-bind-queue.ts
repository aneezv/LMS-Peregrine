/**
 * IndexedDB outbox for offline ID card binds. Prefer IDB over localStorage for size and async durability.
 * Sync when `online` and on a periodic interval from the bind UI.
 */

export type OfflineBindQueueItem = {
  localId: string
  publicCode: string
  courseId: string
  learnerId: string
  createdAt: number
  attempts: number
  lastError?: string
}

export type OfflineBindDeadLetter = OfflineBindQueueItem & {
  failedAt: number
  code: string
  message: string
}

const DB_NAME = 'peregrine-offline-bind-v1'
const DB_VERSION = 1
const STORE_PENDING = 'pending'
const STORE_FAILURES = 'failures'

/** Server / validation errors: drop from queue and record (no infinite retries). */
const NO_RETRY_CODES = new Set<string>([
  'INVALID_CODE',
  'FORBIDDEN',
  'NOT_ENROLLED',
  'CARD_NOT_FOUND',
  'ALREADY_BOUND',
  'NOT_BOUND',
  'COURSE_MISMATCH',
])

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        db.createObjectStore(STORE_PENDING, { keyPath: 'localId' })
      }
      if (!db.objectStoreNames.contains(STORE_FAILURES)) {
        db.createObjectStore(STORE_FAILURES, { keyPath: 'localId' })
      }
    }
  })
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function enqueueOfflineBind(item: Omit<OfflineBindQueueItem, 'attempts'>): Promise<void> {
  const db = await openDb()
  const row: OfflineBindQueueItem = { ...item, attempts: 0 }
  const tx = db.transaction(STORE_PENDING, 'readwrite')
  await idbReq(tx.objectStore(STORE_PENDING).put(row))
}

export async function listPendingBinds(): Promise<OfflineBindQueueItem[]> {
  const db = await openDb()
  const tx = db.transaction(STORE_PENDING, 'readonly')
  const store = tx.objectStore(STORE_PENDING)
  return new Promise((resolve, reject) => {
    const out: OfflineBindQueueItem[] = []
    const cur = store.openCursor()
    cur.onerror = () => reject(cur.error)
    cur.onsuccess = () => {
      const c = cur.result
      if (!c) {
        out.sort((a, b) => a.createdAt - b.createdAt)
        resolve(out)
        return
      }
      out.push(c.value as OfflineBindQueueItem)
      c.continue()
    }
  })
}

export async function removePendingBind(localId: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE_PENDING, 'readwrite')
  await idbReq(tx.objectStore(STORE_PENDING).delete(localId))
}

async function putFailure(row: OfflineBindDeadLetter): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE_FAILURES, 'readwrite')
  await idbReq(tx.objectStore(STORE_FAILURES).put(row))
}

export async function listRecentFailures(limit = 20): Promise<OfflineBindDeadLetter[]> {
  const db = await openDb()
  const tx = db.transaction(STORE_FAILURES, 'readonly')
  const store = tx.objectStore(STORE_FAILURES)
  return new Promise((resolve, reject) => {
    const out: OfflineBindDeadLetter[] = []
    const cur = store.openCursor()
    cur.onerror = () => reject(cur.error)
    cur.onsuccess = () => {
      const c = cur.result
      if (!c) {
        out.sort((a, b) => b.failedAt - a.failedAt)
        resolve(out.slice(0, limit))
        return
      }
      out.push(c.value as OfflineBindDeadLetter)
      c.continue()
    }
  })
}

export type BindAttemptResult = { ok: true } | { ok: false; code: string; message: string }

/**
 * Drain pending rows. `attempt` should call the server bind action and return structured result.
 * Uses `navigator.onLine` short-circuit (caller may also skip when offline).
 */
export async function processOfflineBindQueue(
  attempt: (item: OfflineBindQueueItem) => Promise<BindAttemptResult>,
): Promise<{ processed: number; remaining: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const pending = await listPendingBinds()
    return { processed: 0, remaining: pending.length }
  }

  const pending = await listPendingBinds()
  let processed = 0
  for (const item of pending) {
    try {
      const res = await attempt(item)
      if (res.ok) {
        await removePendingBind(item.localId)
        processed += 1
        continue
      }
      if (NO_RETRY_CODES.has(res.code)) {
        await putFailure({
          ...item,
          failedAt: Date.now(),
          code: res.code,
          message: res.message,
        })
        await removePendingBind(item.localId)
        processed += 1
        continue
      }
      const next: OfflineBindQueueItem = {
        ...item,
        attempts: item.attempts + 1,
        lastError: `${res.code}: ${res.message}`,
      }
      const db = await openDb()
      const tx = db.transaction(STORE_PENDING, 'readwrite')
      await idbReq(tx.objectStore(STORE_PENDING).put(next))
    } catch {
      const next: OfflineBindQueueItem = {
        ...item,
        attempts: item.attempts + 1,
        lastError: 'Network or unexpected error',
      }
      const db = await openDb()
      const tx = db.transaction(STORE_PENDING, 'readwrite')
      await idbReq(tx.objectStore(STORE_PENDING).put(next))
    }
  }
  const rest = await listPendingBinds()
  return { processed, remaining: rest.length }
}

export function newLocalId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}
