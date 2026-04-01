'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { Menu, X } from 'lucide-react'

export default function ModulesDrawerShell({
  children,
  sidebar,
}: {
  children: ReactNode
  sidebar: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const drawerId = useId()

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative min-h-[calc(100vh-8rem)]">
      <div className="sticky top-20 z-20 mb-4 w-fit">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls={drawerId}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Menu className="h-4 w-4" />
          Syllabus
        </button>
      </div>

      <div className="w-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 md:p-8">
        {children}
      </div>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close syllabus drawer overlay"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/35"
          />

          <aside
            id={drawerId}
            aria-label="Course syllabus navigation"
            className="fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-full max-w-md flex-col border-r border-slate-200 bg-white p-3 shadow-2xl sm:max-w-lg"
          >
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="text-sm font-semibold text-slate-800">Course Syllabus</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close syllabus drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-1">
              {sidebar}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
