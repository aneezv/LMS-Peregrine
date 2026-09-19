'use client'

import React, { useState } from 'react'
import { SectionItem, ModuleItem } from './types'
import { LessonListItem } from './LessonListItem'
import {
  Pencil,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Folder,
} from 'lucide-react'

interface CurriculumSectionItemProps {
  section: SectionItem
  sectionIndex: number
  totalSections: number
  sectionModules: ModuleItem[]
  activeModuleId: string
  onSelectModule: (id: string) => void
  onAddModule: (sectionId: string) => void
  onCopyModule: (mod: ModuleItem, e: React.MouseEvent) => void
  onDuplicateModule: (mod: ModuleItem, e: React.MouseEvent) => void
  onDeleteModule: (id: string) => void
  onUpdateSectionTitle: (sectionId: string, title: string) => void
  onMoveSection: (index: number, direction: 'up' | 'down') => void
  onRequestDeleteSection: (sec: SectionItem) => void
}

export function CurriculumSectionItem({
  section,
  sectionIndex,
  totalSections,
  sectionModules,
  activeModuleId,
  onSelectModule,
  onAddModule,
  onCopyModule,
  onDuplicateModule,
  onDeleteModule,
  onUpdateSectionTitle,
  onMoveSection,
  onRequestDeleteSection,
}: CurriculumSectionItemProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingTitle, setEditingTitle] = useState(section.title)

  const handleSaveTitle = () => {
    const trimmed = editingTitle.trim()
    if (trimmed) {
      onUpdateSectionTitle(section.id, trimmed)
    } else {
      setEditingTitle(section.title)
    }
    setIsEditing(false)
  }

  const handleCancelTitle = () => {
    setEditingTitle(section.title)
    setIsEditing(false)
  }

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-2.5 shadow-2xs transition-all hover:border-slate-300/90">
      {/* Section Header */}
      <div className="flex items-center justify-between gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-2xs">
        {/* Left Side: Collapse Arrow, Index Badge, Title or Inline Input */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            title={isCollapsed ? 'Expand section' : 'Collapse section'}
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-50 text-[11px] font-bold text-blue-700">
            {sectionIndex + 1}
          </span>

          {isEditing ? (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <input
                type="text"
                autoFocus
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle()
                  if (e.key === 'Escape') handleCancelTitle()
                }}
                className="h-7 w-full rounded-md border border-blue-500 bg-white px-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Section title..."
              />
              <button
                type="button"
                onClick={handleSaveTitle}
                className="rounded p-1 text-emerald-600 hover:bg-emerald-50 transition"
                title="Save section title"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCancelTitle}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                title="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <span
                className="truncate text-xs font-semibold text-slate-800 cursor-pointer"
                onClick={() => setIsEditing(true)}
                title="Click to rename"
              >
                {section.title}
              </span>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition"
                title="Rename section"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* Right Side: Count badge, Up/Down, Add Lesson, Delete */}
        <div className="flex items-center gap-0.5 shrink-0">
          <span className="mr-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
            {sectionModules.length} {sectionModules.length === 1 ? 'lesson' : 'lessons'}
          </span>

          <button
            type="button"
            disabled={sectionIndex === 0}
            onClick={() => onMoveSection(sectionIndex, 'up')}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:pointer-events-none transition"
            title="Move section up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            disabled={sectionIndex === totalSections - 1}
            onClick={() => onMoveSection(sectionIndex, 'down')}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:pointer-events-none transition"
            title="Move section down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onAddModule(section.id)}
            className="rounded p-1 text-blue-600 hover:bg-blue-50 transition"
            title="Add lesson to this section"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            disabled={totalSections <= 1}
            onClick={() => onRequestDeleteSection(section)}
            className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none transition"
            title="Delete section"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Lesson List Inside Section (Collapsible) */}
      {!isCollapsed && (
        <div className="mt-2 space-y-1.5 min-h-[38px]">
          {sectionModules.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/70 py-4 text-center">
              <Folder className="h-5 w-5 text-slate-300 mb-1" />
              <p className="text-xs text-slate-400 mb-1.5">No lessons in this section yet</p>
              <button
                type="button"
                onClick={() => onAddModule(section.id)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
              >
                <Plus className="h-3 w-3" /> Add Lesson
              </button>
            </div>
          ) : (
            sectionModules.map((mod) => (
              <LessonListItem
                key={mod.id}
                module={mod}
                isActive={mod.id === activeModuleId}
                onSelect={() => onSelectModule(mod.id)}
                onCopy={(e) => onCopyModule(mod, e)}
                onDuplicate={(e) => onDuplicateModule(mod, e)}
                onDelete={(e) => {
                  e.stopPropagation()
                  onDeleteModule(mod.id)
                }}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
