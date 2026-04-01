import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { DashboardLearnerWidgets } from '@/components/internship/DashboardLearnerWidgets'
import { LogOut } from 'lucide-react'
import DashboardNavDrawer from '@/components/DashboardNavDrawer'

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

  const role = profile?.role ?? 'learner'
  const name = profile?.full_name ?? user.email ?? 'User'

  const isInstructor = role === 'instructor' || role === 'admin'
  const isAdmin = role === 'admin'
  const navLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' as const },
    { href: '/courses', label: isInstructor ? 'All Courses' : 'My Courses', icon: 'courses' as const },
    ...(isInstructor ? [{ href: '/grading', label: 'Grading', icon: 'grading' as const }] : []),
    ...(isInstructor ? [{ href: '/attendance', label: 'Attendance', icon: 'attendance' as const }] : []),
    ...(isInstructor ? [{ href: '/admin/internship', label: 'Session Logs', icon: 'internship' as const }] : []),
    ...(isInstructor ? [{ href: '/admin/courses/new', label: 'Create Course', icon: 'createCourse' as const }] : []),
    ...(isAdmin ? [{ href: '/admin/users', label: 'Users', icon: 'users' as const }] : []),
  ]

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-16 items-center justify-between gap-3 py-2">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
                <Image
                  src="/logo.png"
                  alt="Peregrine LMS"
                  width={32}
                  height={32}
                  className="shrink-0"
                  style={{ width: 'auto', height: 'auto' }}
                />
                <span className="text-base font-bold text-slate-900 sm:text-lg">Peregrine LMS</span>
              </Link>

            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-semibold text-slate-800">{name}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                  isAdmin
                    ? 'bg-red-100 text-red-700'
                    : isInstructor
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {role}
                </span>
              </div>
              <form action="/auth/signout" method="post" className="hidden sm:block">
                <button
                  type="submit"
                  title="Sign out"
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
              <DashboardNavDrawer name={name} role={role} links={navLinks} />
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-7xl flex-1 px-1 py-1 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>

      <DashboardLearnerWidgets show={role === 'learner'} />
    </div>
  )
}
