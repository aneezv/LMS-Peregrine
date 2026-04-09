'use server'

import { createClient } from '@/utils/supabase/server'
import { ensureSessionRosterRows } from '@/lib/ensure-session-roster'
import { ROLES, isInstructorRole } from '@/lib/roles'
import type {
  AttendanceReportFetchInput,
  AttendanceReportRow,
  AttendanceSessionTypeFilter,
} from './types'

const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 200

/** Full present/absent/total per session for modules on the current page (not limited by pagination). */
export type AttendanceSessionAggregate = {
  total: number
  present: number
  absent: number
  submittedAt: string | null
}

type ReportResult =
  | {
      rows: AttendanceReportRow[]
      totalCount: number
      page: number
      pageSize: number
      /** Key: `${courseId}:${moduleId}` — counts all roster rows matching filters for that session */
      sessionAggregates: Record<string, AttendanceSessionAggregate>
    }
  | { error: string }

function normalizeSessionType(sessionType: AttendanceSessionTypeFilter): 'all' | 'live_session' | 'offline_session' {
  if (sessionType === 'live_session' || sessionType === 'offline_session') return sessionType
  return 'all'
}

function parseDayStartIso(dateStr: string): string | null {
  const s = dateStr.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return `${s}T00:00:00.000Z`
}

function parseDayEndIso(dateStr: string): string | null {
  const s = dateStr.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return `${s}T23:59:59.999Z`
}

function clampPagination(page: number, pageSize: number) {
  const p = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
  const raw = Number.isFinite(pageSize) ? Math.floor(pageSize) : DEFAULT_PAGE_SIZE
  const ps = Math.min(MAX_PAGE_SIZE, Math.max(10, raw))
  return { page: p, pageSize: ps }
}

