'use client'

import { useMemo, useState } from 'react'
import { AppCard } from '@/components/ui/primitives'
import { Search, ArrowUpDown, Copy, Check, Users, CalendarDays } from 'lucide-react'

export type EnrollmentListItem = {
  id: string
  learnerId: string
  learnerName: string
  enrolledAt: string
  totalModules: number
  completedModules: number
  remainingModules: number
  completionPct: number
  isCompleted: boolean
}

type Props = {
  items: EnrollmentListItem[]
}

export default function EnrollmentsListClient({ items }: Props) {
  const [query, setQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? items.filter(
          (item) =>
            item.learnerName.toLowerCase().includes(q) || item.learnerId.toLowerCase().includes(q),
        )
      : items

    const sorted = [...base].sort((a, b) => {
      const aTime = new Date(a.enrolledAt).getTime()
      const bTime = new Date(b.enrolledAt).getTime()
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime
    })
    return sorted
  }, [items, query, sortOrder])

  async function copyLearnerId(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopiedId(id)
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1200)
    } catch {
      // Clipboard may fail in unsupported contexts. Keep UI stable.
      setCopiedId(null)
    }
  }

  if (items.length === 0) {
    return (
      <AppCard className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
        <Users className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        No learners have enrolled in this course yet.
      </AppCard>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by learner name or ID"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 outline-none ring-0 transition focus:border-emerald-400"
            />
          </div>

          <button
            type="button"
            onClick={() => setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'))}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-emerald-300 hover:text-emerald-800"
            title="Toggle sort order"
          >
            <ArrowUpDown className="h-4 w-4" />
            {sortOrder === 'newest' ? 'Newest first' : 'Oldest first'}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <AppCard className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          No learners match your search.
        </AppCard>
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => (
            <li
              key={item.id}
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/30"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3 sm:items-center">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.learnerName}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>Learner ID: {item.learnerId}</span>
                      <button
                        type="button"
                        onClick={() => void copyLearnerId(item.learnerId)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:border-emerald-300 hover:text-emerald-800"
                      >
                        {copiedId === item.learnerId ? (
                          <>
                            <Check className="h-3 w-3" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copy ID
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                        item.isCompleted
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.completedModules > 0
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {item.isCompleted
                        ? 'Completed'
                        : item.completedModules > 0
                          ? 'In progress'
                          : 'Not started'}
                    </span>
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                      <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
                      {new Date(item.enrolledAt).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-medium text-slate-700">Progress</span>
                    <span>
                      {item.completedModules}/{item.totalModules} modules ({item.completionPct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-[width] duration-300 motion-reduce:transition-none"
                      style={{ width: `${item.completionPct}%` }}
                      aria-hidden
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Needed to complete: <span className="font-semibold text-slate-700">{item.remainingModules}</span>{' '}
                    module{item.remainingModules === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
