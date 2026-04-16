'use client'

import { create } from 'zustand'

type ModuleProgressState = {
  completedByModuleId: Record<string, boolean>
  hydrate: (initialCompletedModuleIds: string[]) => void
  markCompleted: (moduleId: string) => void
}

export const useModuleProgressStore = create<ModuleProgressState>((set) => ({
  completedByModuleId: {},
  hydrate: (initialCompletedModuleIds) =>
    set((state) => {
      if (initialCompletedModuleIds.length === 0) return state

      const completedByModuleId = { ...state.completedByModuleId }
      for (const moduleId of initialCompletedModuleIds) {
        if (moduleId.trim()) {
          completedByModuleId[moduleId] = true
        }
      }

      return { completedByModuleId }
    }),
  markCompleted: (moduleId) =>
    set((state) => ({
      completedByModuleId: {
        ...state.completedByModuleId,
        [moduleId]: true,
      },
    })),
}))
