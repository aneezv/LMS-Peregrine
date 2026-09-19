'use client'

import React from 'react'
import { ModuleItem, TYPE_OPTIONS, TYPE_COLOR } from './types'
import { SortableItem } from '@/components/SortableItem'
import { Copy, Trash2 } from 'lucide-react'

interface LessonListItemProps {
  module: ModuleItem
  isActive: boolean
  onSelect: () => void
  onCopy: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
}

export function LessonListItem({
  module,
  isActive,
  onSelect,
  onCopy,
  onDelete,
}: LessonListItemProps) {
  const typeOpt = TYPE_OPTIONS.find((t) => t.value === module.type) ?? TYPE_OPTIONS[0]
  const color = TYPE_COLOR[module.type] ?? TYPE_COLOR.video

  return (
    <SortableItem id={module.id}>
      <div
        onClick={onSelect}
        className={`group relative flex cursor-pointer select-none items-center gap-2.5 rounded-xl border px-3 py-2.5 pl-8 transition-all ${
          isActive
            ? 'border-blue-500 bg-blue-50/70 shadow-xs ring-2 ring-blue-500/20'
            : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/80'
        }`}
      >
        {/* Week Badge */}
        <span
          className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500"
          title={`Week ${module.week_index} Unlock`}
        >
          W{module.week_index}
        </span>

        {/* Type Icon Badge */}
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${color.bg} ${color.text}`}
          title={`Type: ${typeOpt.label}`}
        >
          {typeOpt.icon}
        </span>

        {/* Title */}
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">
          {module.title.trim() || 'Untitled Lesson'}
        </span>

        {/* Quick Actions (visible on hover / active) */}
        <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition">
          <button
            type="button"
            onClick={onCopy}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 transition"
            title="Copy lesson to clipboard"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
            title="Delete lesson"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </SortableItem>
  )
}
