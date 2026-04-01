'use client'

import { useMemo, useState } from 'react'
import type { GradingRow } from './page'
import { ExternalLink, Save } from 'lucide-react'

export type GradingCourseOption = { id: string; title: string; course_code: string }

export type SubmissionStatusFilter = 'all' | 'turned_in' | 'draft' | 'graded'

function rowBucket(r: GradingRow): 'graded' | 'turned_in' | 'draft' {
  if (r.gradedAt) return 'graded'
  if (r.isTurnedIn) return 'turned_in'
  return 'draft'
}

export default function GradingClient({
  courses,
  initialRows,
}: {
  courses: GradingCourseOption[]
  initialRows: GradingRow[]
}) {
  const [courseFilter, setCourseFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<SubmissionStatusFilter>('turned_in')
  const [rows, setRows] = useState(initialRows)
  const [scores, setScores] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}
    for (const r of initialRows) {
      if (r.score != null) o[r.submissionId] = String(r.score)
    }
    return o
  })
  const [feedback, setFeedback] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}
    for (const r of initialRows) {
      if (r.feedback) o[r.submissionId] = r.feedback
    }
    return o
  })
  const [saving, setSaving] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const filtered = useMemo(() => {
    const list =
      courseFilter === 'all'
        ? rows
        : rows.filter((r) => String(r.courseId) === String(courseFilter))
    return statusFilter === 'all' ? list : list.filter((r) => rowBucket(r) === statusFilter)
  }, [rows, courseFilter, statusFilter])

  const grouped = useMemo(() => {
    const m = new Map<string, GradingRow[]>()
    for (const r of filtered) {
      // Use courseId only — titles/codes may contain "::" and would break string keys or split() parsing.
      const key = String(r.courseId)
      const arr = m.get(key) ?? []
      arr.push(r)
      m.set(key, arr)
    }
    return [...m.entries()]
  }, [filtered])

  async function saveGrade(submissionId: string, maxScore: number) {
    setSaving(submissionId)
    setMsg(null)
    const raw = scores[submissionId]?.trim()
    const sc = raw === '' || raw === undefined ? NaN : Number(raw)
    if (Number.isNaN(sc) || sc < 0) {
      setMsg({ type: 'err', text: 'Enter a valid score.' })
      setSaving(null)
      return
    }
    if (sc > maxScore) {
      setMsg({ type: 'err', text: `Score cannot exceed ${maxScore}.` })
      setSaving(null)
      return
    }

    const res = await fetch('/api/assignments/grade', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        submissionId,
        score: sc,
        feedback: feedback[submissionId] ?? null,
      }),
    })

    const payload = (await res.json().catch(() => ({}))) as { error?: string }

    if (!res.ok) {
      setMsg({ type: 'err', text: payload.error ?? 'Save failed.' })
      setSaving(null)
      return
    }

    setRows((prev) =>
      prev.map((r) =>
        r.submissionId === submissionId
          ? {
              ...r,
              score: sc,
              feedback: feedback[submissionId] ?? null,
              gradedAt: new Date().toISOString(),
              isPassed: sc >= r.passingScore,
            }
          : r,
      ),
    )
    setMsg({ type: 'ok', text: 'Grade saved.' })
    setSaving(null)
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            msg.type === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Course</label>
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="all">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.course_code})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SubmissionStatusFilter)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="turned_in">Turned in (needs grading)</option>
            <option value="draft">Not turned in</option>
            <option value="graded">Graded</option>
            <option value="all">All</option>
          </select>
        </div>
        <span className="text-sm text-slate-500">
          {filtered.length} submission{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      {grouped.length === 0 ? (
        <div className="text-slate-500 text-sm py-12 text-center border border-dashed border-slate-200 rounded-xl">
          No submissions to show.
        </div>
      ) : (
        grouped.map(([courseId, list]) => {
          const head = list[0]
          return (
            <section key={courseId} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
                <h2 className="font-semibold text-slate-900">
                  {head.courseTitle}{' '}
                  <em className="text-slate-600 font-normal not-italic text-sm">{head.courseCode}</em>
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="p-3 font-medium">Learner</th>
                      <th className="p-3 font-medium">Lesson</th>
                      <th className="p-3 font-medium">Type</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium">Files</th>
                      <th className="p-3 font-medium w-28">Score</th>
                      <th className="p-3 font-medium min-w-[140px]">Feedback</th>
                      <th className="p-3 font-medium w-32" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.submissionId} className="border-b border-slate-100 hover:bg-slate-50/80">
                        <td className="p-3 font-medium text-slate-900">{r.learnerName ?? r.learnerId.slice(0, 8)}</td>
                        <td className="p-3 text-slate-700">{r.moduleTitle}</td>
                        <td className="p-3 text-slate-600 capitalize">{r.moduleType.replace('_', ' ')}</td>
                        <td className="p-3">
                          {r.gradedAt ? (
                            <span className="text-emerald-700 font-medium">Graded</span>
                          ) : r.isTurnedIn ? (
                            <span className="text-blue-700 font-medium">Turned in</span>
                          ) : (
                            <span className="text-amber-700">Draft</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-1">
                            {r.files.length === 0 ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              r.files.map((f, i) => (
                                <a
                                  key={i}
                                  href={f.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                >
                                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                                  {f.name}
                                </a>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={r.maxScore}
                              value={scores[r.submissionId] ?? ''}
                              onChange={(e) =>
                                setScores((s) => ({ ...s, [r.submissionId]: e.target.value }))
                              }
                              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                              placeholder={`0–${r.maxScore}`}
                            />
                            <span className="text-slate-500 text-xs whitespace-nowrap">/ {r.maxScore}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <textarea
                            value={feedback[r.submissionId] ?? ''}
                            onChange={(e) =>
                              setFeedback((f) => ({ ...f, [r.submissionId]: e.target.value }))
                            }
                            rows={2}
                            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm resize-y min-h-[52px]"
                            placeholder="Optional"
                          />
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => saveGrade(r.submissionId, r.maxScore)}
                            disabled={saving === r.submissionId}
                            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg"
                          >
                            <Save className="w-3.5 h-3.5" />
                            {saving === r.submissionId ? 'Saving…' : 'Save grade'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
