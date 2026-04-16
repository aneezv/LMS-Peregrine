'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { type CatalogCourse } from '@/lib/catalog-courses'

type CatalogSnapshot = {
  courses: CatalogCourse[]
  totalCount: number
  page: number
  q: string
  departmentId: string
  fetchError: string | null
}

type CourseCatalogState = CatalogSnapshot & {
  pending: boolean
  hydrate: (snapshot: CatalogSnapshot) => void
  setQuery: (q: string) => void
  setDepartmentId: (departmentId: string) => void
  resetFilters: () => void
  loadPage: (nextPage: number, nextQuery: string, nextDept: string) => Promise<void>
}

function buildQuery(nextPage: number, nextQuery: string, nextDept: string): string {
  const params = new URLSearchParams()
  if (nextQuery.trim()) params.set('q', nextQuery.trim())
  if (nextDept.trim()) params.set('dept', nextDept.trim())
  if (nextPage > 1) params.set('page', String(nextPage))
  return params.toString()
}

export const useCourseCatalogStore = create<CourseCatalogState>()(
  persist(
    (set) => ({
      courses: [],
      totalCount: 0,
      page: 1,
      q: '',
      departmentId: '',
      fetchError: null,
      pending: false,
      hydrate: (snapshot) => set({ ...snapshot }),
      setQuery: (q) => set({ q }),
      setDepartmentId: (departmentId) => set({ departmentId }),
      resetFilters: () => set({ q: '', departmentId: '' }),
      loadPage: async (nextPage, nextQuery, nextDept) => {
        set({ pending: true, fetchError: null })
        const query = buildQuery(nextPage, nextQuery, nextDept)
        const url = query ? `/api/courses/catalog?${query}` : '/api/courses/catalog'
        const pageUrl = query ? `/courses?${query}` : '/courses'

        try {
          const res = await fetch(url, { cache: 'no-store' })
          const json = (await res.json()) as {
            courses?: CatalogCourse[]
            totalCount?: number
            error?: string
          }
          if (!res.ok) {
            throw new Error(json.error || 'Failed to load course catalog.')
          }

          set({
            courses: json.courses ?? [],
            totalCount: json.totalCount ?? 0,
            page: nextPage,
            q: nextQuery,
            departmentId: nextDept,
            pending: false,
          })
          window.history.replaceState(null, '', pageUrl)
        } catch (err) {
          set({
            fetchError: err instanceof Error ? err.message : 'Failed to load course catalog.',
            pending: false,
          })
        }
      },
    }),
    {
      name: 'catalog-ui-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        q: state.q,
        departmentId: state.departmentId,
      }),
    },
  ),
)
