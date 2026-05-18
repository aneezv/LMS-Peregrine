import type { NavItem } from '@/components/DashboardNavDrawer'

/** Primary destinations shown in the learner mobile bottom bar (max 4 — a
 *  fifth "More" cell opens the full drawer). */
export const LEARNER_PRIMARY_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: 'dashboard' },
  { href: '/courses', label: 'Courses', icon: 'courses' },
  { href: '/dashboard/my-courses', label: 'My Courses', icon: 'myCourses' },
  { href: '/dashboard/streak', label: 'Streak', icon: 'streak' },
]
