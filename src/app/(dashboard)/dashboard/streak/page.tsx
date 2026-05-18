import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  FileText,
  Flame,
  ListChecks,
  MessageSquare,
  Trophy,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { ErrorAlert } from '@/components/ui/error-alert'
import { AppCard, EmptyState, PageHeader } from '@/components/ui/primitives'
import { ROLES, isStaffRole } from '@/lib/roles'
import StreakCalendar from './_components/StreakCalendar'

type ActivityKind = 'lesson' | 'quiz' | 'feedback' | 'assignment'

type StreakDetail = {
  current_streak: number
  longest_streak: number
  last_active_day: string | null
  active_days: string[]
  recent_activity: {
    kind: ActivityKind
    course_title: string
    item_title: string
    occurred_at: string
  }[]
}

const KIND_META: Record<
  ActivityKind,
  { label: string; icon: typeof BookOpen; cls: string }
> = {
  lesson: { label: 'Lesson', icon: BookOpen, cls: 'bg-blue-50 text-blue-600' },
  quiz: { label: 'Quiz', icon: ListChecks, cls: 'bg-violet-50 text-violet-600' },
  feedback: { label: 'Feedback', icon: MessageSquare, cls: 'bg-emerald-50 text-emerald-600' },
  assignment: { label: 'Assignment', icon: FileText, cls: 'bg-amber-50 text-amber-600' },
}

/** Today's calendar date in IST as 'YYYY-MM-DD' (en-CA → ISO format). */
function istTodayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function formatActivityDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso))
}

function formatDayParts(iso: string): { dayMonth: string; year: string } {
  const date = new Date(`${iso}T00:00:00+05:30`)
  const dayMonth = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
  }).format(date)
  const year = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
  }).format(date)
  return { dayMonth, year }
}

function StatCard({
  label,
  value,
  icon,
  className = '',
}: {
  label: string
  value: React.ReactNode
  icon: React.ReactNode
  className?: string
}) {
  return (
    <AppCard
      className={`relative overflow-hidden p-5 flex flex-row justify-between gap-4 rounded-2xl ${className}`}
    >
      <div className="pointer-events-none absolute opacity-30 -right-4 -bottom-4 text-slate-200 [&>svg]:w-20 [&>svg]:h-20">
        {icon}
      </div>
      <div className="relative z-10 min-w-0 flex flex-col justify-center gap-1">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <p className="text-3xl font-bold text-slate-900 tracking-tight">{value}</p>
      </div>
    </AppCard>
  )
}

export default async function StreakPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? ROLES.LEARNER
  if (isStaffRole(role)) redirect('/dashboard')

  const { data, error } = await supabase.rpc('learner_streak_detail_v1')

  if (error) {
    console.error('[StreakPage] RPC error:', error.message)
    return (
      <div className="p-4">
        <ErrorAlert title="Failed to load your streak">Please refresh the page.</ErrorAlert>
      </div>
    )
  }

  const detail = (data ?? {
    current_streak: 0,
    longest_streak: 0,
    last_active_day: null,
    active_days: [],
    recent_activity: [],
  }) as StreakDetail

  const todayIso = istTodayIso()

  return (
    <div className="space-y-5 px-2 py-4">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Back to Home
      </Link>

      <PageHeader
        title="Your Streak"
        description="Every lesson, quiz, feedback, and graded assignment keeps your streak alive."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700 border border-orange-100">
            <Flame className="w-3.5 h-3.5" />
            {detail.current_streak} day{detail.current_streak === 1 ? '' : 's'}
          </span>
        }
      />

      {!detail.last_active_day ? (
        <EmptyState
          title="No streak yet"
          description="Complete any lesson, quiz, or assignment to start your streak."
          action={
            <Link
              href="/courses"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Browse courses
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatCard
              label="Current streak"
              value={`${detail.current_streak} day${detail.current_streak === 1 ? '' : 's'}`}
              icon={<Flame className="text-orange-500" />}
            />
            <StatCard
              label="Longest streak"
              value={`${detail.longest_streak} day${detail.longest_streak === 1 ? '' : 's'}`}
              icon={<Trophy className="text-amber-500" />}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-stretch gap-3">
            <StatCard
              label="Last active"
              value={
                <span className="leading-tight">
                  {formatDayParts(detail.last_active_day).dayMonth}
                  <span className="block text-xl font-bold text-slate-400">
                    {formatDayParts(detail.last_active_day).year}
                  </span>
                </span>
              }
              icon={<CalendarDays className="text-blue-500" />}
              className="sm:w-56 sm:shrink-0"
            />
            <AppCard className="p-5 rounded-2xl flex-1 min-w-0">
              <h2 className="text-sm font-bold text-slate-900 mb-3 text-center">
                Activity (last 14 weeks)
              </h2>
              <StreakCalendar activeDays={detail.active_days} todayIso={todayIso} />
            </AppCard>
          </div>

          <AppCard className="p-0 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
              <h2 className="font-bold text-slate-500 text-[10px] uppercase tracking-wider">
                Recent activity
              </h2>
            </div>
            {detail.recent_activity.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">
                No recent activity.
              </p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {detail.recent_activity.map((a, i) => {
                  const meta = KIND_META[a.kind]
                  const Icon = meta.icon
                  return (
                    <li key={i} className="flex items-center gap-3 px-4 py-3">
                      <div
                        className={`shrink-0 h-8 w-8 rounded-lg flex items-center justify-center ${meta.cls}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {a.item_title}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {meta.label} · {a.course_title}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] font-medium text-slate-400">
                        {formatActivityDate(a.occurred_at)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </AppCard>
        </>
      )}
    </div>
  )
}
