'use client'

import React, { useState } from 'react'
import { ModuleItem, newClientId } from '../types'
import { Label, FieldInput, FieldTextarea } from '../FormFields'
import { parseQuizCsv } from '@/lib/parse-quiz-csv'
import { Plus, Trash2, Upload, HelpCircle, Clock, Shuffle, CheckCircle2 } from 'lucide-react'

interface QuizEditorProps {
  module: ModuleItem
  onUpdate: (patch: Partial<ModuleItem>) => void
}

export function QuizEditor({ module, onUpdate }: QuizEditorProps) {
  const [quizCsvPaste, setQuizCsvPaste] = useState('')
  const [quizCsvWarnings, setQuizCsvWarnings] = useState<string[]>([])
  const [csvTabOpen, setCsvTabOpen] = useState(false)

  const patchQuestions = (
    patchFn: (qs: ModuleItem['quiz_questions']) => ModuleItem['quiz_questions'],
  ) => {
    onUpdate({ quiz_questions: patchFn(module.quiz_questions) })
  }

  const addQuestion = () => {
    patchQuestions((qs) => [
      ...qs,
      {
        id: newClientId(),
        prompt: '',
        options: [
          { id: newClientId(), label: '', is_correct: true },
          { id: newClientId(), label: '', is_correct: false },
        ],
      },
    ])
  }

  const updateQuestionPrompt = (qid: string, prompt: string) => {
    patchQuestions((qs) => qs.map((q) => (q.id === qid ? { ...q, prompt } : q)))
  }

  const removeQuestion = (qid: string) => {
    patchQuestions((qs) => qs.filter((q) => q.id !== qid))
  }

  const addOption = (qid: string) => {
    patchQuestions((qs) =>
      qs.map((q) =>
        q.id === qid
          ? { ...q, options: [...q.options, { id: newClientId(), label: '', is_correct: false }] }
          : q,
      ),
    )
  }

  const updateOptionLabel = (qid: string, oid: string, label: string) => {
    patchQuestions((qs) =>
      qs.map((q) =>
        q.id === qid
          ? { ...q, options: q.options.map((o) => (o.id === oid ? { ...o, label } : o)) }
          : q,
      ),
    )
  }

  const setCorrectOption = (qid: string, oid: string) => {
    patchQuestions((qs) =>
      qs.map((q) =>
        q.id === qid
          ? { ...q, options: q.options.map((o) => ({ ...o, is_correct: o.id === oid })) }
          : q,
      ),
    )
  }

  const removeOption = (qid: string, oid: string) => {
    patchQuestions((qs) =>
      qs.map((q) => {
        if (q.id !== qid) return q
        const next = q.options.filter((o) => o.id !== oid)
        if (next.length === 0) return q
        if (!next.some((o) => o.is_correct)) next[0] = { ...next[0], is_correct: true }
        return { ...q, options: next }
      }),
    )
  }

  const appendQuestionsFromCsv = (text: string) => {
    const res = parseQuizCsv(text)
    setQuizCsvWarnings(res.warnings)
    if (res.questions.length === 0) return
    patchQuestions((qs) => [
      ...qs,
      ...res.questions.map((q) => ({
        id: newClientId(),
        prompt: q.prompt,
        options: q.options.map((o) => ({
          id: newClientId(),
          label: o.label,
          is_correct: o.is_correct,
        })),
      })),
    ])
  }

  return (
    <div className="space-y-6">
      {/* Quiz Introduction */}
      <div>
        <Label>Quiz Instructions / Overview</Label>
        <FieldTextarea
          value={module.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          rows={3}
          placeholder="Brief instructions, test rules, or context for learners before they begin."
        />
      </div>

      {/* Quiz Grading & Rules */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <Label>Passing Score (% Correct)</Label>
          <div className="flex items-center gap-2">
            <FieldInput
              type="number"
              min={0}
              max={100}
              value={module.quiz_passing_pct}
              onChange={(e) =>
                onUpdate({
                  quiz_passing_pct: Math.min(
                    100,
                    Math.max(0, Math.trunc(Number(e.target.value)) || 0),
                  ),
                })
              }
              className="max-w-28"
            />
            <span className="text-sm font-medium text-slate-600">% required to pass</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Learners receive their pass/fail status immediately upon submitting.
          </p>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div>
            <Label>Retest Policy</Label>
            <label className="mt-1 flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={module.quiz_allow_retest}
                onChange={(e) => onUpdate({ quiz_allow_retest: e.target.checked })}
              />
              <span className="text-sm font-medium text-slate-800">
                Allow learners to retake this quiz
              </span>
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {module.quiz_allow_retest
              ? 'Learners can take this quiz multiple times; highest score is recorded.'
              : 'Learners are restricted to a single attempt.'}
          </p>
        </div>
      </div>

      {/* Exam-Style Timers & Randomization */}
      <div className="rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4 shadow-2xs">
        <div className="flex items-center gap-2 text-cyan-950">
          <Clock className="h-4 w-4 text-cyan-700" />
          <h4 className="text-sm font-semibold">Exam-Style Controls</h4>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-cyan-900">Time Limit (Minutes)</Label>
            <FieldInput
              type="number"
              min={1}
              max={1440}
              placeholder="No limit (leave blank)"
              value={module.quiz_time_limit_minutes ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim()
                if (v === '') {
                  onUpdate({ quiz_time_limit_minutes: null })
                  return
                }
                const n = Math.trunc(Number(v))
                if (!Number.isFinite(n) || n < 1) {
                  onUpdate({ quiz_time_limit_minutes: null })
                  return
                }
                onUpdate({ quiz_time_limit_minutes: Math.min(1440, n) })
              }}
              className="bg-white"
            />
            <p className="mt-1 text-xs text-cyan-800/80">
              Live countdown timer displayed for learners during the quiz.
            </p>
          </div>

          <div>
            <Label className="text-cyan-900">Question Order</Label>
            <label className="mt-2 flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-cyan-300 text-cyan-600 focus:ring-cyan-500"
                checked={module.quiz_randomize_questions}
                onChange={(e) => onUpdate({ quiz_randomize_questions: e.target.checked })}
              />
              <span className="text-sm font-medium text-slate-800">
                Randomize question order
              </span>
            </label>
            <p className="mt-1.5 text-xs text-cyan-800/80">
              Shuffles questions deterministically per learner to prevent simple answer copying.
            </p>
          </div>
        </div>
      </div>

      {/* Bulk CSV Importer Section */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-slate-600" />
            <span className="text-sm font-semibold text-slate-800">Bulk CSV Question Import</span>
          </div>
          <button
            type="button"
            onClick={() => setCsvTabOpen(!csvTabOpen)}
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            {csvTabOpen ? 'Hide CSV tool' : 'Show CSV importer'}
          </button>
        </div>

        {csvTabOpen && (
          <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-600 leading-relaxed">
              Format header row:{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-800">
                Question Text, Correct Answer, Option A, Option B, Option C, ...
              </code>
              . Correct answer can be the letter (e.g. <code>A</code>, <code>B</code>) or exact text.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs">
                <Upload className="h-3.5 w-3.5" />
                Upload CSV File
                <input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (!f) return
                    const reader = new FileReader()
                    reader.onload = () => {
                      appendQuestionsFromCsv(String(reader.result ?? ''))
                    }
                    reader.readAsText(f)
                  }}
                />
              </label>
            </div>

            <FieldTextarea
              value={quizCsvPaste}
              onChange={(e) => setQuizCsvPaste(e.target.value)}
              rows={3}
              placeholder="Or paste CSV rows directly here..."
              className="font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => {
                appendQuestionsFromCsv(quizCsvPaste)
                setQuizCsvPaste('')
              }}
              className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-black transition"
            >
              Parse & Append Questions
            </button>

            {quizCsvWarnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-semibold mb-1">Notice during parsing:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {quizCsvWarnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Interactive Question Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              Questions ({module.quiz_questions.length})
            </h4>
            <p className="text-xs text-slate-500">Add questions and specify the single correct answer.</p>
          </div>
          <button
            type="button"
            onClick={addQuestion}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Question
          </button>
        </div>

        {module.quiz_questions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
            <HelpCircle className="h-8 w-8 text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-700">No questions in this quiz yet</p>
            <p className="text-xs text-slate-500 mt-0.5 max-w-sm">
              Add questions manually using the button above or use the bulk CSV importer.
            </p>
            <button
              type="button"
              onClick={addQuestion}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
            >
              <Plus className="h-3.5 w-3.5 text-blue-600" />
              Add First Question
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {module.quiz_questions.map((q, qIdx) => (
              <div
                key={q.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-slate-300 space-y-3.5"
              >
                {/* Question Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-100 text-[11px] font-bold text-cyan-800">
                      {qIdx + 1}
                    </span>
                    <span className="text-xs font-semibold text-slate-800">Question {qIdx + 1}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeQuestion(q.id)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                    title="Delete question"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Question Prompt */}
                <div>
                  <FieldTextarea
                    value={q.prompt}
                    onChange={(e) => updateQuestionPrompt(q.id, e.target.value)}
                    rows={2}
                    placeholder="Enter the question prompt here..."
                  />
                </div>

                {/* Options List */}
                <div className="space-y-2 pt-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Options & Correct Answer
                  </span>
                  <div className="space-y-2">
                    {q.options.map((opt, optIdx) => (
                      <div key={opt.id} className="flex items-center gap-2">
                        <label
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border cursor-pointer transition ${
                            opt.is_correct
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-600 shadow-2xs'
                              : 'border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300'
                          }`}
                          title="Mark as correct answer"
                        >
                          <input
                            type="radio"
                            name={`correct-${q.id}`}
                            checked={opt.is_correct}
                            onChange={() => setCorrectOption(q.id, opt.id)}
                            className="sr-only"
                          />
                          {opt.is_correct ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <span className="text-xs font-bold uppercase">{String.fromCharCode(65 + optIdx)}</span>
                          )}
                        </label>

                        <FieldInput
                          value={opt.label}
                          onChange={(e) => updateOptionLabel(q.id, opt.id, e.target.value)}
                          placeholder={`Option ${String.fromCharCode(65 + optIdx)} text...`}
                          className={opt.is_correct ? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20' : ''}
                        />

                        <button
                          type="button"
                          onClick={() => removeOption(q.id, opt.id)}
                          disabled={q.options.length <= 2}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none transition"
                          title="Delete option"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => addOption(q.id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline pt-1"
                  >
                    <Plus className="h-3 w-3" /> Add another option
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
