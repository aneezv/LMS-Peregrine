'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import {
  deriveUnlockMode,
  fromDatetimeLocal,
  toDatetimeLocalValue,
  unlockAtForWeek,
} from '@/lib/unlock-schedule'
import { syncQuizAndExternalForModules } from '@/lib/sync-module-quiz-external'
import { ROLES } from '@/lib/roles'
import { GENERAL_DEPARTMENT_NAME } from '@/lib/course-departments'
import { toast } from 'sonner'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { firstEmbeddedAssignment } from '@/lib/embedded-assignment'
import {
  getModuleContentUrl,
  getModuleQuizSettings,
  getModuleSessionFields,
} from '@/lib/module-subtypes'

import {
  SectionItem,
  ModuleItem,
  makeSection,
  makeModule,
  remapModuleIds,
  parseModuleFromClipboard,
  serializeModuleForClipboard,
  normalizeModuleType,
  sortBySortOrder,
  newClientId,
} from './course-builder/types'
import { CourseBuilderHeader, StudioTab } from './course-builder/CourseBuilderHeader'
import { CurriculumTab } from './course-builder/CurriculumTab'
import { CourseDetailsTab } from './course-builder/CourseDetailsTab'
import { PricingAccessTab } from './course-builder/PricingAccessTab'

function buildModuleRow(
  mod: ModuleItem,
  courseId: string,
  sectionId: string | null,
  sortIndex: number,
  courseStartsAtStr: string,
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
    sort_order: sortIndex,
    week_index: weekIndex,
    available_from: availableFrom,
  }
}

function buildModuleSubtypePayloads(mod: ModuleItem, moduleId: string) {
  const quizTimeLimit =
    mod.type === 'mcq'
      ? (() => {
          const v = mod.quiz_time_limit_minutes
          if (v == null) return null
          const n = Math.trunc(Number(v))
          if (!Number.isFinite(n) || n < 1) return null
          return Math.min(1440, n) as number
        })()
      : null

  return {
    content:
      mod.type === 'video' || mod.type === 'live_session' || (mod.type as string) === 'document'
        ? { module_id: moduleId, content_url: mod.content_url.trim() || null }
        : null,
    session:
      mod.type === 'live_session' || mod.type === 'offline_session'
        ? {
            module_id: moduleId,
            session_location: mod.session_location.trim() || null,
            session_start_at: mod.session_start_at ? fromDatetimeLocal(mod.session_start_at) : null,
            session_end_at: mod.session_end_at ? fromDatetimeLocal(mod.session_end_at) : null,
          }
        : null,
    quiz:
      mod.type === 'mcq' || (mod.type as string) === 'quiz'
        ? {
            module_id: moduleId,
            quiz_passing_pct: Math.min(100, Math.max(0, Math.trunc(Number(mod.quiz_passing_pct)) || 60)),
            quiz_allow_retest: !!mod.quiz_allow_retest,
            quiz_time_limit_minutes: quizTimeLimit,
            quiz_randomize_questions: !!mod.quiz_randomize_questions,
          }
        : null,
  }
}

async function syncModuleSubtypes(
  supabase: ReturnType<typeof createClient>,
  mod: ModuleItem,
  moduleId: string,
) {
  const payloads = buildModuleSubtypePayloads(mod, moduleId)

  const contentRes = payloads.content
    ? await supabase.from('module_content').upsert(payloads.content, { onConflict: 'module_id' })
    : await supabase.from('module_content').delete().eq('module_id', moduleId)
  if (contentRes.error) throw contentRes.error

  const sessionRes = payloads.session
    ? await supabase.from('module_session').upsert(payloads.session, { onConflict: 'module_id' })
    : await supabase.from('module_session').delete().eq('module_id', moduleId)
  if (sessionRes.error) throw sessionRes.error

  const quizRes = payloads.quiz
    ? await supabase.from('module_quiz_settings').upsert(payloads.quiz, { onConflict: 'module_id' })
    : await supabase.from('module_quiz_settings').delete().eq('module_id', moduleId)
  if (quizRes.error) throw quizRes.error
}

