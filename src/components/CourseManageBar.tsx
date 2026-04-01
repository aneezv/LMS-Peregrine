'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Trash2, MessageSquareText, Users } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

export default function CourseManageBar({ courseId }: { courseId: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm('Delete this course and all related lessons and data? This cannot be undone.')) {
      return
    }
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('courses').delete().eq('id', courseId)
    setDeleting(false)
    if (error) {
      alert(error.message)
      return
    }
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
      </div>
    </div>
  )
}
