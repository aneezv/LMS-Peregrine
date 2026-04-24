'use server'

import { createClient } from '@/utils/supabase/server'
import { ROLES, isStaffRole } from '@/lib/roles'
import { revalidatePath } from 'next/cache'

// ─── Types ───────────────────────────────────────────────────

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

export type GradingFilters = {
  courseId: string | 'all'
  status: 'all' | 'turned_in' | 'draft' | 'graded'
  learnerQuery: string
}

export type GradingPagination = {
  page: number
  pageSize: number
}

export type GradingCourseOption = {
  id: string
  title: string
  course_code: string
}

// ─── Fetch grading data (single RPC call) ────────────────────

/**
 * Fetches paginated grading submissions using the `grading_fetch_v1` Postgres RPC.
 *
 * The RPC handles everything server-side in one query:
 *   - Authorization (role + course ownership check)
 *   - Joins: submissions → assignments → modules → courses → profiles → submission_files
 *   - Filtering by course, status, and learner name search
 *   - Pagination with total count
 *
 * This replaces the old implementation which made 9 sequential queries and
 * required the admin client (service role key) to bypass RLS.
 */
export async function fetchGradingData(
  filters: GradingFilters,
  pagination: GradingPagination,
): Promise<{ rows: GradingRow[]; totalCount: number; page: number; pageSize: number } | { error: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('grading_fetch_v1', {
    p_course_id: filters.courseId,
    p_status: filters.status,
    p_learner_query: filters.learnerQuery,
    p_page: pagination.page,
    p_page_size: pagination.pageSize,
  })

  if (error) {
    console.error('[fetchGradingData] RPC error:', error.message)
    return { error: error.message }
  }

  // The RPC returns jsonb — check for embedded error
  const result = data as {
    error?: string
    rows: GradingRow[]
    totalCount: number
    page: number
    pageSize: number
  }

  if (result.error) {
    return { error: result.error }
  }

  return {
    rows: result.rows ?? [],
    totalCount: result.totalCount ?? 0,
    page: result.page ?? pagination.page,
    pageSize: result.pageSize ?? pagination.pageSize,
  }
}

// ─── Bulk grade submissions ──────────────────────────────────

/**
 * Updates scores and feedback for multiple submissions at once.
 *
 * Uses the existing `bulk_update_submissions_v1` RPC if available,
 * otherwise falls back to individual updates.
 */
export async function bulkUpdateGrades(
  grades: { submissionId: string; score: number; feedback: string | null }[],
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role ?? ROLES.LEARNER
  if (!isStaffRole(role)) return { error: 'Forbidden' }

  // Look up passing_score for each assignment to compute is_passed
  const subIds = grades.map((g) => g.submissionId)
  const { data: subsData } = await supabase
    .from('submissions')
    .select('id, assignment_id')
    .in('id', subIds)

  const asnIds = [...new Set((subsData ?? []).map((s) => s.assignment_id))]
  const { data: asnsData } = await supabase
    .from('assignments')
    .select('id, passing_score')
    .in('id', asnIds)

  const asnMap = new Map((asnsData ?? []).map((a) => [a.id, a.passing_score]))
  const subToAsn = new Map((subsData ?? []).map((s) => [s.id, s.assignment_id]))

  const ts = new Date().toISOString()
  const updates = grades.map((g) => {
    const asnId = subToAsn.get(g.submissionId)
    const passingScore = asnId ? asnMap.get(asnId) ?? 60 : 60
    return {
      submissionId: g.submissionId,
      score: g.score,
      feedback: g.feedback,
      gradedAt: ts,
      isPassed: g.score >= passingScore,
    }
  })

  const { error } = await supabase.rpc('bulk_update_submissions_v1', {
    p_updates: updates,
  })
  if (error) return { error: error.message }

  revalidatePath('/grading')
  return { ok: true }
}
