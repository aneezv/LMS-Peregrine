import Link from 'next/link'
import { AppButton, AppCard } from '@/components/ui/primitives'

export default function AdminUsersPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <AppCard className="w-full max-w-2xl p-8 text-center">
        <div className="text-5xl">🚧</div>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">User Management</h1>
        <p className="mx-auto mt-2 max-w-md text-slate-500">
          This section is under construction. Full role assignment, account controls, and audit logs will appear here.
        </p>
        <Link href="/dashboard" className="mt-5 inline-flex">
          <AppButton>Back to Dashboard</AppButton>
        </Link>
      </AppCard>
    </div>
  )
}
