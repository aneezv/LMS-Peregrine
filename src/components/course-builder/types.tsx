import React from 'react'
import {
  Video,
  FileText,
  CalendarDays,
  MapPin,
  ListChecks,
  MessageSquare,
  ExternalLink,
} from 'lucide-react'

export interface SectionItem {
  /** Client/dnd id (equals DB uuid when loaded from server) */
  id: string
  /** Set when row exists in DB */
  dbId: string | null
  title: string
  sort_order: number
}

export type ModuleType =
  | 'video'
  | 'assignment'
  | 'live_session'
  | 'offline_session'
  | 'mcq'
  | 'feedback'
  | 'external_resource'

export interface QuizOption {
  id: string
  label: string
  is_correct: boolean
}

export interface QuizQuestion {
  id: string
  prompt: string
  options: QuizOption[]
}

export interface ExternalLinkItem {
  id: string
  label: string
  url: string
}

export interface ModuleItem {
  /** Client/dnd id (equals DB uuid when loaded from server) */
  id: string
  /** Set when row exists in DB */
  dbId: string | null
  /** Section ID (client id or DB uuid) this module belongs to */
  section_id: string
  title: string
  type: ModuleType
  /** 1-based week number for syllabus grouping */
  week_index: number
  /** Use course starts_at + week schedule, or set available_from manually */
  unlock_mode: 'auto' | 'manual'
  /** datetime-local when unlock_mode is manual */
  available_from: string
  /** Extra copy (e.g. offline session instructions) */
  description: string
  content_url: string
  session_location: string
  session_start_at: string
  session_end_at: string
  max_score: number
  passing_score: number
  deadline_at: string
  assignment_description: string
  /** Pass score percent required to pass (module type mcq) */
  quiz_passing_pct: number
  /** Instructor toggle: learners can retake this quiz */
  quiz_allow_retest: boolean
  /** Minutes for learner timer (null = no limit); browser-enforced only */
  quiz_time_limit_minutes: number | null
  /** Shuffle question order per learner (deterministic on lesson page) */
  quiz_randomize_questions: boolean
  external_links: ExternalLinkItem[]
  quiz_questions: QuizQuestion[]
}

/** randomUUID() fallback on non-secure origins (e.g. http://192.168.x.x). */
export function newClientId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function normalizeModuleType(t: string): ModuleType {
  if (
    t === 'video' ||
    t === 'assignment' ||
    t === 'live_session' ||
    t === 'offline_session' ||
    t === 'mcq' ||
    t === 'feedback' ||
    t === 'external_resource'
  ) {
    return t
  }
  return 'video'
}

export const makeSection = (title = 'New Section', sortOrder = 0): SectionItem => ({
  id: newClientId(),
  dbId: null,
  title,
  sort_order: sortOrder,
})

export const makeModule = (sectionId = '', weekIndex = 1): ModuleItem => ({
  id: newClientId(),
  dbId: null,
  section_id: sectionId,
  title: 'New Lesson',
  type: 'video',
  week_index: Math.max(1, Math.trunc(Number(weekIndex)) || 1),
  unlock_mode: 'auto',
  available_from: '',
  description: '',
  content_url: '',
  session_location: '',
  session_start_at: '',
  session_end_at: '',
  max_score: 100,
  passing_score: 60,
  deadline_at: '',
  assignment_description: '',
  quiz_passing_pct: 60,
  quiz_allow_retest: true,
  quiz_time_limit_minutes: null,
  quiz_randomize_questions: false,
  external_links: [{ id: newClientId(), label: '', url: '' }],
  quiz_questions: [],
})

export const MODULE_CLIPBOARD_PREFIX = 'peregrine:coursebuilder:module:v1:'

export function remapModuleIds(mod: ModuleItem): ModuleItem {
  return {
    ...mod,
    id: newClientId(),
    dbId: null,
    external_links: (mod.external_links ?? []).map((l) => ({
      ...l,
      id: newClientId(),
    })),
    quiz_questions: (mod.quiz_questions ?? []).map((q) => ({
      ...q,
      id: newClientId(),
      options: (q.options ?? []).map((o) => ({
        ...o,
        id: newClientId(),
      })),
    })),
  }
}

export function serializeModuleForClipboard(mod: ModuleItem): string {
  return MODULE_CLIPBOARD_PREFIX + JSON.stringify(mod)
}

