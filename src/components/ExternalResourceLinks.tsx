'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { fetchWithRetry } from '@/lib/network-retry'
import { queryKeys } from '@/lib/query/query-keys'

type ExternalResourceLink = {
  id: string
  label: string | null
  url: string
}

export default function ExternalResourceLinks({
  moduleId,
  links,
}: {
  moduleId: string
  links: ExternalResourceLink[]
}) {
  const queryClient = useQueryClient()
  const didMarkRef = useRef(false)

  useEffect(() => {
    if (didMarkRef.current) return
    didMarkRef.current = true

    const run = async () => {
      try {
        const res = await fetchWithRetry('/api/modules/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ moduleId }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          throw new Error(data.error ?? 'Could not save lesson completion')
        }
        queryClient.setQueryData(queryKeys.moduleProgress({ moduleId }), { completed: true })
      } catch (error) {
        didMarkRef.current = false
        toast.error('Could not save lesson completion', {
          description:
            error instanceof Error ? error.message : 'Check your connection and try again.',
        })
      }
    }

    void run()
  }, [moduleId, queryClient])

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">Resource pack</p>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
            {links.length} link{links.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <ul className="space-y-3">
        {links.map((link, idx) => {
          const label = link.label?.trim() ? link.label : link.url
          return (
            <li key={link.id}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900 group-hover:text-indigo-700">
                    {label}
                  </span>
                  <span className="mt-1 block truncate text-xs text-slate-500">{link.url}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                  Open
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

