'use client'

import { useMemo, useState, useTransition, useRef } from 'react'
import { fetchGradingData, bulkUpdateGrades, type GradingRow, type GradingFilters, type GradingCourseOption } from './actions'
import { ExternalLink, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useVirtualizer } from '@tanstack/react-virtual'

export type SubmissionStatusFilter = 'all' | 'turned_in' | 'draft' | 'graded'

function GradingTable({ list, modifiedSubmissionIds, scores, feedback, handleScoreChange, handleFeedbackChange }: { 
  list: GradingRow[], 
  modifiedSubmissionIds: Set<string>,
  scores: Record<string, string>,
  feedback: Record<string, string>,
  handleScoreChange: (id: string, val: string) => void,
  handleFeedbackChange: (id: string, val: string) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: list.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 73, // Estimated row height
    overscan: 10,
  })

  return (
    <div 
      ref={parentRef} 
      className="overflow-auto max-h-[600px] min-h-[250px] border-t border-slate-200"
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600 shadow-sm">
          <div className="flex-[2] p-3">Learner</div>
          <div className="flex-[2] p-3">Lesson</div>
          <div className="flex-1 p-3">Status</div>
          <div className="flex-1 p-3">Files</div>
          <div className="w-32 p-3">Score</div>
          <div className="flex-[3] p-3">Feedback</div>
        </div>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const r = list[virtualRow.index]
          const isModified = modifiedSubmissionIds.has(r.submissionId)
          
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className={`absolute left-0 top-0 flex w-full border-b border-slate-100 transition hover:bg-slate-50/80 ${isModified ? 'bg-blue-50/30' : 'bg-white'}`}
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                marginTop: '45px', // offset for sticky header
              }}
            >
              <div className="flex-[2] p-3 font-medium text-sm text-slate-900 text-wrap">
                {r.learnerName ?? r.learnerId.slice(0, 8)}
              </div>
              <div className="flex-[2] p-3 text-slate-700 text-sm text-wrap">{r.moduleTitle}</div>
              <div className="flex-1 p-3">
                {r.gradedAt ? (
                  <span className="text-emerald-700 font-semibold inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs">
                    Graded
                  </span>
                ) : r.isTurnedIn ? (
                  <span className="text-blue-700 font-semibold inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs">
                    Turned in
                  </span>
                ) : (
                  <span className="text-amber-700 font-semibold inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs">
                    Draft
                  </span>
                )}
              </div>
              <div className="flex-1 p-3 overflow-hidden">
                <div className="flex flex-col gap-1">
                  {r.files.length === 0 ? (
                    <span className="text-slate-400 text-xs italic">No files</span>
                  ) : (
                    r.files.map((f, i) => (
                      <a
                        key={i}
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
                      >
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate max-w-[100px]">{f.name}</span>
                      </a>
                    ))
                  )}
                </div>
              </div>
              <div className="w-32 p-3">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={r.maxScore}
                    value={scores[r.submissionId] ?? ''}
                    onChange={(e) => handleScoreChange(r.submissionId, e.target.value)}
                    className="w-16 border border-slate-300 rounded-md px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500"
                    placeholder="0"
                  />
                  <span className="text-slate-500 font-bold text-xs">/ {r.maxScore}</span>
                </div>
              </div>
              <div className="flex-[3] p-3">
                <textarea
                  value={feedback[r.submissionId] ?? ''}
                  onChange={(e) => handleFeedbackChange(r.submissionId, e.target.value)}
                  rows={1}
                  className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm resize-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Add feedback..."
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function GradingClient({
  courses,
  initialRows,
  initialTotalCount,
}: {
  courses: GradingCourseOption[]
  initialRows: GradingRow[]
  initialTotalCount: number
}) {
  const [filters, setFilters] = useState<GradingFilters>({
    courseId: 'all',
    status: 'turned_in',
    learnerQuery: '',
  })

  const [rows, setRows] = useState<GradingRow[]>(initialRows)
  const [totalCount, setTotalCount] = useState(initialTotalCount)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  
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

  const [modifiedSubmissionIds, setModifiedSubmissionIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)

  const grouped = useMemo(() => {
    const m = new Map<string, GradingRow[]>()
    for (const r of rows) {
      const key = String(r.courseId)
      const arr = m.get(key) ?? []
      arr.push(r)
      m.set(key, arr)
    }
    return [...m.entries()]
  }, [rows])

  function updateFilter<K extends keyof GradingFilters>(key: K, value: GradingFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function loadData(nextPage: number, nextPageSize: number) {
    startTransition(async () => {
      const res = await fetchGradingData(filters, { page: nextPage, pageSize: nextPageSize })
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setRows(res.rows)
      setTotalCount(res.totalCount)
      setPage(res.page)
      setPageSize(res.pageSize)
      
      // Update scores and feedback maps for new rows
      const nextScores = { ...scores }
      const nextFeedback = { ...feedback }
      for (const r of res.rows) {
        if (r.score != null && !modifiedSubmissionIds.has(r.submissionId)) {
          nextScores[r.submissionId] = String(r.score)
        }
        if (r.feedback && !modifiedSubmissionIds.has(r.submissionId)) {
          nextFeedback[r.submissionId] = r.feedback
        }
      }
      setScores(nextScores)
      setFeedback(nextFeedback)
    })
  }

  function handleScoreChange(submissionId: string, val: string) {
    setScores((s) => ({ ...s, [submissionId]: val }))
    setModifiedSubmissionIds((prev) => new Set([...prev, submissionId]))
  }

  function handleFeedbackChange(submissionId: string, val: string) {
    setFeedback((f) => ({ ...f, [submissionId]: val }))
    setModifiedSubmissionIds((prev) => new Set([...prev, submissionId]))
  }

  async function handleBulkSave() {
    if (modifiedSubmissionIds.size === 0) {
      toast.info('No changes to save.')
      return
    }

    setSaving(true)
    const gradesToUpdate = Array.from(modifiedSubmissionIds).map((id) => {
      const score = Number(scores[id])
      return {
        submissionId: id,
        score: isNaN(score) ? 0 : score,
        feedback: feedback[id] ?? null,
      }
    })

    const res = await bulkUpdateGrades(gradesToUpdate)
    setSaving(false)

    if ('error' in res) {
      toast.error(res.error)
      return
    }

    toast.success(`Saved ${modifiedSubmissionIds.size} grades.`)
    setModifiedSubmissionIds(new Set())
    loadData(page, pageSize)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <label className="mb-1 block text-sm font-medium text-slate-700">Course</label>
            <select
              value={filters.courseId}
              onChange={(e) => updateFilter('courseId', e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.course_code})
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[180px]">
            <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
            <select
              value={filters.status}
              onChange={(e) => updateFilter('status', e.target.value as any)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="turned_in">Turned in (needs grading)</option>
              <option value="draft">Not turned in</option>
              <option value="graded">Graded</option>
              <option value="all">All</option>
            </select>
          </div>

          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">Learner search</label>
            <input
              type="text"
              value={filters.learnerQuery}
              onChange={(e) => updateFilter('learnerQuery', e.target.value)}
              placeholder="Type a learner name or ID…"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
            />
          </div>

          <div className="min-w-[120px]">
            <label className="mb-1 block text-sm font-medium text-slate-700">Per page</label>
            <select
              value={pageSize}
              onChange={(e) => {
                const next = Number(e.target.value)
                setPageSize(next)
                loadData(1, next)
              }}
              disabled={isPending}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-60"
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadData(1, pageSize)}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Loading...
                </>
              ) : (
                'Load data'
              )}
            </button>
            
            {modifiedSubmissionIds.size > 0 && (
              <button
                type="button"
                onClick={handleBulkSave}
                disabled={saving || isPending}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60 shadow-sm"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save {modifiedSubmissionIds.size} changes
              </button>
            )}
          </div>
        </div>

        {totalCount > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">{totalCount.toLocaleString()}</span> row
              {totalCount === 1 ? '' : 's'} total · page{' '}
              <span className="font-medium text-slate-800">{page}</span> of{' '}
              <span className="font-medium text-slate-800">{totalPages}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isPending || page <= 1}
                onClick={() => loadData(page - 1, pageSize)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={isPending || page >= totalPages}
                onClick={() => loadData(page + 1, pageSize)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {grouped.length === 0 ? (
        <div className="text-slate-500 text-sm py-12 text-center border border-dashed border-slate-200 rounded-xl bg-white">
          No submissions match your filters.
        </div>
      ) : (
        grouped.map(([courseId, list]) => {
          const head = list[0]
          return (
            <section key={courseId} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">
                  {head.courseTitle}{' '}
                  <em className="text-slate-600 font-normal not-italic text-sm">{head.courseCode}</em>
                </h2>
                <span className="text-xs text-slate-500 font-medium">
                  {list.length} submission{list.length === 1 ? '' : 's'}
                </span>
              </div>
              <GradingTable 
                list={list}
                modifiedSubmissionIds={modifiedSubmissionIds}
                scores={scores}
                feedback={feedback}
                handleScoreChange={handleScoreChange}
                handleFeedbackChange={handleFeedbackChange}
              />
            </section>
          )
        })
      )}

      {modifiedSubmissionIds.size > 0 && (
        <div className="sticky bottom-4 left-0 right-0 flex justify-center z-20">
          <div className="bg-white border border-slate-200 rounded-full shadow-xl px-6 py-3 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <span className="text-sm font-medium text-slate-700">
              {modifiedSubmissionIds.size} unsaved grade{modifiedSubmissionIds.size === 1 ? '' : 's'}
            </span>
            <div className="h-4 w-px bg-slate-200" />
            <button
              type="button"
              onClick={handleBulkSave}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-1.5 rounded-full transition shadow-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving changes...' : 'Save all changes'}
            </button>
            <button
              type="button"
              onClick={() => {
                setModifiedSubmissionIds(new Set())
                loadData(page, pageSize)
              }}
              disabled={saving}
              className="text-sm font-medium text-slate-500 hover:text-slate-700 px-2"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