export function parseModuleFromClipboard(text: string): ModuleItem | null {
  if (!text.startsWith(MODULE_CLIPBOARD_PREFIX)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(MODULE_CLIPBOARD_PREFIX.length))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as Partial<ModuleItem>
  const base = makeModule('', 1)
  const merged: ModuleItem = {
    ...base,
    ...p,
    id: typeof p.id === 'string' ? p.id : base.id,
    dbId: null,
    section_id: typeof p.section_id === 'string' ? p.section_id : base.section_id,
    week_index: Math.max(1, Math.trunc(Number(p.week_index)) || 1),
    type: normalizeModuleType(String(p.type ?? base.type)),
    unlock_mode: p.unlock_mode === 'manual' ? 'manual' : 'auto',
    available_from: typeof p.available_from === 'string' ? p.available_from : base.available_from,
    description: typeof p.description === 'string' ? p.description : base.description,
    content_url: typeof p.content_url === 'string' ? p.content_url : base.content_url,
    session_location:
      typeof p.session_location === 'string' ? p.session_location : base.session_location,
    session_start_at:
      typeof p.session_start_at === 'string' ? p.session_start_at : base.session_start_at,
    session_end_at: typeof p.session_end_at === 'string' ? p.session_end_at : base.session_end_at,
    max_score: typeof p.max_score === 'number' ? p.max_score : base.max_score,
    passing_score: typeof p.passing_score === 'number' ? p.passing_score : base.passing_score,
    deadline_at: typeof p.deadline_at === 'string' ? p.deadline_at : base.deadline_at,
    assignment_description:
      typeof p.assignment_description === 'string'
        ? p.assignment_description
        : base.assignment_description,
    quiz_passing_pct:
      typeof p.quiz_passing_pct === 'number' ? p.quiz_passing_pct : base.quiz_passing_pct,
    quiz_allow_retest: p.quiz_allow_retest !== false,
    quiz_time_limit_minutes:
      p.quiz_time_limit_minutes === null || typeof p.quiz_time_limit_minutes === 'number'
        ? p.quiz_time_limit_minutes
        : base.quiz_time_limit_minutes,
    quiz_randomize_questions: Boolean(p.quiz_randomize_questions),
    external_links: Array.isArray(p.external_links)
      ? p.external_links.map((l) => ({
          id: typeof l.id === 'string' ? l.id : newClientId(),
          label: typeof l.label === 'string' ? l.label : '',
          url: typeof l.url === 'string' ? l.url : '',
        }))
      : base.external_links,
    quiz_questions: Array.isArray(p.quiz_questions)
      ? p.quiz_questions.map((q) => ({
          id: typeof q.id === 'string' ? q.id : newClientId(),
          prompt: typeof q.prompt === 'string' ? q.prompt : '',
          options: Array.isArray(q.options)
            ? q.options.map((o) => ({
                id: typeof o.id === 'string' ? o.id : newClientId(),
                label: typeof o.label === 'string' ? o.label : '',
                is_correct: Boolean(o.is_correct),
              }))
            : [],
        }))
      : base.quiz_questions,
  }
  if (merged.external_links.length === 0) {
    merged.external_links = [{ id: newClientId(), label: '', url: '' }]
  }
  return merged
}

export const TYPE_OPTIONS: { value: ModuleType; label: string; icon: React.ReactElement }[] = [
  { value: 'video', label: 'Video', icon: <Video className="w-4 h-4" /> },
  { value: 'assignment', label: 'Assignment', icon: <FileText className="w-4 h-4" /> },
  { value: 'live_session', label: 'Live Session', icon: <CalendarDays className="w-4 h-4" /> },
  { value: 'offline_session', label: 'Offline Session', icon: <MapPin className="w-4 h-4" /> },
  { value: 'mcq', label: 'Quiz', icon: <ListChecks className="w-4 h-4" /> },
  { value: 'feedback', label: 'Feedback', icon: <MessageSquare className="w-4 h-4" /> },
  { value: 'external_resource', label: 'External resource', icon: <ExternalLink className="w-4 h-4" /> },
]

export const TYPE_COLOR: Record<ModuleType, { text: string; bg: string; border: string }> = {
  video: { text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  assignment: { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  live_session: { text: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  offline_session: { text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  mcq: { text: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-200' },
  feedback: { text: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
  external_resource: { text: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
}

export function sortBySortOrder<T extends { sort_order?: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}
