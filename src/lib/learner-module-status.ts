import type { SupabaseClient } from '@supabase/supabase-js'

export type ModuleUiStatus = { 
  complete: boolean;
  overdue: boolean;
  in_grading?: boolean; // for assignments: submitted but not graded yet
}

type Mod = { id: string; type: string | null }

/**
 * Progress markers for syllabus UI: complete / overdue (assignments only).
 * Assignment complete: module_progress.is_completed and/or submission.graded_at (back-compat).
 * Quiz (mcq): complete when a quiz_attempt exists.
 * Feedback: complete when module_feedback_submissions exists.
 * External resource: complete when module_progress.is_completed (set when learner opens a link).
 */
export async function getLearnerModuleStatusMap(
  supabase: SupabaseClient,
  _courseId: string,
  learnerId: string,
  modules: Mod[],
): Promise<Record<string, ModuleUiStatus>> {
  void _courseId
  const out: Record<string, ModuleUiStatus> = {}
  for (const m of modules) {
    out[m.id] = {
      complete: false,
      overdue: false
     }
  }
  if (modules.length === 0) return out

  const moduleIds = modules.map((m) => m.id)

  const { data: progressRows } = await supabase
    .from('module_progress')
    .select('module_id, is_completed')
    .eq('learner_id', learnerId)
    .in('module_id', moduleIds)

  const progressByMod = new Map(
    (progressRows ?? []).map((r) => [r.module_id as string, !!(r as { is_completed: boolean }).is_completed]),
  )

  const mcqIds = modules.filter((m) => m.type === 'mcq').map((m) => m.id)
  const feedbackIds = modules.filter((m) => m.type === 'feedback').map((m) => m.id)

  const quizPassed = new Set<string>()
  if (mcqIds.length > 0) {
    const { data: attempts } = await supabase
      .from('quiz_attempts')
      .select('module_id, passed')
      .eq('learner_id', learnerId)
      .in('module_id', mcqIds)
    for (const a of attempts ?? []) {
      if ((a as { passed?: boolean }).passed) {
        quizPassed.add(a.module_id as string)
      }
    }
  }

  const feedbackDone = new Set<string>()
  if (feedbackIds.length > 0) {
    const { data: subs } = await supabase
      .from('module_feedback_submissions')
      .select('module_id')
      .eq('learner_id', learnerId)
      .in('module_id', feedbackIds)
    for (const s of subs ?? []) {
      feedbackDone.add(s.module_id as string)
    }
  }

  const assignmentMods = modules.filter((m) => m.type === 'assignment')
  const assignmentModuleIds = assignmentMods.map((m) => m.id)

  const assignIdByModule = new Map<string, string>()
  const deadlineByModule = new Map<string, string | null>()

  if (assignmentModuleIds.length > 0) {
    const { data: assigns } = await supabase
      .from('assignments')
      .select('id, module_id, deadline_at')
      .in('module_id', assignmentModuleIds)

    for (const a of assigns ?? []) {
      assignIdByModule.set(a.module_id as string, a.id as string)
      deadlineByModule.set(a.module_id as string, (a.deadline_at as string | null) ?? null)      
    }
  }

  const submissionByAssignment = new Map<string, { graded_at: string | null, submitted_at: string | null , is_turned_in: boolean }>()
  const assignmentIds = [...new Set([...assignIdByModule.values()])]
  if (assignmentIds.length > 0) {
    const { data: subs } = await supabase
      .from('submissions')
      .select('assignment_id, graded_at, submitted_at, is_turned_in')
      .eq('learner_id', learnerId)
      .in('assignment_id', assignmentIds)

    for (const s of subs ?? []) {
      submissionByAssignment.set(s.assignment_id as string, { 
        graded_at: (s.graded_at as string | null) ?? null,
        submitted_at: (s.submitted_at as string | null) ?? null,
        is_turned_in: !!(s as { is_turned_in?: boolean }).is_turned_in
      })
    }
  }

  const now = Date.now()
  for (const m of modules) {
    const pid = m.id
    const progDone = progressByMod.get(pid) ?? false

    if (m.type === 'external_resource') {
      out[pid] = { complete: progDone, overdue: false }
      continue
    }

    if (m.type === 'mcq') {
      out[pid] = { complete: quizPassed.has(pid), overdue: false }
      continue
    }

    if (m.type === 'feedback') {
      out[pid] = { complete: feedbackDone.has(pid), overdue: false }
      continue
    }

    if (m.type === 'assignment') {
      const aid = assignIdByModule.get(pid)
      const sub = aid ? submissionByAssignment.get(aid) : undefined
      const graded = !!sub?.graded_at
      const complete = progDone || graded
      const deadline = deadlineByModule.get(pid) ?? null
      const submitted = !!sub?.submitted_at;
      const is_turned_in = !!sub?.is_turned_in
      const in_grading = submitted && !graded && !is_turned_in;
      const overdue = !!deadline && !complete && !submitted && new Date(deadline).getTime() < now
      out[pid] = { complete, overdue, in_grading }
      continue
    }

    out[pid] = { complete: progDone, overdue: false }
  }

  return out
}
