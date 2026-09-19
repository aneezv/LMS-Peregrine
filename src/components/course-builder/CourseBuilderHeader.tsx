'use client'

import React from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Eye,
  Trash2,
  Save,
  Send,
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
  isPublished: boolean
  hasUnsavedChanges: boolean
  saving: boolean
  saved: boolean
  deleting: boolean
  actionError: string
  activeTab: StudioTab
  lessonCount: number
  onTabChange: (tab: StudioTab) => void
  onSave: (publish: boolean) => void
  onRequestDeleteCourse: () => void
}

export function CourseBuilderHeader({
  courseId,
  title,
  courseCode,
  isPublished,
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
    <div className="sticky top-0 z-30 -mx-1 -mt-1 sm:-mx-6 sm:-mt-8 lg:-mx-8 mb-6 border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-2xs">
      {/* Top Header Row */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        {/* Left Side: Back Link, Title & Status */}
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/courses"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900"
            title="Back to courses"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-base font-bold text-slate-900">
                {title.trim() || 'Untitled Course'}
              </span>

              {courseCode.trim() && (
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                  {courseCode.trim()}
                </span>
              )}

              {/* Status Badge */}
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  isPublished
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {isPublished ? 'Published' : 'Draft'}
              </span>

              {/* Unsaved Changes Indicator */}
              {hasUnsavedChanges && !saved && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
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
            <p className="hidden sm:block text-[11px] text-slate-400">
              {courseId ? 'Course Studio & Curriculum Builder' : 'New Course Studio'}
            </p>
          </div>
        </div>

        {/* Right Side: Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {actionError && (
            <span className="flex items-center gap-1 text-xs font-semibold text-red-600 mr-1" role="alert">
              <AlertCircle className="h-3.5 w-3.5" />
              {actionError}
            </span>
          )}

          {courseId && (
            <>
              <Link
                href={`/courses/${courseId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900"
                title="Preview course landing page"
              >
                <Eye className="h-3.5 w-3.5 text-slate-500" />
                <span className="hidden sm:inline">Preview</span>
              </Link>

              <button
                type="button"
                onClick={onRequestDeleteCourse}
                disabled={deleting || saving}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/60 px-3 py-2 text-xs font-semibold text-red-600 shadow-2xs transition hover:bg-red-100 disabled:opacity-50"
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

          {/* Save Draft Button */}
          <button
            type="button"
            onClick={() => onSave(false)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Draft
          </button>

          {/* Publish / Save Changes Button */}
          <button
            type="button"
            onClick={() => onSave(true)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {isPublished ? 'Save & Update' : 'Publish Course'}
          </button>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="mx-auto flex max-w-7xl items-center gap-1 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => onTabChange('curriculum')}
          className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-bold transition-all ${
            activeTab === 'curriculum'
              ? 'border-blue-600 text-blue-600'
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
          className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-bold transition-all ${
            activeTab === 'details'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
          }`}
        >
          <Settings2 className="h-4 w-4" />
          <span>Course Details</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('pricing')}
          className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-bold transition-all ${
            activeTab === 'pricing'
              ? 'border-blue-600 text-blue-600'
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
