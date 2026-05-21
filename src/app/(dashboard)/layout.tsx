import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardLearnerWidgets } from '@/components/internship/DashboardLearnerWidgets'
import { type NavLinkSections } from '@/components/DashboardNavDrawer'
import BottomNav from '@/components/BottomNav'
import { SiteNavbar } from '@/components/site/SiteNavbar'
import { LEARNER_PRIMARY_NAV } from '@/lib/nav'
import { ROLES, isInstructorRole } from '@/lib/roles'

const PEREGRINE_AI_HREF = 'https://ai.peregrinehub.com/'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? ROLES.LEARNER
  const name = profile?.full_name ?? user.email ?? 'User'
  const roleLabel = role === ROLES.COORDINATOR ? 'Coordinator' : role

  const isInstructor = isInstructorRole(role)
  const isAdmin = role === ROLES.ADMIN
  const isCardCoordinator = role === ROLES.COORDINATOR
  const isLearner = role === ROLES.LEARNER

  const navSections: NavLinkSections = isCardCoordinator
    ? [
        [
          { href: '/dashboard', label: 'Home', icon: 'dashboard' },
          { href: '/dashboard/notifications', label: 'Notifications', icon: 'notifications' },
        ],
        [
          { href: '/attendance/bind-cards', label: 'Bind ID Cards', icon: 'bindIdCards' },
          {
            href: '/attendance/id-card-scan',
            label: 'Scan ID attendance',
            icon: 'idCardScanAttendance',
          },
        ],
        [{ href: '/grading', label: 'Grading', icon: 'grading' }],
        [{ href: '/dashboard/settings', label: 'Settings', icon: 'settings' }],
        [{ href: PEREGRINE_AI_HREF, label: 'Peregrine AI', icon: 'aiExternal', external: true }],
      ]
    : [
        [
          { href: '/dashboard', label: 'Home', icon: 'dashboard' },
          { href: '/dashboard/notifications', label: 'Notifications', icon: 'notifications' },
          { href: '/courses', label: isInstructor ? 'All Courses' : 'Course Catalog', icon: 'courses' },
          ...(!isInstructor ? [{ href: '/dashboard/my-courses', label: 'My Courses', icon: 'myCourses' as const }] : []),
          ...(isInstructor ? [{ href: '/grading', label: 'Grading', icon: 'grading' as const }] : []),
        ],
        [
          ...(isInstructor ? [{ href: '/attendance', label: 'Attendance', icon: 'attendance' as const }] : []),
          ...(isInstructor ? [{ href: '/attendance-report', label: 'Attendance Report', icon: 'attendanceReport' as const }] : []),
          ...(isInstructor ? [{href: '/attendance/id-card-scan',label: 'Scan ID attendance',icon: 'idCardScanAttendance' as const,},]: []),

        ],
        [
          ...(isInstructor ? [{ href: '/admin/courses/new', label: 'Create Course', icon: 'createCourse' as const }] : []),
          ...(isAdmin ? [{ href: '/admin/add-instructor', label: 'Add Instructor', icon: 'addInstructor' as const }] : []),
          ...(isAdmin ? [{ href: '/admin/coupons', label: 'Coupons', icon: 'coupons' as const }] : []),
        ],
        [
          ...(isInstructor ? [{ href: '/attendance/learner-id-lookup', label: 'Learner ID Lookup', icon: 'learnerIdLookup' as const }] : []),
          ...(isInstructor ? [{ href: '/attendance/bind-cards', label: 'Bind ID Cards', icon: 'bindIdCards' as const }] : []),
          ...(isAdmin ? [{ href: '/admin/offline-cards', label: 'Import ID Cards', icon: 'importIdCards' as const }] : []),
          ...(isAdmin ? [{ href: '/dashboard/admin/sheet-sync-log', label: 'Sheet Sync Log', icon: 'sheetSync' as const }] : []),
        ],
        [
          ...(isInstructor ? [{ href: '/admin/internship', label: 'Session Logs', icon: 'internship' as const }] : []),
          { href: '/dashboard/settings', label: 'Settings', icon: 'settings' as const },
          { href: PEREGRINE_AI_HREF, label: 'Peregrine AI', icon: 'aiExternal', external: true },
        ],
      ]

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <SiteNavbar
        user={{
          name,
          roleLabel,
          isAdmin,
          isInstructor,
          isCardCoordinator,
          isLearner,
          navSections,
        }}
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

      <DashboardLearnerWidgets show={role === ROLES.LEARNER} />
      {isLearner && <BottomNav items={LEARNER_PRIMARY_NAV} />}

      {/* {process.env.NODE_ENV === 'development' && (
        <aside
          aria-label="Dashboard layout inspect"
          className="fixed bottom-3 left-3 z-100 max-h-[min(40vh,320px)] w-[min(100vw-1.5rem,28rem)] overflow-auto rounded-lg border border-amber-500/40 bg-amber-50/95 p-3 text-xs shadow-lg backdrop-blur dark:border-amber-600/50 dark:bg-amber-950/90 dark:text-amber-100"
        >
          <details className="font-mono">
            <summary className="cursor-pointer select-none font-semibold text-amber-900 dark:text-amber-200">
              Inspect
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-all text-[11px] leading-relaxed text-amber-950/90 dark:text-amber-50/95">
              {JSON.stringify(
                {
                  userId: user.id,
                  email: user.email,
                  name,
                  role,
                  isAdmin,
                  isInstructor,
                  isCardCoordinator,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </aside>
      )} */}
    </div>
  )
}
