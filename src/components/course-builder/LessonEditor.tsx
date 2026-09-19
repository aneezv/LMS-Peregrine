'use client'

import React, { useMemo } from 'react'
import { ModuleItem, SectionItem, TYPE_OPTIONS, TYPE_COLOR } from './types'
import { Label, FieldInput, FieldSelect, FieldTextarea } from './FormFields'
import { QuizEditor } from './editors/QuizEditor'
import { AssignmentEditor } from './editors/AssignmentEditor'
import { SessionEditor } from './editors/SessionEditor'
import { ExternalResourcesEditor } from './editors/ExternalResourcesEditor'
import VideoModule from '@/components/VideoModule'
import { isValidDemoVideoUrl } from '@/lib/video-url'
import { unlockAtForWeek } from '@/lib/unlock-schedule'
import {
  ClipboardPaste,
  Trash2,
  Calendar,
  Layers,
  Sparkles,
  BookOpen,
  PlayCircle,
} from 'lucide-react'

interface LessonEditorProps {
  activeModule: ModuleItem | null
  sections: SectionItem[]
  courseStartsAt: string
  onUpdate: (patch: Partial<ModuleItem>) => void
  onDelete: (id: string) => void
  onPasteAfter: () => void
}

export function LessonEditor({
  activeModule,
  sections,
  courseStartsAt,
  onUpdate,
  onDelete,
  onPasteAfter,
}: LessonEditorProps) {
  const activeUnlockPreview = useMemo(() => {
    if (!activeModule || activeModule.unlock_mode !== 'auto' || !courseStartsAt.trim()) return null
    return unlockAtForWeek(courseStartsAt, activeModule.week_index)
  }, [activeModule, courseStartsAt])

  if (!activeModule) {
    return (
      <div className="flex h-full min-h-[500px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/70 p-8 text-center shadow-2xs">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mb-3">
          <BookOpen className="h-7 w-7" />
        </div>
        <h3 className="text-base font-semibold text-slate-800">No Lesson Selected</h3>
        <p className="mt-1 max-w-sm text-xs text-slate-500 leading-relaxed">
          Select a lesson from the curriculum panel on the left to edit its content, schedule, and settings, or click "+ Add Lesson" in any section.
        </p>
      </div>
    )
  }

  const currentColor = TYPE_COLOR[activeModule.type] ?? TYPE_COLOR.video
  const currentTypeOpt = TYPE_OPTIONS.find((t) => t.value === activeModule.type) ?? TYPE_OPTIONS[0]

  return (
    <div className="space-y-6 rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-7 shadow-xs">
      {/* Top Banner: Title Input, Quick Toolbar (Paste, Delete) */}
      <div className="space-y-4 border-b border-slate-100 pb-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${currentColor.bg} ${currentColor.text} shadow-2xs`}>
              {currentTypeOpt.icon}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Editing {currentTypeOpt.label} Lesson
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                Week {activeModule.week_index}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onPasteAfter}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 active:scale-95 transition shadow-2xs"
              title="Paste copied lesson after this one"
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              Paste After
            </button>
            <button
              type="button"
              onClick={() => onDelete(activeModule.id)}
              className="rounded-xl border border-red-200 bg-red-50/50 p-2 text-red-600 hover:bg-red-100 active:scale-95 transition shadow-2xs"
              title="Delete lesson"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Lesson Title Input */}
        <div>
          <Label required>Lesson Title</Label>
          <FieldInput
            type="text"
            value={activeModule.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder="e.g. Introduction to Asynchronous JavaScript"
            className="text-base font-semibold"
          />
        </div>

        {/* Lesson Type Selector */}
        <div>
          <Label>Lesson Type</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {TYPE_OPTIONS.map((opt) => {
              const isSelected = activeModule.type === opt.value
              const color = TYPE_COLOR[opt.value]
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onUpdate({ type: opt.value })}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center text-xs font-semibold transition-all active:scale-95 ${
                    isSelected
                      ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
                      : 'border-slate-200/80 bg-slate-50/60 text-slate-700 hover:border-slate-300 hover:bg-slate-100/80'
                  }`}
                >
                  <span className={isSelected ? 'text-white' : color.text}>{opt.icon}</span>
                  <span className="truncate w-full text-[11px]">{opt.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Section Assignment */}
        <div className="pt-1">
          <Label>Assigned Section</Label>
          <FieldSelect
            value={activeModule.section_id}
            onChange={(e) => onUpdate({ section_id: e.target.value })}
          >
            {sections.map((sec, idx) => (
              <option key={sec.id} value={sec.id}>
                Section {idx + 1}: {sec.title}
              </option>
            ))}
          </FieldSelect>
          <p className="mt-1 text-xs text-slate-500">
            Change the section this lesson belongs to without manual dragging.
          </p>
        </div>
      </div>

      {/* Unlock Schedule Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 text-slate-900">
          <Calendar className="h-4 w-4 text-blue-600" />
          <h4 className="text-sm font-semibold">Access & Unlock Schedule</h4>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Week Number</Label>
            <FieldInput
              type="number"
              min={1}
              step={1}
              value={activeModule.week_index}
              onChange={(e) => {
                const v = Math.max(1, Math.trunc(Number(e.target.value)) || 1)
                onUpdate({ week_index: v })
              }}
              className="bg-white"
            />
            <p className="mt-1 text-xs text-slate-500">Used to group curriculum by week progression.</p>
          </div>

          <div>
            <Label>Unlock Mode</Label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name={`unlock-mode-${activeModule.id}`}
                  checked={activeModule.unlock_mode === 'auto'}
                  onChange={() => onUpdate({ unlock_mode: 'auto' })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                Automatic Schedule
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer sm:ml-2">
                <input
                  type="radio"
                  name={`unlock-mode-${activeModule.id}`}
                  checked={activeModule.unlock_mode === 'manual'}
                  onChange={() => onUpdate({ unlock_mode: 'manual' })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                Custom Date
              </label>
            </div>
          </div>
        </div>

        {activeModule.unlock_mode === 'auto' ? (
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-900">
            {activeUnlockPreview ? (
              <p>
                Learners unlock this lesson on{' '}
                <strong className="font-semibold">{new Date(activeUnlockPreview).toLocaleString()}</strong>{' '}
                (calculated from course start date + week offset).
              </p>
            ) : (
              <p className="text-slate-600">
                Set a <strong>Course Start Date</strong> in the <em>Course Details</em> tab to enable automatic week unlocks, or choose Custom Date above.
              </p>
            )}
          </div>
        ) : (
          <div>
            <Label required>Custom Unlock Date & Time</Label>
            <FieldInput
              type="datetime-local"
              value={activeModule.available_from}
              onChange={(e) => onUpdate({ available_from: e.target.value })}
              className="bg-white max-w-md"
            />
          </div>
        )}
      </div>

      {/* Type-Specific Content Section */}
      <div className="pt-2">
        <div className="mb-4 flex items-center gap-2 text-slate-900">
          <Layers className="h-4 w-4 text-slate-600" />
          <h4 className="text-sm font-semibold">Lesson Content & Details</h4>
        </div>

        {/* Video Type with Live Player Preview */}
        {activeModule.type === 'video' && (
          <div className="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/30 p-4 shadow-2xs">
            <div>
              <Label required>Video URL (YouTube or Vimeo)</Label>
              <FieldInput
                type="url"
                value={activeModule.content_url}
                onChange={(e) => onUpdate({ content_url: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=... or https://vimeo.com/..."
                className="bg-white"
              />
              <p className="mt-1 text-xs text-slate-500">
                Paste a public or unlisted YouTube or Vimeo video link.
              </p>
            </div>

            {activeModule.content_url.trim() && (
              <div className="mt-3">
                {isValidDemoVideoUrl(activeModule.content_url) ? (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-black aspect-video shadow-sm">
                    <VideoModule contentUrl={activeModule.content_url.trim()} />
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <p className="font-semibold">Unsupported video URL</p>
                    <p className="mt-0.5 text-amber-700">
                      Please provide a valid YouTube or Vimeo URL format.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Quiz Type */}
        {activeModule.type === 'mcq' && (
          <QuizEditor module={activeModule} onUpdate={onUpdate} />
        )}

        {/* Assignment Type */}
        {activeModule.type === 'assignment' && (
          <AssignmentEditor module={activeModule} onUpdate={onUpdate} />
        )}

        {/* Live or Offline Session Type */}
        {(activeModule.type === 'live_session' || activeModule.type === 'offline_session') && (
          <SessionEditor module={activeModule} onUpdate={onUpdate} />
        )}

        {/* External Resources Type */}
        {activeModule.type === 'external_resource' && (
          <ExternalResourcesEditor module={activeModule} onUpdate={onUpdate} />
        )}

        {/* Feedback Type */}
        {activeModule.type === 'feedback' && (
          <div className="space-y-3 rounded-2xl border border-rose-100 bg-rose-50/30 p-4 shadow-2xs">
            <Label required>Feedback Prompt Instructions</Label>
            <FieldTextarea
              value={activeModule.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              rows={4}
              placeholder="What feedback are you requesting from learners? (e.g. Rate this week's assignments, suggestions for topics, etc.)"
              className="bg-white"
            />
            <p className="text-xs text-slate-500">
              Learners submit their feedback directly on the lesson page. Submitting marks this lesson complete.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
