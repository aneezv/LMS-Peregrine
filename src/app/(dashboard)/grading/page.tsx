import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import GradingClient, { type GradingCourseOption } from './GradingClient'
import { PageHeader } from '@/components/ui/primitives'
import { ROLES, isStaffRole } from '@/lib/roles'

/** PostgREST builds long query strings for `.in(...)`; keep chunks well under proxy URL limits. */
const SUPABASE_IN_CHUNK = 40

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export type GradingRow = {
  submissionId: string
  assignmentId: string
  learnerId: string
  learnerName: string | null
  courseId: string
  courseTitle: string
  courseCode: string
  moduleTitle: string
  moduleType: string
  maxScore: number
  passingScore: number
  isTurnedIn: boolean
  turnedInAt: string | null
  submittedAt: string
  score: number | null
  feedback: string | null
  gradedAt: string | null
  isPassed: boolean | null
  primaryFileUrl: string | null
  files: { url: string; name: string }[]
}

function inferFileNameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname
    const last = pathname.split('/').filter(Boolean).pop()
    if (!last) return null
    const decoded = decodeURIComponent(last).trim()
    if (!decoded) return null

    // Ignore generic route segments from share links (e.g. /edit, /view, /open).
    const blocked = new Set(['edit', 'view', 'open', 'preview', 'u', 'd'])
    if (blocked.has(decoded.toLowerCase())) {
      const queryHints = ['filename', 'file', 'name', 'title']
      for (const key of queryHints) {
        const hint = parsed.searchParams.get(key)?.trim()
        if (hint) return hint
      }
      return null
    }

    return decoded
  } catch {
    return null
  }
}

