'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Menu } from 'lucide-react'
import { iconFor, type NavItem } from '@/components/DashboardNavDrawer'
import { useNavDrawer } from '@/lib/stores/navDrawer'
import { queryKeys } from '@/lib/query/query-keys'
import { cn } from '@/lib/utils'

// NOTE: this bar is `fixed bottom-0`. The internship timer widget
// (InternshipTimerWidget.tsx) is currently disabled; if it is re-enabled, its
// bottom offset must clear this bar's height (~3.5rem + safe-area) on <lg.

/** Returns the href of the single item that best matches the current path:
 *  exact match wins, otherwise the longest href that is a path-segment prefix
 *  (so `/dashboard` is not active on `/dashboard/streak`). */
function activeHref(pathname: string, items: NavItem[]): string | null {
  let best: string | null = null
  let bestLen = -1
  for (const { href } of items) {
    const matches = pathname === href || pathname.startsWith(href + '/')
    if (matches && href.length > bestLen) {
      best = href
      bestLen = href.length
    }
  }
  return best
}

export default function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  const setOpen = useNavDrawer((s) => s.setOpen)
  const quizInProgress = useQuery({
    queryKey: queryKeys.quizInProgress(),
    queryFn: () => false,
    initialData: false,
    enabled: false,
    staleTime: Infinity,
  }).data
  const active = activeHref(pathname, items)

  // Hide while a quiz is being taken — the quiz renders its own fixed bottom
  // submit bar at the same position, which this would otherwise overlap.
  if (quizInProgress) return null

  const cellClass =
    'flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium [&_svg]:size-5'

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0,1fr))` }}
      >
        {items.map((item) => {
          const isActive = item.href === active
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(cellClass, isActive ? 'text-blue-600' : 'text-slate-500')}
            >
              {iconFor(item.icon)}
              <span className="leading-none">{item.label}</span>
            </Link>
          )
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          className={cn(cellClass, 'text-slate-500')}
        >
          <Menu className="h-4 w-4" />
          <span className="leading-none">More</span>
        </button>
      </div>
    </nav>
  )
}
