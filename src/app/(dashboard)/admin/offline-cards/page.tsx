import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { AppCard, PageHeader } from '@/components/ui/primitives'
import ImportOfflineCardsClient from './ImportOfflineCardsClient'

export default async function AdminOfflineCardsImportPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    redirect('/unauthorized')
  }

  const { data: courses } = await supabase
    .from('courses')
    .select('id, title, course_code')
    .order('title')

  const courseList = (courses ?? []).map((c) => ({
    id: c.id as string,
    title: c.title as string,
    course_code: c.course_code as string,
  }))

  return (
    <div className="space-y-6 p-2">
      <PageHeader
        title="Import offline ID cards"
        description="Upload a CSV, paste codes, or scan ID cards to add cards to the pool."
      />
      <AppCard className="p-2">
        <ImportOfflineCardsClient courses={courseList} />
      </AppCard>
    </div>
  )
}
