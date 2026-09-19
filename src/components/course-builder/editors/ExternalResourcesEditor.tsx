'use client'

import React from 'react'
import { ModuleItem, newClientId } from '../types'
import { Label, FieldInput, FieldTextarea } from '../FormFields'
import { Plus, Trash2, ExternalLink } from 'lucide-react'

interface ExternalResourcesEditorProps {
  module: ModuleItem
  onUpdate: (patch: Partial<ModuleItem>) => void
}

export function ExternalResourcesEditor({ module, onUpdate }: ExternalResourcesEditorProps) {
  const patchLinks = (
    patchFn: (links: ModuleItem['external_links']) => ModuleItem['external_links'],
  ) => {
    onUpdate({ external_links: patchFn(module.external_links) })
  }

  const addLink = () => {
    patchLinks((ls) => [...ls, { id: newClientId(), label: '', url: '' }])
  }

  const updateLink = (id: string, patch: Partial<{ label: string; url: string }>) => {
    patchLinks((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const removeLink = (id: string) => {
    patchLinks((ls) => {
      const next = ls.filter((l) => l.id !== id)
      return next.length > 0 ? next : [{ id: newClientId(), label: '', url: '' }]
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <Label>Resource Description / Reading Context</Label>
        <FieldTextarea
          value={module.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          rows={3}
          placeholder="Context, reading instructions, or takeaways for learners before opening these links..."
        />
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-800">
            <ExternalLink className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-semibold">Links & References</span>
          </div>
          <button
            type="button"
            onClick={addLink}
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Add Link
          </button>
        </div>

        <div className="space-y-2.5">
          {module.external_links.map((link, idx) => (
            <div key={link.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <FieldInput
                type="text"
                value={link.label}
                onChange={(e) => updateLink(link.id, { label: e.target.value })}
                placeholder={`Label (e.g. Doc #${idx + 1})`}
                className="sm:max-w-44"
              />
              <FieldInput
                type="url"
                value={link.url}
                onChange={(e) => updateLink(link.id, { url: e.target.value })}
                placeholder="https://..."
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removeLink(link.id)}
                disabled={module.external_links.length <= 1 && !link.label && !link.url}
                className="rounded-xl p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none transition shrink-0"
                title="Remove link"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-500 pt-1">
          External resources provide supplementary material and are not counted towards formal module grading.
        </p>
      </div>
    </div>
  )
}
