import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { AppCard, PageHeader } from '@/components/ui/primitives'
import LearnerIdLookupClient from './LearnerIdLookupClient'
import { ROLES, isInstructorRole } from '@/lib/roles'

export default async function LearnerIdLookupPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role ?? ROLES.LEARNER
  if (!isInstructorRole(role)) {
    redirect('/unauthorized')
  }

  return (
    <div className="space-y-6 p-2">
      <PageHeader
        title="Learner ID lookup"
        description="Scan or enter an offline ID card code to see who it belongs to (if bound)."
      />
      <AppCard className="p-2">
        <LearnerIdLookupClient />
      </AppCard>
    </div>
  )
}
