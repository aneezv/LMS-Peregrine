import Link from 'next/link'
import { ShieldX } from 'lucide-react'
import { AppButton, AppCard } from '@/components/ui/primitives'

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6">
      <AppCard className="max-w-md w-full p-6 text-center space-y-6 sm:p-8">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100">
          <ShieldX className="w-10 h-10 text-red-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-slate-900">403</h1>
          <h2 className="text-xl font-semibold text-slate-700">Access Denied</h2>
          <p className="text-slate-500">
            You don&apos;t have permission to view this page. Please contact your administrator if you believe this is a mistake.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex"
        >
          <AppButton>Back to Dashboard</AppButton>
        </Link>
      </AppCard>
    </div>
  )
}
