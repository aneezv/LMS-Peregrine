'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'

export type RosterRow = {
  id: string
  learner_id: string
  learner_name: string | null
  is_present: boolean
  roster_submitted_at: string | null
  updated_at: string | null
}

function normalizeRowsForEditing(rows: RosterRow[]): RosterRow[] {
  const submittedOnce = rows.some((r) => r.roster_submitted_at != null)
  if (submittedOnce) {
    return rows.map((r) => ({ ...r }))
  }
  return rows.map((r) => ({ ...r, is_present: true }))
}

export default function SessionAttendanceClient({
  moduleId,
  courseId,
  currentUserId,
  initialRows,
  variant = 'hub',
  onAfterSubmit,
}: {
  moduleId: string
  courseId: string
  currentUserId: string
  initialRows: RosterRow[]
  /** hub: single attendance area; module: legacy link back to lesson */
  variant?: 'hub' | 'module'
  onAfterSubmit?: () => void
}) {
  const [rows, setRows] = useState<RosterRow[]>(() => normalizeRowsForEditing(initialRows))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setRows(normalizeRowsForEditing(initialRows))
  }, [moduleId, initialRows])

  const submittedOnce = rows.some((r) => r.roster_submitted_at != null)

  function togglePresent(rowId: string, next: boolean) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, is_present: next } : r)))
  }

  async function submitAttendance() {
    setBusy(true)
    const supabase = createClient()
    const ts = new Date().toISOString()

    for (const r of rows) {
      const { error } = await supabase
        .from('module_session_roster')
        .update({
          is_present: r.is_present,
          last_marked_by: currentUserId,
          updated_at: ts,
          roster_submitted_at: ts,
        })
        .eq('id', r.id)

      if (error) {
        toast.error(error.message)
        setBusy(false)
        return
      }
    }

    setRows((prev) => prev.map((r) => ({ ...r, roster_submitted_at: ts })))
    toast.success('Attendance submitted.')
    setBusy(false)
    onAfterSubmit?.()
  }

  return (
    <div className="space-y-6">
      {!submittedOnce && rows.length > 0 && (
        <p className="text-sm text-slate-600 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          Everyone starts as <strong className="text-slate-800">Present</strong> for quick editing. Uncheck absences,
          then click <strong className="text-slate-800">Submit attendance</strong> to save.
        </p>
      )}

      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
              <th className="p-3 font-medium">Learner</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium w-40">Present</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-6 text-center text-slate-500">
                  No enrolled learners for this course yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="p-3 font-medium text-slate-900">{r.learner_name ?? r.learner_id.slice(0, 8)}</td>
                  <td className="p-3 text-slate-600">
                    {r.is_present ? (
                      <span className="text-emerald-700">Present</span>
                    ) : (
                      <span className="text-rose-700">Absent</span>
                    )}
                  </td>
                  <td className="p-3">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={r.is_present}
                        onChange={(e) => togglePresent(r.id, e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span className="text-slate-600">Present</span>
                    </label>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void submitAttendance()}
          disabled={busy || rows.length === 0}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 px-5 rounded-lg text-sm"
        >
          {busy ? 'Saving…' : submittedOnce ? 'Update submitted attendance' : 'Submit attendance'}
        </button>
        {variant === 'module' && (
          <Link
            href={`/courses/${courseId}/modules/${moduleId}`}
            className="text-sm text-slate-600 hover:text-blue-600 underline"
          >
            ← Back to lesson
          </Link>
        )}
      </div>
    </div>
  )
}
