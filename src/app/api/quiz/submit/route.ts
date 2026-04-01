import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

type Body = { moduleId?: string; answers?: Record<string, string> }
type ReviewRow = {
  questionId: string
  prompt: string
  selectedOptionId: string
  selectedLabel: string
  correctOptionId: string
  correctLabel: string
  isCorrect: boolean
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const moduleId = body.moduleId?.trim()
  const answers = body.answers ?? {}
  if (!moduleId) {
    return NextResponse.json({ error: 'moduleId required' }, { status: 400 })
  }

  const { data: mod, error: modErr } = await supabase
    .from('modules')
    .select('id, type, course_id, quiz_passing_pct, quiz_allow_retest')
    .eq('id', moduleId)
    .single()

  if (modErr || !mod || mod.type !== 'mcq') {
    return NextResponse.json({ error: 'Lesson not found or not a quiz' }, { status: 404 })
  }

  const { data: enr } = await supabase
    .from('enrollments')
    .select('id')
    .eq('course_id', mod.course_id)
    .eq('learner_id', user.id)
    .maybeSingle()

  if (!enr) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 403 })
  }

  const { data: questions, error: qErr } = await supabase
    .from('quiz_questions')
    .select('id, prompt')
    .eq('module_id', moduleId)

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 })
  }

  const questionRows = questions ?? []
  if (questionRows.length === 0) {
    return NextResponse.json({ error: 'This quiz has no questions yet' }, { status: 400 })
  }

  const qIds = new Set(questionRows.map((q) => q.id as string))
  const promptByQ = new Map(
    questionRows.map((q) => [q.id as string, (q.prompt as string) ?? 'Question']),
  )
  for (const qid of qIds) {
    if (!answers[qid] || typeof answers[qid] !== 'string') {
      return NextResponse.json({ error: 'Answer every question' }, { status: 400 })
    }
  }
  for (const k of Object.keys(answers)) {
    if (!qIds.has(k)) {
      return NextResponse.json({ error: 'Invalid question id' }, { status: 400 })
    }
  }

  const { data: allOpts, error: optErr } = await supabase
    .from('quiz_options')
    .select('id, question_id, is_correct, label')
    .in(
      'question_id',
      [...qIds],
    )

  if (optErr || !allOpts) {
    return NextResponse.json({ error: optErr?.message ?? 'Load options failed' }, { status: 500 })
  }

  const optsByQ = new Map<string, { id: string; is_correct: boolean; label: string }[]>()
  for (const o of allOpts) {
    const qid = o.question_id as string
    if (!optsByQ.has(qid)) optsByQ.set(qid, [])
    optsByQ.get(qid)!.push({
      id: o.id as string,
      is_correct: !!(o as { is_correct: boolean }).is_correct,
      label: (o.label as string) ?? '',
    })
  }

  const review: ReviewRow[] = []
  let score = 0
  const maxScore = questionRows.length

  for (const q of questionRows) {
    const qid = q.id as string
    const picked = answers[qid]
    const allowed = optsByQ.get(qid) ?? []
    const ok = allowed.some((o) => o.id === picked)
    if (!ok) {
      return NextResponse.json({ error: 'Invalid answer for a question' }, { status: 400 })
    }
    const chosen = allowed.find((o) => o.id === picked)
    const correct = allowed.find((o) => o.is_correct)
    if (!correct) {
      return NextResponse.json({ error: 'Quiz question has no correct option configured' }, { status: 400 })
    }
    if (chosen?.is_correct) score++
    review.push({
      questionId: qid,
      prompt: promptByQ.get(qid) ?? 'Question',
      selectedOptionId: picked,
      selectedLabel: chosen?.label ?? 'Selected option',
      correctOptionId: correct.id,
      correctLabel: correct.label,
      isCorrect: !!chosen?.is_correct,
    })
  }

  const pct = maxScore > 0 ? Math.round((score * 100) / maxScore) : 0
  const passing = mod.quiz_passing_pct ?? 60
  const passed = maxScore > 0 && pct >= passing

  const { data: existingBest, error: existingErr } = await supabase
    .from('quiz_attempts')
    .select('id, score, max_score, passed')
    .eq('module_id', moduleId)
    .eq('learner_id', user.id)
    .order('score', { ascending: false })
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 })
  }

  const allowRetest = (mod.quiz_allow_retest as boolean | null) ?? true
  if (!allowRetest && existingBest) {
    return NextResponse.json(
      { error: 'Retest is disabled for this quiz by your instructor.' },
      { status: 403 },
    )
  }

  const shouldReplaceBest =
    !existingBest ||
    score > ((existingBest.score as number) ?? 0) ||
    score === ((existingBest.score as number) ?? 0)

  let attemptId = existingBest?.id as string | undefined
  if (!existingBest) {
    const { data: inserted, error: insErr } = await supabase
      .from('quiz_attempts')
      .insert({
        module_id: moduleId,
        learner_id: user.id,
        score,
        max_score: maxScore,
        passed,
      })
      .select('id')
      .single()

    if (insErr || !inserted) {
      return NextResponse.json({ error: insErr?.message ?? 'Could not save attempt' }, { status: 500 })
    }
    attemptId = inserted.id as string
  } else if (shouldReplaceBest) {
    const { error: upErr } = await supabase
      .from('quiz_attempts')
      .update({
        score,
        max_score: maxScore,
        passed,
        submitted_at: new Date().toISOString(),
      })
      .eq('id', existingBest.id)

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }
  }

  const bestScore = shouldReplaceBest ? score : ((existingBest?.score as number) ?? score)
  const bestMaxScore = shouldReplaceBest ? maxScore : ((existingBest?.max_score as number) ?? maxScore)
  const bestPassed = shouldReplaceBest ? passed : !!existingBest?.passed
  const bestPct = bestMaxScore > 0 ? Math.round((bestScore * 100) / bestMaxScore) : 0

  if (!attemptId) {
    return NextResponse.json({ error: 'Could not resolve attempt record' }, { status: 500 })
  }

  const insAnswers = review.map((r) => ({
    attempt_id: attemptId,
    question_id: r.questionId,
    option_id: r.selectedOptionId,
  }))

  const { error: ansErr } = await supabase
    .from('quiz_attempt_answers')
    .upsert(insAnswers, { onConflict: 'attempt_id,question_id' })

  if (ansErr) {
    return NextResponse.json({ error: ansErr.message }, { status: 500 })
  }

  return NextResponse.json({
    score,
    maxScore,
    passed,
    passingPct: passing,
    percentCorrect: pct,
    bestAttemptKept: !shouldReplaceBest && !!existingBest,
    bestScore,
    bestMaxScore,
    bestPassed,
    bestPercentCorrect: bestPct,
    review,
  })
}
