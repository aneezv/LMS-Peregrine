'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  normalizeOfflinePublicCode,
  OFFLINE_ID_CODE_RE,
} from '@/lib/offline-id-card'
import { importOfflineIdCards, type ImportOfflineIdCardsResult } from './actions'
import { Camera, X } from 'lucide-react'

type CourseOption = { id: string; title: string; course_code: string }

/** First column only: comma, tab, or simple "quoted" first field. */
function firstColumnFromLine(line: string): string {
  const trimmed = line.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('"')) {
    let i = 1
    let out = ''
    while (i < trimmed.length) {
      const c = trimmed[i]
      if (c === '"') {
        if (trimmed[i + 1] === '"') {
          out += '"'
          i += 2
          continue
        }
        break
      }
      out += c
      i++
    }
    return out.trim()
  }
  const comma = trimmed.indexOf(',')
  const tab = trimmed.indexOf('\t')
  let sep = -1
  if (comma >= 0 && tab >= 0) sep = Math.min(comma, tab)
  else sep = comma >= 0 ? comma : tab
  if (sep === -1) return trimmed
  return trimmed.slice(0, sep).trim()
}

function parseCodesFromText(text: string): string[] {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (const line of lines) {
    const cell = firstColumnFromLine(line)
    if (cell) out.push(cell)
  }
  return out
}

