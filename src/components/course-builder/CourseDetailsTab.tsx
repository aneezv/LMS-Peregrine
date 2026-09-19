'use client'

import React, { useMemo } from 'react'
import Image from 'next/image'
import VideoModule from '@/components/VideoModule'
import { isValidDemoVideoUrl } from '@/lib/video-url'
import { toRenderableImageUrl } from '@/lib/drive-image'
import { Label, FieldInput, FieldSelect, FieldTextarea } from './FormFields'
import { Upload, Loader2, Video, ImageIcon, Sparkles } from 'lucide-react'

interface CourseDetailsTabProps {
  title: string
  setTitle: (val: string) => void
  courseCode: string
  setCourseCode: (val: string) => void
  description: string
  setDescription: (val: string) => void
  courseStartsAt: string
  setCourseStartsAt: (val: string) => void
  thumbnailUrl: string
  setThumbnailUrl: (val: string) => void
  demoVideoUrl: string
  setDemoVideoUrl: (val: string) => void
  departmentId: string
  setDepartmentId: (val: string) => void
  departmentOptions: { id: string; name: string; sort_order: number }[]
  isAdmin: boolean
  selectedInstructorId: string
  setSelectedInstructorId: (val: string) => void
  instructorChoices: { id: string; full_name: string | null; role: string }[]
  thumbnailUploading: boolean
  thumbnailUploadError: string
  onUploadThumbnail: (file: File) => Promise<void>
  thumbnailPreviewVersion: number
}

export function CourseDetailsTab({
  title,
  setTitle,
  courseCode,
  setCourseCode,
  description,
  setDescription,
  courseStartsAt,
  setCourseStartsAt,
  thumbnailUrl,
  setThumbnailUrl,
  demoVideoUrl,
  setDemoVideoUrl,
  departmentId,
  setDepartmentId,
  departmentOptions,
  isAdmin,
  selectedInstructorId,
  setSelectedInstructorId,
  instructorChoices,
  thumbnailUploading,
  thumbnailUploadError,
  onUploadThumbnail,
  thumbnailPreviewVersion,
}: CourseDetailsTabProps) {
  const thumbnailPreviewSrc = useMemo(() => {
    const base = toRenderableImageUrl(thumbnailUrl)
    if (!base) return ''
    const joiner = base.includes('?') ? '&' : '?'
    return `${base}${joiner}v=${thumbnailPreviewVersion}`
  }, [thumbnailUrl, thumbnailPreviewVersion])

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
      {/* Left Column: Core Metadata (~60%) */}
      <div className="space-y-6 lg:col-span-7">
        <div className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-7 shadow-xs space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4 text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Sparkles className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Course Information
            </h3>
          </div>

          {/* Instructor Assignment (Admin Only) */}
          {isAdmin && (
            <div>
              <Label required>Instructor (Course Owner)</Label>
              {instructorChoices.length > 0 ? (
                <FieldSelect
                  value={selectedInstructorId}
                  onChange={(e) => setSelectedInstructorId(e.target.value)}
                >
                  {instructorChoices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name?.trim() || 'Unnamed'} ({p.role})
                    </option>
                  ))}
                </FieldSelect>
              ) : (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  Loading verified instructors...
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                The course owner appears in catalog cards and receives grading and submission privileges.
              </p>
            </div>
          )}

          {/* Course Title */}
          <div>
            <Label required>Course Title</Label>
            <FieldInput
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Modern Full-Stack Web Development"
              className="text-base font-semibold"
            />
          </div>

          {/* Course Code & Department */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label required>Course Code</Label>
              <FieldInput
                type="text"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                placeholder="e.g. CS101-A"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="mt-1 text-xs text-slate-500">
                Unique identifier displayed across catalog and course header.
              </p>
            </div>

            <div>
              <Label required>Department</Label>
              {departmentOptions.length > 0 ? (
                <FieldSelect
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                >
                  {departmentOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </FieldSelect>
              ) : (
                <p className="text-xs text-slate-500">Loading departments...</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Used to filter and categorize courses in the student catalog.
              </p>
            </div>
          </div>

          {/* Description */}
          <div>
            <Label>Course Overview & Objectives</Label>
            <FieldTextarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Provide a comprehensive summary of what learners will study, prerequisities, and outcomes..."
            />
          </div>

          {/* Course Start Date */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 shadow-2xs">
            <Label>Course Start Date (Schedule Baseline)</Label>
            <FieldInput
              type="datetime-local"
              value={courseStartsAt}
              onChange={(e) => setCourseStartsAt(e.target.value)}
              className="bg-white max-w-sm"
            />
            <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
              Used to calculate automated week-based lesson unlocking. Week 1 unlocks at this time; Week 2 unlocks +7 days later, and so on.
            </p>
          </div>
        </div>
      </div>

      {/* Right Column: Visual Media (~40%) */}
      <div className="space-y-6 lg:col-span-5">
        {/* Course Thumbnail Card */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <ImageIcon className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Thumbnail Cover Image
            </h3>
          </div>

          {/* Preview Canvas */}
          {thumbnailUrl ? (
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 aspect-video group">
              <Image
                src={thumbnailPreviewSrc}
                alt="Course thumbnail preview"
                fill
                className="object-cover"
                unoptimized
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <a
                  href={thumbnailUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-900 backdrop-blur shadow hover:bg-white"
                >
                  View Full Image
                </a>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 aspect-video text-center p-4">
              <ImageIcon className="h-8 w-8 text-slate-300 mb-1.5" />
              <p className="text-xs font-semibold text-slate-600">No thumbnail image set</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Upload a cover image or paste a URL below.</p>
            </div>
          )}

          <div>
            <Label>Thumbnail Image URL</Label>
            <FieldInput
              type="url"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              placeholder="https://images.unsplash.com/... or Google Drive URL"
            />
          </div>

          {/* Upload Button */}
          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs">
              {thumbnailUploading ? (
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              ) : (
                <Upload className="h-4 w-4 text-slate-600" />
              )}
              {thumbnailUploading ? 'Uploading cover...' : 'Upload Image File'}
              <input
                type="file"
                className="sr-only"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml"
                disabled={thumbnailUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) void onUploadThumbnail(file)
                }}
              />
            </label>
            {thumbnailUploadError && (
              <p className="mt-2 text-xs font-semibold text-red-600">{thumbnailUploadError}</p>
            )}
          </div>
        </div>

        {/* Demo Video Card */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-slate-900">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Video className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                Introductory Demo Video
              </h3>
            </div>
            {demoVideoUrl && (
              <button
                type="button"
                onClick={() => setDemoVideoUrl('')}
                className="text-xs font-semibold text-red-600 hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          <div>
            <Label>YouTube or Vimeo URL</Label>
            <FieldInput
              type="url"
              value={demoVideoUrl}
              onChange={(e) => setDemoVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... or https://vimeo.com/..."
            />
            <p className="mt-1 text-xs text-slate-500">
              Optional promotional or introductory video displayed on the course landing page.
            </p>
          </div>

          {demoVideoUrl.trim() && (
            <div className="mt-2">
              {isValidDemoVideoUrl(demoVideoUrl) ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm bg-black aspect-video">
                  <VideoModule contentUrl={demoVideoUrl.trim()} />
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <p className="font-semibold">Unsupported Video Format</p>
                  <p className="mt-0.5">Please provide a valid YouTube or Vimeo link.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
