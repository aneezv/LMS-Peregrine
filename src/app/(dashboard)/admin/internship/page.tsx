'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { MAX_DAILY_ACTIVE_SECONDS } from '@/lib/internship/constants'
import { PageHeader } from '@/components/ui/primitives'

type Report = {
  from: string
  to: string
  filterUserId: string | null
  filterCourseId: string | null
  maxDailyCreditSeconds: number
  learnerOptions: Array<{ userId: string; name: string }>
  courseOptions: Array<{ courseId: string; label: string }>
  uniqueLearnersInResults: number
  sessions: Array<{
    id: string
    user_id: string
    course_id: string | null
    course_code?: string | null
    course_title?: string | null
    start_time: string
    end_time: string | null
    active_seconds: number
    break_seconds: number
    status: string
    had_inactivity_auto: boolean
    profiles?: { full_name?: string | null } | null
  }>
  activityLogs: Array<{ session_id: string; event_type: string; logged_at: string }>
  rollup: Array<{
    userId: string
    name: string
    onlineSeconds: number
    breakSeconds: number
    sessionCount: number
    inactivityFlags: number
  }>
  dailySummary: Array<{ date: string; onlineSeconds: number; sessions: number; uniqueLearners: number }>
  dailyByUser: Array<{
    date: string
    userId: string
    name: string
    onlineSeconds: number
    breakSeconds: number
    sessionCount: number
    inactivityFlags: number
  }>
}

