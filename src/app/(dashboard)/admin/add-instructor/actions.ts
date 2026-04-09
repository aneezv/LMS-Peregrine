'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { ROLES } from '@/lib/roles'

export type CreateInstructorState = {
  ok: boolean | null
  error: string | null
}

export async function createInstructorAccount(
  _prev: CreateInstructorState,
  formData: FormData,
): Promise<CreateInstructorState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: 'You must be signed in.' }
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== ROLES.ADMIN) {
    return { ok: false, error: 'Only administrators can create instructor accounts.' }
  }

  const fullName = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!fullName || !email || !password) {
    return { ok: false, error: 'Name, email, and password are required.' }
  }

  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' }
  }

  const admin = createAdminClient()
  if (!admin) {
    return { ok: false, error: 'Server cannot create users (missing service role configuration).' }
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, source: 'admin_add_instructor' },
  })

  if (createErr || !created.user?.id) {
    const msg = createErr?.message ?? 'Could not create authentication user.'
    return { ok: false, error: msg }
  }

  const { error: profileErr } = await admin
    .from('profiles')
    .update({
      role: ROLES.INSTRUCTOR,
      full_name: fullName,
      email,
      updated_at: new Date().toISOString(),
    })
    .eq('id', created.user.id)

  if (profileErr) {
    return {
      ok: false,
      error: `Account was created but updating the profile failed: ${profileErr.message}. Fix this user in the Dashboard.`,
    }
  }

  revalidatePath('/admin/add-instructor')
  return { ok: true, error: null }
}
