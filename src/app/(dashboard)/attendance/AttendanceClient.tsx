'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { prepareSessionRoster } from './actions'
import SessionAttendanceClient, { type RosterRow } from './SessionAttendanceClient'
import type { SessionModuleListItem } from './types'
import { AppButton } from '@/components/ui/primitives'
import { PencilIcon, XIcon } from 'lucide-react'

export type AttendanceCourseOption = { id: string; title: string; course_code: string }

export default function AttendanceClient({
  courses,
  sessionModules,
  currentUserId,
}: {
  courses: AttendanceCourseOption[]
  sessionModules: SessionModuleListItem[]
  currentUserId: string
}) {
  const [courseFilter, setCourseFilter] = useState<string>('all')
  const [selected, setSelected] = useState<SessionModuleListItem | null>(null)
  const [rosterRows, setRosterRows] = useState<RosterRow[] | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [submittedMap, setSubmittedMap] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {}
    for (const s of sessionModules) {
      m[s.moduleId] = s.attendanceSubmitted
    }
    return m
  })

  const filtered = useMemo(() => {
    if (courseFilter === 'all') return sessionModules
    return sessionModules.filter((s) => s.courseId === courseFilter)
  }, [sessionModules, courseFilter])

  function openModule(s: SessionModuleListItem) {
    setLoadErr(null)
    setSelected(s)
    setRosterRows(null)
    startTransition(async () => {
      const res = await prepareSessionRoster(s.courseId, s.moduleId)
      if ('error' in res) {
        setLoadErr(res.error)
        setRosterRows([])
        return
      }
      setRosterRows(res.rows)
    })
  }

  function closePanel() {
    setSelected(null)
    setRosterRows(null)
    setLoadErr(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Course</label>
          <select
            value={courseFilter}
            onChange={(e) => {
              setCourseFilter(e.target.value)
              closePanel()
            }}
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
        <span className="text-sm text-slate-500">
          {filtered.length} session lesson{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-slate-500 text-sm py-12 text-center border border-dashed border-slate-200 rounded-xl">
          No live or offline session lessons in your courses yet.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-left text-slate-600">
                <th className="p-3 font-medium">Course</th>
                <th className="p-3 font-medium">Lesson</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">Week</th>
                <th className="p-3 font-medium">Attendance</th>
                <th className="p-3 font-medium w-40" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const submitted = submittedMap[s.moduleId] ?? s.attendanceSubmitted
                return (
                  <tr key={s.moduleId} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="p-3 text-slate-800">
                      <span className="font-medium">{s.courseTitle}</span>
                      <span className="text-slate-500 text-xs block">{s.courseCode}</span>
                    </td>
                    <td className="p-3 text-slate-700">{s.moduleTitle}</td>
                    <td className="p-3 text-slate-600 capitalize">{s.moduleType.replace('_', ' ')}</td>
                    <td className="p-3 text-slate-600">{s.weekIndex}</td>
                    <td className="p-3">
                      {submitted ? (
                        <span className="text-emerald-700 font-medium text-xs">Submitted</span>
                      ) : (
                        <span className="text-amber-700 font-medium text-xs">Not submitted</span>
                      )}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => openModule(s)}
                        className="border bg-amber-50 border-amber-200 rounded-lg inline-flex items-center gap-1 px-3 py-1.5 text-amber-700 hover:bg-amber-100 font-medium text-xs"
                      >
                        <PencilIcon className="w-3.5 h-3.5 flex-shrink-0 mr-1" />
                        {selected?.moduleId === s.moduleId ? 'Reload' : 'Mark attendance'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <section className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{selected.moduleTitle}</h2>
              <p className="text-sm text-slate-500">
                {selected.courseTitle} · Week {selected.weekIndex}
              </p>
            </div>
            <button
              type="button"
              onClick={closePanel}
              className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {loadErr && (
            <div className="rounded-lg px-4 py-3 text-sm bg-red-50 text-red-800 border border-red-200">{loadErr}</div>
          )}

          {isPending && !rosterRows && !loadErr && (
            <p className="text-sm text-slate-500">Loading roster…</p>
          )}

          {rosterRows !== null && !loadErr && (
            <SessionAttendanceClient
              moduleId={selected.moduleId}
              courseId={selected.courseId}
              currentUserId={currentUserId}
              initialRows={rosterRows}
              variant="hub"
              onAfterSubmit={() => {
                setSubmittedMap((prev) => ({ ...prev, [selected.moduleId]: true }))
              }}
            />
          )}
        </section>
      )}
    </div>
  )
}