function formatHms(s: number) {
  const n = Math.max(0, Math.floor(s))
  const h = Math.floor(n / 3600)
  const m = Math.floor((n % 3600) / 60)
  const sec = n % 60
  return `${h}h ${m}m ${sec}s`
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export default function InternshipAdminPage() {
  const [report, setReport] = useState<Report | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [from, setFrom] = useState(() => isoDate(new Date()))
  const [to, setTo] = useState(() => isoDate(new Date()))
  const [learnerId, setLearnerId] = useState<string>('')
  const [courseIdFilter, setCourseIdFilter] = useState<string>('')

  const load = useCallback(async () => {
    setErr(null)
    try {
      const q = new URLSearchParams({
        from: `${from}T00:00:00.000Z`,
        to: `${to}T23:59:59.999Z`,
      })
      if (learnerId) q.set('userId', learnerId)
      if (courseIdFilter.trim()) q.set('courseId', courseIdFilter.trim())

      const res = await fetch(`/api/session/report?${q}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setReport(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    }
  }, [from, to, learnerId, courseIdFilter])

  useEffect(() => {
    void load()
  }, [load])

  const capLabel = useMemo(() => formatHms(report?.maxDailyCreditSeconds ?? MAX_DAILY_ACTIVE_SECONDS), [report])

  function setPreset(key: 'today' | 'yesterday' | '7d' | '30d') {
    const now = new Date()
    if (key === 'today') {
      const d = isoDate(now)
      setFrom(d)
      setTo(d)
      return
    }
    if (key === 'yesterday') {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      const d = isoDate(y)
      setFrom(d)
      setTo(d)
      return
    }
    const end = isoDate(now)
    const start = new Date(now)
    if (key === '7d') start.setDate(start.getDate() - 6)
    if (key === '30d') start.setDate(start.getDate() - 29)
    setFrom(isoDate(start))
    setTo(end)
  }

  function matchFromToToday() {
    setTo(from)
  }

  return (
    <div className="space-y-8 p-2">
      <PageHeader
        title="Session Logs"
        description={`Filter by UTC date range, learner, and optional course id. Credited-time cap per learner per UTC day: ${capLabel}.`}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPreset('today')}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-200"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setPreset('yesterday')}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-200"
          >
            Yesterday
          </button>
          <button
            type="button"
            onClick={() => setPreset('7d')}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-200"
          >
            Last 7 days
          </button>
          <button
            type="button"
            onClick={() => setPreset('30d')}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-200"
          >
            Last 30 days
          </button>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">From (UTC)</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">To (UTC)</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={matchFromToToday}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 mb-0.5"
            title="Set To equal From (single UTC day)"
          >
            Single day (To = From)
          </button>
          <label className="text-sm min-w-[12rem] flex-1">
            <span className="block text-slate-600 mb-1">Learner</span>
            <select
              value={learnerId}
              onChange={(e) => setLearnerId(e.target.value)}
              className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
            >
              <option value="">All learners in window</option>
              {(report?.learnerOptions ?? []).map((o) => (
                <option key={o.userId} value={o.userId}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm min-w-[12rem]">
            <span className="block text-slate-600 mb-1">Course code (optional)</span>
            <select
              value={courseIdFilter}
              onChange={(e) => setCourseIdFilter(e.target.value)}
              className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
            >
              <option value="">All courses in window</option>
              {(report?.courseOptions ?? []).map((c) => (
                <option key={c.courseId} value={c.courseId}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-4 py-2 hover:bg-indigo-700"
          >
            Apply
          </button>
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      {!report ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Showing <strong>{report.sessions.length}</strong> session{report.sessions.length !== 1 ? 's' : ''} ·{' '}
            <strong>{report.uniqueLearnersInResults}</strong> unique learner
            {report.uniqueLearnersInResults !== 1 ? 's' : ''}
            {report.filterUserId ? ' (filtered)' : ''}.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              By day &amp; learner <span className="font-normal text-slate-500 text-sm">(session start date, UTC)</span>
            </h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Learner</th>
                    <th className="px-3 py-2">Active credited</th>
                    <th className="px-3 py-2">Break</th>
                    <th className="px-3 py-2">Sessions</th>
                    <th className="px-3 py-2">Idle flags</th>
                  </tr>
                </thead>
                <tbody>
                  {report.dailyByUser.map((r) => (
                    <tr key={`${r.date}|${r.userId}`} className="border-t border-slate-100">
                      <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                      <td className="px-3 py-2 font-mono tabular-nums">{formatHms(r.onlineSeconds)}</td>
                      <td className="px-3 py-2 font-mono text-slate-600 tabular-nums">{formatHms(r.breakSeconds)}</td>
                      <td className="px-3 py-2">{r.sessionCount}</td>
                      <td className="px-3 py-2">{r.inactivityFlags}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.dailyByUser.length === 0 && (
                <p className="p-4 text-slate-500 text-sm">No sessions overlap this window.</p>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Day totals (UTC)</h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Credited active</th>
                    <th className="px-3 py-2">Sessions</th>
                    <th className="px-3 py-2">Unique learners</th>
                  </tr>
                </thead>
                <tbody>
                  {report.dailySummary.map((d) => (
                    <tr key={d.date} className="border-t border-slate-100">
                      <td className="px-3 py-2">{d.date}</td>
                      <td className="px-3 py-2 font-mono tabular-nums">{formatHms(d.onlineSeconds)}</td>
                      <td className="px-3 py-2">{d.sessions}</td>
                      <td className="px-3 py-2">{d.uniqueLearners}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Learner totals (range)</h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Learner</th>
                    <th className="px-3 py-2">Active credited</th>
                    <th className="px-3 py-2">Break</th>
                    <th className="px-3 py-2">Sessions</th>
                    <th className="px-3 py-2">Idle flags</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rollup.map((r) => (
                    <tr key={r.userId} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                      <td className="px-3 py-2 font-mono tabular-nums">{formatHms(r.onlineSeconds)}</td>
                      <td className="px-3 py-2 font-mono text-slate-600 tabular-nums">{formatHms(r.breakSeconds)}</td>
                      <td className="px-3 py-2">{r.sessionCount}</td>
                      <td className="px-3 py-2">{r.inactivityFlags}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.rollup.length === 0 && (
                <p className="p-4 text-slate-500 text-sm">No rows in this view.</p>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Session log</h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white max-h-96 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600 sticky top-0">
                  <tr>
                    <th className="px-3 py-2">Learner</th>
                    <th className="px-3 py-2">Course code</th>
                    <th className="px-3 py-2">Start</th>
                    <th className="px-3 py-2">End</th>
                    <th className="px-3 py-2">Active</th>
                    <th className="px-3 py-2">Break</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Idle</th>
                  </tr>
                </thead>
                <tbody>
                  {report.sessions.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        {(s.profiles as { full_name?: string } | null)?.full_name ?? s.user_id.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-slate-600 max-w-[8rem] truncate">
                        {s.course_code ?? s.course_id ?? '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">{s.start_time}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">{s.end_time ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums">{formatHms(s.active_seconds)}</td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums">{formatHms(s.break_seconds)}</td>
                      <td className="px-3 py-2">{s.status}</td>
                      <td className="px-3 py-2">{s.had_inactivity_auto ? 'Yes' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
