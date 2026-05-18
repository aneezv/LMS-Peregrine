'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { AppButton } from '@/components/ui/primitives'
import { ErrorAlert } from '@/components/ui/error-alert'
import { updateProfileName } from '../actions'
import { initialSettingsState } from '../state'
import Modal from './Modal'

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

function EditForm({
  defaultName,
  onClose,
}: {
  defaultName: string
  onClose: () => void
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(updateProfileName, initialSettingsState)

  useEffect(() => {
    if (state.ok === true) {
      toast.success('Profile updated')
      onClose()
      router.refresh()
    } else if (state.error && state.kind === 'server') {
      toast.error(state.error)
    }
  }, [state, onClose, router])

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="edit-name" className="mb-1 block text-sm font-medium text-slate-700">
          Full name
        </label>
        <input
          id="edit-name"
          name="full_name"
          type="text"
          required
          maxLength={120}
          autoComplete="name"
          autoFocus
          defaultValue={defaultName}
          className={inputClass}
          placeholder="Your name"
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
          {pending ? 'Saving…' : 'Save changes'}
        </AppButton>
      </div>
    </form>
  )
}

export default function EditProfileModal({ fullName }: { fullName: string }) {
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
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit profile">
        <EditForm key={formKey} defaultName={fullName} onClose={() => setOpen(false)} />
      </Modal>
    </>
  )
}
