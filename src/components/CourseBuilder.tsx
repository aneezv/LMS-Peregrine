'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { SortableItem } from './SortableItem'
import {
  Plus,
  Video,
  FileText,
  CalendarDays,
  MapPin,
  ListChecks,
  MessageSquare,
  ExternalLink,
  Save,
  Loader2,
  CheckCircle2,
  Trash2,
  Upload,
  Copy,
  ClipboardPaste,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import {
  deriveUnlockMode,
  fromDatetimeLocal,
  toDatetimeLocalValue,
  unlockAtForWeek,
} from '@/lib/unlock-schedule'
import { syncQuizAndExternalForModule } from '@/lib/sync-module-quiz-external'
import { parseQuizCsv } from '@/lib/parse-quiz-csv'
import { toRenderableImageUrl } from '@/lib/drive-image'
import { ROLES } from '@/lib/roles'

type ModuleType =
  | 'video'
  | 'assignment'
  | 'live_session'
  | 'offline_session'
  | 'mcq'
  | 'feedback'
  | 'external_resource'

interface ModuleItem {
  /** Client/dnd id (equals DB uuid when loaded from server) */
  id: string
  /** Set when row exists in DB */
  dbId: string | null
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
  external_links: { id: string; label: string; url: string }[]
  quiz_questions: {
    id: string
    prompt: string
    options: { id: string; label: string; is_correct: boolean }[]
  }[]
}

/** TODO: Use a more secure random UUID generator in production. */

/** randomUUID() is missing on non-secure origins (e.g. http://192.168.x.x). */
function newClientId(): string {
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

function normalizeModuleType(t: string): ModuleType {
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

function buildModuleRow(
  mod: ModuleItem,
  courseId: string,
  sectionId: string | null,
  sortIndex: number,
  courseStartsAtStr: string
) {
  const startsAtIso = fromDatetimeLocal(courseStartsAtStr)
  const weekIndex = Math.max(1, Math.trunc(Number(mod.week_index)) || 1)
  const manualUnlock = fromDatetimeLocal(mod.available_from)
  const autoUnlock =
    startsAtIso != null ? unlockAtForWeek(courseStartsAtStr, weekIndex) : null
  const availableFrom =
    mod.unlock_mode === 'manual' ? manualUnlock : autoUnlock

  return {
    course_id: courseId,
    section_id: sectionId,
    type: mod.type,
    title: mod.title,
    description: mod.description.trim() || null,
    content_url:
      mod.type === 'video' || mod.type === 'live_session'
        ? mod.content_url?.trim() || null
        : null,
    quiz_passing_pct:
      mod.type === 'mcq'
        ? Math.min(100, Math.max(0, Math.trunc(Number(mod.quiz_passing_pct)) || 60))
        : 60,
    quiz_allow_retest: mod.type === 'mcq' ? !!mod.quiz_allow_retest : true,
    quiz_time_limit_minutes:
      mod.type === 'mcq'
        ? (() => {
            const v = mod.quiz_time_limit_minutes
            if (v == null) return null
            const n = Math.trunc(Number(v))
            if (!Number.isFinite(n) || n < 1) return null
            return Math.min(1440, n) as number
          })()
        : null,
    quiz_randomize_questions: mod.type === 'mcq' ? !!mod.quiz_randomize_questions : false,
    session_location:
      mod.type === 'offline_session' && mod.session_location.trim()
        ? mod.session_location.trim()
        : null,
    sort_order: sortIndex,
    week_index: weekIndex,
    available_from: availableFrom,
    session_start_at: mod.session_start_at
      ? fromDatetimeLocal(mod.session_start_at)
      : null,
    session_end_at: mod.session_end_at
      ? fromDatetimeLocal(mod.session_end_at)
      : null,
  }
}

async function syncAssignmentForModule(
  supabase: ReturnType<typeof createClient>,
  mod: ModuleItem,
  moduleId: string
) {
  if (mod.type !== 'assignment') {
    await supabase.from('assignments').delete().eq('module_id', moduleId)
    return
  }
  const payload = {
    description: mod.assignment_description.trim() || null,
    max_score: mod.max_score,
    passing_score: mod.passing_score,
    deadline_at: mod.deadline_at ? fromDatetimeLocal(mod.deadline_at) : null,
    allow_late: false,
    late_penalty_pct: 0,
  }
  const { data: existing } = await supabase
    .from('assignments')
    .select('id')
    .eq('module_id', moduleId)
    .maybeSingle()
  if (existing) {
    await supabase.from('assignments').update(payload).eq('id', existing.id)
  } else {
    await supabase.from('assignments').insert({ module_id: moduleId, ...payload })
  }
}

const makeModule = (weekIndex = 1): ModuleItem => ({
  id: newClientId(),
  dbId: null,
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

const MODULE_CLIPBOARD_PREFIX = 'peregrine:coursebuilder:module:v1:'

function remapModuleIds(mod: ModuleItem): ModuleItem {
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

function serializeModuleForClipboard(mod: ModuleItem): string {
  return MODULE_CLIPBOARD_PREFIX + JSON.stringify(mod)
}

function parseModuleFromClipboard(text: string): ModuleItem | null {
  if (!text.startsWith(MODULE_CLIPBOARD_PREFIX)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(MODULE_CLIPBOARD_PREFIX.length))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as Partial<ModuleItem>
  const base = makeModule(1)
  const merged: ModuleItem = {
    ...base,
    ...p,
    id: typeof p.id === 'string' ? p.id : base.id,
    dbId: null,
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

const TYPE_OPTIONS: { value: ModuleType; label: string; icon: React.ReactNode }[] = [
  { value: 'video', label: 'Video', icon: <Video className="w-4 h-4" /> },
  { value: 'assignment', label: 'Assignment', icon: <FileText className="w-4 h-4" /> },
  { value: 'live_session', label: 'Live Session', icon: <CalendarDays className="w-4 h-4" /> },
  { value: 'offline_session', label: 'Offline Session', icon: <MapPin className="w-4 h-4" /> },
  { value: 'mcq', label: 'Quiz', icon: <ListChecks className="w-4 h-4" /> },
  { value: 'feedback', label: 'Feedback', icon: <MessageSquare className="w-4 h-4" /> },
  { value: 'external_resource', label: 'External resource', icon: <ExternalLink className="w-4 h-4" /> },
]

const typeColor: Record<ModuleType, string> = {
  video: 'text-blue-600',
  assignment: 'text-green-600',
  live_session: 'text-purple-600',
  offline_session: 'text-amber-600',
  mcq: 'text-cyan-600',
  feedback: 'text-rose-600',
  external_resource: 'text-indigo-600',
}

function sortBySortOrder<T extends { sort_order?: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <label className={`mb-1.5 block text-sm font-semibold text-slate-700 ${className ?? ''}`}>
      {children}
    </label>
  )
}

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props
  return (
    <input
      {...rest}
      className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${className ?? ''}`}
    />
  )
}

function mapDbModuleToItem(
  row: Record<string, unknown>,
  courseStartsIso: string | null
): ModuleItem {
  const id = row.id as string
  const asnList = row.assignments as
    | { id: string; description: string | null; max_score: number; passing_score: number; deadline_at: string | null }[]
    | null
  const asn = Array.isArray(asnList) && asnList.length > 0 ? asnList[0] : null
  const weekIndex = (row.week_index as number) ?? 1
  const avail = row.available_from as string | null | undefined
  const unlockMode = deriveUnlockMode(courseStartsIso, weekIndex, avail ?? null)

  const rawLinks = row.module_external_links as
    | { label: string | null; url: string; sort_order: number }[]
    | null
  const linksSorted = sortBySortOrder(rawLinks ?? [])
  const external_links =
    linksSorted.length > 0
      ? linksSorted.map((l) => ({
          id: newClientId(),
          label: l.label ?? '',
          url: l.url ?? '',
        }))
      : [{ id: newClientId(), label: '', url: '' }]

  const rawQ = row.quiz_questions as
    | {
        id: string
        prompt: string
        sort_order: number
        quiz_options: {
          id: string
          label: string
          is_correct: boolean
          sort_order: number
        }[]
      }[]
    | null
  const qsSorted = sortBySortOrder(rawQ ?? [])
  const quiz_questions = qsSorted.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    options: sortBySortOrder(q.quiz_options ?? []).map((o) => ({
      id: o.id,
      label: o.label,
      is_correct: o.is_correct,
    })),
  }))

  const qpct = (row.quiz_passing_pct as number | undefined) ?? 60
  const qRetest = (row.quiz_allow_retest as boolean | undefined) ?? true
  const rawTlim = row.quiz_time_limit_minutes as number | null | undefined
  const qTimeLim =
    rawTlim != null && Number.isFinite(Number(rawTlim))
      ? Math.min(1440, Math.max(1, Math.trunc(Number(rawTlim))))
      : null
  const qRand = !!(row.quiz_randomize_questions as boolean | undefined)

  return {
    id,
    dbId: id,
    title: (row.title as string) ?? '',
    type: normalizeModuleType(String(row.type)),
    week_index: weekIndex,
    unlock_mode: unlockMode,
    available_from:
      unlockMode === 'manual' && avail ? toDatetimeLocalValue(avail) : '',
    description: (row.description as string) ?? '',
    content_url: (row.content_url as string) ?? '',
    session_location: (row.session_location as string) ?? '',
    session_start_at: row.session_start_at
      ? toDatetimeLocalValue(row.session_start_at as string)
      : '',
    session_end_at: row.session_end_at
      ? toDatetimeLocalValue(row.session_end_at as string)
      : '',
    max_score: asn?.max_score ?? 100,
    passing_score: asn?.passing_score ?? 60,
    deadline_at: asn?.deadline_at ? toDatetimeLocalValue(asn.deadline_at) : '',
    assignment_description: asn?.description ?? '',
    quiz_passing_pct: Math.min(100, Math.max(0, Math.trunc(qpct) || 60)),
    quiz_allow_retest: qRetest,
    quiz_time_limit_minutes: qTimeLim,
    quiz_randomize_questions: qRand,
    external_links,
    quiz_questions,
  }
}

export default function CourseBuilder({ courseId }: { courseId?: string }) {
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [courseCode, setCourseCode] = useState('')
  const [description, setDescription] = useState('')
  const [courseStartsAt, setCourseStartsAt] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [enrollmentType, setEnrollmentType] = useState<'open' | 'invite_only'>('invite_only')

  const [modules, setModules] = useState<ModuleItem[]>([makeModule()])
  const [activeId, setActiveId] = useState<string>(modules[0]?.id ?? '')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  /** Validation only (title / course code); shown above the form */
  const [error, setError] = useState('')
  /** Generic save/publish/delete failure; details go to console */
  const [actionError, setActionError] = useState('')
  const [loading, setLoading] = useState(!!courseId)
  const [loadError, setLoadError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [baselineSnapshot, setBaselineSnapshot] = useState('')
  const [baselineReady, setBaselineReady] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [instructorChoices, setInstructorChoices] = useState<
    { id: string; full_name: string | null; role: string }[]
  >([])
  const [selectedInstructorId, setSelectedInstructorId] = useState('')
  const [thumbnailUploading, setThumbnailUploading] = useState(false)
  const [thumbnailUploadError, setThumbnailUploadError] = useState('')
  const [thumbnailPreviewVersion, setThumbnailPreviewVersion] = useState(() => Date.now())

  const thumbnailPreviewSrc = useMemo(() => {
    const base = toRenderableImageUrl(thumbnailUrl)
    if (!base) return ''
    const joiner = base.includes('?') ? '&' : '?'
    return `${base}${joiner}v=${thumbnailPreviewVersion}`
  }, [thumbnailUrl, thumbnailPreviewVersion])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (cancelled) return
      const admin = prof?.role === ROLES.ADMIN
      setIsAdmin(!!admin)
      if (admin) {
        const { data: people } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .in('role', [ROLES.INSTRUCTOR, ROLES.ADMIN])
          .order('full_name')
        if (cancelled) return
        setInstructorChoices(people ?? [])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!courseId) return
    let cancelled = false
    setLoading(true)
    setLoadError('')
    ;(async () => {
      const supabase = createClient()
      const { data: course, error: cErr } = await supabase
        .from('courses')
        .select(
          'title, course_code, description, thumbnail_url, starts_at, enrollment_type, status, instructor_id'
        )
        .eq('id', courseId)
        .single()

      if (cancelled) return
      if (cErr || !course) {
        setLoadError(cErr?.message ?? 'Could not load course.')
        setLoading(false)
        return
      }

      setTitle(course.title ?? '')
      setCourseCode((course.course_code as string) ?? '')
      setSelectedInstructorId((course.instructor_id as string) ?? '')
      setDescription(course.description ?? '')
      setThumbnailUrl(course.thumbnail_url ?? '')
      setCourseStartsAt(
        course.starts_at ? toDatetimeLocalValue(course.starts_at as string) : ''
      )
      setEnrollmentType((course.enrollment_type as 'open' | 'invite_only') ?? 'invite_only')

      const { data: mods, error: mErr } = await supabase
        .from('modules')
        .select(
          `
          id, type, title, week_index, description, content_url, session_location,
          available_from, session_start_at, session_end_at, sort_order, quiz_passing_pct,
          quiz_allow_retest, quiz_time_limit_minutes, quiz_randomize_questions,
          module_external_links ( label, url, sort_order ),
          quiz_questions ( id, prompt, sort_order, quiz_options ( id, label, is_correct, sort_order ) ),
          assignments ( id, description, max_score, passing_score, deadline_at )
        `
        )
        .eq('course_id', courseId)
        .order('sort_order', { ascending: true })

      if (cancelled) return
      if (mErr) {
        setLoadError(mErr.message)
        setLoading(false)
        return
      }

      const courseStartsIso = (course.starts_at as string | null) ?? null
      const mapped = (mods ?? []).map((row) =>
        mapDbModuleToItem(row as Record<string, unknown>, courseStartsIso)
      )
      const loadedModules = mapped.length === 0 ? [makeModule()] : mapped
      setModules(loadedModules)
      setActiveId(loadedModules[0].id)
      setBaselineSnapshot(
        JSON.stringify({
          title: course.title ?? '',
          courseCode: (course.course_code as string) ?? '',
          description: course.description ?? '',
          courseStartsAt: course.starts_at ? toDatetimeLocalValue(course.starts_at as string) : '',
          thumbnailUrl: course.thumbnail_url ?? '',
          enrollmentType: (course.enrollment_type as 'open' | 'invite_only') ?? 'invite_only',
          selectedInstructorId: (course.instructor_id as string) ?? '',
          modules: loadedModules,
        }),
      )
      setBaselineReady(true)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [courseId])

  useEffect(() => {
    if (courseId || selectedInstructorId) return
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setSelectedInstructorId(user.id)
    })()
  }, [courseId, selectedInstructorId])

  useEffect(() => {
    // Bust browser cache when thumbnail URL changes so preview always refreshes.
    setThumbnailPreviewVersion(Date.now())
  }, [thumbnailUrl])

  const activeModule = modules.find((m) => m.id === activeId) ?? null

  useEffect(() => {
    if (modules.length === 0) {
      if (activeId !== '') setActiveId('')
      return
    }
    if (!modules.some((m) => m.id === activeId)) {
      setActiveId(modules[0].id)
    }
  }, [modules, activeId])

  const modulesForDisplay = useMemo(() => {
    return modules
      .map((m, idx) => ({ m, idx }))
      .sort((a, b) => a.m.week_index - b.m.week_index || a.idx - b.idx)
      .map(({ m }) => m)
  }, [modules])

  const moduleWeekGroups = useMemo(() => {
    const grouped = new Map<number, ModuleItem[]>()
    for (const mod of modulesForDisplay) {
      const week = Math.max(1, Math.trunc(Number(mod.week_index)) || 1)
      const list = grouped.get(week) ?? []
      list.push(mod)
      grouped.set(week, list)
    }
    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([week, mods]) => ({ week, mods }))
  }, [modulesForDisplay])

  const snapshot = useMemo(
    () =>
      JSON.stringify({
        title,
        courseCode,
        description,
        courseStartsAt,
        thumbnailUrl,
        enrollmentType,
        selectedInstructorId,
        modules,
      }),
    [
      title,
      courseCode,
      description,
      courseStartsAt,
      thumbnailUrl,
      enrollmentType,
      selectedInstructorId,
      modules,
    ],
  )

  const hasUnsavedChanges = baselineReady && snapshot !== baselineSnapshot

  useEffect(() => {
    if (baselineReady || loading) return
    setBaselineSnapshot(snapshot)
    setBaselineReady(true)
  }, [baselineReady, loading, snapshot])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnsavedChanges])

  const activeUnlockPreview = useMemo(() => {
    if (!activeModule || activeModule.unlock_mode !== 'auto' || !courseStartsAt.trim()) return null
    return unlockAtForWeek(courseStartsAt, activeModule.week_index)
  }, [activeModule, courseStartsAt])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const activeIdStr = String(active.id)
      const overIdStr = String(over.id)
      const oldIdx = modulesForDisplay.findIndex((i) => i.id === activeIdStr)
      const newIdx = modulesForDisplay.findIndex((i) => i.id === overIdStr)
      if (oldIdx < 0 || newIdx < 0) return

      const destinationWeek = modulesForDisplay[newIdx]?.week_index ?? 1
      const next = arrayMove(modulesForDisplay, oldIdx, newIdx).map((m) =>
        m.id === activeIdStr ? { ...m, week_index: destinationWeek } : m,
      )
      setModules(next)
    }
  }

  const addModule = () => {
    const newWeek = activeModule?.week_index ?? 1
    const m = makeModule(newWeek)
    setModules((prev) => [...prev, m])
    setActiveId(m.id)
  }

  const removeModule = (id: string) => {
    setModules((prev) => prev.filter((m) => m.id !== id))
  }

  const copyModuleToClipboard = async (mod: ModuleItem, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(serializeModuleForClipboard(mod))
      setActionError('')
    } catch {
      setActionError('Could not copy lesson to clipboard.')
    }
  }

  const pasteModuleFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const parsed = parseModuleFromClipboard(text)
      if (!parsed) {
        setActionError('Clipboard does not contain a copied lesson.')
        return
      }
      const fresh = remapModuleIds(parsed)
      const activeIdx = modules.findIndex((m) => m.id === activeId)
      const insertAt = activeIdx >= 0 ? activeIdx + 1 : modules.length
      const week = activeModule?.week_index ?? fresh.week_index
      const withWeek: ModuleItem = { ...fresh, week_index: week }
      setModules((prev) => {
        const next = [...prev]
        next.splice(insertAt, 0, withWeek)
        return next
      })
      setActiveId(withWeek.id)
      setActionError('')
    } catch {
      setActionError('Could not read clipboard or paste lesson.')
    }
  }

  const update = (patch: Partial<ModuleItem>) => {
    setModules((prev) =>
      prev.map((m) => (m.id === activeId ? { ...m, ...patch } : m))
    )
  }

  function patchActiveQuiz(
    patchFn: (q: ModuleItem['quiz_questions']) => ModuleItem['quiz_questions'],
  ) {
    setModules((prev) =>
      prev.map((m) => (m.id === activeId ? { ...m, quiz_questions: patchFn(m.quiz_questions) } : m)),
    )
  }

  function addQuizQuestion() {
    patchActiveQuiz((qs) => [
      ...qs,
      {
        id: newClientId(),
        prompt: '',
        options: [
          { id: newClientId(), label: '', is_correct: true },
          { id: newClientId(), label: '', is_correct: false },
        ],
      },
    ])
  }

  function updateQuizQuestion(qid: string, prompt: string) {
    patchActiveQuiz((qs) => qs.map((q) => (q.id === qid ? { ...q, prompt } : q)))
  }

  function removeQuizQuestion(qid: string) {
    patchActiveQuiz((qs) => qs.filter((q) => q.id !== qid))
  }

  function addQuizOption(qid: string) {
    patchActiveQuiz((qs) =>
      qs.map((q) =>
        q.id === qid
          ? { ...q, options: [...q.options, { id: newClientId(), label: '', is_correct: false }] }
          : q,
      ),
    )
  }

  function updateQuizOption(qid: string, oid: string, label: string) {
    patchActiveQuiz((qs) =>
      qs.map((q) =>
        q.id === qid
          ? { ...q, options: q.options.map((o) => (o.id === oid ? { ...o, label } : o)) }
          : q,
      ),
    )
  }

  function setCorrectOption(qid: string, oid: string) {
    patchActiveQuiz((qs) =>
      qs.map((q) =>
        q.id === qid
          ? { ...q, options: q.options.map((o) => ({ ...o, is_correct: o.id === oid })) }
          : q,
      ),
    )
  }

  function removeQuizOption(qid: string, oid: string) {
    patchActiveQuiz((qs) =>
      qs.map((q) => {
        if (q.id !== qid) return q
        const next = q.options.filter((o) => o.id !== oid)
        if (next.length === 0) return q
        if (!next.some((o) => o.is_correct)) next[0] = { ...next[0], is_correct: true }
        return { ...q, options: next }
      }),
    )
  }

  const [quizCsvPaste, setQuizCsvPaste] = useState('')
  const [quizCsvWarnings, setQuizCsvWarnings] = useState<string[]>([])

  function appendQuestionsFromCsv(text: string) {
    const res = parseQuizCsv(text)
    setQuizCsvWarnings(res.warnings)
    if (res.questions.length === 0) return
    patchActiveQuiz((qs) => [
      ...qs,
      ...res.questions.map((q) => ({
        id: newClientId(),
        prompt: q.prompt,
        options: q.options.map((o) => ({
          id: newClientId(),
          label: o.label,
          is_correct: o.is_correct,
        })),
      })),
    ])
  }

  function patchExternalLinks(
    patchFn: (links: ModuleItem['external_links']) => ModuleItem['external_links'],
  ) {
    setModules((prev) =>
      prev.map((m) =>
        m.id === activeId ? { ...m, external_links: patchFn(m.external_links) } : m,
      ),
    )
  }

  function addExternalLinkRow() {
    patchExternalLinks((ls) => [...ls, { id: newClientId(), label: '', url: '' }])
  }

  function updateExternalLinkRow(linkId: string, patch: Partial<{ label: string; url: string }>) {
    patchExternalLinks((ls) => ls.map((l) => (l.id === linkId ? { ...l, ...patch } : l)))
  }

  function removeExternalLinkRow(linkId: string) {
    patchExternalLinks((ls) => {
      const next = ls.filter((l) => l.id !== linkId)
      return next.length ? next : [{ id: newClientId(), label: '', url: '' }]
    })
  }

  async function uploadThumbnail(file: File) {
    if (!(file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name))) {
      setThumbnailUploadError('Please select an image file (PNG, JPG, GIF, WEBP, or SVG).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setThumbnailUploadError('Thumbnail must be under 5 MB.')
      return
    }

    setThumbnailUploading(true)
    setThumbnailUploadError('')
    try {
      const formData = new FormData()
      formData.set('file', file)
      const res = await fetch('/api/courses/thumbnail-upload', {
        method: 'POST',
        body: formData,
      })
      const payload = (await res.json().catch(() => ({}))) as { fileUrl?: string; error?: string }
      if (!res.ok || !payload.fileUrl) {
        setThumbnailUploadError(payload.error ?? 'Could not upload thumbnail.')
        return
      }
      setThumbnailUrl(payload.fileUrl)
    } finally {
      setThumbnailUploading(false)
    }
  }

  const logSaveFailure = (label: string, err: unknown) => {
    console.error(`[CourseBuilder] ${label}`, err)
  }

  const handleSave = async (publish: boolean) => {
    if (!title.trim()) { setError('Course title is required.'); return }
    if (!courseCode.trim()) { setError('Course code is required.'); return }
    setSaving(true)
    setError('')
    setActionError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      logSaveFailure('save: not authenticated', new Error('No session'))
      setActionError('Something went wrong.')
      setSaving(false)
      return
    }

    try {
      const startsAtIso = fromDatetimeLocal(courseStartsAt)

      if (courseId) {
        const updatePayload: Record<string, unknown> = {
          title: title.trim(),
          course_code: courseCode.trim(),
          description: description.trim() || null,
          thumbnail_url: thumbnailUrl.trim() || null,
          starts_at: startsAtIso,
          status: publish ? 'published' : 'draft',
          enrollment_type: enrollmentType,
        }
        if (isAdmin && selectedInstructorId) {
          updatePayload.instructor_id = selectedInstructorId
        }

        const { error: upErr } = await supabase.from('courses').update(updatePayload).eq('id', courseId)

        if (upErr) {
          logSaveFailure('course update', upErr)
          setActionError('Something went wrong.')
          return
        }

        const { data: existingMods } = await supabase
          .from('modules')
          .select('id')
          .eq('course_id', courseId)

        const keepIds = new Set(
          modules.map((m) => m.dbId).filter(Boolean) as string[]
        )
        const toRemove = (existingMods ?? [])
          .map((r) => r.id)
          .filter((id) => !keepIds.has(id))
        if (toRemove.length > 0) {
          await supabase.from('modules').delete().in('id', toRemove)
        }

        let { data: sectionRow } = await supabase
          .from('sections')
          .select('id')
          .eq('course_id', courseId)
          .order('sort_order', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (!sectionRow) {
          const { data: newSec } = await supabase
            .from('sections')
            .insert({ course_id: courseId, title: 'Course Content', sort_order: 0 })
            .select('id')
            .single()
          sectionRow = newSec
        }

        const sectionId = sectionRow?.id ?? null

        for (let i = 0; i < modules.length; i++) {
          const mod = modules[i]
          const row = buildModuleRow(mod, courseId, sectionId, i, courseStartsAt)

          if (mod.dbId) {
            const { error: mErr } = await supabase
              .from('modules')
              .update(row)
              .eq('id', mod.dbId)
            if (mErr) {
              logSaveFailure('module update', mErr)
              setActionError('Something went wrong.')
              return
            }
            await syncAssignmentForModule(supabase, mod, mod.dbId)
            await syncQuizAndExternalForModule(
              supabase,
              mod.dbId,
              mod.type,
              mod.external_links.map(({ label, url }) => ({ label, url })),
              mod.quiz_questions.map((q) => ({
                prompt: q.prompt,
                options: q.options.map((o) => ({ label: o.label, is_correct: o.is_correct })),
              })),
            )
          } else {
            const { data: dbMod, error: insErr } = await supabase
              .from('modules')
              .insert(row)
              .select('id')
              .single()
            if (insErr || !dbMod) {
              logSaveFailure('module insert', insErr ?? new Error('no row'))
              setActionError('Something went wrong.')
              return
            }
            await syncAssignmentForModule(supabase, mod, dbMod.id)
            await syncQuizAndExternalForModule(
              supabase,
              dbMod.id,
              mod.type,
              mod.external_links.map(({ label, url }) => ({ label, url })),
              mod.quiz_questions.map((q) => ({
                prompt: q.prompt,
                options: q.options.map((o) => ({ label: o.label, is_correct: o.is_correct })),
              })),
            )
          }
        }

        setBaselineSnapshot(snapshot)
        setSaved(true)
        setTimeout(() => router.push(`/courses/${courseId}`), 800)
        return
      }

      const ownerId = isAdmin && selectedInstructorId ? selectedInstructorId : user.id

      const { data: course, error: courseErr } = await supabase
        .from('courses')
        .insert({
          instructor_id: ownerId,
          course_code: courseCode.trim(),
          title: title.trim(),
          description: description.trim() || null,
          thumbnail_url: thumbnailUrl.trim() || null,
          starts_at: startsAtIso,
          status: publish ? 'published' : 'draft',
          enrollment_type: enrollmentType,
        })
        .select('id')
        .single()

      if (courseErr || !course) {
        logSaveFailure('course insert', courseErr ?? new Error('no row'))
        setActionError('Something went wrong.')
        return
      }

      const { data: section } = await supabase
        .from('sections')
        .insert({ course_id: course.id, title: 'Course Content', sort_order: 0 })
        .select('id')
        .single()

      for (let i = 0; i < modules.length; i++) {
        const mod = modules[i]
        const row = buildModuleRow(mod, course.id, section?.id ?? null, i, courseStartsAt)
        const { data: dbMod, error: mErr } = await supabase
          .from('modules')
          .insert(row)
          .select('id')
          .single()

        if (mErr || !dbMod) {
          logSaveFailure('module insert (new course)', mErr ?? new Error('no row'))
          setActionError('Something went wrong.')
          return
        }
        await syncAssignmentForModule(supabase, mod, dbMod.id)
        await syncQuizAndExternalForModule(
          supabase,
          dbMod.id,
          mod.type,
          mod.external_links.map(({ label, url }) => ({ label, url })),
          mod.quiz_questions.map((q) => ({
            prompt: q.prompt,
            options: q.options.map((o) => ({ label: o.label, is_correct: o.is_correct })),
          })),
        )
      }

      setBaselineSnapshot(snapshot)
      setSaved(true)
      setTimeout(() => router.push(`/courses/${course.id}`), 1200)
    } catch (e: unknown) {
      logSaveFailure('save (exception)', e)
      setActionError('Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCourse = async () => {
    if (!courseId) return
    if (!confirm('Delete this course and all related lessons and data? This cannot be undone.')) return
    setDeleting(true)
    setError('')
    setActionError('')
    const supabase = createClient()
    const { error: dErr } = await supabase.from('courses').delete().eq('id', courseId)
    setDeleting(false)
    if (dErr) {
      console.error('[CourseBuilder] delete course', dErr)
      setActionError('Something went wrong.')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  if (courseId && loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-600 gap-2">
        <Loader2 className="w-6 h-6 animate-spin" aria-hidden />
        Loading course…
      </div>
    )
  }

  if (courseId && loadError) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-lg">
        {loadError}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {/* Course Details — save/publish errors use actionError near the action buttons */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-linear-to-r from-slate-50 to-white px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-slate-900">
            {courseId ? 'Edit course' : 'Course Details'}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Set your course metadata before building lessons.
          </p>
        </div>
        <div className="space-y-5 p-5 sm:p-6">

        {isAdmin && (
          <div>
            <Label>Instructor</Label>
            {instructorChoices.length > 0 ? (
              <select
                value={selectedInstructorId}
                onChange={(e) => setSelectedInstructorId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {instructorChoices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name?.trim() || 'Unnamed'} ({p.role})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Loading instructors… If this stays empty, ensure the admin migration for profile access is applied.
              </p>
            )}
            <p className="text-xs text-slate-500 mt-1">
              Course owner appears in the catalog and receives grading access.
            </p>
          </div>
        )}

        <div>
          <Label>Course Title *</Label>
          <FieldInput
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Introduction to Web Development"
          />
        </div>

        <div>
          <Label>Course code *</Label>
          <FieldInput
            type="text"
            value={courseCode}
            onChange={(e) => setCourseCode(e.target.value)}
            placeholder="e.g. CS101-A"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-slate-500 mt-1">
            Unique identifier for this course. Shown on the course page and catalog. Case-insensitive uniqueness.
          </p>
        </div>

        <div>
          <Label>Description</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What will learners achieve in this course?"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Course start (for week-based unlocks)</Label>
            <FieldInput
              type="datetime-local"
              value={courseStartsAt}
              onChange={(e) => setCourseStartsAt(e.target.value)}
            />
            <p className="text-xs text-slate-500 mt-1">
              Week 1 unlocks at this time; each higher week adds 7 days. Leave empty if you only use custom dates per lesson.
            </p>
          </div>
          <div className="group relative">
            <Label>Thumbnail image URL</Label>
            {thumbnailUrl && (
              <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl group-hover:block group-focus-within:block">
                <img
                  src={thumbnailPreviewSrc}
                  alt="Course thumbnail preview"
                  className="h-32 w-full rounded-lg object-cover"
                />
                <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Thumbnail preview
                </p>
              </div>
            )}
            <FieldInput
              type="url"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              placeholder="https://…"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                {thumbnailUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden />
                )}
                {thumbnailUploading ? 'Uploading thumbnail...' : 'Upload thumbnail'}
                <input
                  type="file"
                  className="sr-only"
                  accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml"
                  disabled={thumbnailUploading}
                  onChange={(e) => {
                    const picked = e.target.files?.[0]
                    e.target.value = ''
                    if (!picked) return
                    void uploadThumbnail(picked)
                  }}
                />
              </label>
              {thumbnailUrl && (
                <a
                  href={thumbnailUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  Open uploaded thumbnail
                </a>
              )}
            </div>
            {thumbnailUploadError && (
              <p className="mt-2 text-xs font-medium text-red-600">{thumbnailUploadError}</p>
            )}
            <p className="text-xs text-slate-500 mt-1">
              Paste a public URL, or upload an image to Google Drive to auto-fill this field. Hover this area to preview.
            </p>
          </div>
        </div>

        <div>
          <Label>Enrollment Type</Label>
          <select
            value={enrollmentType}
            onChange={(e) => setEnrollmentType(e.target.value as 'open' | 'invite_only')}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="open">Open — anyone can enroll</option>
            <option value="invite_only">Invite Only</option>
          </select>
        </div>
        </div>
      </div>

      {/* Syllabus Builder */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-linear-to-r from-slate-50 to-white px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-slate-900">Syllabus Builder</h2>
          <p className="mt-1 text-xs text-slate-500">
            Add lessons, reorder with drag-and-drop, then configure each lesson.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 p-5 sm:p-6 lg:grid-cols-5">

          {/* Lesson List (left) */}
          <div className="space-y-2 lg:col-span-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={modulesForDisplay.map((m) => m.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="max-h-[67vh] space-y-2 overflow-y-auto pr-1">
                  {moduleWeekGroups.map((group) => (
                    <div key={`week-${group.week}`} className="space-y-2">
                      <div className="flex items-center gap-3 my-2">
                        <div className="w-full flex items-center">
                          <div className="grow border-t border-dashed border-slate-300"></div>
                          <span className="mx-2 text-xs text-slate-400 uppercase tracking-widest">
                          week {group.week}
                          </span>
                          <div className="grow border-t border-dashed border-slate-300"></div>
                        </div>
                      </div>
                      {group.mods.map((mod) => (
                        <SortableItem key={mod.id} id={mod.id}>
                          {/* Padding-left makes room for the absolute grip handle */}
                          <div
                            onClick={() => setActiveId(mod.id)}
                            className={`cursor-pointer select-none rounded-xl border px-3 py-3 pl-8 transition ${
                              activeId === mod.id
                                ? 'border-blue-500 bg-blue-50 shadow-sm ring-1 ring-blue-200'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500"
                                title={`Week ${mod.week_index}`}
                              >
                                W{mod.week_index}
                              </span>
                              <span className={typeColor[mod.type]}>
                                {mod.type === 'video' && <Video className="w-4 h-4" />}
                                {mod.type === 'assignment' && <FileText className="w-4 h-4" />}
                                {mod.type === 'live_session' && <CalendarDays className="w-4 h-4" />}
                                {mod.type === 'offline_session' && <MapPin className="w-4 h-4" />}
                                {mod.type === 'mcq' && <ListChecks className="w-4 h-4" />}
                                {mod.type === 'feedback' && <MessageSquare className="w-4 h-4" />}
                                {mod.type === 'external_resource' && <ExternalLink className="w-4 h-4" />}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                                {mod.title}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => copyModuleToClipboard(mod, e)}
                                className="ml-auto shrink-0 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                title="Copy lesson"
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </SortableItem>
                      ))}
                    </div>
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <button
              onClick={addModule}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-medium text-slate-600 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600"
            >
              <Plus className="w-4 h-4" /> Add Lesson
            </button>
          </div>

          {/* Config Panel (right) */}
          <div className="lg:col-span-3">
            {activeModule ? (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-800">Configure Lesson</h3>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => void pasteModuleFromClipboard()}
                      className="rounded p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                      title="Paste copied lesson after this one"
                    >
                      <ClipboardPaste className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeModule(activeModule.id)}
                      className="rounded p-1 text-red-400 transition hover:bg-red-50 hover:text-red-600"
                      title="Delete lesson"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Type selector */}
                <div>
                  <Label>Lesson Type</Label>
                  <div className="flex flex-wrap gap-2">
                    {TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => update({ type: opt.value })}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                          activeModule.type === opt.value
                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                            : 'bg-white border-slate-300 text-slate-700 hover:border-blue-400 hover:text-blue-600'
                        }`}
                      >
                        {opt.icon} {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lesson Title */}
                <div>
                  <Label>Lesson Title</Label>
                  <FieldInput
                    type="text"
                    value={activeModule.title}
                    onChange={(e) => update({ title: e.target.value })}
                    placeholder="Enter lesson title"
                  />
                </div>

                <div>
                  <Label>Week (syllabus group)</Label>
                  <FieldInput
                    type="number"
                    min={1}
                    step={1}
                    value={activeModule.week_index}
                    onChange={(e) => {
                      const v = Math.max(1, Math.trunc(Number(e.target.value)) || 1)
                      update({ week_index: v })
                    }}
                  />
                  <p className="text-xs text-slate-500 mt-1">Lessons with the same week appear under the same heading.</p>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <Label>When this lesson unlocks</Label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <label className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name={`unlock-${activeModule.id}`}
                        checked={activeModule.unlock_mode === 'auto'}
                        onChange={() => update({ unlock_mode: 'auto' })}
                      />
                      From course start + week (default)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name={`unlock-${activeModule.id}`}
                        checked={activeModule.unlock_mode === 'manual'}
                        onChange={() => update({ unlock_mode: 'manual' })}
                      />
                      Custom date and time
                    </label>
                  </div>
                  {activeModule.unlock_mode === 'auto' && (
                    <p className="text-xs text-slate-600">
                      {activeUnlockPreview ? (
                        <>
                          Learners can open this lesson starting{' '}
                          <strong>{new Date(activeUnlockPreview).toLocaleString()}</strong>.
                        </>
                      ) : (
                        <>
                          Set <strong>Course start</strong> above to preview automatic unlock, or choose custom.
                        </>
                      )}
                    </p>
                  )}
                  {activeModule.unlock_mode === 'manual' && (
                    <div>
                      <FieldInput
                        type="datetime-local"
                        value={activeModule.available_from}
                        onChange={(e) => update({ available_from: e.target.value })}
                      />
                    </div>
                  )}
                </div>

                {/* Video */}
                {activeModule.type === 'video' && (
                  <div>
                    <Label>Video URL (YouTube or Vimeo)</Label>
                    <FieldInput
                      type="url"
                      value={activeModule.content_url}
                      onChange={(e) => update({ content_url: e.target.value })}
                      placeholder="https://www.youtube.com/watch?v=..."
                    />
                  </div>
                )}

                {/* Live Session */}
                {activeModule.type === 'live_session' && (
                  <div className="space-y-3">
                    <div>
                      <Label>Meeting Link</Label>
                      <FieldInput
                        type="url"
                        value={activeModule.content_url}
                        onChange={(e) => update({ content_url: e.target.value })}
                        placeholder="https://meet.google.com/..."
                      />
                    </div>
                    <div>
                      <Label>Session start</Label>
                      <FieldInput
                        type="datetime-local"
                        value={activeModule.session_start_at}
                        onChange={(e) => update({ session_start_at: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Session end {!activeModule.session_end_at && '(optional)'}</Label>
                      <FieldInput
                        type="datetime-local"
                        value={activeModule.session_end_at}
                        onChange={(e) => update({ session_end_at: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                {/* Offline session */}
                {activeModule.type === 'offline_session' && (
                  <div className="space-y-3">
                    <div>
                      <Label>Description (what to bring, agenda, …)</Label>
                      <textarea
                        value={activeModule.description}
                        onChange={(e) => update({ description: e.target.value })}
                        rows={4}
                        placeholder="Describe the in-person session for learners."
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <Label>Location / venue</Label>
                      <FieldInput
                        type="text"
                        value={activeModule.session_location}
                        onChange={(e) => update({ session_location: e.target.value })}
                        placeholder="Room, building, address…"
                      />
                    </div>
                    <div>
                      <Label>Session start</Label>
                      <FieldInput
                        type="datetime-local"
                        value={activeModule.session_start_at}
                        onChange={(e) => update({ session_start_at: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Session end {!activeModule.session_end_at && '(optional)'}</Label>
                      <FieldInput
                        type="datetime-local"
                        value={activeModule.session_end_at}
                        onChange={(e) => update({ session_end_at: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                {/* External resource: shared description + multiple links (no completion tracking) */}
                {activeModule.type === 'external_resource' && (
                  <div className="space-y-3">
                    <div>
                      <Label>Description (shared for all links)</Label>
                      <textarea
                        value={activeModule.description}
                        onChange={(e) => update({ description: e.target.value })}
                        rows={4}
                        placeholder="Context for learners before they open the links below."
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Links</Label>
                      {activeModule.external_links.map((link) => (
                        <div key={link.id} className="flex flex-col sm:flex-row gap-2 items-start">
                          <FieldInput
                            type="text"
                            value={link.label}
                            onChange={(e) => updateExternalLinkRow(link.id, { label: e.target.value })}
                            placeholder="Label (e.g. Reading)"
                            className="sm:max-w-45"
                          />
                          <FieldInput
                            type="url"
                            value={link.url}
                            onChange={(e) => updateExternalLinkRow(link.id, { url: e.target.value })}
                            placeholder="https://…"
                            className="flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => removeExternalLinkRow(link.id)}
                            className="shrink-0 rounded-lg px-2 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addExternalLinkRow}
                        className="flex items-center gap-1 text-sm text-indigo-600 font-medium"
                      >
                        <Plus className="w-4 h-4" /> Add link
                      </button>
                      <p className="text-xs text-slate-500">
                        External resources are not marked complete in the course outline.
                      </p>
                    </div>
                  </div>
                )}

                {/* Quiz (mcq): builder */}
                {activeModule.type === 'mcq' && (
                  <div className="space-y-4">
                    <div>
                      <Label>Introduction (shown above the quiz)</Label>
                      <textarea
                        value={activeModule.description}
                        onChange={(e) => update({ description: e.target.value })}
                        rows={3}
                        placeholder="Instructions or context for learners."
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <Label>Passing score (% correct)</Label>
                      <FieldInput
                        type="number"
                        min={0}
                        max={100}
                        value={activeModule.quiz_passing_pct}
                        onChange={(e) =>
                          update({
                            quiz_passing_pct: Math.min(
                              100,
                              Math.max(0, Math.trunc(Number(e.target.value)) || 0),
                            ),
                          })
                        }
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Learners see pass status after submit. Best score is kept per learner.
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <label className="flex items-start gap-2 text-sm text-slate-800">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={activeModule.quiz_allow_retest}
                          onChange={(e) => update({ quiz_allow_retest: e.target.checked })}
                        />
                        <span>
                          Allow learners to retake this quiz
                          <span className="mt-0.5 block text-xs text-slate-500">
                            If disabled, learners can submit only once.
                          </span>
                        </span>
                      </label>
                    </div>
                    <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-3 space-y-2">
                      <p className="text-xs font-semibold text-cyan-900">Exam-style settings</p>
                      <div>
                        <Label>Time limit (minutes)</Label>
                        <FieldInput
                          type="number"
                          min={1}
                          max={1440}
                          placeholder="e.g. 60 — leave empty for no limit"
                          value={activeModule.quiz_time_limit_minutes ?? ''}
                          onChange={(e) => {
                            const v = e.target.value.trim()
                            if (v === '') {
                              update({ quiz_time_limit_minutes: null })
                              return
                            }
                            const n = Math.trunc(Number(v))
                            if (!Number.isFinite(n) || n < 1) {
                              update({ quiz_time_limit_minutes: null })
                              return
                            }
                            update({ quiz_time_limit_minutes: Math.min(1440, n) })
                          }}
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Shown as a countdown for learners (browser only; not enforced server-side in v1).
                        </p>
                      </div>
                      <label className="flex items-start gap-2 text-sm text-slate-800">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={activeModule.quiz_randomize_questions}
                          onChange={(e) => update({ quiz_randomize_questions: e.target.checked })}
                        />
                        <span>
                          Randomize question order for each learner
                          <span className="mt-0.5 block text-xs text-slate-500">
                            Order is stable per learner but different from the list below—reduces simple
                            answer-key sharing.
                          </span>
                        </span>
                      </label>
                      <p className="text-xs text-slate-600">
                        <span className="font-medium text-slate-700">Recommended for exams:</span> set a time
                        limit (e.g. 60 minutes) and enable randomization above.
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2">
                      <Label>Bulk import from CSV</Label>
                      <p className="text-xs text-slate-600">
                        Use a header row:{' '}
                        <span className="font-mono text-[11px]">
                          Question Text, Correct Answer, Option A, Option B, …
                        </span>
                        . Correct Answer can be a letter (A, B, …) or text matching an option.
                      </p>
                      <div className="flex flex-wrap gap-2 items-center">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
                          <Upload className="w-4 h-4" />
                          Choose .csv file
                          <input
                            type="file"
                            accept=".csv,text/csv,text/plain"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              e.target.value = ''
                              if (!f) return
                              const reader = new FileReader()
                              reader.onload = () => {
                                appendQuestionsFromCsv(String(reader.result ?? ''))
                              }
                              reader.readAsText(f)
                            }}
                          />
                        </label>
                      </div>
                      <textarea
                        value={quizCsvPaste}
                        onChange={(e) => setQuizCsvPaste(e.target.value)}
                        rows={3}
                        placeholder="Or paste CSV here (including header row)…"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          appendQuestionsFromCsv(quizCsvPaste)
                          setQuizCsvPaste('')
                        }}
                        className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900"
                      >
                        Append questions from paste
                      </button>
                      {quizCsvWarnings.length > 0 && (
                        <ul className="list-disc pl-5 text-xs text-amber-800 space-y-0.5">
                          {quizCsvWarnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="mb-0">Questions</Label>
                        <button
                          type="button"
                          onClick={addQuizQuestion}
                          className="flex items-center gap-1 text-sm text-cyan-700 font-medium"
                        >
                          <Plus className="w-4 h-4" /> Add question
                        </button>
                      </div>
                      {activeModule.quiz_questions.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          No questions yet. Add at least one for learners to take the quiz.
                        </p>
                      ) : (
                        activeModule.quiz_questions.map((q, qi) => (
                          <div
                            key={q.id}
                            className="space-y-2 rounded-xl border border-cyan-200 bg-white p-3"
                          >
                            <div className="flex justify-between gap-2">
                              <span className="text-xs font-semibold text-cyan-800">Question {qi + 1}</span>
                              <button
                                type="button"
                                onClick={() => removeQuizQuestion(q.id)}
                                className="text-xs text-red-600 hover:underline"
                              >
                                Remove question
                              </button>
                            </div>
                            <textarea
                              value={q.prompt}
                              onChange={(e) => updateQuizQuestion(q.id, e.target.value)}
                              rows={2}
                              placeholder="Question text"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            />
                            <p className="text-xs text-slate-600">Mark the correct answer:</p>
                            <ul className="space-y-2">
                              {q.options.map((o) => (
                                <li key={o.id} className="flex items-start gap-2">
                                  <input
                                    type="radio"
                                    name={`correct-${q.id}`}
                                    className="mt-2"
                                    checked={o.is_correct}
                                    onChange={() => setCorrectOption(q.id, o.id)}
                                    title="Correct answer"
                                  />
                                  <FieldInput
                                    type="text"
                                    value={o.label}
                                    onChange={(e) => updateQuizOption(q.id, o.id, e.target.value)}
                                    placeholder="Option text"
                                    className="flex-1"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeQuizOption(q.id, o.id)}
                                    className="text-slate-400 hover:text-red-600 text-sm px-1"
                                  >
                                    ×
                                  </button>
                                </li>
                              ))}
                            </ul>
                            <button
                              type="button"
                              onClick={() => addQuizOption(q.id)}
                              className="text-sm text-cyan-700 font-medium"
                            >
                              + Add option
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Feedback: instructions only; learners submit on the lesson page */}
                {activeModule.type === 'feedback' && (
                  <div>
                    <Label>Instructions</Label>
                    <textarea
                      value={activeModule.description}
                      onChange={(e) => update({ description: e.target.value })}
                      rows={4}
                      placeholder="What feedback you want and how it will be used."
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Learners type feedback on the lesson page; submitting marks the lesson complete.
                    </p>
                  </div>
                )}

                {activeModule.type === 'assignment' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label>Instructions / description</Label>
                      <textarea
                        value={activeModule.assignment_description}
                        onChange={(e) => update({ assignment_description: e.target.value })}
                        rows={4}
                        placeholder="What learners should submit and how it will be graded."
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <Label>Max Score</Label>
                      <FieldInput
                        type="number"
                        value={activeModule.max_score}
                        onChange={(e) => update({ max_score: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>Passing Score</Label>
                      <FieldInput
                        type="number"
                        value={activeModule.passing_score}
                        onChange={(e) => update({ passing_score: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Deadline (optional)</Label>
                      <FieldInput
                        type="datetime-local"
                        value={activeModule.deadline_at}
                        onChange={(e) => update({ deadline_at: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full min-h-45 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
                Select a lesson to configure it
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Row */}
      <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <div>
          {courseId && (
            <button
              type="button"
              onClick={() => void handleDeleteCourse()}
              disabled={deleting || saving}
              className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete course
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {hasUnsavedChanges && !saved && (
            <span className="text-sm font-medium text-amber-700">Unsaved changes</span>
          )}
          {saved && (
            <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" /> Saved! Redirecting…
            </span>
          )}
          {actionError && (
            <span className="text-sm font-medium text-red-600" role="alert">
              Something went wrong.
            </span>
          )}
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving || thumbnailUploading}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {courseId ? 'Save draft' : 'Save as Draft'}
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving || thumbnailUploading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow transition hover:bg-blue-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {courseId ? 'Publish' : 'Publish Course'}
          </button>
        </div>
      </div>
    </div>
  )
}
