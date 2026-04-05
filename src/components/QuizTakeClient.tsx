'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export type QuizQuestionPublic = {
  id: string
  prompt: string
  options: { id: string; label: string }[]
}

export type QuizResult = {
  score: number
  maxScore: number
  passed: boolean
  percentCorrect: number
  passingPct: number
  bestAttemptKept?: boolean
}

type QuizReview = {
  questionId: string
  prompt: string
  selectedOptionId: string
  selectedLabel: string
  correctOptionId: string
  correctLabel: string
  isCorrect: boolean
}

type QuizSubmitResponse = QuizResult & { error?: string; review?: QuizReview[] }

function formatElapsed(totalSeconds: number) {
  const sec = Math.max(0, totalSeconds)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function QuizTakeClient({
  moduleId,
  questions,
  initialResult,
  allowRetest,
  introText,
  timeLimitMinutes = null,
  questionsRandomized = false,
}: {
  moduleId: string
  questions: QuizQuestionPublic[]
  initialResult: QuizResult | null
  allowRetest: boolean
  introText?: string
  /** When set, learner sees a countdown (browser-only enforcement). */
  timeLimitMinutes?: number | null
  /** Instructor enabled per-learner question shuffle (server already reordered `questions`). */
  questionsRandomized?: boolean
}) {
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const answersRef = useRef(answers)
  answersRef.current = answers
  const [result, setResult] = useState<QuizResult | null>(initialResult)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [quizStarted, setQuizStarted] = useState(false)
  const [startedAt, setStartedAt] = useState<number>(() => Date.now())
  const [elapsedSec, setElapsedSec] = useState(0)
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null)
  const [remainingSec, setRemainingSec] = useState(0)
  const [timeExpired, setTimeExpired] = useState(false)
  const timeUpHandledRef = useRef(false)
  const [reviewRows, setReviewRows] = useState<QuizReview[]>([])
  const [submittedNow, setSubmittedNow] = useState(false)
  const answeredCount = questions.reduce((acc, q) => acc + (answers[q.id] ? 1 : 0), 0)
  const unansweredCount = Math.max(0, questions.length - answeredCount)
  const draftKey = useMemo(() => `quiz-draft:${moduleId}`, [moduleId])
  const hasTimeLimit =
    timeLimitMinutes != null && Number.isFinite(timeLimitMinutes) && timeLimitMinutes >= 1

  const submitQuiz = useCallback(async () => {
    setConfirmOpen(false)
    setError('')
    for (const q of questions) {
      if (!answersRef.current[q.id]) {
        setError('Please answer every question.')
        return
      }
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId, answers: answersRef.current }),
      })
      const data = (await res.json().catch(() => ({}))) as QuizSubmitResponse
      if (!res.ok) {
        setError(data.error ?? 'Submit failed')
        return
      }
      setReviewRows(data.review ?? [])
      setSubmittedNow(true)
      setResult({
        score: data.score,
        maxScore: data.maxScore,
        passed: data.passed,
        percentCorrect: data.percentCorrect,
        passingPct: data.passingPct,
        bestAttemptKept: !!data.bestAttemptKept,
      })
      router.refresh()
      window.localStorage.removeItem(draftKey)
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }, [questions, moduleId, router, draftKey])

  const submitQuizRef = useRef(submitQuiz)
  submitQuizRef.current = submitQuiz

  useEffect(() => {
    if (result || !quizStarted || timeExpired) return
    const tick = () => {
      if (deadlineAt != null) {
        const rem = Math.max(0, Math.floor((deadlineAt - Date.now()) / 1000))
        setRemainingSec(rem)
        if (rem <= 0 && !timeUpHandledRef.current) {
          timeUpHandledRef.current = true
          const allDone = questions.every((q) => !!answersRef.current[q.id])
          if (allDone) {
            void submitQuizRef.current()
          } else {
            setTimeExpired(true)
            setError("Time's up. You did not answer every question before the limit.")
            window.localStorage.removeItem(draftKey)
          }
        }
      } else {
        setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
      }
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [startedAt, result, quizStarted, deadlineAt, timeExpired, questions])

  useEffect(() => {
    if (hasTimeLimit) return
    const raw = window.localStorage.getItem(draftKey)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as Record<string, string>
      setAnswers(parsed)
      setQuizStarted(true)
    } catch {
      window.localStorage.removeItem(draftKey)
    }
  }, [draftKey, hasTimeLimit])

  useEffect(() => {
    if (result || hasTimeLimit) return
    window.localStorage.setItem(draftKey, JSON.stringify(answers))
  }, [answers, draftKey, result, hasTimeLimit])

  if (questions.length === 0) {
    return (
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Your instructor has not added quiz questions yet.
      </p>
    )
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className={`rounded-xl border space-y-2 ${result.passed ? 'border-emerald-200 bg-emerald-50/70 ' : 'border-amber-200 bg-amber-50/70'} p-5 sm:p-6 `}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-900">
              {submittedNow ? 'Quiz evaluation' : 'Best saved result'}
            </p>
            <span className={`rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold ${result.passed ? 'text-emerald-700' : 'text-amber-700'}`}>
            {result.passed ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                You passed (passing bar: {result.passingPct}%).
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-medium text-amber-800">
                <AlertCircle className="h-4 w-4" />
                Failed ({result.passingPct}% required).
              </span>
            )}
            </span>
          </div>
          <p className={`text-sm ${result.passed ? 'text-emerald-800' : 'text-amber-800'}`}>
            Score: <strong>{result.score}</strong> / {result.maxScore} ({result.percentCorrect}% correct)
          </p>
          {allowRetest ? (
            <button
              type="button"
              onClick={() => {
                setResult(null)
                setAnswers({})
                setError('')
                setReviewRows([])
                setSubmittedNow(false)
                setQuizStarted(true)
                const now = Date.now()
                setStartedAt(now)
                setElapsedSec(0)
                setTimeExpired(false)
                timeUpHandledRef.current = false
                if (hasTimeLimit && timeLimitMinutes) {
                  const dl = now + timeLimitMinutes * 60_000
                  setDeadlineAt(dl)
                  setRemainingSec(Math.max(0, Math.floor((dl - Date.now()) / 1000)))
                } else {
                  setDeadlineAt(null)
                  setRemainingSec(0)
                }
                window.localStorage.removeItem(draftKey)
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
            >
              Retake quiz
            </button>
          ) : (
            <p className="text-xs font-medium text-slate-600">Retest is disabled for this quiz.</p>
          )}
        </div>

        {submittedNow && reviewRows.length > 0 && (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-900">Answer review</h4>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {reviewRows.filter((r) => r.isCorrect).length}/{reviewRows.length} correct
              </span>
            </div>
            <ul className="space-y-3">
              {reviewRows.map((row, idx) => (
                <li
                  key={row.questionId}
                  className={`rounded-xl border p-3 text-sm sm:p-4 ${
                    row.isCorrect
                      ? 'border-emerald-200 bg-emerald-50/50'
                      : 'border-amber-200 bg-amber-50/50'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium text-slate-900">
                      <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-700">
                        {idx + 1}
                      </span>
                      {row.prompt}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        row.isCorrect
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {row.isCorrect ? 'Correct' : 'Incorrect'}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1.5">
                    <p className={row.isCorrect ? 'text-emerald-700' : 'text-amber-800'}>
                      Your answer: <span className="font-semibold">{row.selectedLabel}</span>
                    </p>
                    {!row.isCorrect && (
                      <p className="text-emerald-700">
                        Correct answer: <span className="font-semibold">{row.correctLabel}</span>
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  function requestSubmit() {
    if (timeExpired) return
    setError('')
    for (const q of questions) {
      if (!answers[q.id]) {
        setError('Please answer every question.')
        return
      }
    }
    setConfirmOpen(true)
  }

  if (!quizStarted) {
    return (
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-lg font-semibold text-slate-900">Before you start</h3>
        {introText ? (
          <div className="rounded-lg border border-cyan-100 bg-cyan-50/60 px-3 py-2 text-sm whitespace-pre-wrap text-slate-700">
            {introText}
          </div>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Read each question carefully and choose one option.</li>
          <li>Submit only when all questions are answered.</li>
          <li>Your best quiz score is used for marks and pass status.</li>
          {!allowRetest && <li>Retest is disabled for this quiz by your instructor.</li>}
          {questionsRandomized && (
            <li className="font-medium text-slate-800">
              Questions are shown in a randomized order for you.
            </li>
          )}
          {!hasTimeLimit && (
            <li className="text-slate-500">
              Exam-style tip: ask your instructor to set a time limit (e.g. 60 minutes) and randomize
              questions in the course builder so answer keys are harder to share.
            </li>
          )}
          {hasTimeLimit && (
            <li>
              You have <strong>{timeLimitMinutes} minutes</strong> once you start. The timer counts down in
              your browser.
            </li>
          )}
        </ul>
        <button
          type="button"
          onClick={() => {
            const now = Date.now()
            setQuizStarted(true)
            setStartedAt(now)
            setElapsedSec(0)
            setTimeExpired(false)
            timeUpHandledRef.current = false
            if (hasTimeLimit && timeLimitMinutes) {
              const dl = now + timeLimitMinutes * 60_000
              setDeadlineAt(dl)
              setRemainingSec(Math.floor((dl - now) / 1000))
            } else {
              setDeadlineAt(null)
              setRemainingSec(0)
            }
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700"
        >
          Start Quiz
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {timeExpired && (
        <div
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900"
          role="alert"
        >
          Time&apos;s up. Your answers were not submitted. Contact your instructor if you need another
          attempt.
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">
            Exam mode
            {hasTimeLimit ? (
              <span className="ml-2 font-normal text-slate-600">· Timed</span>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
              Answered {answeredCount}/{questions.length}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                hasTimeLimit
                  ? remainingSec <= 120
                    ? 'border-amber-400 bg-amber-50 text-amber-900'
                    : 'border-slate-200 bg-white text-slate-600'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {hasTimeLimit ? `Time left ${formatElapsed(remainingSec)}` : `Elapsed ${formatElapsed(elapsedSec)}`}
            </span>
          </div>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-slate-200 bg-white">
          <div
            className="h-full rounded-full bg-cyan-600 transition-[width] duration-200"
            style={{ width: `${questions.length ? Math.round((answeredCount / questions.length) * 100) : 0}%` }}
            aria-hidden
          />
        </div>
      </div>

      {questions.map((q, qi) => (
        <div
          key={q.id}
          className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${timeExpired ? 'pointer-events-none opacity-60' : ''}`}
        >
          <p className="mb-3 font-medium text-slate-900">
            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
              {qi + 1}
            </span>
            {q.prompt}
          </p>
          <ul className="space-y-2">
            {q.options.map((o, oi) => {
              const selected = answers[q.id] === o.id
              const optionLetter = String.fromCharCode(65 + oi)
              return (
                <li key={o.id}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                      selected
                        ? 'border-cyan-400 bg-cyan-50 text-cyan-900'
                        : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      className="mt-1"
                      disabled={timeExpired}
                      checked={answers[q.id] === o.id}
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: o.id }))}
                    />
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-slate-500">
                      {optionLetter}
                    </span>
                    <span>{o.label}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
        {unansweredCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-amber-700">
            <AlertCircle className="h-4 w-4" />
            {unansweredCount} question{unansweredCount === 1 ? '' : 's'} unanswered.
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            All questions answered. Ready to submit.
          </span>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="hidden lg:block">
        <button
          type="button"
          onClick={requestSubmit}
          disabled={submitting || timeExpired}
          className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-lg transition"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Submit quiz
        </button>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <p className="text-xs text-slate-600">
            Answered <span className="font-semibold text-slate-800">{answeredCount}</span>/{questions.length}
          </p>
          <button
            type="button"
            onClick={requestSubmit}
            disabled={submitting || timeExpired}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit
          </button>
        </div>
      </div>

      {confirmOpen && (
        <>
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="fixed inset-0 z-50 bg-slate-900/40"
            aria-label="Close submit confirmation"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-x-4 top-1/2 z-[60] mx-auto w-full max-w-md -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <h3 className="text-base font-semibold text-slate-900">Submit quiz?</h3>
            <p className="mt-2 text-sm text-slate-600">
              This submission will be checked now. Marks and pass status use your best attempt.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitQuiz()}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm submit
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
