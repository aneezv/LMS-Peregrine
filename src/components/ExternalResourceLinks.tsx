'use client'

import { useEffect, useRef } from 'react'
import { ExternalLink } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

type ExternalResourceLink = {
  id: string
  label: string | null
  url: string
}

export default function ExternalResourceLinks({
  courseId,
  moduleId,
  links,
}: {
  courseId: string
  moduleId: string
  links: ExternalResourceLink[]
}) {
  void courseId
  const router = useRouter()
  const didMarkRef = useRef(false)

  useEffect(() => {
    if (didMarkRef.current) return
    didMarkRef.current = true

    const run = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('module_progress').upsert(
        {
          module_id: moduleId,
          learner_id: user.id,
          watch_pct: 100,
          is_completed: true,
          completed_at: new Date().toISOString(),
        },
        { onConflict: 'module_id,learner_id' },
      )
      router.refresh()
    }

    void run()
  }, [moduleId, router])

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