async function syncAssignmentForModule(
  supabase: ReturnType<typeof createClient>,
  mod: ModuleItem,
  moduleId: string,
) {
  if (mod.type !== 'assignment') {
    await supabase.from('assignments').delete().eq('module_id', moduleId)
    return
  }
  const maxScore = Math.min(10_000, Math.max(0, Math.trunc(Number(mod.max_score)) || 100))
  const passingScore = Math.min(maxScore, Math.max(0, Math.trunc(Number(mod.passing_score)) || 60))
  const payload = {
    module_id: moduleId,
    description: mod.assignment_description.trim() || null,
    max_score: maxScore,
    passing_score: passingScore,
    deadline_at: mod.deadline_at ? fromDatetimeLocal(mod.deadline_at) : null,
    allow_late: false,
    late_penalty_pct: 0,
  }

  const { data: existingRows, error: selErr } = await supabase
    .from('assignments')
    .select('id')
    .eq('module_id', moduleId)
    .limit(1)
  if (selErr) throw selErr
  const existingId = existingRows?.[0]?.id
  if (existingId) {
    const { error } = await supabase
      .from('assignments')
      .update({
        description: payload.description,
        max_score: payload.max_score,
        passing_score: payload.passing_score,
        deadline_at: payload.deadline_at,
        allow_late: payload.allow_late,
        late_penalty_pct: payload.late_penalty_pct,
      })
      .eq('id', existingId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('assignments').insert(payload)
    if (error) throw error
  }
}

function mapDbModuleToItem(
  row: Record<string, unknown>,
  courseStartsIso: string | null,
  fallbackSectionId: string,
): ModuleItem {
  const id = row.id as string
  const sectionId = (row.section_id as string) || fallbackSectionId
  const asn = firstEmbeddedAssignment(row.assignments)
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

  const subtypeRow = row as Record<string, unknown>
  const quizSettings = getModuleQuizSettings(subtypeRow)
  const sessionFields = getModuleSessionFields(subtypeRow)
  const contentUrl = getModuleContentUrl(subtypeRow)

  const qpct = quizSettings.quiz_passing_pct ?? 60
  const qRetest = quizSettings.quiz_allow_retest ?? true
  const rawTlim = quizSettings.quiz_time_limit_minutes
  const qTimeLim =
    rawTlim != null && Number.isFinite(Number(rawTlim))
      ? Math.min(1440, Math.max(1, Math.trunc(Number(rawTlim))))
      : null
  const qRand = !!quizSettings.quiz_randomize_questions

  return {
    id,
    dbId: id,
    section_id: sectionId,
    title: (row.title as string) ?? '',
    type: normalizeModuleType(String(row.type)),
    week_index: weekIndex,
    unlock_mode: unlockMode,
    available_from:
      unlockMode === 'manual' && avail ? toDatetimeLocalValue(avail) : '',
    description: (row.description as string) ?? '',
    content_url: contentUrl,
    session_location: sessionFields.session_location,
    session_start_at: sessionFields.session_start_at
      ? toDatetimeLocalValue(sessionFields.session_start_at)
      : '',
    session_end_at: sessionFields.session_end_at
      ? toDatetimeLocalValue(sessionFields.session_end_at)
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
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<StudioTab>(courseId ? 'curriculum' : 'details')

  const [title, setTitle] = useState('')
  const [courseCode, setCourseCode] = useState('')
  const [description, setDescription] = useState('')
  const [courseStartsAt, setCourseStartsAt] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [demoVideoUrl, setDemoVideoUrl] = useState('')
  const [enrollmentType, setEnrollmentType] = useState<'open' | 'invite_only'>('invite_only')
  const [departmentOptions, setDepartmentOptions] = useState<
    { id: string; name: string; sort_order: number }[]
  >([])
  const [departmentId, setDepartmentId] = useState('')
  const [price, setPrice] = useState<string>('0')
  const [discountPercent, setDiscountPercent] = useState<string>('0')
  const [status, setStatus] = useState<'draft' | 'published'>('draft')

  const [sections, setSections] = useState<SectionItem[]>(() => [makeSection('Course Content', 0)])
  const [deletedSectionIds, setDeletedSectionIds] = useState<Set<string>>(new Set())
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<{
    sectionId: string
    title: string
    lessonCount: number
  } | null>(null)

  const [modules, setModules] = useState<ModuleItem[]>([])
  const [activeId, setActiveId] = useState<string>('')

  const [modifiedModuleIds, setModifiedModuleIds] = useState<Set<string>>(new Set())
  const [deletedModuleIds, setDeletedModuleIds] = useState<Set<string>>(new Set())

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [loading, setLoading] = useState(!!courseId)
  const [loadError, setLoadError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
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

  useEffect(() => {
    if (!courseId && modules.length === 0 && sections.length > 0) {
      const initialMod = makeModule(sections[0].id, 1)
      setModules([initialMod])
      setActiveId(initialMod.id)
    }
  }, [courseId, modules.length, sections])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
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

      const { data: deps } = await supabase
        .from('departments')
        .select('id, name, sort_order')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (cancelled || !deps?.length) return
      setDepartmentOptions(deps)
      if (!courseId) {
        const gen = deps.find(
          (d) => d.name.trim().toLowerCase() === GENERAL_DEPARTMENT_NAME.toLowerCase(),
        )
        setDepartmentId((prev) => prev || gen?.id || deps[0].id)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [courseId])

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
          'title, course_code, description, thumbnail_url, demo_video_url, starts_at, enrollment_type, status, instructor_id, department_id, price, discount_percent',
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
      setDemoVideoUrl((course.demo_video_url as string) ?? '')
      setCourseStartsAt(
        course.starts_at ? toDatetimeLocalValue(course.starts_at as string) : '',
      )
      setEnrollmentType((course.enrollment_type as 'open' | 'invite_only') ?? 'invite_only')
      setStatus((course.status as 'draft' | 'published') ?? 'draft')
      setDepartmentId((course.department_id as string) ?? '')
      setPrice(String((course as { price?: number }).price ?? 0))
      setDiscountPercent(String((course as { discount_percent?: number }).discount_percent ?? 0))

      const { data: secRows, error: secErr } = await supabase
        .from('sections')
        .select('id, title, sort_order')
        .eq('course_id', courseId)
        .order('sort_order', { ascending: true })

      if (cancelled) return
      if (secErr) {
        setLoadError(secErr.message)
        setLoading(false)
        return
      }

      const loadedSections: SectionItem[] =
        (secRows ?? []).length > 0
          ? (secRows ?? []).map((s, idx) => ({
              id: s.id,
              dbId: s.id,
              title: s.title || `Section ${idx + 1}`,
              sort_order: s.sort_order ?? idx,
            }))
          : [makeSection('Course Content', 0)]

      setSections(loadedSections)

      const { data: mods, error: mErr } = await supabase
        .from('modules')
        .select(
          `
          id, type, title, week_index, description, available_from, sort_order, section_id,
          module_content ( content_url ),
          module_session ( session_location, session_start_at, session_end_at ),
          module_quiz_settings (
            quiz_passing_pct, quiz_allow_retest, quiz_time_limit_minutes, quiz_randomize_questions
          ),
          module_external_links ( label, url, sort_order ),
          quiz_questions ( id, prompt, sort_order, quiz_options ( id, label, is_correct, sort_order ) ),
          assignments ( id, description, max_score, passing_score, deadline_at )
        `,
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
      const defaultSectionId = loadedSections[0]?.id ?? ''
      const mapped = (mods ?? []).map((row) =>
        mapDbModuleToItem(row as Record<string, unknown>, courseStartsIso, defaultSectionId),
      )
      const loadedModules = mapped.length === 0 ? [makeModule(defaultSectionId)] : mapped
      setModules(loadedModules)
      setActiveId(loadedModules[0].id)
      setBaselineSnapshot(
        JSON.stringify({
          title: course.title ?? '',
          courseCode: (course.course_code as string) ?? '',
          description: course.description ?? '',
          courseStartsAt: course.starts_at ? toDatetimeLocalValue(course.starts_at as string) : '',
          thumbnailUrl: course.thumbnail_url ?? '',
          demoVideoUrl: (course.demo_video_url as string) ?? '',
          enrollmentType: (course.enrollment_type as 'open' | 'invite_only') ?? 'invite_only',
          selectedInstructorId: (course.instructor_id as string) ?? '',
          departmentId: (course.department_id as string) ?? '',
          price: String((course as { price?: number }).price ?? 0),
          discountPercent: String((course as { discount_percent?: number }).discount_percent ?? 0),
          sections: loadedSections,
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
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) setSelectedInstructorId(user.id)
    })()
  }, [courseId, selectedInstructorId])

  useEffect(() => {
    setThumbnailPreviewVersion(Date.now())
  }, [thumbnailUrl])

  useEffect(() => {
    if (modules.length === 0) {
      if (activeId !== '') setActiveId('')
      return
    }
    if (!modules.some((m) => m.id === activeId)) {
      setActiveId(modules[0].id)
    }
  }, [modules, activeId])

  const snapshot = useMemo(
    () =>
      JSON.stringify({
        title,
        courseCode,
        description,
        courseStartsAt,
        thumbnailUrl,
        demoVideoUrl,
        enrollmentType,
        selectedInstructorId,
        departmentId,
        price,
        discountPercent,
        sections,
        modules,
      }),
    [
      title,
      courseCode,
      description,
      courseStartsAt,
      thumbnailUrl,
      demoVideoUrl,
      enrollmentType,
      selectedInstructorId,
      departmentId,
      price,
      discountPercent,
      sections,
      modules,
    ],
  )

  const hasUnsavedChanges = baselineReady && snapshot !== baselineSnapshot

  useEffect(() => {
    if (baselineReady || loading) return
    if (!courseId && !departmentId) return
    setBaselineSnapshot(snapshot)
    setBaselineReady(true)
  }, [baselineReady, loading, snapshot, courseId, departmentId])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnsavedChanges])

  const addSection = () => {
    const newSec = makeSection(`Section ${sections.length + 1}`, sections.length)
    setSections((prev) => [...prev, newSec])
  }

  const updateSectionTitle = (sectionId: string, newTitle: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, title: newTitle } : s)),
    )
  }

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= sections.length) return
    const next = [...sections]
    const temp = next[index]
    next[index] = next[targetIndex]
    next[targetIndex] = temp
    setSections(next.map((s, idx) => ({ ...s, sort_order: idx })))
  }

  const requestDeleteSection = (sec: SectionItem) => {
    if (sections.length <= 1) {
      toast.error('A course must have at least one section.')
      return
    }
    const lessonCount = modules.filter((m) => m.section_id === sec.id).length
    if (lessonCount > 0) {
      setConfirmDeleteSection({
        sectionId: sec.id,
        title: sec.title,
        lessonCount,
      })
    } else {
      executeDeleteSection(sec.id)
    }
  }

  const executeDeleteSection = (sectionId: string) => {
    const sec = sections.find((s) => s.id === sectionId)
    if (!sec) return

    if (sec.dbId) {
      setDeletedSectionIds((prev) => new Set([...prev, sec.dbId!]))
    }

    const modsInSec = modules.filter((m) => m.section_id === sectionId)
    for (const m of modsInSec) {
      if (m.dbId) {
        setDeletedModuleIds((prev) => new Set([...prev, m.dbId!]))
      }
    }

    setModules((prev) => prev.filter((m) => m.section_id !== sectionId))
    const remainingSections = sections
      .filter((s) => s.id !== sectionId)
      .map((s, idx) => ({ ...s, sort_order: idx }))
    setSections(remainingSections)
    setConfirmDeleteSection(null)
    toast.success(`Section "${sec.title}" deleted.`)
  }

  const addModule = (sectionId?: string) => {
    const activeModule = modules.find((m) => m.id === activeId)
    const targetSecId = sectionId ?? activeModule?.section_id ?? sections[0]?.id ?? ''
    const newWeek = activeModule?.week_index ?? 1
    const m = makeModule(targetSecId, newWeek)
    setModules((prev) => [...prev, m])
    setActiveId(m.id)
    setModifiedModuleIds((prev) => new Set([...prev, m.id]))
  }

  const removeModule = (id: string) => {
    const mod = modules.find((m) => m.id === id)
    if (mod?.dbId) {
      setDeletedModuleIds((prev) => new Set([...prev, mod.dbId!]))
    }
    setModules((prev) => prev.filter((m) => m.id !== id))
    setModifiedModuleIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const updateActiveModule = (patch: Partial<ModuleItem>) => {
    setModules((prev) =>
      prev.map((m) => (m.id === activeId ? { ...m, ...patch } : m)),
    )
    setModifiedModuleIds((prev) => new Set([...prev, activeId]))
  }

  const copyModuleToClipboard = async (mod: ModuleItem, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(serializeModuleForClipboard(mod))
      setActionError('')
      toast.success('Lesson copied to clipboard.')
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
        toast.error('Clipboard does not contain a copied lesson.')
        return
      }
      const fresh = remapModuleIds(parsed)
      const activeIdx = modules.findIndex((m) => m.id === activeId)
      const insertAt = activeIdx >= 0 ? activeIdx + 1 : modules.length
      const activeModule = modules.find((m) => m.id === activeId)
      const week = activeModule?.week_index ?? fresh.week_index
      const sectionId = activeModule?.section_id ?? sections[0]?.id ?? ''
      const withSection: ModuleItem = { ...fresh, section_id: sectionId, week_index: week }
      setModules((prev) => {
        const next = [...prev]
        next.splice(insertAt, 0, withSection)
        return next
      })
      setActiveId(withSection.id)
      setModifiedModuleIds((prev) => new Set([...prev, withSection.id]))
      setActionError('')
      toast.success('Lesson pasted successfully.')
    } catch {
      setActionError('Could not read clipboard or paste lesson.')
    }
  }

  const reorderModules = (newModules: ModuleItem[], movedId: string) => {
    setModules(newModules)
    setModifiedModuleIds((prev) => new Set([...prev, movedId]))
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
      toast.success('Thumbnail uploaded successfully.')
    } finally {
      setThumbnailUploading(false)
    }
  }

  const handleSave = async (publish: boolean) => {
    if (!title.trim()) {
      setError('Course title is required.')
      setActiveTab('details')
      return
    }
    if (!courseCode.trim()) {
      setError('Course code is required.')
      setActiveTab('details')
      return
    }
    if (!departmentId) {
      setError('Department is required.')
      setActiveTab('details')
      return
    }
    if (sections.length === 0) {
      setError('At least one section is required.')
      setActiveTab('curriculum')
      return
    }
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      if (!sections[sIdx].title.trim()) {
        setError(`Section ${sIdx + 1} name cannot be empty.`)
        setActiveTab('curriculum')
        return
      }
    }
    for (let mIdx = 0; mIdx < modules.length; mIdx++) {
      if (!modules[mIdx].title.trim()) {
        setError(`Lesson ${mIdx + 1} title cannot be empty.`)
        setActiveTab('curriculum')
        return
      }
    }
    setSaving(true)
    setError('')
    setActionError('')

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      const message = 'You are not signed in. Please log in and try again.'
      setActionError(message)
      toast.error(message)
      setSaving(false)
      return
    }

    const backupState = {
      sections: [...sections],
      deletedSectionIds: new Set(deletedSectionIds),
      modules: [...modules],
      modifiedModuleIds: new Set(modifiedModuleIds),
      deletedModuleIds: new Set(deletedModuleIds),
      title,
      courseCode,
      description,
      courseStartsAt,
      thumbnailUrl,
      demoVideoUrl,
      enrollmentType,
      selectedInstructorId,
      departmentId,
      price,
      discountPercent,
    }

    try {
      const startsAtIso = fromDatetimeLocal(courseStartsAt)
      const priceNumber = Math.max(0, Number(price) || 0)
      const discountNumber = Math.max(0, Math.min(100, Math.round(Number(discountPercent) || 0)))

      const sectionIndexMap = new Map<string, number>(
        sections.map((sec, idx) => [sec.id, idx]),
      )
      const modulesForDisplay = [...modules].sort((a, b) => {
        const secA = sectionIndexMap.get(a.section_id) ?? 999
        const secB = sectionIndexMap.get(b.section_id) ?? 999
        if (secA !== secB) return secA - secB
        return 0
      })

      if (courseId) {
        const updatePayload: Record<string, unknown> = {
          title: title.trim(),
          course_code: courseCode.trim(),
          description: description.trim() || null,
          thumbnail_url: thumbnailUrl.trim() || null,
          demo_video_url: demoVideoUrl.trim() || null,
          starts_at: startsAtIso,
          status: publish ? 'published' : 'draft',
          enrollment_type: enrollmentType,
          department_id: departmentId,
          price: priceNumber,
          discount_percent: discountNumber,
        }
        if (isAdmin && selectedInstructorId) {
          updatePayload.instructor_id = selectedInstructorId
        }

        const { error: upErr } = await supabase
          .from('courses')
          .update(updatePayload)
          .eq('id', courseId)

        if (upErr) throw upErr

        if (deletedSectionIds.size > 0) {
          const { error: sDelErr } = await supabase
            .from('sections')
            .delete()
            .in('id', Array.from(deletedSectionIds))
          if (sDelErr) throw sDelErr
        }

        if (deletedModuleIds.size > 0) {
          await supabase.from('modules').delete().in('id', Array.from(deletedModuleIds))
        }

        const sectionIdToDbId = new Map<string, string>()
        for (let sIdx = 0; sIdx < sections.length; sIdx++) {
          const sec = sections[sIdx]
          if (sec.dbId) {
            const { error: sUpErr } = await supabase
              .from('sections')
              .update({
                title: sec.title.trim(),
                sort_order: sIdx,
              })
              .eq('id', sec.dbId)
            if (sUpErr) throw sUpErr
            sectionIdToDbId.set(sec.id, sec.dbId)
          } else {
            const { data: newSec, error: sInsErr } = await supabase
              .from('sections')
              .insert({
                course_id: courseId,
                title: sec.title.trim(),
                sort_order: sIdx,
              })
              .select('id')
              .single()
            if (sInsErr || !newSec) throw sInsErr ?? new Error('Failed to create section')
            sec.dbId = newSec.id
            sectionIdToDbId.set(sec.id, newSec.id)
          }
        }

        const { data: existingMods } = await supabase
          .from('modules')
          .select('id, sort_order, section_id')
          .eq('course_id', courseId)
        const existingModMeta = new Map<string, { sort_order: number; section_id: string | null }>(
          (existingMods ?? []).map((row) => [
            row.id as string,
            {
              sort_order: Number((row as { sort_order?: number }).sort_order ?? 0),
              section_id: (row as { section_id?: string | null }).section_id ?? null,
            },
          ]),
        )

        const modulesToSync: Array<{
          moduleId: string
          moduleType: string
          externalLinks: ModuleItem['external_links']
          quizQuestions: ModuleItem['quiz_questions']
        }> = []

        for (let i = 0; i < modulesForDisplay.length; i++) {
          const mod = modulesForDisplay[i]
          const targetSectionDbId =
            sectionIdToDbId.get(mod.section_id) ?? sections[0]?.dbId ?? null
          const row = buildModuleRow(mod, courseId, targetSectionDbId, i, courseStartsAt)

          if (mod.dbId) {
            const meta = existingModMeta.get(mod.dbId)
            const orderChanged = meta == null || meta.sort_order !== i
            const sectionChanged = meta == null || meta.section_id !== targetSectionDbId

            if (modifiedModuleIds.has(mod.id)) {
              const { error: mErr } = await supabase
                .from('modules')
                .update(row)
                .eq('id', mod.dbId)
              if (mErr) throw mErr
              await syncModuleSubtypes(supabase, mod, mod.dbId)
              modulesToSync.push({
                moduleId: mod.dbId,
                moduleType: mod.type,
                externalLinks: mod.external_links,
                quizQuestions: mod.quiz_questions,
              })
            } else if (orderChanged || sectionChanged) {
              const { error: sErr } = await supabase
                .from('modules')
                .update({ sort_order: i, section_id: targetSectionDbId })
                .eq('id', mod.dbId)
              if (sErr) throw sErr
            }
            await syncAssignmentForModule(supabase, mod, mod.dbId)
          } else {
            const { data: dbMod, error: insErr } = await supabase
              .from('modules')
              .insert(row)
              .select('id')
              .single()
            if (insErr || !dbMod) throw insErr ?? new Error('Failed to create lesson')
            mod.dbId = dbMod.id
            await syncModuleSubtypes(supabase, mod, dbMod.id)
            await syncAssignmentForModule(supabase, mod, dbMod.id)
            modulesToSync.push({
              moduleId: dbMod.id,
              moduleType: mod.type,
              externalLinks: mod.external_links,
              quizQuestions: mod.quiz_questions,
            })
          }
        }

        if (modulesToSync.length > 0) {
          await syncQuizAndExternalForModules(
            supabase,
            modulesToSync.map((m) => ({
              moduleId: m.moduleId,
              moduleType: m.moduleType,
              externalLinks: m.externalLinks.map(({ label, url }) => ({ label, url })),
              quizQuestions: m.quizQuestions.map((q) => ({
                prompt: q.prompt,
                options: q.options.map((o) => ({ label: o.label, is_correct: o.is_correct })),
              })),
            })),
          )
        }

        setModifiedModuleIds(new Set())
        setDeletedModuleIds(new Set())
        setDeletedSectionIds(new Set())
        setBaselineSnapshot(snapshot)
        setStatus(publish ? 'published' : 'draft')
        setSaved(true)
        toast.success(publish ? 'Course published!' : 'Draft saved successfully!')
        setTimeout(() => router.push(`/courses/${courseId}`), 800)
        return
      }

      // Creating new course
      const ownerId = isAdmin && selectedInstructorId ? selectedInstructorId : user.id
      const { data: newCourse, error: courseErr } = await supabase
        .from('courses')
        .insert({
          instructor_id: ownerId,
          course_code: courseCode.trim(),
          title: title.trim(),
          description: description.trim() || null,
          thumbnail_url: thumbnailUrl.trim() || null,
          demo_video_url: demoVideoUrl.trim() || null,
          starts_at: startsAtIso,
          status: publish ? 'published' : 'draft',
          enrollment_type: enrollmentType,
          department_id: departmentId,
          price: priceNumber,
          discount_percent: discountNumber,
        })
        .select('id')
        .single()

      if (courseErr || !newCourse) throw courseErr ?? new Error('Failed to create course metadata')

      const sectionIdToDbId = new Map<string, string>()
      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        const sec = sections[sIdx]
        const { data: newSec, error: sInsErr } = await supabase
          .from('sections')
          .insert({
            course_id: newCourse.id,
            title: sec.title.trim(),
            sort_order: sIdx,
          })
          .select('id')
          .single()
        if (sInsErr || !newSec) throw sInsErr ?? new Error('Failed to create section')
        sec.dbId = newSec.id
        sectionIdToDbId.set(sec.id, newSec.id)
      }

      const modulesToSync: Array<{
        moduleId: string
        moduleType: string
        externalLinks: ModuleItem['external_links']
        quizQuestions: ModuleItem['quiz_questions']
      }> = []

      for (let i = 0; i < modulesForDisplay.length; i++) {
        const mod = modulesForDisplay[i]
        const targetSectionDbId = sectionIdToDbId.get(mod.section_id) ?? null
        const row = buildModuleRow(mod, newCourse.id, targetSectionDbId, i, courseStartsAt)
        const { data: dbMod, error: mErr } = await supabase
          .from('modules')
          .insert(row)
          .select('id')
          .single()

        if (mErr || !dbMod) throw mErr ?? new Error('Failed to create lesson')
        mod.dbId = dbMod.id
        await syncModuleSubtypes(supabase, mod, dbMod.id)
        await syncAssignmentForModule(supabase, mod, dbMod.id)
        modulesToSync.push({
          moduleId: dbMod.id,
          moduleType: mod.type,
          externalLinks: mod.external_links,
          quizQuestions: mod.quiz_questions,
        })
      }

      if (modulesToSync.length > 0) {
        await syncQuizAndExternalForModules(
          supabase,
          modulesToSync.map((m) => ({
            moduleId: m.moduleId,
            moduleType: m.moduleType,
            externalLinks: m.externalLinks.map(({ label, url }) => ({ label, url })),
            quizQuestions: m.quizQuestions.map((q) => ({
              prompt: q.prompt,
              options: q.options.map((o) => ({ label: o.label, is_correct: o.is_correct })),
            })),
          })),
        )
      }

      setModifiedModuleIds(new Set())
      setDeletedModuleIds(new Set())
      setDeletedSectionIds(new Set())
      setBaselineSnapshot(snapshot)
      setSaved(true)
      toast.success(publish ? 'Course created and published!' : 'Course draft created successfully!')
      setTimeout(() => router.push(`/courses/${newCourse.id}`), 1200)
    } catch (e: unknown) {
      console.error('[CourseBuilder] Save failed:', e)
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message?: unknown }).message)
          : 'Failed to save changes. Reverting to previous state.'
      setActionError(msg)
      toast.error(msg)

      // Rollback
      setSections(backupState.sections)
      setDeletedSectionIds(backupState.deletedSectionIds)
      setModules(backupState.modules)
      setModifiedModuleIds(backupState.modifiedModuleIds)
      setDeletedModuleIds(backupState.deletedModuleIds)
      setTitle(backupState.title)
      setCourseCode(backupState.courseCode)
      setDescription(backupState.description)
      setCourseStartsAt(backupState.courseStartsAt)
      setThumbnailUrl(backupState.thumbnailUrl)
      backupState.demoVideoUrl && setDemoVideoUrl(backupState.demoVideoUrl)
      setEnrollmentType(backupState.enrollmentType)
      setSelectedInstructorId(backupState.selectedInstructorId)
      setDepartmentId(backupState.departmentId)
      setPrice(backupState.price)
      setDiscountPercent(backupState.discountPercent)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCourse = async () => {
    if (!courseId) return
    setConfirmDeleteOpen(false)
    setDeleting(true)
    setError('')
    setActionError('')
    const supabase = createClient()
    const { error: dErr } = await supabase.from('courses').delete().eq('id', courseId)
    setDeleting(false)
    if (dErr) {
      console.error('[CourseBuilder] Delete course error:', dErr)
      setActionError('Could not delete course.')
      toast.error(dErr.message || 'Could not delete course.')
      return
    }
    toast.success('Course deleted.')
    await queryClient.invalidateQueries({ queryKey: ['courses', 'catalog'] })
    router.push('/dashboard')
  }

  if (courseId && loading) {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-slate-500 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" aria-hidden />
        <span className="text-sm font-semibold">Loading course builder...</span>
      </div>
    )
  }

  if (courseId && loadError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800 text-sm">
        <h3 className="font-bold text-base mb-1">Failed to load course</h3>
        <p>{loadError}</p>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-140px)] pb-12">
      {/* Sticky Studio Header */}
      <CourseBuilderHeader
        courseId={courseId}
        title={title}
        courseCode={courseCode}
        isPublished={status === 'published'}
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        saved={saved}
        deleting={deleting}
        actionError={actionError}
        activeTab={activeTab}
        lessonCount={modules.length}
        onTabChange={setActiveTab}
        onSave={handleSave}
        onRequestDeleteCourse={() => setConfirmDeleteOpen(true)}
      />

      {/* Validation Error Banner */}
      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 shadow-2xs">
          {error}
        </div>
      )}

      {/* Tab 1: Curriculum Workbench */}
      {activeTab === 'curriculum' && (
        <CurriculumTab
          sections={sections}
          modules={modules}
          activeId={activeId}
          courseStartsAt={courseStartsAt}
          onSelectModule={setActiveId}
          onAddModule={addModule}
          onDeleteModule={removeModule}
          onUpdateActiveModule={updateActiveModule}
          onCopyModule={copyModuleToClipboard}
          onPasteModule={pasteModuleFromClipboard}
          onReorderModules={reorderModules}
          onAddSection={addSection}
          onUpdateSectionTitle={updateSectionTitle}
          onMoveSection={moveSection}
          onRequestDeleteSection={requestDeleteSection}
        />
      )}

      {/* Tab 2: Course Details */}
      {activeTab === 'details' && (
        <CourseDetailsTab
          title={title}
          setTitle={setTitle}
          courseCode={courseCode}
          setCourseCode={setCourseCode}
          description={description}
          setDescription={setDescription}
          courseStartsAt={courseStartsAt}
          setCourseStartsAt={setCourseStartsAt}
          thumbnailUrl={thumbnailUrl}
          setThumbnailUrl={setThumbnailUrl}
          demoVideoUrl={demoVideoUrl}
          setDemoVideoUrl={setDemoVideoUrl}
          departmentId={departmentId}
          setDepartmentId={setDepartmentId}
          departmentOptions={departmentOptions}
          isAdmin={isAdmin}
          selectedInstructorId={selectedInstructorId}
          setSelectedInstructorId={setSelectedInstructorId}
          instructorChoices={instructorChoices}
          thumbnailUploading={thumbnailUploading}
          thumbnailUploadError={thumbnailUploadError}
          onUploadThumbnail={uploadThumbnail}
          thumbnailPreviewVersion={thumbnailPreviewVersion}
        />
      )}

      {/* Tab 3: Pricing & Access */}
      {activeTab === 'pricing' && (
        <PricingAccessTab
          price={price}
          setPrice={setPrice}
          discountPercent={discountPercent}
          setDiscountPercent={setDiscountPercent}
          enrollmentType={enrollmentType}
          setEnrollmentType={setEnrollmentType}
        />
      )}

      {/* Confirmation Dialogs */}
      <ConfirmationDialog
        open={confirmDeleteOpen}
        title="Delete this course?"
        description="This removes the course and all related lessons and student progress permanently. This action cannot be undone."
        confirmLabel="Delete Course"
        confirmVariant="danger"
        busy={deleting}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => void handleDeleteCourse()}
      />

      <ConfirmationDialog
        open={!!confirmDeleteSection}
        title="Delete Section?"
        description={
          confirmDeleteSection
            ? `Are you sure you want to delete "${confirmDeleteSection.title}"? This section contains ${confirmDeleteSection.lessonCount} lesson(s), which will also be deleted permanently.`
            : ''
        }
        confirmLabel="Delete Section & Lessons"
        confirmVariant="danger"
        onCancel={() => setConfirmDeleteSection(null)}
        onConfirm={() => {
          if (confirmDeleteSection) {
            executeDeleteSection(confirmDeleteSection.sectionId)
          }
        }}
      />
    </div>
  )
}
