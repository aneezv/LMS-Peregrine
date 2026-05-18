'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** Parse a 'YYYY-MM-DD' string to a UTC-midnight Date (timezone-safe). */
function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

/**
 * GitHub-style activity heatmap. Weeks are columns (Sunday → Saturday rows),
 * showing roughly the last ~14 weeks ending at `todayIso` (IST date computed
 * server-side). A cell is filled when its date is in `activeDays`.
 */
export default function StreakCalendar({
  activeDays,
  todayIso,
  weeks = 14,
}: {
  activeDays: string[]
  todayIso: string
  weeks?: number
}) {
  const { columns, monthLabels } = useMemo(() => {
    const active = new Set(activeDays)
    const today = parseIso(todayIso)

    // Grid ends on the Saturday of today's week, starts `weeks` weeks before
    // the Sunday of that span so every column is a full Sun–Sat week.
    const endOfWeek = addDays(today, 6 - today.getUTCDay())
    const start = addDays(endOfWeek, -(weeks * 7 - 1))

    const cols: { iso: string | null; active: boolean; isToday: boolean; future: boolean }[][] = []
    const labels: { col: number; text: string }[] = []
    let lastMonth = -1

    for (let w = 0; w < weeks; w++) {
      const col: { iso: string | null; active: boolean; isToday: boolean; future: boolean }[] = []
      for (let dow = 0; dow < 7; dow++) {
        const cell = addDays(start, w * 7 + dow)
        const iso = toIso(cell)
        const future = cell.getTime() > today.getTime()
        col.push({
          iso,
          active: active.has(iso),
          isToday: iso === todayIso,
          future,
        })
        if (dow === 0) {
          const month = cell.getUTCMonth()
          if (month !== lastMonth) {
            labels.push({ col: w, text: MONTHS[month] })
            lastMonth = month
          }
        }
      }
      cols.push(col)
    }
    return { columns: cols, monthLabels: labels }
  }, [activeDays, todayIso, weeks])

  return (
    <div className="w-full flex flex-col gap-1.5">
      {/* Month labels */}
      <div className="flex gap-1.5">
        {columns.map((_, w) => {
          const label = monthLabels.find((l) => l.col === w)
          return (
            <div
              key={w}
              className="flex-1 text-[10px] font-medium text-slate-400 overflow-visible whitespace-nowrap"
            >
              {label ? label.text : ''}
            </div>
          )
        })}
      </div>

      {/* Week columns */}
      <div className="flex gap-1.5">
        {columns.map((col, w) => (
          <div key={w} className="flex-1 flex flex-col gap-1.5">
            {col.map((cell, dow) =>
              cell.future ? (
                <div key={dow} className="h-5 w-full" />
              ) : (
                <div
                  key={dow}
                  title={`${cell.iso}${cell.active ? ' — active' : ''}`}
                  className={cn(
                    'h-5 w-full rounded-[3px]',
                    cell.active ? 'bg-orange-500' : 'bg-slate-100',
                    cell.isToday && 'ring-1 ring-orange-600 ring-offset-1',
                  )}
                />
              ),
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-slate-400">
        <span>Less</span>
        <span className="h-3 w-3 rounded-[3px] bg-slate-100" />
        <span className="h-3 w-3 rounded-[3px] bg-orange-500" />
        <span>More</span>
      </div>
    </div>
  )
}
