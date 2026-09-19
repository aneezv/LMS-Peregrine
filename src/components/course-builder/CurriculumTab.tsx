'use client'

import React, { useState, useMemo } from 'react'
import { SectionItem, ModuleItem } from './types'
import { CurriculumSectionItem } from './CurriculumSectionItem'
import { LessonEditor } from './LessonEditor'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { FolderPlus, ClipboardPaste, Search, X } from 'lucide-react'

interface CurriculumTabProps {
  sections: SectionItem[]
  modules: ModuleItem[]
  activeId: string
  courseStartsAt: string
  onSelectModule: (id: string) => void
  onAddModule: (sectionId?: string) => void
  onDeleteModule: (id: string) => void
  onUpdateActiveModule: (patch: Partial<ModuleItem>) => void
  onCopyModule: (mod: ModuleItem, e: React.MouseEvent) => void
  onDuplicateModule: (mod: ModuleItem) => void
  onPasteModule: () => void
  onReorderModules: (newModules: ModuleItem[], movedId: string) => void
  onAddSection: () => void
  onUpdateSectionTitle: (sectionId: string, title: string) => void
  onMoveSection: (index: number, direction: 'up' | 'down') => void
  onRequestDeleteSection: (sec: SectionItem) => void
}

export function CurriculumTab({
  sections,
  modules,
  activeId,
  courseStartsAt,
  onSelectModule,
  onAddModule,
  onDeleteModule,
  onUpdateActiveModule,
  onCopyModule,
  onDuplicateModule,
  onPasteModule,
  onReorderModules,
  onAddSection,
  onUpdateSectionTitle,
  onMoveSection,
  onRequestDeleteSection,
}: CurriculumTabProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const modulesForDisplay = useMemo(() => {
    const sectionIndexMap = new Map<string, number>(
      sections.map((sec, idx) => [sec.id, idx])
    )
    return [...modules].sort((a, b) => {
      const secA = sectionIndexMap.get(a.section_id) ?? 999
      const secB = sectionIndexMap.get(b.section_id) ?? 999
      if (secA !== secB) return secA - secB
      return 0
    })
  }, [modules, sections])

  const filteredModules = useMemo(() => {
    if (!searchQuery.trim()) return modulesForDisplay
    const q = searchQuery.toLowerCase()
    return modulesForDisplay.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.type.toLowerCase().includes(q) ||
        `week ${m.week_index}`.includes(q)
    )
  }, [modulesForDisplay, searchQuery])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const activeIdStr = String(active.id)
      const overIdStr = String(over.id)
      const oldIdx = modulesForDisplay.findIndex((i) => i.id === activeIdStr)
      const newIdx = modulesForDisplay.findIndex((i) => i.id === overIdStr)
      if (oldIdx < 0 || newIdx < 0) return

      const destinationSectionId =
        modulesForDisplay[newIdx]?.section_id ?? sections[0]?.id ?? ''
      const next = arrayMove(modulesForDisplay, oldIdx, newIdx).map((m) =>
        m.id === activeIdStr ? { ...m, section_id: destinationSectionId } : m
      )
      onReorderModules(next, activeIdStr)
    }
  }

  const activeModule = useMemo(
    () => modules.find((m) => m.id === activeId) ?? null,
    [modules, activeId]
  )

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
      {/* Left Column: Curriculum Tree (~42% on desktop) */}
      <div className="space-y-4 lg:col-span-5">
        {/* Toolbar: Search, Paste, Add Section */}
        <div className="space-y-2.5 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter lessons by title or type..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-1.5 pl-8 pr-7 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onPasteModule}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 active:scale-95 transition"
              title="Paste copied lesson"
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              Paste
            </button>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 px-0.5">
            <span className="font-medium">
              {sections.length} {sections.length === 1 ? 'Section' : 'Sections'} &bull;{' '}
              {modules.length} {modules.length === 1 ? 'Lesson' : 'Lessons'}
            </span>
            <button
              type="button"
              onClick={onAddSection}
              className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              Add Section
            </button>
          </div>
        </div>

        {/* Draggable Curriculum Sections */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredModules.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3 max-h-[calc(100vh-230px)] overflow-y-auto pr-1">
              {sections.map((section, secIdx) => {
                const sectionMods = filteredModules.filter(
                  (m) => m.section_id === section.id
                )

                return (
                  <CurriculumSectionItem
                    key={section.id}
                    section={section}
                    sectionIndex={secIdx}
                    totalSections={sections.length}
                    sectionModules={sectionMods}
                    activeModuleId={activeId}
                    onSelectModule={onSelectModule}
                    onAddModule={onAddModule}
                    onCopyModule={onCopyModule}
                    onDuplicateModule={(mod, e) => {
                      e.stopPropagation()
                      onDuplicateModule(mod)
                    }}
                    onDeleteModule={onDeleteModule}
                    onUpdateSectionTitle={onUpdateSectionTitle}
                    onMoveSection={onMoveSection}
                    onRequestDeleteSection={onRequestDeleteSection}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>

        <button
          type="button"
          onClick={onAddSection}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-blue-300 bg-blue-50/50 py-3 text-xs font-bold text-blue-700 transition hover:border-blue-400 hover:bg-blue-100/60 shadow-2xs active:scale-95"
        >
          <FolderPlus className="h-4 w-4" /> Add New Section
        </button>
      </div>

      {/* Right Column: Sticky Focused Lesson Editor (~58% on desktop) */}
      <div className="lg:col-span-7 lg:sticky lg:top-[128px] lg:max-h-[calc(100vh-148px)] lg:overflow-y-auto pr-1">
        <LessonEditor
          activeModule={activeModule}
          sections={sections}
          courseStartsAt={courseStartsAt}
          onUpdate={onUpdateActiveModule}
          onDelete={onDeleteModule}
          onPasteAfter={onPasteModule}
        />
      </div>
    </div>
  )
}
