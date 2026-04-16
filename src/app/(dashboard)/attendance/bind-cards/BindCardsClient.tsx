'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { AttendanceCourseOption } from '../AttendanceClient'
import { bindOfflineIdCard, lookupOfflineIdCard, unbindOfflineIdCard } from './actions'
import {
  normalizeOfflinePublicCode,
  OFFLINE_ID_CODE_RE,
  type LookupOfflineIdCardResult,
} from '@/lib/offline-id-card'
import {
  enqueueOfflineBind,
  listPendingBinds,
  listRecentFailures,
  newLocalId,
  processOfflineBindQueue,
  type OfflineBindDeadLetter,
  type OfflineBindQueueItem,
} from '@/lib/offline-bind-queue'
import { Camera, Search, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'

type LearnerOption = { id: string; full_name: string | null; email: string | null }

function learnerListPrimaryLine(u: LearnerOption): string {
  const name = u.full_name?.trim()
  if (name) return name
  return u.email?.trim() || u.id
}

function learnerListSecondaryLine(u: LearnerOption): string | null {
  const name = u.full_name?.trim()
  const mail = u.email?.trim()
  if (name && mail) return mail
  return null
}

function learnerSelectedSummary(u: LearnerOption): string {
  const name = u.full_name?.trim()
  const mail = u.email?.trim()
  if (name && mail) return `${name} · ${mail}`
  if (name) return name
  if (mail) return mail
  return u.id
}

export default function BindCardsClient({
  courses,
  allowUnbind,
  isAdmin,
}: {
  courses: AttendanceCourseOption[]
  /** Instructors and admins may unbind; coordinators may not. */
  allowUnbind: boolean
  /** Admins may unbind without the bound learner appearing in the selected course roster. */
  isAdmin: boolean
}) {
  const readerDomId = useId().replace(/:/g, '')
  const courseComboId = useId()
  const [courseId, setCourseId] = useState('')
  const [learnerQuery, setLearnerQuery] = useState('')
  const [learnerHits, setLearnerHits] = useState<LearnerOption[]>([])
  const [learnerSearchNote, setLearnerSearchNote] = useState<string | null>(null)
  const [courseLearners, setCourseLearners] = useState<LearnerOption[]>([])
  const [courseLearnersLoading, setCourseLearnersLoading] = useState(false)
  const [courseLearnersErr, setCourseLearnersErr] = useState<string | null>(null)
  const [learnerPick, setLearnerPick] = useState<LearnerOption | null>(null)
  const [codeInput, setCodeInput] = useState('')
  const [previewLookup, setPreviewLookup] = useState<LookupOfflineIdCardResult | null>(null)
  const [lookupErr, setLookupErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanErr, setScanErr] = useState<string | null>(null)
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null)
  const [pending, setPending] = useState<OfflineBindQueueItem[]>([])
  const [failures, setFailures] = useState<OfflineBindDeadLetter[]>([])
  // Default true for SSR + first client paint so markup matches (avoids hydration mismatch).
  const [online, setOnline] = useState(true)

  const selectedCourse = useMemo(
    () => courses.find((x) => x.id === courseId) ?? null,
    [courses, courseId],
  )

  const courseTitle = useMemo(() => {
    return selectedCourse ? `${selectedCourse.title} (${selectedCourse.course_code})` : ''
  }, [selectedCourse])

  const normalizedCode = useMemo(() => normalizeOfflinePublicCode(codeInput), [codeInput])

  const boundLearnerLabel = useMemo(() => {
    if (!previewLookup?.ok || previewLookup.status !== 'bound' || !previewLookup.learnerId) {
      return null
    }
    const u = courseLearners.find((l) => l.id === previewLookup.learnerId)
    if (!u) return `Learner ${previewLookup.learnerId.slice(0, 8)}…`
    return learnerSelectedSummary(u)
  }, [previewLookup, courseLearners])

  const refreshQueueUi = useCallback(async () => {
    const [p, f] = await Promise.all([listPendingBinds(), listRecentFailures(15)])
    setPending(p)
    setFailures(f)
  }, [])

  useEffect(() => {
    void refreshQueueUi()
  }, [refreshQueueUi])

  useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const drainQueue = useCallback(async () => {
    await processOfflineBindQueue(async (item) => {
      try {
        return await bindOfflineIdCard({
          publicCode: item.publicCode,
          courseId: item.courseId,
          learnerId: item.learnerId,
        })
      } catch {
        return { ok: false, code: 'NETWORK', message: 'Network error' }
      }
    })
    await refreshQueueUi()
  }, [refreshQueueUi])

  useEffect(() => {
    void drainQueue()
    const t = window.setInterval(() => {
      void drainQueue()
    }, 45_000)
    const onLine = () => void drainQueue()
    window.addEventListener('online', onLine)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('online', onLine)
    }
  }, [drainQueue])

  useEffect(() => {
    if (!courseId) {
      setCourseLearners([])
      setCourseLearnersErr(null)
      setCourseLearnersLoading(false)
      setLearnerHits([])
      setLearnerSearchNote(null)
      return
    }

    let cancelled = false
    ;(async () => {
      setCourseLearnersLoading(true)
      setCourseLearnersErr(null)
      setCourseLearners([])
      setLearnerHits([])
      setLearnerSearchNote(null)
      try {
        const supabase = createClient()
        const { data: enr, error: e1 } = await supabase
          .from('enrollments')
          .select('learner_id')
          .eq('course_id', courseId)
        if (cancelled) return
        if (e1) {
          setCourseLearnersErr(e1.message)
          return
        }
        const ids = [...new Set((enr ?? []).map((r) => r.learner_id as string))]
        if (ids.length === 0) {
          setCourseLearners([])
          return
        }
        const PROFILE_CHUNK = 120
        const all: LearnerOption[] = []
        for (let i = 0; i < ids.length; i += PROFILE_CHUNK) {
          const slice = ids.slice(i, i + PROFILE_CHUNK)
          const { data: profs, error: e2 } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', slice)
          if (cancelled) return
          if (e2) {
            setCourseLearnersErr(e2.message)
            return
          }
          all.push(...((profs ?? []) as LearnerOption[]))
        }
        all.sort((a, b) => {
          const na = learnerListPrimaryLine(a).toLowerCase()
          const nb = learnerListPrimaryLine(b).toLowerCase()
          if (na < nb) return -1
          if (na > nb) return 1
          const ea = (a.email ?? '').toLowerCase()
          const eb = (b.email ?? '').toLowerCase()
          if (ea < eb) return -1
          if (ea > eb) return 1
          return 0
        })
        if (!cancelled) setCourseLearners(all)
      } finally {
        if (!cancelled) setCourseLearnersLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [courseId])

  function runLearnerSearch() {
    setLearnerSearchNote(null)
    if (!courseId) return
    const q = learnerQuery.trim().toLowerCase()
    if (q.length < 2) {
      setLearnerHits([])
      setLearnerSearchNote('Enter at least 2 characters, then click Search.')
      return
    }
    if (courseLearnersLoading) {
      setLearnerHits([])
      setLearnerSearchNote('Still loading roster…')
      return
    }
    if (courseLearnersErr) {
      setLearnerHits([])
      setLearnerSearchNote('Could not load roster. Try changing course again.')
      return
    }
    const rows = courseLearners
      .filter((u) => {
        const name = (u.full_name ?? '').toLowerCase()
        const mail = (u.email ?? '').toLowerCase()
        return name.includes(q) || mail.includes(q)
      })
      .slice(0, 30)
    setLearnerHits(rows)
    if (rows.length === 0) {
      setLearnerSearchNote('No learners found matching that name or email.')
    }
  }

  useEffect(() => {
    return () => {
      const s = scannerRef.current
      if (s) {
        void s.stop().catch(() => {})
        scannerRef.current = null
      }
    }
  }, [])

  async function stopScanner() {
    const s = scannerRef.current
    if (s) {
      try {
        await s.stop()
      } catch {
        /* ignore */
      }
      scannerRef.current = null
    }
    setScanning(false)
  }

  async function startScanner() {
    setScanErr(null)
    setScanning(true)
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const elId = `qr-${readerDomId}`
      await new Promise((r) => window.setTimeout(r, 80))
      const qr = new Html5Qrcode(elId, /* verbose */ false)
      scannerRef.current = { stop: () => qr.stop() }
      await qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decoded) => {
          const norm = normalizeOfflinePublicCode(decoded)
          setCodeInput(norm)
          await stopScanner()
        },
        () => {},
      )
    } catch (e) {
      setScanErr(e instanceof Error ? e.message : 'Could not start camera (use HTTPS or localhost).')
      setScanning(false)
      scannerRef.current = null
    }
  }

  async function runPreview() {
    setLookupErr(null)
    setPreviewLookup(null)
    if (!OFFLINE_ID_CODE_RE.test(normalizedCode)) {
      setLookupErr('Enter a code like ID-ABC-XYZ (scan or type).')
      return
    }
    setBusy(true)
    try {
      const res = await lookupOfflineIdCard(normalizedCode)
      if (!res.ok) {
        setLookupErr(res.message)
        return
      }
      setPreviewLookup(res)
    } catch {
      setLookupErr('Could not look up this code. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  async function runBind() {
    setLookupErr(null)
    if (!courseId || !learnerPick || !OFFLINE_ID_CODE_RE.test(normalizedCode)) {
      setLookupErr('Choose a course, learner, and valid card code.')
      return
    }
    if (!previewLookup?.ok) {
      setLookupErr('Preview the card first, then confirm.')
      return
    }
    if (previewLookup.status === 'bound' && previewLookup.learnerId !== learnerPick.id) {
      setLookupErr('This card is already bound to another learner.')
      return
    }
    setBusy(true)
    try {
      if (!online) {
        await enqueueOfflineBind({
          localId: newLocalId(),
          publicCode: normalizedCode,
          courseId,
          learnerId: learnerPick.id,
          createdAt: Date.now(),
        })
        await refreshQueueUi()
        setCodeInput('')
        setPreviewLookup(null)
        toast.warning('Bind queued for sync when you are back online.')
        return
      }
      try {
        const res = await bindOfflineIdCard({
          publicCode: normalizedCode,
          courseId,
          learnerId: learnerPick.id,
        })
        if (res.ok) {
          setCodeInput('')
          setPreviewLookup(null)
          await refreshQueueUi()
          toast.success('Card bound successfully.')
          return
        }
        if (
          res.code === 'NOT_SIGNED_IN' ||
          res.code === 'DB_ERROR' ||
          res.message.toLowerCase().includes('fetch')
        ) {
          await enqueueOfflineBind({
            localId: newLocalId(),
            publicCode: normalizedCode,
            courseId,
            learnerId: learnerPick.id,
            createdAt: Date.now(),
          })
          await refreshQueueUi()
          setCodeInput('')
          setPreviewLookup(null)
          toast.warning('Could not reach server - bind queued for sync.')
          return
        }
        toast.error(res.message)
      } catch {
        await enqueueOfflineBind({
          localId: newLocalId(),
          publicCode: normalizedCode,
          courseId,
          learnerId: learnerPick.id,
          createdAt: Date.now(),
        })
        await refreshQueueUi()
        setCodeInput('')
        setPreviewLookup(null)
        toast.warning('Network error - bind queued for sync.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function runUnbind() {
    if (!allowUnbind) return
    setLookupErr(null)
    if (!online) {
      toast.error('Unbind needs an internet connection.')
      return
    }
    if (!courseId || !OFFLINE_ID_CODE_RE.test(normalizedCode)) {
      setLookupErr('Choose a course and a valid card code, then preview.')
      return
    }
    if (!previewLookup?.ok || previewLookup.status !== 'bound') {
      setLookupErr('Preview shows this card is not bound.')
      return
    }
    const learnerInSelectedCourse =
      !!previewLookup.learnerId && courseLearners.some((l) => l.id === previewLookup.learnerId)
    if (!isAdmin && !learnerInSelectedCourse) {
      setLookupErr('Select a course where this learner is enrolled, then unbind.')
      return
    }
    setBusy(true)
    try {
      const res = await unbindOfflineIdCard({ publicCode: normalizedCode, courseId })
      if (res.ok) {
        const resPreview = await lookupOfflineIdCard(normalizedCode)
        if (resPreview.ok) setPreviewLookup(resPreview)
        toast.success('Card unbound - you can assign it again.')
        return
      }
      toast.error(res.message)
    } catch {
      toast.error('Unbind failed. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const previewBlocking =
    previewLookup?.ok === true &&
    previewLookup.status === 'bound' &&
    previewLookup.learnerId !== learnerPick?.id

  const boundLearnerInSelectedCourse =
    previewLookup?.ok === true &&
    previewLookup.status === 'bound' &&
    !!previewLookup.learnerId &&
    courseLearners.some((l) => l.id === previewLookup.learnerId)

  const canUnbind =
    allowUnbind &&
    online &&
    previewLookup?.ok === true &&
    previewLookup.status === 'bound' &&
    !!courseId &&
    OFFLINE_ID_CODE_RE.test(normalizedCode) &&
    (isAdmin || boundLearnerInSelectedCourse)

  const unbindCourseHint =
    allowUnbind &&
    previewLookup?.ok &&
    previewLookup.status === 'bound' &&
    !isAdmin &&
    !!previewLookup.learnerId &&
    !!courseId &&
    !boundLearnerInSelectedCourse

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">1. Course and learner</h2>
        <Field>
          <FieldLabel htmlFor={courseComboId} className="text-xs font-medium text-slate-600">
            Course
          </FieldLabel>
          <FieldContent className="flex flex-col gap-1">
            {courses.length === 0 ? (
              <FieldDescription>
                No courses are available here yet. Draft courses are not listed.
              </FieldDescription>
            ) : (
              <Combobox
                items={courses}
                value={selectedCourse}
                onValueChange={(c) => {
                  setCourseId(c?.id ?? '')
                  setLearnerPick(null)
                  setLearnerQuery('')
                  setLearnerHits([])
                  setLearnerSearchNote(null)
                  setPreviewLookup(null)
                }}
                itemToStringLabel={(c) => `${c.title} (${c.course_code})`}
                isItemEqualToValue={(a, b) => a.id === b.id}
              >
                <ComboboxInput
                  id={courseComboId}
                  placeholder="Search or pick a course…"
                  showClear={!!courseId}
                  className="w-full min-w-0 h-10"  // force with !important
                />
                <ComboboxContent>
                  <ComboboxEmpty>No course matches.</ComboboxEmpty>
                  <ComboboxList>
                    <ComboboxCollection>
                      {(c: AttendanceCourseOption) => (
                        <ComboboxItem key={c.id} value={c}>
                          {c.title} ({c.course_code})
                        </ComboboxItem>
                      )}
                    </ComboboxCollection>
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            )}
            {courseId && courseLearnersLoading && (
              <p className="text-xs text-slate-500">Loading enrolled learners…</p>
            )}
            {courseId && !courseLearnersLoading && !courseLearnersErr && (
              <p className="text-xs text-slate-600">
                {courseLearners.length} learner{courseLearners.length === 1 ? '' : 's'} in roster (cached for
                search)
              </p>
            )}
            {courseId && courseLearnersErr && (
              <p className="text-xs text-red-700">{courseLearnersErr}</p>
            )}
          </FieldContent>
        </Field>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Find learner by name or email</label>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              value={learnerQuery}
              onChange={(e) => {
                setLearnerQuery(e.target.value)
                setLearnerPick(null)
                setLearnerSearchNote(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  runLearnerSearch()
                }
              }}
              disabled={!courseId}
              placeholder="Name or email…"
              className="flex-1 min-w-[160px] border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!courseId || courseLearnersLoading}
              onClick={() => runLearnerSearch()}
              className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
          {learnerSearchNote && (
            <p className="text-xs text-slate-600 pt-0.5">{learnerSearchNote}</p>
          )}
          {learnerHits.length > 0 && (
            <ul className="mt-1 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-slate-50 text-sm">
              {learnerHits.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setLearnerPick(u)
                      setLearnerQuery(learnerListPrimaryLine(u))
                      setLearnerHits([])
                      setLearnerSearchNote(null)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-white"
                  >
                    <span className="block font-medium text-slate-900">{learnerListPrimaryLine(u)}</span>
                    {learnerListSecondaryLine(u) && (
                      <span className="block text-xs text-slate-500">{learnerListSecondaryLine(u)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {learnerPick && (
            <p className="text-xs text-emerald-800 pt-1">
              Selected: <span className="font-medium">{learnerSelectedSummary(learnerPick)}</span>
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">2. Card code</h2>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[180px] space-y-1">
            <label className="text-xs font-medium text-slate-600">ID card code</label>
            <input
              value={codeInput}
              onChange={(e) => {
                setCodeInput(e.target.value.toUpperCase())
                setPreviewLookup(null)
              }}
              placeholder="ID-ABC-XYZ"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono tracking-wide"
            />
          </div>
          <button
            type="button"
            onClick={() => (scanning ? void stopScanner() : void startScanner())}
            className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50"
          >
            {scanning ? <XCircle className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
          </button>
        </div>
        {scanning && (
          <div
            id={`qr-${readerDomId}`}
            className="w-full max-w-sm rounded-lg overflow-hidden border border-slate-200 bg-black/5"
          />
        )}
        {scanErr && <p className="text-sm text-amber-800">{scanErr}</p>}
        <button
          type="button"
          disabled={busy || !normalizedCode}
          onClick={() => void runPreview()}
          className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Preview ID card status
        </button>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">
          {allowUnbind ? '3. Bind or unbind' : '3. Bind'}
        </h2>
        {previewLookup?.ok && (
          <div className="rounded-lg px-3 py-2 text-sm bg-slate-50 border border-slate-200 space-y-1">
            <p>
              <span className="font-medium text-slate-700">Code:</span>{' '}
              <span className="font-mono">{normalizedCode}</span>
            </p>
            <p>
              <span className="font-medium text-slate-700">Course:</span> {courseTitle || '—'}
            </p>
            <p>
              <span className="font-medium text-slate-700">Selected learner:</span>{' '}
              {learnerPick ? learnerSelectedSummary(learnerPick) : '—'}
            </p>
            <p>
              <span className="font-medium text-slate-700">Card:</span>{' '}
              {previewLookup.status === 'unbound' ? (
                <span className="text-emerald-700">Unbound — ready to assign</span>
              ) : previewBlocking ? (
                <>
                  <span className="text-amber-800">Bound to someone else</span>
                  {boundLearnerLabel && (
                    <span className="text-slate-600"> ({boundLearnerLabel})</span>
                  )}
                </>
              ) : learnerPick &&
                previewLookup.learnerId === learnerPick.id ? (
                <span className="text-emerald-700">Already bound to selected learner</span>
              ) : (
                <>
                  <span className="text-emerald-700">Bound</span>
                  {boundLearnerLabel && (
                    <span className="text-slate-700"> — {boundLearnerLabel}</span>
                  )}
                </>
              )}
            </p>
          </div>
        )}
        {lookupErr && (
          <div className="rounded-lg px-3 py-2 text-sm bg-red-50 text-red-800 border border-red-200">
            {lookupErr}
          </div>
        )}
        {!online && (
          <p className="text-xs text-amber-800">
            You are offline — Confirm bind will queue for sync.
            {allowUnbind ? ' Unbind needs a connection.' : ''}
          </p>
        )}
        {unbindCourseHint && (
          <p className="text-xs text-amber-800">
            The bound learner is not in this course roster — select a course where they are enrolled to unbind, or
            ask an admin.
          </p>
        )}
        {canUnbind && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void runUnbind()}
            className="rounded-lg border border-red-300 bg-white text-red-800 px-4 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Unbind card (release)'}
          </button>
        )}
        <button
          type="button"
          disabled={busy || !previewLookup?.ok || !learnerPick || !courseId || previewBlocking}
          onClick={() => void runBind()}
          className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 block"
        >
          {busy ? 'Working…' : 'Confirm bind'}
        </button>
      </section>

      {(pending.length > 0 || failures.length > 0) && (
        <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-5 text-sm">
          <h2 className="font-semibold text-slate-800">Outbox</h2>
          {pending.length > 0 && (
            <div>
              <p className="text-slate-700 font-medium mb-1">Pending sync ({pending.length})</p>
              <ul className="list-disc pl-5 text-slate-600 space-y-0.5">
                {pending.map((p) => (
                  <li key={p.localId}>
                    <span className="font-mono">{p.publicCode}</span>
                    {p.attempts > 0 && (
                      <span className="text-slate-500"> — attempts: {p.attempts}</span>
                    )}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void drainQueue()}
                className="mt-2 text-xs font-medium text-blue-700 hover:underline"
              >
                Sync now
              </button>
            </div>
          )}
          {failures.length > 0 && (
            <div className="pt-2 border-t border-amber-200/80">
              <p className="text-slate-700 font-medium mb-1">Could not apply (recent)</p>
              <ul className="space-y-1 text-slate-600">
                {failures.map((f) => (
                  <li key={`${f.localId}-${f.failedAt}`}>
                    <span className="font-mono">{f.publicCode}</span> — {f.code}: {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
