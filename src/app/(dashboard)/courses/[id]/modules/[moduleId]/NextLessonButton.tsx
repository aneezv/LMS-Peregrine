'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useEffect } from 'react'
import { useModuleProgressStore } from '@/stores/module-progress.store'

interface NextLessonButtonProps {
  courseId: string
  currentModuleId: string
  nextModule: { id: string; title: string; locked: boolean; unlockAt: string | null } | null
  initialCompleted: boolean
  nextDisabledReason: string
}

export default function NextLessonButton({ 
  courseId, 
  currentModuleId,
  nextModule, 
  initialCompleted, 
  nextDisabledReason 
}: NextLessonButtonProps) {
  const hydrate = useModuleProgressStore((state) => state.hydrate)
  const isCompleted = useModuleProgressStore((state) => !!state.completedByModuleId[currentModuleId])

  useEffect(() => {
    if (!initialCompleted) return
    hydrate([currentModuleId])
  }, [currentModuleId, hydrate, initialCompleted])

  if (!nextModule) return null

  const canGoNext = isCompleted && !nextModule.locked

  return (
    <div className="space-y-2 pt-2">
      <div className="flex justify-end">
        {canGoNext ? (
          <Link
            href={`/courses/${courseId}/modules/${nextModule.id}`}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Next lesson
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600"
            title={nextDisabledReason}
          >
            Next lesson
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
      {!canGoNext && (
        <p className="text-right text-xs text-slate-500">{nextDisabledReason}</p>
      )}
    </div>
  )
}