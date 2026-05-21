import { createClient } from '@/utils/supabase/server'
import { type NavLinkSections } from '@/components/DashboardNavDrawer'
import BottomNav from '@/components/BottomNav'
import { SiteNavbar } from '@/components/site/SiteNavbar'
import { LEARNER_PRIMARY_NAV } from '@/lib/nav'
import { DashboardLearnerWidgets } from '@/components/internship/DashboardLearnerWidgets'
import { ROLES, isInstructorRole } from '@/lib/roles'

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
      <SiteNavbar
        user={
          isAuthenticated
            ? {
                name,
                roleLabel,
                isAdmin,
                isInstructor,
                isCardCoordinator,
                isLearner,
                navSections,
              }
            : undefined
        }
      />

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
