'use client'

import React from 'react'
import { ModuleItem } from '../types'
import { Label, FieldInput, FieldTextarea } from '../FormFields'
import { Video, MapPin, Calendar } from 'lucide-react'

interface SessionEditorProps {
  module: ModuleItem
  onUpdate: (patch: Partial<ModuleItem>) => void
}

export function SessionEditor({ module, onUpdate }: SessionEditorProps) {
  const isLive = module.type === 'live_session'

  return (
    <div className="space-y-5">
      {isLive ? (
        <div className="rounded-2xl border border-purple-100 bg-purple-50/30 p-4 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-purple-950">
            <Video className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-semibold">Live Video Session Details</span>
          </div>

          <div>
            <Label required>Meeting Link</Label>
            <FieldInput
              type="url"
              value={module.content_url}
              onChange={(e) => onUpdate({ content_url: e.target.value })}
              placeholder="https://meet.google.com/... or https://zoom.us/j/..."
              className="bg-white"
            />
            <p className="mt-1 text-xs text-slate-500">
              Paste the video conference link for learners to join.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-100 bg-amber-50/30 p-4 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-amber-950">
            <MapPin className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-semibold">In-Person Session Details</span>
          </div>

          <div>
            <Label required>Venue / Location Address</Label>
            <FieldInput
              type="text"
              value={module.session_location}
              onChange={(e) => onUpdate({ session_location: e.target.value })}
              placeholder="Room 302, Building B, Peregrine Campus, Bangalore"
              className="bg-white"
            />
            <p className="mt-1 text-xs text-slate-500">
              Clear directions and room details for in-person attendance.
            </p>
          </div>

          <div>
            <Label>Session Agenda & Preparation Instructions</Label>
            <FieldTextarea
              value={module.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              rows={4}
              placeholder="What to bring, dress code, pre-readings, schedule outline..."
              className="bg-white"
            />
          </div>
        </div>
      )}

      {/* Shared Timings */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 text-slate-900">
          <Calendar className="h-4 w-4 text-slate-600" />
          <span className="text-sm font-semibold">Session Schedule</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label required>Session Start Time</Label>
            <FieldInput
              type="datetime-local"
              value={module.session_start_at}
              onChange={(e) => onUpdate({ session_start_at: e.target.value })}
            />
          </div>

          <div>
            <Label>Session End Time (Optional)</Label>
            <FieldInput
              type="datetime-local"
              value={module.session_end_at}
              onChange={(e) => onUpdate({ session_end_at: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
