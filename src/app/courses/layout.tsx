import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import { LogOut, Sparkles } from 'lucide-react'
import DashboardNavDrawer, { type NavLinkSections } from '@/components/DashboardNavDrawer'
import BottomNav from '@/components/BottomNav'
import { LEARNER_PRIMARY_NAV } from '@/lib/nav'
import { DashboardLearnerWidgets } from '@/components/internship/DashboardLearnerWidgets'
import { ROLES, isInstructorRole } from '@/lib/roles'
import { HomeNavbar } from '@/components/home/HomeNavbar'

const PEREGRINE_AI_HREF = 'https://ai.peregrinehub.com/'

export default async function CoursesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile: { full_name: string; role: string } | null = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .single()
    profile = data
  }

  const isAuthenticated = !!user
  const role = profile?.role ?? ROLES.LEARNER
  const name = profile?.full_name ?? user?.email ?? 'User'
  const roleLabel = role === ROLES.COORDINATOR ? 'Coordinator' : role

  const isInstructor = isInstructorRole(role)
  const isAdmin = role === ROLES.ADMIN
  const isCardCoordinator = role === ROLES.COORDINATOR
  const isLearner = isAuthenticated && role === ROLES.LEARNER

  const navSections: NavLinkSections = isCardCoordinator
    ? [
        [{ href: '/dashboard', label: 'Home', icon: 'dashboard' }],
        [
          { href: '/attendance/bind-cards', label: 'Bind ID Cards', icon: 'bindIdCards' },
          { href: '/attendance/id-card-scan', label: 'Scan ID attendance', icon: 'idCardScanAttendance' },
        ],
        [{ href: '/grading', label: 'Grading', icon: 'grading' }],
        [{ href: PEREGRINE_AI_HREF, label: 'Peregrine AI', icon: 'aiExternal', external: true }],
      ]
    : [
        [
          { href: '/dashboard', label: 'Home', icon: 'dashboard' },
          { href: '/courses', label: isInstructor ? 'All Courses' : 'Course Catalog', icon: 'courses' },
          ...(!isInstructor ? [{ href: '/dashboard/my-courses', label: 'My Courses', icon: 'myCourses' as const }] : []),
          ...(isInstructor ? [{ href: '/grading', label: 'Grading', icon: 'grading' as const }] : []),
        ],
        [
          ...(isInstructor ? [{ href: '/attendance', label: 'Attendance', icon: 'attendance' as const }] : []),
          ...(isInstructor ? [{ href: '/attendance-report', label: 'Attendance Report', icon: 'attendanceReport' as const }] : []),
          ...(isInstructor ? [{ href: '/attendance/id-card-scan', label: 'Scan ID attendance', icon: 'idCardScanAttendance' as const }] : []),
        ],
        [
          ...(isInstructor ? [{ href: '/admin/courses/new', label: 'Create Course', icon: 'createCourse' as const }] : []),
          ...(isAdmin ? [{ href: '/admin/add-instructor', label: 'Add Instructor', icon: 'addInstructor' as const }] : []),
        ],
        [
          ...(isInstructor ? [{ href: '/attendance/learner-id-lookup', label: 'Learner ID Lookup', icon: 'learnerIdLookup' as const }] : []),
          ...(isInstructor ? [{ href: '/attendance/bind-cards', label: 'Bind ID Cards', icon: 'bindIdCards' as const }] : []),
          ...(isAdmin ? [{ href: '/admin/offline-cards', label: 'Import ID Cards', icon: 'importIdCards' as const }] : []),
          ...(isAdmin ? [{ href: '/dashboard/admin/sheet-sync-log', label: 'Sheet Sync Log', icon: 'sheetSync' as const }] : []),
        ],
        [
          ...(isInstructor ? [{ href: '/admin/internship', label: 'Session Logs', icon: 'internship' as const }] : []),
          { href: PEREGRINE_AI_HREF, label: 'Peregrine AI', icon: 'aiExternal', external: true },
        ],
      ]

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {isAuthenticated ? (
        <nav className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex min-h-16 min-w-0 items-center justify-between gap-2 py-2 sm:gap-3">
              <div className="flex min-w-0 items-center gap-4">
                <Link
                  href="/dashboard"
                  className="flex min-w-0 items-center gap-2 shrink"
                >
                  <Image
                    src="/logo.png"
                    alt="Peregrine T&C"
                    width={45}
                    height={45}
                    className="h-9 w-9 shrink-0 rounded-full sm:h-11 sm:w-11"
                  />
                  <span className="truncate text-sm font-bold text-slate-900 sm:text-lg">
                    Peregrine T&amp;C
                  </span>
                </Link>
              </div>

              <div className="flex shrink-0 items-center gap-1 sm:gap-3">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-sm font-semibold text-slate-800">{name}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    isAdmin
                      ? 'bg-red-100 text-red-700 capitalize'
                      : isCardCoordinator
                        ? 'bg-amber-100 text-amber-900'
                        : isInstructor
                          ? 'bg-purple-100 text-purple-700 capitalize'
                          : 'bg-blue-100 text-blue-700 capitalize'
                  }`}>
                    {roleLabel}
                  </span>
                </div>
                <a
                  href={PEREGRINE_AI_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Peregrine AI"
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-violet-600 transition hover:bg-violet-50 hover:text-violet-800"
                >
                  <Sparkles className="h-4 w-4 shrink-0" />
                  <span className="hidden text-sm font-semibold sm:inline">AI</span>
                </a>
                <form action="/auth/signout" method="post" className="hidden sm:block">
                  <button
                    type="submit"
                    title="Sign out"
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </form>
                <DashboardNavDrawer name={name} role={roleLabel} sections={navSections} hideTriggerBelowLg={isLearner} />
              </div>
            </div>
          </div>
        </nav>
      ) : (
        <HomeNavbar />
      )}

      <main className="mx-auto w-full max-w-7xl flex-1 px-1 py-1 sm:px-6 sm:py-8 lg:px-8">
        {children}
        {isLearner && (
          <div
            aria-hidden
            className="lg:hidden"
            style={{ height: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }}
          />
        )}
      </main>

      {isAuthenticated && <DashboardLearnerWidgets show={role === ROLES.LEARNER} />}
      {isLearner && <BottomNav items={LEARNER_PRIMARY_NAV} />}
    </div>
  )
}
