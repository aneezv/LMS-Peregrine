'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { KeyRound } from 'lucide-react'
import { AppButton } from '@/components/ui/primitives'
import { ErrorAlert } from '@/components/ui/error-alert'
import { updatePassword } from '../actions'
import { initialSettingsState } from '../state'
import Modal from './Modal'

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

function PasswordFields({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(updatePassword, initialSettingsState)

  useEffect(() => {
    if (state.ok === true) {
      toast.success('Password changed')
      onClose()
    } else if (state.error && state.kind === 'server') {
      toast.error(state.error)
    }
  }, [state, onClose])

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="cp-current" className="mb-1 block text-sm font-medium text-slate-700">
          Current password
        </label>
        <input
          id="cp-current"
          name="current"
          type="password"
          required
          autoComplete="current-password"
          autoFocus
          className={inputClass}
          placeholder="Your current password"
        />
      </div>
      <div>
        <label htmlFor="cp-new" className="mb-1 block text-sm font-medium text-slate-700">
          New password
        </label>
        <input
          id="cp-new"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
          placeholder="At least 8 characters"
        />
      </div>
      <div>
        <label htmlFor="cp-confirm" className="mb-1 block text-sm font-medium text-slate-700">
          Confirm new password
        </label>
        <input
          id="cp-confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
          placeholder="Re-enter new password"
        />
      </div>

      {state.error && state.kind === 'validation' ? (
        <ErrorAlert>{state.error}</ErrorAlert>
      ) : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <AppButton type="submit" disabled={pending}>
          {pending ? 'Updating…' : 'Update password'}
        </AppButton>
      </div>
    </form>
  )
}

export default function ChangePasswordModal() {
  const [open, setOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)

  const handleOpen = () => {
    setFormKey((k) => k + 1)
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <KeyRound className="h-3.5 w-3.5" />
        Change password
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Change password">
        <PasswordFields key={formKey} onClose={() => setOpen(false)} />
      </Modal>
    </>
  )
}