export async function fetchAttendanceReport(input: AttendanceReportFetchInput): Promise<ReportResult> {
  const filters = input.filters
  const { page, pageSize } = clampPagination(
    input.pagination?.page ?? 1,
    input.pagination?.pageSize ?? DEFAULT_PAGE_SIZE,
  )
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? ROLES.LEARNER
  if (!isInstructorRole(role)) return { error: 'Forbidden' }

  // Determine courses user can report on.
  let coursesQuery = supabase.from('courses').select('id, title, course_code').order('title')
  if (role !== ROLES.ADMIN) coursesQuery = coursesQuery.eq('instructor_id', user.id)
  const { data: allowedCourses, error: cErr } = await coursesQuery
  if (cErr) return { error: cErr.message }

  const allowedCourseIds = new Set((allowedCourses ?? []).map((c) => c.id as string))
  const courseFilter = filters.courseId ?? 'all'
  if (courseFilter !== 'all' && !allowedCourseIds.has(courseFilter)) {
    return { error: 'Forbidden' }
  }

  const sessionType = normalizeSessionType(filters.sessionType)
  const presence = filters.presence ?? 'all'

  // Step 1: select relevant session modules (to allow course/type filtering).
  let modsQuery = supabase
    .from('modules')
    .select('id, title, type, week_index, course_id')
    .in('course_id', courseFilter === 'all' ? Array.from(allowedCourseIds) : [courseFilter])
    .in('type', sessionType === 'all' ? ['live_session', 'offline_session'] : [sessionType])

  const { data: mods, error: mErr } = await modsQuery
  if (mErr) return { error: mErr.message }

  const moduleRows = (mods ?? []) as {
    id: string
    title: string
    type: string
    week_index: number | null
    course_id: string
  }[]

  const moduleIds = moduleRows.map((m) => m.id)
  if (moduleIds.length === 0)
    return { rows: [], totalCount: 0, page: 1, pageSize, sessionAggregates: {} }

  const moduleById = new Map(
    moduleRows.map((m) => [
      m.id,
      {
        moduleId: m.id,
        moduleTitle: m.title,
        moduleType:
          m.type === 'offline_session' ? ('offline_session' as const) : ('live_session' as const),
        weekIndex: m.week_index ?? 1,
        courseId: m.course_id,
      },
    ]),
  )

  const courseById = new Map(
    (allowedCourses ?? []).map((c: any) => [
      c.id as string,
      { courseTitle: (c.title as string) ?? 'Course', courseCode: (c.course_code as string) ?? '' },
    ]),
  )

  // Step 2: optional learner search -> resolve learner ids.
  const learnerQuery = (filters.learnerQuery ?? '').trim()
  let learnerIdsFilter: string[] | null = null
  if (learnerQuery) {
    const { data: matches, error: pErr } = await supabase
      .from('profiles')
      .select('id')
      .ilike('full_name', `%${learnerQuery}%`)
      .limit(100)
    if (pErr) return { error: pErr.message }
    learnerIdsFilter = (matches ?? []).map((m) => m.id as string)
    if (learnerIdsFilter.length === 0)
      return { rows: [], totalCount: 0, page: 1, pageSize, sessionAggregates: {} }
  }

  function applyRosterFilters(q: any, moduleIdsList: string[]) {
    let rosterQuery = q.in('module_id', moduleIdsList)
    if (presence === 'present') rosterQuery = rosterQuery.eq('is_present', true)
    if (presence === 'absent') rosterQuery = rosterQuery.eq('is_present', false)
    if (learnerIdsFilter) rosterQuery = rosterQuery.in('learner_id', learnerIdsFilter)
    const fromIso = parseDayStartIso(filters.fromDate ?? '')
    const toIso = parseDayEndIso(filters.toDate ?? '')
    if (fromIso) rosterQuery = rosterQuery.gte('roster_submitted_at', fromIso)
    if (toIso) rosterQuery = rosterQuery.lte('roster_submitted_at', toIso)
    return rosterQuery
  }

  // Step 3a: exact count only (does not transfer row payloads).
  const countQuery = applyRosterFilters(
    supabase.from('module_session_roster').select('id', { count: 'exact', head: true }),
    moduleIds,
  )

  const { count: totalCountRaw, error: countErr } = await countQuery
  if (countErr) return { error: countErr.message }

  const totalCount = totalCountRaw ?? 0
  if (totalCount === 0) return { rows: [], totalCount: 0, page: 1, pageSize, sessionAggregates: {} }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const safePage = Math.min(page, totalPages)
  const fromIdx = (safePage - 1) * pageSize
  const toIdx = fromIdx + pageSize - 1

  // Step 3b: one page of roster rows.
  const rosterQuery = applyRosterFilters(
    supabase
      .from('module_session_roster')
      .select('id, module_id, learner_id, is_present, roster_submitted_at, updated_at'),
    moduleIds,
  )

  const { data: roster, error: rErr } = await rosterQuery
    .order('updated_at', { ascending: false })
    .range(fromIdx, toIdx)
  if (rErr) return { error: rErr.message }

  const rosterRows = (roster ?? []) as {
    id: string
    module_id: string
    learner_id: string
    is_present: boolean
    roster_submitted_at: string | null
    updated_at: string | null
  }[]

  if (rosterRows.length === 0)
    return { rows: [], totalCount, page: safePage, pageSize, sessionAggregates: {} }

  // Step 3c: full per-session counts for modules on this page (same filters, no pagination).
  const pageModuleIdSet = new Set(rosterRows.map((r) => r.module_id))
  const pageModuleIds = Array.from(pageModuleIdSet)
  const aggQuery = applyRosterFilters(
    supabase.from('module_session_roster').select('module_id, is_present, roster_submitted_at'),
    pageModuleIds,
  )
  const { data: aggRows, error: aggErr } = await aggQuery
  if (aggErr) return { error: aggErr.message }

  const sessionAggregates: Record<string, AttendanceSessionAggregate> = {}
  const byModule = new Map<
    string,
    { total: number; present: number; absent: number; submittedAts: string[] }
  >()
  for (const mid of pageModuleIds) {
    byModule.set(mid, { total: 0, present: 0, absent: 0, submittedAts: [] })
  }
  for (const raw of aggRows ?? []) {
    const row = raw as {
      module_id: string
      is_present: boolean
      roster_submitted_at: string | null
    }
    const acc = byModule.get(row.module_id)
    if (!acc) continue
    acc.total += 1
    if (row.is_present) acc.present += 1
    else acc.absent += 1
    if (row.roster_submitted_at) acc.submittedAts.push(row.roster_submitted_at)
  }
  for (const [mid, acc] of byModule) {
    const mod = moduleById.get(mid)
    if (!mod) continue
    const key = `${mod.courseId}:${mid}`
    let submittedAt: string | null = null
    for (const s of acc.submittedAts) {
      if (!submittedAt || new Date(s) > new Date(submittedAt)) submittedAt = s
    }
    sessionAggregates[key] = {
      total: acc.total,
      present: acc.present,
      absent: acc.absent,
      submittedAt,
    }
  }

  // Step 4: fetch learner names for the filtered roster.
  const learnerIds = Array.from(new Set(rosterRows.map((r) => r.learner_id)))
  const { data: profs, error: nErr } =
    learnerIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', learnerIds)
      : { data: [], error: null }
  if (nErr) return { error: nErr.message }
  const learnerNameById = new Map((profs ?? []).map((p: any) => [p.id as string, (p.full_name as string | null) ?? null]))

  const rows: AttendanceReportRow[] = rosterRows
    .map((r) => {
      const mod = moduleById.get(r.module_id)
      if (!mod) return null
      const courseMeta = courseById.get(mod.courseId)
      return {
        moduleId: mod.moduleId,
        moduleTitle: mod.moduleTitle,
        moduleType: mod.moduleType,
        weekIndex: mod.weekIndex,
        courseId: mod.courseId,
        courseTitle: courseMeta?.courseTitle ?? 'Course',
        courseCode: courseMeta?.courseCode ?? '',

        rosterRowId: r.id,
        learnerId: r.learner_id,
        learnerName: learnerNameById.get(r.learner_id) ?? null,
        isPresent: !!r.is_present,
        rosterSubmittedAt: r.roster_submitted_at ?? null,
        updatedAt: r.updated_at ?? null,
      } satisfies AttendanceReportRow
    })
    .filter(Boolean) as AttendanceReportRow[]

  return { rows, totalCount, page: safePage, pageSize, sessionAggregates }
}