export default function ImportOfflineCardsClient({ courses }: { courses: CourseOption[] }) {
  const readerDomId = useId().replace(/:/g, '')
  const [pasteText, setPasteText] = useState('')
  const [batchLabel, setBatchLabel] = useState('')
  const [courseId, setCourseId] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanErr, setScanErr] = useState<string | null>(null)
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportOfflineIdCardsResult | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      const s = scannerRef.current
      if (s) {
        void s.stop().catch(() => {})
        scannerRef.current = null
      }
    }
  }, [])

  const mergedCodes = useMemo(() => {
    const raw = parseCodesFromText(pasteText)
    const seen = new Set<string>()
    const out: string[] = []
    for (const c of raw) {
      const n = normalizeOfflinePublicCode(c)
      if (!seen.has(n)) {
        seen.add(n)
        out.push(n)
      }
    }
    return out
  }, [pasteText])

  const invalidInMerged = useMemo(() => {
    let n = 0
    for (const c of mergedCodes) {
      if (!OFFLINE_ID_CODE_RE.test(c)) n++
    }
    return n
  }, [mergedCodes])

  const stopScanner = useCallback(async () => {
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
  }, [])

  const startScanner = useCallback(async () => {
    setScanErr(null)
    setScanning(true)
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const elId = `admin-qr-${readerDomId}`
      await new Promise((r) => window.setTimeout(r, 80))
      const qr = new Html5Qrcode(elId, false)
      scannerRef.current = { stop: () => qr.stop() }
      await qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decoded) => {
          const norm = normalizeOfflinePublicCode(decoded)
          if (OFFLINE_ID_CODE_RE.test(norm)) {
            setPasteText((prev) => {
              const existing = new Set(parseCodesFromText(prev).map((c) => normalizeOfflinePublicCode(c)))
              if (existing.has(norm)) return prev
              if (!prev.trim()) return norm
              return prev.endsWith('\n') ? `${prev}${norm}` : `${prev}\n${norm}`
            })
          }
          await stopScanner()
        },
        () => {},
      )
    } catch (e) {
      setScanErr(e instanceof Error ? e.message : 'Could not start camera.')
      setScanning(false)
      scannerRef.current = null
    }
  }, [readerDomId, stopScanner])

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFileName(file.name)
    const text = await file.text()
    const lines = parseCodesFromText(text)
    if (lines.length === 0) {
      setPasteText((t) => t)
      return
    }
    setPasteText((prev) => {
      const existing = parseCodesFromText(prev)
      const set = new Set([...existing, ...lines].map((c) => normalizeOfflinePublicCode(c)))
      return Array.from(set).join('\n')
    })
  }

  async function handleSubmit() {
    setResult(null)
    const combined = parseCodesFromText(pasteText)
    if (combined.length === 0) {
      setResult({ ok: false, message: 'Add codes from a CSV file, paste, or scan.' })
      return
    }
    setBusy(true)
    try {
      const res = await importOfflineIdCards({
        codes: combined,
        batchLabel: batchLabel || null,
        courseId: courseId || null,
      })
      setResult(res)
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Import failed.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">Batch options</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Batch label (optional)</label>
            <input
              value={batchLabel}
              onChange={(e) => setBatchLabel(e.target.value)}
              placeholder="e.g. Spring 2026 print run"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Pre-scope course (optional)</label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Any course (unscoped)</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.course_code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Add codes</h2>
          <p className="text-xs text-slate-500 mt-1">
            CSV/text (first column) and QR scans append into the list below. You can edit the box directly.
            Format <code className="text-xs bg-slate-100 px-1 rounded">ID-ABC-XYZ</code>. Camera needs HTTPS
            or localhost.
          </p>
        </div>

        <div className="space-y-2 pt-1 border-t border-slate-100">
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">From file or scan</h3>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
              <span className="font-medium">Choose CSV / TXT</span>
              <input
                type="file"
                accept=".csv,.txt,text/csv"
                onChange={(e) => void onFileChange(e)}
                className="sr-only"
              />
            </label>
            <button
              type="button"
              onClick={() => (scanning ? void stopScanner() : void startScanner())}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              {scanning ? (
                <X className="inline w-4 h-4" />
              ) : (
                <Camera className="inline w-4 h-4" />
              )}
            </button>
          </div>
          {fileName && <p className="text-xs text-slate-500">Last file merged: {fileName}</p>}
          {scanning && (
            <div
              id={`admin-qr-${readerDomId}`}
              className="w-full max-w-sm rounded-lg overflow-hidden border border-slate-200"
            />
          )}
          {scanErr && <p className="text-sm text-amber-800">{scanErr}</p>}
        </div>

        <div className="space-y-2 pt-1 border-t border-slate-100">
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">List (paste / preview)</h3>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={10}
            placeholder={'ID-3V6-Y8H\nID-7K2-W9P'}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
          />
          <p className="text-xs text-slate-600">
            Unique codes ready to submit: <strong>{mergedCodes.length}</strong>
            {invalidInMerged > 0 && (
              <span className="text-amber-700">
                {' '}
                ({invalidInMerged} invalid format — will be reported)
              </span>
            )}
          </p>
        </div>

        <div className="space-y-3 pt-4 border-t border-slate-200">
          {result && (
            <div
              className={`rounded-lg border p-4 text-sm ${
                result.ok
                  ? 'border-emerald-200 bg-emerald-50/80'
                  : 'border-red-200 bg-red-50/80'
              }`}
            >
              {!result.ok ? (
                <p className="text-red-800 font-medium">{result.message}</p>
              ) : (
                <div className="space-y-2 text-slate-800">
                  <p className="font-semibold text-emerald-900">Import finished</p>
                  <ul className="list-none space-y-1">
                    <li>
                      <strong>{result.inserted}</strong> new cards inserted
                    </li>
                    <li>
                      <strong>{result.alreadyInDatabase}</strong> already in database (skipped)
                    </li>
                    <li>
                      <strong>{result.invalidFormat}</strong> invalid format (not ID-XXX-XXX)
                    </li>
                    <li>
                      <strong>{result.duplicateInUpload}</strong> duplicate in this upload (skipped)
                    </li>
                    <li>
                      <strong>{result.validUnique}</strong> unique valid codes in this upload
                    </li>
                    <li className="text-slate-600 text-xs">
                      Non-empty lines considered: {result.totalSubmitted}
                    </li>
                  </ul>
                  {result.insertErrors.length > 0 && (
                    <div className="mt-3">
                      <p className="font-medium text-amber-900 text-xs">Insert errors (sample)</p>
                      <ul className="mt-1 text-xs font-mono text-amber-950 space-y-0.5 max-h-40 overflow-auto">
                        {result.insertErrors.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            disabled={busy || mergedCodes.length === 0}
            onClick={() => void handleSubmit()}
            className="rounded-lg bg-slate-900 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? 'Importing…' : 'Import to database'}
          </button>
        </div>
      </section>
    </div>
  )
}
