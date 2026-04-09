'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Trash2, MessageSquareText, Users } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'

export default function CourseManageBar({ courseId }: { courseId: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  async function handleDelete() {
    setConfirmDeleteOpen(false)
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('courses').delete().eq('id', courseId)
    setDeleting(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Course deleted.')
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex flex-row justify-between gap-2 mt-4">
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/courses/${courseId}/feedback`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm font-medium hover:border-rose-300 hover:text-rose-800 transition"
        >
          <MessageSquareText className="w-4 h-4" />
          Feedback
        </Link>
        <Link
          href={`/courses/${courseId}/enrollments`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm font-medium hover:border-emerald-300 hover:text-emerald-800 transition"
        >
          <Users className="w-4 h-4" />
          Enrollments
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/admin/courses/${courseId}/edit`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm font-medium hover:border-blue-400 hover:text-blue-700 transition"
        >
          <Pencil className="w-4 h-4" />
          Edit course
        </Link>
        <button
          type="button"
          onClick={() => setConfirmDeleteOpen(true)}
          disabled={deleting}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100 transition disabled:opacity-50"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          Delete course
        </button>
      </div>
      <ConfirmationDialog
        open={confirmDeleteOpen}
        title="Delete this course?"
        description="This removes the course and related lessons/data. This cannot be undone."
        confirmLabel="Delete course"
        confirmVariant="danger"
        busy={deleting}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}