type ModuleDetailResult = { rows: AttendanceReportRow[] } | { error: string }

/** Full roster for one session module (all enrolled learners). Same auth as prepareSessionRoster. */
export async function fetchAttendanceModuleDetail({
  courseId,
  moduleId,
}: {
  courseId: string
  moduleId: string
}): Promise<ModuleDetailResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role ?? ROLES.LEARNER
  if (!isInstructorRole(role)) return { error: 'Forbidden' }

  const { data: course, error: cErr } = await supabase
    .from('courses')
    .select('instructor_id, title, course_code')
    .eq('id', courseId)
    .single()
  if (cErr || !course) return { error: cErr?.message ?? 'Course not found' }
  if (role !== ROLES.ADMIN && course.instructor_id !== user.id) return { error: 'Forbidden' }

  const { data: mod, error: mErr } = await supabase
    .from('modules')
    .select('id, type, title, week_index, course_id')
    .eq('id', moduleId)
    .eq('course_id', courseId)
    .single()
  if (mErr || !mod) return { error: mErr?.message ?? 'Module not found' }
  if (mod.type !== 'live_session' && mod.type !== 'offline_session') {
    return { error: 'Invalid session lesson' }
  }

  const ensured = await ensureSessionRosterRows(supabase, moduleId, courseId)
  if (ensured.error) return { error: ensured.error }

  const { data: roster, error: rErr } = await supabase
    .from('module_session_roster')
    .select('id, module_id, learner_id, is_present, roster_submitted_at, updated_at')
    .eq('module_id', moduleId)
    .order('learner_id')

  if (rErr) return { error: rErr.message }

  const rosterList = (roster ?? []) as {
    id: string
    module_id: string
    learner_id: string
    is_present: boolean
    roster_submitted_at: string | null
    updated_at: string | null
  }[]

  const learnerIds = rosterList.map((r) => r.learner_id)
  const { data: profs, error: pErr } =
    learnerIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', learnerIds)
      : { data: [], error: null }
  if (pErr) return { error: pErr.message }

  const learnerNameById = new Map(
    (profs ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]),
  )

  const moduleType = mod.type === 'offline_session' ? 'offline_session' : 'live_session'
  const courseTitle = (course.title as string) ?? 'Course'
  const courseCode = (course.course_code as string) ?? ''

  const rows: AttendanceReportRow[] = rosterList.map((r) => ({
    moduleId,
    moduleTitle: (mod.title as string) ?? '',
    moduleType,
    weekIndex: (mod.week_index as number) ?? 1,
    courseId,
    courseTitle,
    courseCode,
    rosterRowId: r.id,
    learnerId: r.learner_id,
    learnerName: learnerNameById.get(r.learner_id) ?? null,
    isPresent: !!r.is_present,
    rosterSubmittedAt: r.roster_submitted_at ?? null,
    updatedAt: r.updated_at ?? null,
  }))

  return { rows }
}

