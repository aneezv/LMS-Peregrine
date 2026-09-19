'use client'

import React from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Eye,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Settings2,
  IndianRupee,
} from 'lucide-react'

export type StudioTab = 'curriculum' | 'details' | 'pricing'

interface CourseBuilderHeaderProps {
  courseId?: string
  title: string
  courseCode: string
  status: 'draft' | 'published'
  onStatusChange: (status: 'draft' | 'published') => void
  hasUnsavedChanges: boolean
  saving: boolean
  saved: boolean
  deleting: boolean
  actionError: string
  activeTab: StudioTab
  lessonCount: number
  onTabChange: (tab: StudioTab) => void
  onSave: () => void
  onRequestDeleteCourse: () => void
}

export function CourseBuilderHeader({
  courseId,
  title,
  courseCode,
  status,
  onStatusChange,
  hasUnsavedChanges,
  saving,
  saved,
  deleting,
  actionError,
  activeTab,
  lessonCount,
  onTabChange,
  onSave,
  onRequestDeleteCourse,
}: CourseBuilderHeaderProps) {
  return (
    <div className="sticky top-16 z-20 -mx-1 -mt-1 sm:-mx-6 sm:-mt-8 lg:-mx-8 mb-6 border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-2xs transition-all">
      {/* Top Header Row */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        {/* Left Side: Back Link, Title & Status */}
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/courses"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 active:scale-95"
            title="Back to courses"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-base font-bold text-slate-900 tracking-tight">
                {title.trim() || 'Untitled Course'}
              </span>

              {courseCode.trim() && (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600 border border-slate-200/60">
                  {courseCode.trim()}
                </span>
              )}

              {/* Unsaved Changes Indicator */}
              {hasUnsavedChanges && !saved && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200/60">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Unsaved changes
                </span>
              )}

              {saved && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Saved!
                </span>
              )}
            </div>
            <p className="hidden sm:block text-[11px] font-medium text-slate-400 mt-0.5">
              {courseId ? 'Course Studio & Curriculum Builder' : 'New Course Studio'}
            </p>
          </div>
        </div>

        {/* Right Side: Action Buttons & Status Toggle */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {actionError && (
            <span className="flex items-center gap-1 text-xs font-semibold text-red-600 mr-1" role="alert">
              <AlertCircle className="h-3.5 w-3.5" />
              {actionError}
            </span>
          )}

          {/* Status Toggle Switch: Draft <-> Published */}
          <div
            onClick={() => onStatusChange(status === 'published' ? 'draft' : 'published')}
            className={`group flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-1.5 shadow-2xs transition-all select-none active:scale-95 ${
              status === 'published'
                ? 'border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100/80 text-emerald-800'
                : 'border-slate-200 bg-slate-50/90 hover:bg-slate-100/90 text-slate-600'
            }`}
            title={`Course is currently ${status}. Click to switch to ${status === 'published' ? 'draft' : 'published'}.`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onStatusChange(status === 'published' ? 'draft' : 'published')
              }
            }}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full transition-colors ${
                  status === 'published'
                    ? 'bg-emerald-500 ring-2 ring-emerald-200 animate-pulse'
                    : 'bg-slate-400'
                }`}
              />
              <span className="text-xs font-bold tracking-tight">
                {status === 'published' ? 'Published' : 'Draft'}
              </span>
            </div>

            {/* Modern Sliding Switch */}
            <div
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out ${
                status === 'published' ? 'bg-emerald-600' : 'bg-slate-300 group-hover:bg-slate-400'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
                  status === 'published' ? 'translate-x-[18px]' : 'translate-x-[2px]'
                }`}
              />
            </div>
          </div>

          {courseId && (
            <>
              <Link
                href={`/courses/${courseId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 active:scale-95"
                title="Preview course landing page"
              >
                <Eye className="h-3.5 w-3.5 text-slate-500" />
                <span className="hidden sm:inline">Preview</span>
              </Link>

              <button
                type="button"
                onClick={onRequestDeleteCourse}
                disabled={deleting || saving}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/60 px-3 py-2 text-xs font-semibold text-red-600 shadow-2xs transition hover:bg-red-100 active:scale-95 disabled:opacity-50"
                title="Delete course"
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Delete</span>
              </button>
            </>
          )}

          {/* Single Save Button */}
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 active:scale-95 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8 pt-1">
        <button
          type="button"
          onClick={() => onTabChange('curriculum')}
          className={`flex items-center gap-2 rounded-t-xl border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
            activeTab === 'curriculum'
              ? 'border-blue-600 text-blue-600 bg-blue-50/40'
              : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          <span>Curriculum</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              activeTab === 'curriculum'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {lessonCount} {lessonCount === 1 ? 'Lesson' : 'Lessons'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('details')}
          className={`flex items-center gap-2 rounded-t-xl border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
            activeTab === 'details'
              ? 'border-blue-600 text-blue-600 bg-blue-50/40'
              : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
          }`}
        >
          <Settings2 className="h-4 w-4" />
          <span>Course Details</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('pricing')}
          className={`flex items-center gap-2 rounded-t-xl border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
            activeTab === 'pricing'
              ? 'border-blue-600 text-blue-600 bg-blue-50/40'
              : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
          }`}
        >
          <IndianRupee className="h-4 w-4" />
          <span>Pricing & Access</span>
        </button>
      </div>
    </div>
  )
}
