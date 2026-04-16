'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { AttendanceCourseOption } from '../AttendanceClient'
import {
  finalizeIdCardSessionAttendance,
  getIdCardSessionSubmissionStatus,
  listOfflineSessionsForCourse,
  recordIdCardAttendanceScan,
  type OfflineSessionOption,
} from './actions'
import { normalizeOfflinePublicCode, OFFLINE_ID_CODE_RE } from '@/lib/offline-id-card'
import { Camera, XCircle } from 'lucide-react'
import { formatLocalDisplay } from '@/lib/timestamp'
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

type LogEntry = {
  id: string
  at: string
  code: string
  ok: boolean
  message: string
  detail?: string
}

function formatSessionLabel(s: OfflineSessionOption): string {
  const w = s.week_index ?? 1
  return `Week ${w} · ${s.title}`
}

export default function IdCardScanAttendanceClient({ courses }: { courses: AttendanceCourseOption[] }) {
  const readerDomId = useId().replace(/:/g, '')
  const courseComboId = useId()
  const [courseId, setCourseId] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [sessions, setSessions] = useState<OfflineSessionOption[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsErr, setSessionsErr] = useState<string | null>(null)

  const [codeInput, setCodeInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastResult, setLastResult] = useState<{ ok: boolean; text: string; sub?: string } | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanErr, setScanErr] = useState<string | null>(null)
  const [submissionStatus, setSubmissionStatus] = useState<{
    submitted: boolean
    submittedAt: string | null
  } | null>(null)
  const [submissionStatusLoading, setSubmissionStatusLoading] = useState(false)
  const [finalizeErr, setFinalizeErr] = useState<string | null>(null)
  const [finalizeBusy, setFinalizeBusy] = useState(false)
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null)

  const normalizedCode = normalizeOfflinePublicCode(codeInput)

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === courseId) ?? null,
    [courses, courseId],
  )

  const loadSessions = useCallback(async (cid: string) => {
    if (!cid) {
      setSessions([])
      setModuleId('')
      return
    }
    setSessionsLoading(true)
    setSessionsErr(null)
    setModuleId('')
    try {
      const res = await listOfflineSessionsForCourse(cid)
      if ('error' in res) {
        setSessionsErr(res.error)
        setSessions([])
        return
      }
      setSessions(res.sessions)
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSessions(courseId)
  }, [courseId, loadSessions])

  useEffect(() => {
    return () => {
      const s = scannerRef.current
      if (s) {
        void s.stop().catch(() => {})
        scannerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!courseId || !moduleId || sessionsLoading || sessionsErr) {
      setSubmissionStatus(null)
      setFinalizeErr(null)
      return
    }
    setSubmissionStatusLoading(true)
    setFinalizeErr(null)
    let cancelled = false
    void (async () => {
      const res = await getIdCardSessionSubmissionStatus(courseId, moduleId)
      if (cancelled) return
      setSubmissionStatusLoading(false)
      if ('error' in res) {
        setSubmissionStatus(null)
        return
      }
      setSubmissionStatus({ submitted: res.submitted, submittedAt: res.submittedAt })
    })()
    return () => {
      cancelled = true
    }
  }, [courseId, moduleId, sessionsLoading, sessionsErr])

  async function onFinalizeAttendance() {
    //add a confirm dialog here
    if (!window.confirm('Are you sure you want to finalize attendance attendance?')) return
    //end of confirm dialog
    if (!courseId || !moduleId) return
    setFinalizeBusy(true)
    setFinalizeErr(null)
    try {
      const res = await finalizeIdCardSessionAttendance({ courseId, moduleId })
      if ('error' in res) {
        setFinalizeErr(res.error)
        return
      }
      setSubmissionStatus({ submitted: true, submittedAt: res.submittedAt })
    } finally {
      setFinalizeBusy(false)
    }
  }

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
    if (!courseId || !moduleId) {
      setScanErr('Select a course and offline session first.')
      return
    }

    setScanning(true)
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const elId = `qr-scan-${readerDomId}`
      await new Promise((r) => window.setTimeout(r, 80))
      const qr = new Html5Qrcode(elId, false)
      scannerRef.current = { stop: () => qr.stop() }
      await qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decoded) => {
          const norm = normalizeOfflinePublicCode(decoded)
          setCodeInput(norm)
          await stopScanner()
          await processScan(norm)
        },
        () => {},
      )
    } catch (e) {
      setScanErr(e instanceof Error ? e.message : 'Could not start camera (use HTTPS or localhost).')
      setScanning(false)
      scannerRef.current = null
    }
  }

  async function processScan(code: string) {
    setLastResult(null)
    const norm = normalizeOfflinePublicCode(code)
    if (!courseId || !moduleId) {
      setLastResult({ ok: false, text: 'Select a course and offline session first.' })
      return
    }
    if (!OFFLINE_ID_CODE_RE.test(norm)) {
      setLastResult({ ok: false, text: 'Invalid code format (expected ID-ABC-XYZ).' })
      appendLog(norm, false, 'Invalid code format')
      return
    }

    setBusy(true)
    try {
      const res = await recordIdCardAttendanceScan({
        courseId,
        moduleId,
        publicCode: norm,
      })
      if (res.ok) {
        const name =
          res.learnerName?.trim() ||
          res.learnerEmail?.trim() ||
          res.learnerId.slice(0, 8) + '…'
        const sub = res.wasAlreadyPresent ? 'Already marked present — updated.' : 'Marked present.'
        setLastResult({ ok: true, text: name, sub })
        appendLog(norm, true, name, sub)
      } else {
        setLastResult({ ok: false, text: res.message })
        appendLog(norm, false, res.message)
      }
    } catch {
      setLastResult({ ok: false, text: 'Request failed. Check your connection.' })
      appendLog(norm, false, 'Request failed')
    } finally {
      setBusy(false)
      setCodeInput('')
    }
  }

  function appendLog(code: string, ok: boolean, message: string, detail?: string) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const at = new Date().toLocaleTimeString()
    setLog((prev) => [{ id, at, code, ok, message, detail }, ...prev].slice(0, 50))
  }

  async function onManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    await processScan(normalizedCode)
  }

  const canScan = !!courseId && !!moduleId && !sessionsLoading && !sessionsErr

  return (
    <div className="space-y-6">
          <div className="flex flex-inline items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="text-sm">
              {submissionStatusLoading ? (
                <span className="text-slate-500">Loading submission status…</span>
              ) : submissionStatus?.submitted ? (
                <span>
                  <span className="font-semibold text-emerald-800">Attendance submitted</span>
                  {submissionStatus.submittedAt ? (
                    <span className="text-slate-600">
                      {' '}
                      · {formatLocalDisplay(submissionStatus.submittedAt)}
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className=" text-slate-800">Finalize attendance to submit it</span>
              )}
            </div>
            <button
              type="button"
              disabled={finalizeBusy || submissionStatusLoading || !moduleId}
              onClick={() => void onFinalizeAttendance()}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-50"
            >
              {finalizeBusy
                ? 'Saving…'
                : submissionStatus?.submitted
                  ? 'Update submission time'
                  : 'Finalize attendance'}
            </button>
          </div>
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">1. Course</h2>
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
                  setLastResult(null)
                }}
                itemToStringLabel={(c) => `${c.title} (${c.course_code})`}
                isItemEqualToValue={(a, b) => a.id === b.id}
              >
                <ComboboxInput
                  id={courseComboId}
                  placeholder="Search or pick a course…"
                  showClear={!!courseId}
                  className="w-full min-w-0 h-10"
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
          </FieldContent>
        </Field>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">2. Offline session</h2>
        {sessionsLoading && <p className="text-xs text-slate-500">Loading sessions…</p>}
        {sessionsErr && <p className="text-xs text-red-700">{sessionsErr}</p>}
        {!sessionsLoading && !sessionsErr && courseId && sessions.length === 0 && (
          <p className="text-sm text-amber-800">No offline sessions in this course yet.</p>
        )}
        <select
          value={moduleId}
          onChange={(e) => {
            setModuleId(e.target.value)
            setLastResult(null)
          }}
          disabled={!courseId || sessionsLoading || sessions.length === 0}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50"
        >
          <option value="">Select offline session…</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {formatSessionLabel(s)}
            </option>
          ))}
        </select>

        {finalizeErr && (
          <p className="text-xs text-red-700" role="alert">
            {finalizeErr}
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">3. Scan or enter card code</h2>
        <form onSubmit={onManualSubmit} className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[180px] space-y-1">
            <label className="text-xs font-medium text-slate-600">ID card code</label>
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              disabled={!canScan || busy}
              placeholder="ID-ABC-XYZ"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono tracking-wide"
            />
          </div>
          <button
            type="button"
            disabled={!canScan || busy}
            onClick={() => (scanning ? void stopScanner() : void startScanner())}
            className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50 disabled:opacity-50"
            aria-label={scanning ? 'Stop camera' : 'Start camera'}
          >
            {scanning ? <XCircle className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
          </button>
          <button
            type="submit"
            disabled={!canScan || busy || !OFFLINE_ID_CODE_RE.test(normalizedCode)}
            className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Mark attendance'}
          </button>
        </form>
        {scanning && (
          <div
            id={`qr-scan-${readerDomId}`}
            className="w-full max-w-sm rounded-lg overflow-hidden border border-slate-200 bg-black/5"
          />
        )}
        {scanErr && <p className="text-sm text-amber-800">{scanErr}</p>}
        {!canScan && courseId && (
          <p className="text-xs text-slate-500">Choose an offline session above to enable scanning.</p>
        )}
      </section>

      {lastResult && (
        <div
          className={`rounded-lg px-4 py-3 text-sm border ${
            lastResult.ok
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <p className="font-medium">{lastResult.ok ? 'Recorded' : 'Could not record'}</p>
          <p className="mt-1">{lastResult.text}</p>
          {lastResult.sub && <p className="mt-1 text-xs opacity-90">{lastResult.sub}</p>}
        </div>
      )}

      {log.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-2">Recent scans</h3>
          <ul className="max-h-64 overflow-auto text-sm space-y-2">
            {log.map((row) => (
              <li
                key={row.id}
                className={`flex flex-wrap gap-x-3 gap-y-1 border-b border-slate-100 pb-2 last:border-0 ${
                  row.ok ? 'text-slate-800' : 'text-red-800'
                }`}
              >
                <span className="text-slate-500 tabular-nums">{row.at}</span>
                <span className="font-mono">{row.code}</span>
                <span>{row.message}</span>
                {row.detail && <span className="text-xs text-slate-600 w-full">{row.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