export default async function GradingPage() {
  const supabase = await createClient()
  const admin = createAdminClient()
  const db = admin ?? supabase
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
  const role = profile?.role ?? ROLES.LEARNER
  if (!isStaffRole(role)) {
    redirect('/unauthorized')
  }

  let coursesQuery = db.from('courses').select('id, title, course_code').order('title')
  if (role === ROLES.INSTRUCTOR) {
    coursesQuery = coursesQuery.eq('instructor_id', user.id)
  }

  const { data: courses } = await coursesQuery

  const { data: subs } = await db
    .from('submissions')
    .select(
      'id, assignment_id, learner_id, is_turned_in, turned_in_at, submitted_at, score, feedback, graded_at, is_passed, file_url',
    )
    .order('submitted_at', { ascending: false })
    .limit(500)

  const submissionList = subs ?? []
  const assignmentIds = [...new Set(submissionList.map((s) => s.assignment_id))]

  let assignmentMap = new Map<
    string,
    {
      max_score: number
      passing_score: number
      moduleTitle: string
      moduleType: string
      courseId: string
      courseTitle: string
      courseCode: string
    }
  >()

  if (assignmentIds.length > 0) {
    const { data: asns } = await db
      .from('assignments')
      .select('id, max_score, passing_score, module_id')
      .in('id', assignmentIds)

    const moduleIds = [...new Set((asns ?? []).map((a) => a.module_id))]
    const { data: mods } = await db
      .from('modules')
      .select('id, title, type, course_id')
      .in('id', moduleIds)

    const courseIds = [...new Set((mods ?? []).map((m) => m.course_id))]
    const { data: crs } = await db.from('courses').select('id, title, course_code').in('id', courseIds)

    const courseMeta = new Map(
      (crs ?? []).map((c) => [c.id, { title: c.title, courseCode: c.course_code }]),
    )
    const modById = new Map(
      (mods ?? []).map((m) => {
        const meta = courseMeta.get(m.course_id)
        return [
          m.id,
          {
            title: m.title,
            type: m.type,
            courseId: m.course_id,
            courseTitle: meta?.title ?? 'Course',
            courseCode: meta?.courseCode ?? '',
          },
        ] as const
      }),
    )

    for (const a of asns ?? []) {
      const m = modById.get(a.module_id)
      if (!m) continue
      if (role === ROLES.INSTRUCTOR && !courses?.some((c) => c.id === m.courseId)) continue
      assignmentMap.set(a.id, {
        max_score: a.max_score,
        passing_score: a.passing_score,
        moduleTitle: m.title,
        moduleType: m.type,
        courseId: m.courseId,
        courseTitle: m.courseTitle,
        courseCode: m.courseCode,
      })
    }
  }

  const learnerIds = [...new Set(submissionList.map((s) => s.learner_id))]
  const nameByLearner = new Map<string, string | null>()
  for (const idChunk of chunkArray(learnerIds, SUPABASE_IN_CHUNK)) {
    const { data: profs, error: profErr } = await db
      .from('profiles')
      .select('id, full_name')
      .in('id', idChunk)
    if (!profErr) {
      for (const p of profs ?? []) nameByLearner.set(p.id, p.full_name)
    }
  }

  const subIds = submissionList.map((s) => s.id)
  const filesBySub = new Map<string, { url: string; name: string }[]>()
  if (subIds.length > 0) {
    const allSfiles: {
      submission_id: string
      file_url: string
      original_name: string | null
      sort_order: number
      created_at: string
    }[] = []

    for (const idChunk of chunkArray(subIds, SUPABASE_IN_CHUNK)) {
      const { data: sfiles, error: sfilesErr } = await db
        .from('submission_files')
        .select('submission_id, file_url, original_name, sort_order, created_at')
        .in('submission_id', idChunk)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (!sfilesErr) {
        allSfiles.push(...(sfiles ?? []))
      }
    }

    allSfiles.sort((a, b) => {
      if (a.submission_id !== b.submission_id) return a.submission_id.localeCompare(b.submission_id)
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      return String(a.created_at).localeCompare(String(b.created_at))
    })

    for (const f of allSfiles) {
      if (!f.file_url) continue
      const arr = filesBySub.get(f.submission_id) ?? []
      const explicit = typeof f.original_name === 'string' ? f.original_name.trim() : ''
      const inferred = inferFileNameFromUrl(f.file_url)
      const chosen = explicit || inferred || 'Submission'

      arr.push({ url: f.file_url, name: chosen })
      filesBySub.set(f.submission_id, arr)
    }
  }

  const rows: GradingRow[] = []
  for (const s of submissionList) {
    const meta = assignmentMap.get(s.assignment_id)
    if (!meta) continue

    const extra = filesBySub.get(s.id) ?? []
    const dedup = new Set<string>()
    let fileList: { url: string; name: string }[] = []
    if (extra.length > 0) {
      fileList = extra
    } else if (s.file_url) {
      const legacyName = inferFileNameFromUrl(s.file_url) ?? 'Submission'
      fileList = [{ url: s.file_url, name: legacyName }]
    }
    const files = fileList.filter((f) => {
      if (!f.url || dedup.has(f.url)) return false
      dedup.add(f.url)
      return true
    })

    rows.push({
      submissionId: s.id,
      assignmentId: s.assignment_id,
      learnerId: s.learner_id,
      learnerName: nameByLearner.get(s.learner_id) ?? null,
      courseId: meta.courseId,
      courseTitle: meta.courseTitle,
      courseCode: meta.courseCode,
      moduleTitle: meta.moduleTitle,
      moduleType: meta.moduleType,
      maxScore: meta.max_score,
      passingScore: meta.passing_score,
      isTurnedIn: s.is_turned_in,
      turnedInAt: s.turned_in_at,
      submittedAt: s.submitted_at,
      score: s.score,
      feedback: s.feedback,
      gradedAt: s.graded_at,
      isPassed: s.is_passed,
      primaryFileUrl: s.file_url,
      files,
    })
  }

  return (
    <div className="space-y-6 p-2">
      <PageHeader
        title="Assignment grading"
        description="Review submissions by course, open files in Google Drive, and enter scores."
      />
      <GradingClient courses={(courses ?? []) as GradingCourseOption[]} initialRows={rows} />
    </div>
  )
}
