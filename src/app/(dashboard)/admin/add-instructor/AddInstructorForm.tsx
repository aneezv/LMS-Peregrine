'use client'

import { useActionState, useEffect, useRef } from 'react'
import { AppButton, AppCard } from '@/components/ui/primitives'
import { createInstructorAccount, type CreateInstructorState } from './actions'

const initialState: CreateInstructorState = { ok: null, error: null }

export default function AddInstructorForm() {
  const [state, formAction, pending] = useActionState(createInstructorAccount, initialState)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.ok === true) {
      formRef.current?.reset()
    }
  }, [state.ok])

  return (
    <AppCard className="p-4 sm:p-6">
      <form ref={formRef} action={formAction} className="flex flex-col gap-4">
        <div>
          <label htmlFor="add-inst-name" className="mb-1 block text-sm font-medium text-slate-700">
            Full name
          </label>
          <input
            id="add-inst-name"
            name="name"
            type="text"
            required
            autoComplete="name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Jane Instructor"
          />
        </div>
        <div>
          <label htmlFor="add-inst-email" className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="add-inst-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="instructor@school.edu"
          />
        </div>
        <div>
          <label htmlFor="add-inst-pass" className="mb-1 block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="add-inst-pass"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="At least 8 characters"
          />
        </div>

        {state.error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.ok === true ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
            Instructor account created. They can sign in with this email and password.
          </p>
        ) : null}

        <AppButton type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create instructor account'}
        </AppButton>
      </form>
    </AppCard>
  )
}
