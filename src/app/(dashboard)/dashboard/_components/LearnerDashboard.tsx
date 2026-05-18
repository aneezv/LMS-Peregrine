import Link from 'next/link'
import { FileText, ChevronRight, Flame } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/primitives'
import type { LearnerSummary, MetricCard } from '../_types'
import MetricCardGrid from './MetricCardGrid'
import ContinueLearning from './ContinueLearning'
import DueAssignmentRow from './DueAssignmentRow'

const DUE_ASSIGNMENTS_HREF = '/dashboard/due-assignments'
const STREAK_HREF = '/dashboard/streak'

export default function LearnerDashboard({
  name,
  summary,
}: {
  name: string
  summary: LearnerSummary
}) {
  const { enrolled_courses, streak: rawStreak, due_assignments } = summary
  const streak = rawStreak ?? 0
  const dueTotal = summary.due_assignments_count ?? due_assignments.length
  const dueShown = due_assignments.slice(0, 3)

  const metrics: MetricCard[] = [
    {
      label: 'Day streak',
      value: streak,
      icon: <Flame className="w-12.5 h-12.5 text-orange-500" />,
      bg: 'bg-orange-50',
      hint: streak === 0 ? 'Complete a lesson to start' : undefined,
      href: STREAK_HREF,
    },
    {
      label: 'Assignments Due',
      value: dueTotal,
      icon: <FileText className="w-12.5 h-12.5 text-amber-500" />,
      bg: 'bg-amber-50',
      href: DUE_ASSIGNMENTS_HREF,
    },
  ]

  const enrolledCourses = enrolled_courses.map((c) => ({
    id: c.id,
    course_code: c.course_code,
    title: c.title,
    thumbnail_url: c.thumbnail_url ?? undefined,
    progress: c.progress,
  }))

  return (
    <div className="space-y-4 px-2 py-4">
      <PageHeader title={`Welcome back, ${name}!`} />

      {/* Metric Cards */}
      <MetricCardGrid metrics={metrics} />

      {/* Enrolled Courses */}
      <ContinueLearning enrolledCourses={enrolledCourses} />

      {/* Due Assignments */}
      {dueShown.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-slate-500 text-[10px] uppercase tracking-wider">
              Assignments due
            </h3>
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
              {dueTotal}
            </span>
          </div>

          {/* Assignment List */}
          <ul className="divide-y divide-slate-50">
            {dueShown.map((a) => (
              <li key={a.assignment_id}>
                <DueAssignmentRow assignment={a} />
              </li>
            ))}
          </ul>

          {/* View more */}
          {dueTotal > dueShown.length && (
            <div className="border-t border-slate-100 px-2 py-1.5 flex justify-end">
              <Link href={DUE_ASSIGNMENTS_HREF}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[12px] font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-7 px-2 gap-0.5"
                >
                  View more
                  <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
