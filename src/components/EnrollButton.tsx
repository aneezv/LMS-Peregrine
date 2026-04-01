'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function EnrollButton({ courseId }: { courseId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleEnroll = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('enrollments').insert({
      course_id: courseId,
      learner_id: user.id,
    })

    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handleEnroll}
      disabled={loading}
      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 px-6 rounded-lg shadow transition duration-200"
    >
      {loading ? 'Enrolling…' : 'Enroll Now'}
    </button>
  )
}
