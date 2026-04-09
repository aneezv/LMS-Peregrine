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
  selectedOptionId: string | null
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

  const submitQuiz = useCallback(async (isAuto = false) => {
    setConfirmOpen(false)
    setError('')
    if (!isAuto) {
      for (const q of questions) {
        if (!answersRef.current[q.id]) {
          setError('Please answer every question.')
          return
        }
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
          setTimeExpired(true)
          const allDone = questions.every((q) => !!answersRef.current[q.id])
          void submitQuizRef.current(true)
          window.localStorage.removeItem(draftKey)
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
  if (result) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}, [result]);

// begin of capturing effects related to unsaved progress warning

useEffect(() => {
  if (!quizStarted || result || submitting) return;

  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = ''; 
    return '';
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}, [quizStarted, result, submitting]);

useEffect(() => {
  if (!quizStarted || result) return;

  // Push a new state so the user has to click "Back" twice to leave
  window.history.pushState(null, '', window.location.href);

  const handlePopState = () => {
    const confirmLeave = window.confirm("You have a quiz in progress. Leaving will lose your progress. Are you sure?");
    if (!confirmLeave) {
      window.history.pushState(null, '', window.location.href);
    } else {
      window.history.back();
    }
  };

  window.addEventListener('popstate', handlePopState);
  return () => window.removeEventListener('popstate', handlePopState);
}, [quizStarted, result]);

useEffect(() => {
  if (!quizStarted || result) return;

  const handleInternalNavigation = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');

    if (anchor && anchor.href && !anchor.href.includes('#')) {
      const confirmLeave = window.confirm("Leave quiz? Progress will be lost.");
      if (!confirmLeave) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  };

  document.addEventListener('click', handleInternalNavigation, true);
  return () => document.removeEventListener('click', handleInternalNavigation, true);
}, [quizStarted, result]);

// end of capturing effects related to unsaved progress warning

  useEffect(() => {
    if (result || hasTimeLimit || !quizStarted) return
    window.localStorage.setItem(draftKey, JSON.stringify(answers))
  }, [answers, draftKey, result, hasTimeLimit, quizStarted])

  if (questions.length === 0) {
    return (
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Your instructor has not added quiz questions yet.
      </p>
    )
  }

  if (result) {
    return (
      <div className="mx-auto max-w-3xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* --- 1. RESULT HERO SECTION --- */}
        <div className={`relative overflow-hidden rounded-2xl border-2 p-6 sm:p-8 shadow-sm ${
          result.passed 
            ? 'border-emerald-200 bg-linear-to-br from-emerald-50 to-white' 
            : 'border-amber-200 bg-linear-to-br from-amber-50 to-white'
        }`}>
          {/* Decorative Background Icon */}
          <div className="absolute -right-8 -top-8 opacity-10">
            {result.passed ? <CheckCircle2 size={160} /> : <AlertCircle size={160} />}
          </div>

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-2">
              <h2 className={`text-2xl font-bold ${result.passed ? 'text-emerald-900' : 'text-amber-900'}`}>
                {result.passed ? 'Congratulations! You Passed' : 'Keep Practicing!'}
              </h2>
              <p className="text-slate-600 max-w-md text-sm sm:text-base">
                {submittedNow 
                  ? `You scored ${result.percentCorrect}% on this attempt.` 
                  : "This is your best saved attempt from previous sessions."
                } The passing threshold is <strong>{result.passingPct}%</strong>.
              </p>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className={`text-4xl font-black ${result.passed ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {result.score}<span className="text-xl font-medium text-slate-400">/{result.maxScore}</span>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Score</p>
              </div>
              
              <div className="h-12 w-px bg-slate-200 hidden sm:block" />

              {allowRetest ? (
                <button
                  type="button"
                  onClick={() => {
                    setResult(null)
                    setAnswers({})
                    setError('')
                    setReviewRows([])
                    setSubmittedNow(false)
                    setConfirmOpen(false)
                    setQuizStarted(false)
                    setStartedAt(Date.now())
                    setElapsedSec(0)
                    setTimeExpired(false)
                    timeUpHandledRef.current = false
                    setDeadlineAt(null)
                    setRemainingSec(0)
                    window.localStorage.removeItem(draftKey)
                  }}
                  className="rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 shadow-lg shadow-slate-200"
                >
                  Try Again
                </button>
              ) : (
                <p className="text-xs font-bold text-slate-400 uppercase">Retest Disabled</p>
              )}
            </div>
          </div>
        </div>

        {/* --- 2. ENHANCED REVIEW LIST (Only shows on immediate submit) --- */}
        {submittedNow && reviewRows.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-lg font-bold text-slate-800 uppercase tracking-tight">Review Answers</h3>
              <div className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                {reviewRows.filter(r => r.isCorrect).length} Correct / {reviewRows.length} Total
              </div>
            </div>

            <div className="grid gap-4">
              {reviewRows.map((row, idx) => (
                <div
                  key={row.questionId}
                  className={`group overflow-hidden rounded-2xl border transition-all ${
                    row.isCorrect 
                      ? 'border-slate-200 bg-white hover:border-emerald-200' 
                      : 'border-slate-200 bg-white hover:border-red-200 shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-4 p-4 sm:p-5">
                    {/* Number Indicator */}
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                      row.isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {idx + 1}
                    </div>
                    
                    <div className="flex-1 space-y-4">
                      <p className="text-base font-semibold leading-tight text-slate-800">
                        {row.prompt}
                      </p>

                      <div className="grid gap-3 sm:grid-cols-2">
                        {/* User Selection */}
                        <div className={`rounded-xl border p-3 ${
                          row.isCorrect 
                            ? 'border-emerald-100 bg-emerald-50/50' 
                            : 'border-red-100 bg-red-50/50'
                        }`}>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                            Your Answer
                          </p>
                          <div className="flex items-center gap-2">
                            {row.isCorrect ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-red-600" />
                            )}
                            <span className={`text-sm font-medium ${row.isCorrect ? 'text-emerald-900' : 'text-red-900'}`}>
                              {row.selectedLabel || "No answer provided"}
                            </span>
                          </div>
                        </div>

                        {/* Correct Answer (Show only if user was wrong) */}
                        {!row.isCorrect && (
                          <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                              Correct Answer
                            </p>
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              <span className="text-sm font-medium text-emerald-900">
                                {row.correctLabel}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ): null}
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
          <li>Your best quiz attempt will be used for grading.</li>
          {!allowRetest && <li>Retest is disabled for this quiz by your instructor.</li>}
          {hasTimeLimit && (
            <li>
              You have <strong>{timeLimitMinutes} minutes</strong> once you start.
            </li>
          )}
        </ul>
        <button
          type="button"
          onClick={() => {
            const now = Date.now()
            setAnswers({})
            window.localStorage.removeItem(draftKey)
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
      {timeExpired && !result && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 animate-pulse">
          Time&apos;s up! We are submitting your answers automatically...
        </div>
      )}
      <div className="fixed inset-x-0 top-0 z-50 rounded-none border-b border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur-md lg:sticky lg:top-18 lg:z-30 lg:mb-6 lg:rounded-xl lg:border lg:bg-slate-50/95">
        <div className="mx-auto max-w-3xl"> {/* Keeps content aligned with your quiz width */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">
              Progress
            </p>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 border border-slate-100">
                Answered {answeredCount}/{questions.length}
              </span>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${hasTimeLimit
                    ? remainingSec <= 300
                      ? `border-amber-500 bg-amber-100 text-amber-900 ${remainingSec <= 60 && remainingSec > 0 ? 'animate-pulse' : ''}`
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
              className="h-full rounded-full bg-cyan-600 transition-[width] duration-300 ease-in-out"
              style={{ width: `${questions.length ? Math.round((answeredCount / questions.length) * 100) : 0}%` }}
              aria-hidden
            />
          </div>
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
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition ${selected
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
            className="fixed inset-x-4 top-1/2 z-60 mx-auto w-full max-w-md -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
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
