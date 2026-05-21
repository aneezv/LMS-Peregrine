import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, LogOut, BadgeCheck, MailWarning } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { AppCard, PageHeader } from '@/components/ui/primitives'
import { ErrorAlert } from '@/components/ui/error-alert'
import { ROLES } from '@/lib/roles'
import EditProfileModal from './_components/EditProfileModal'
import ChangePasswordModal from './_components/ChangePasswordModal'
import PurchaseHistoryList, { type Payment } from './_components/PurchaseHistoryList'
import InstallAppCard from './_components/InstallAppCard'

type PaymentCourse = { course_code: string; title: string }

type PaymentRow = {
  id: string
  amount_paise: number
  original_amount_paise: number | null
  discount_paise: number
  currency: string
  status: 'created' | 'paid' | 'failed'
  created_at: string
  courses: PaymentCourse | PaymentCourse[] | null
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  )
}

export default async function SettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('full_name, email, role, created_at')
    .eq('id', user.id)
    .single()

  if (profileErr) {
    console.error('[SettingsPage] profile error:', profileErr.message)
    return (
      <div className="p-4">
        <ErrorAlert title="Failed to load your settings">Please refresh the page.</ErrorAlert>
      </div>
    )
  }

  const role = profile?.role ?? ROLES.LEARNER
  const isLearner = role === ROLES.LEARNER
  const fullName = profile?.full_name ?? ''
  const email = profile?.email ?? user.email ?? ''
  const roleLabel = role === ROLES.COORDINATOR ? 'Coordinator' : role
  const joinedOn = formatDate(profile?.created_at ?? null)
  const emailVerified = Boolean(user.email_confirmed_at)

  let payments: Payment[] = []
  if (isLearner) {
    const { data: payRows } = await supabase
      .from('course_payments')
      .select(
        'id, amount_paise, original_amount_paise, discount_paise, currency, status, created_at, courses(course_code, title)',
      )
      .eq('user_id', user.id)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })

    payments = ((payRows ?? []) as PaymentRow[]).map((p) => {
      const course = unwrap(p.courses)
      return {
        id: p.id,
        amount_paise: p.amount_paise,
        original_amount_paise: p.original_amount_paise,
        discount_paise: p.discount_paise,
        currency: p.currency,
        status: p.status,
        created_at: p.created_at,
        course_title: course?.title ?? 'Course',
        course_code: course?.course_code ?? null,
      }
    })
  }

  return (
    <div className="space-y-5 px-2 py-4">
      <Link
        href="/dashboard"
        className="hidden lg:inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Back to Home
      </Link>

      <PageHeader title="Settings" description="Manage your account and preferences." />

      {/* Identity header */}
      <AppCard className="p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">
            {initials(fullName || email || 'U')}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900">{fullName || 'Unnamed user'}</p>
            <p className="truncate text-sm text-slate-500">{email}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 capitalize border border-blue-100">
                {roleLabel}
              </span>
              {emailVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-100">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Email verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-100">
                  <MailWarning className="h-3.5 w-3.5" />
                  Email not verified
                </span>
              )}
            </div>
          </div>
        </div>
      </AppCard>

      {/* Profile */}
      <AppCard className="p-4 sm:p-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Profile</h2>
          <EditProfileModal fullName={fullName} />
        </div>
        <div>
          <InfoRow label="Full name" value={fullName || '—'} />
          <InfoRow label="Email" value={email || '—'} />
          <InfoRow label="Joined on" value={joinedOn} />
        </div>
      </AppCard>

      {/* Account security */}
      <AppCard className="p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Account security
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Update the password you use to sign in.
            </p>
          </div>
          <ChangePasswordModal />
        </div>
      </AppCard>

      {/* Purchase history (learners) */}
      {isLearner ? (
        <AppCard className="p-4 sm:p-6">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
            Purchase history
          </h2>
          <PurchaseHistoryList payments={payments} />
        </AppCard>
      ) : null}

      {/* Install app */}
      <InstallAppCard />

      {/* Sign out */}
      <AppCard className="p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Session</h2>
            <p className="mt-1 text-sm text-slate-600">Sign out of your account on this device.</p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </AppCard>
    </div>
  )
}
