'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { queryKeys } from '@/lib/query/query-keys'
import { fetchWithRetry } from '@/lib/network-retry'

export default function FeedbackSubmitClient({
  moduleId,
  submittedInitially,
}: {
  moduleId: string
  submittedInitially: boolean
}) {
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const [done, setDone] = useState(submittedInitially)
  const [error, setError] = useState('')

  const submitMutation = useMutation({
    mutationFn: async (trimmedBody: string) => {
      const res = await fetchWithRetry('/api/feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId, body: trimmedBody }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Submit failed')
      return data
    },
    onSuccess: async () => {
      setDone(true)
      queryClient.setQueryData(queryKeys.moduleProgress({ moduleId }), { completed: true })
      await queryClient.invalidateQueries({ queryKey: queryKeys.feedbackStatus({ moduleId }) })
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Network error')
    },
  })

  if (done) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-5">
        <p className="font-medium text-rose-900">Thank you — your feedback has been submitted.</p>
      </div>
    )
  }

  async function submit() {
    const t = body.trim()
    if (!t) {
      setError('Please enter your feedback.')
      return
    }
    setError('')
    await submitMutation.mutateAsync(t)
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-700">Your feedback</label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        placeholder="Share your thoughts…"
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={submitMutation.isPending}
        className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-lg transition"
      >
        {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Submit feedback
      </button>
    </div>
  )
}
