import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────

/** Status flags for a single module, shown in the syllabus UI. */
export type ModuleUiStatus = {
  /** Module is fully completed (quiz passed, assignment graded+passed, video watched, etc.) */
  complete: boolean
  /** Assignment deadline has passed and learner hasn't submitted */
  overdue: boolean
  /** Assignment was submitted but hasn't been graded yet */
  in_grading?: boolean
  /** Assignment was graded but learner didn't reach the passing score */
  isFailed?: boolean
}

/** Minimal module shape needed to build the status map. */
type ModuleRef = { id: string; type: string | null }

// ─── Main Function ───────────────────────────────────────────

/**
 * Fetch completion status for every module in a course, for a single learner.
 *
 * Uses the `learner_module_status_v1` Postgres RPC (see refactor_03_rpcs_and_extras.sql).
 * This replaces the old implementation that made 5 sequential Supabase queries
 * (module_progress → quiz_attempts → feedback → assignments → submissions).
 *
 * The RPC does all the work in a single database round-trip:
 *   - Checks module_progress.is_completed for videos/documents/sessions
 *   - Checks quiz_attempts.passed for MCQ modules
 *   - Checks module_feedback_submissions for feedback modules
 *   - Checks assignments + submissions for assignment modules (graded, overdue, in_grading)
 *
 * @param supabase  - Authenticated Supabase client (the learner's session)
 * @param _courseId - Course ID (unused — kept for API compatibility)
 * @param _learnerId - Learner ID (unused — RPC uses auth.uid() internally)
 * @param modules  - Array of { id, type } for every module in the course
 * @returns A map of module ID → status flags
 */
export async function getLearnerModuleStatusMap(
  supabase: SupabaseClient,
  _courseId: string,
  _learnerId: string,
  modules: ModuleRef[],
): Promise<Record<string, ModuleUiStatus>> {
  // Build the default map — everything starts as incomplete
  const defaults: Record<string, ModuleUiStatus> = {}
  for (const m of modules) {
    defaults[m.id] = { complete: false, overdue: false }
  }

  // Nothing to check if the course has no modules
  if (modules.length === 0) return defaults

  // Call the server-side RPC (single round-trip instead of 5 queries)
  const moduleIds = modules.map((m) => m.id)
  const { data, error } = await supabase.rpc('learner_module_status_v1', {
    p_module_ids: moduleIds,
  })

  if (error) {
    console.error('[getLearnerModuleStatusMap] RPC error:', error.message)
    return defaults
  }

  // The RPC returns a JSON object keyed by module ID
  const rpcResult = (data ?? {}) as Record<
    string,
    { complete: boolean; overdue: boolean; in_grading: boolean; isFailed: boolean }
  >

  // Merge RPC results into the defaults map
  const result: Record<string, ModuleUiStatus> = {}
  for (const m of modules) {
    const rpc = rpcResult[m.id]
    if (rpc) {
      result[m.id] = {
        complete: !!rpc.complete,
        overdue: !!rpc.overdue,
        in_grading: !!rpc.in_grading,
        isFailed: !!rpc.isFailed,
      }
    } else {
      // Module wasn't in the RPC response — treat as incomplete
      result[m.id] = { complete: false, overdue: false }
    }
  }

  return result
}
