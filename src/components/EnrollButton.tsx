'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'

export default function EnrollButton({ courseId }: { courseId: string }) {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

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
    await queryClient.invalidateQueries({ queryKey: ['courses', 'catalog'] })
  }

  return (
    <Button
      type="button"
      onClick={handleEnroll}
      disabled={loading}
      size="lg"
      className="w-full min-h-11 sm:w-auto"
    >
      {loading ? 'Enrolling…' : 'Enroll now'}
    </Button>
  )
}
