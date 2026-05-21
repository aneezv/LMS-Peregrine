import Link from 'next/link'
import Image from 'next/image'
import { LogOut, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import DashboardNavDrawer, { type NavLinkSections } from '@/components/DashboardNavDrawer'
import NotificationBell from '@/components/notifications/NotificationBell'

const PEREGRINE_AI_HREF = 'https://ai.peregrinehub.com/'

export type SiteNavbarUser = {
  name: string
  roleLabel: string
  isAdmin: boolean
  isInstructor: boolean
  isCardCoordinator: boolean
  isLearner: boolean
  navSections: NavLinkSections
}

export function SiteNavbar({ user }: { user?: SiteNavbarUser }) {
  const homeHref = user ? '/dashboard' : '/'

  return (
    <nav className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 min-w-0 items-center justify-between gap-2 py-2 sm:gap-3">
          <Link href={homeHref} className="flex min-w-0 items-center gap-2 shrink">
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

          {user ? <AuthedActions user={user} /> : <PublicActions />}
        </div>
      </div>
    </nav>
  )
}

function PublicActions() {
  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      <Button variant="ghost" size="sm" asChild className="hidden px-2 sm:inline-flex sm:px-3">
        <Link href="/explore">Explore</Link>
      </Button>
      <Button variant="ghost" size="sm" asChild className="px-2 sm:px-3">
        <Link href="/login">Sign in</Link>
      </Button>
      <Button size="sm" asChild className="px-3 sm:px-4">
        <Link href="/signup" aria-label="Get started with Peregrine">
          Get started
        </Link>
      </Button>
    </div>
  )
}

function AuthedActions({ user }: { user: SiteNavbarUser }) {
  const { name, roleLabel, isAdmin, isInstructor, isCardCoordinator, isLearner, navSections } = user
  const roleChipClass = isAdmin
    ? 'bg-red-100 text-red-700 capitalize'
    : isCardCoordinator
      ? 'bg-amber-100 text-amber-900'
      : isInstructor
        ? 'bg-purple-100 text-purple-700 capitalize'
        : 'bg-blue-100 text-blue-700 capitalize'

  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-3">
      <NotificationBell />
      <div className="hidden flex-col items-end sm:flex">
        <span className="text-sm font-semibold text-slate-800">{name}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleChipClass}`}>
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
      <DashboardNavDrawer
        name={name}
        role={roleLabel}
        sections={navSections}
        hideTriggerBelowLg={isLearner}
      />
    </div>
  )
}
