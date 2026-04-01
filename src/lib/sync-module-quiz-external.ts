import type { createClient } from '@/utils/supabase/client'

export type ExternalLinkRow = { label: string; url: string }

export type QuizOptRow = { label: string; is_correct: boolean }

export type QuizQuestionRow = { prompt: string; options: QuizOptRow[] }

type Supabase = ReturnType<typeof createClient>

/**
 * Replaces module_external_links and quiz graph for a module after the module row is saved.
 */
export async function syncQuizAndExternalForModule(
  supabase: Supabase,
  moduleId: string,
  moduleType: string,
  externalLinks: ExternalLinkRow[],
  quizQuestions: QuizQuestionRow[],
) {
  await supabase.from('module_external_links').delete().eq('module_id', moduleId)

  if (moduleType === 'external_resource') {
    const rows = externalLinks
      .map((l, i) => ({
        module_id: moduleId,
        label: l.label.trim() || null,
        url: l.url.trim(),
        sort_order: i,
      }))
      .filter((r) => r.url.length > 0)
    if (rows.length > 0) {
      const { error } = await supabase.from('module_external_links').insert(rows)
      if (error) throw error
    }
  }

  await supabase.from('quiz_questions').delete().eq('module_id', moduleId)

  if (moduleType !== 'mcq') return

  let qOrder = 0
  for (const q of quizQuestions) {
    const prompt = q.prompt.trim()
    if (!prompt) continue
    const opts = q.options.filter((o) => o.label.trim())
    if (opts.length === 0) continue
    const { data: qRow, error: qErr } = await supabase
      .from('quiz_questions')
      .insert({
        module_id: moduleId,
        prompt,
        sort_order: qOrder++,
      })
      .select('id')
      .single()
    if (qErr || !qRow) throw qErr ?? new Error('Failed to insert quiz question')
    let oOrder = 0
    for (const o of opts) {
      const { error: oErr } = await supabase.from('quiz_options').insert({
        question_id: qRow.id,
        label: o.label.trim(),
        is_correct: !!o.is_correct,
        sort_order: oOrder++,
      })
      if (oErr) throw oErr
    }
  }
}
