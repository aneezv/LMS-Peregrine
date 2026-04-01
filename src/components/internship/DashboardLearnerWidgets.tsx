'use client'

import InternshipTimerWidget from '@/components/internship/InternshipTimerWidget'

/** Renders internship tooling only for learners (role decided in server layout). */
export function DashboardLearnerWidgets({ show }: { show: boolean }) {
  if (!show) return null
  return <InternshipTimerWidget />
}
