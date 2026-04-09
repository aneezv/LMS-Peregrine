import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/primitives'
import AddInstructorForm from './AddInstructorForm'
import { ROLES } from '@/lib/roles'

export default async function AddInstructorPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== ROLES.ADMIN) {
    redirect('/unauthorized')
  }

  return (
    <div className="space-y-6 p-2">
      <PageHeader
        title="Add instructor"
        description="Creates a instructor account."
      />
      <AddInstructorForm />
    </div>
  )
}
