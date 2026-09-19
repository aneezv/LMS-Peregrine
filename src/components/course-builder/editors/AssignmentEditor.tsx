'use client'

import React from 'react'
import { ModuleItem } from '../types'
import { Label, FieldInput, FieldTextarea } from '../FormFields'

interface AssignmentEditorProps {
  module: ModuleItem
  onUpdate: (patch: Partial<ModuleItem>) => void
}

export function AssignmentEditor({ module, onUpdate }: AssignmentEditorProps) {
  return (
    <div className="space-y-5">
      <div>
        <Label required>Assignment Instructions & Guidelines</Label>
        <FieldTextarea
          value={module.assignment_description}
          onChange={(e) => onUpdate({ assignment_description: e.target.value })}
          rows={5}
          placeholder="Describe what learners need to prepare, requirements, submission format, and grading rubrics..."
        />
        <p className="mt-1 text-xs text-slate-500">
          Learners will submit files or responses based on these instructions.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <Label>Max Score</Label>
          <FieldInput
            type="number"
            min={1}
            max={10000}
            value={module.max_score}
            onChange={(e) => onUpdate({ max_score: Math.max(0, Math.trunc(Number(e.target.value)) || 100) })}
          />
          <p className="mt-1 text-xs text-slate-500">Maximum possible score for this assignment.</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <Label>Passing Score</Label>
          <FieldInput
            type="number"
            min={0}
            max={module.max_score}
            value={module.passing_score}
            onChange={(e) => onUpdate({ passing_score: Math.max(0, Math.trunc(Number(e.target.value)) || 60) })}
          />
          <p className="mt-1 text-xs text-slate-500">Minimum score required to pass.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <Label>Submission Deadline (Optional)</Label>
        <FieldInput
          type="datetime-local"
          value={module.deadline_at}
          onChange={(e) => onUpdate({ deadline_at: e.target.value })}
          className="max-w-md"
        />
        <p className="mt-1 text-xs text-slate-500">
          Leave blank if there is no hard deadline for submitting this assignment.
        </p>
      </div>
    </div>
  )
}
