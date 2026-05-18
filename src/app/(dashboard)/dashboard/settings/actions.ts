'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import type { SettingsState } from './state'

export async function updateProfileName(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: 'You must be signed in.', kind: 'server' }
  }

  const fullName = String(formData.get('full_name') ?? '').trim()
  if (!fullName) {
    return { ok: false, error: 'Name is required.', kind: 'validation' }
  }
  if (fullName.length > 120) {
    return { ok: false, error: 'Name must be 120 characters or fewer.', kind: 'validation' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    return { ok: false, error: `Could not save your name: ${error.message}`, kind: 'server' }
  }

  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard', 'layout')
  return { ok: true, error: null }
}

export async function updatePassword(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return { ok: false, error: 'You must be signed in.', kind: 'server' }
  }

  const current = String(formData.get('current') ?? '')
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (!current) {
    return { ok: false, error: 'Enter your current password.', kind: 'validation' }
  }
  if (password.length < 8) {
    return { ok: false, error: 'New password must be at least 8 characters.', kind: 'validation' }
  }
  if (password !== confirm) {
    return { ok: false, error: 'New passwords do not match.', kind: 'validation' }
  }
  if (password === current) {
    return {
      ok: false,
      error: 'New password must be different from your current one.',
      kind: 'validation',
    }
  }

  // Verify the current password by re-authenticating the same user.
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  })
  if (signInErr) {
    return { ok: false, error: 'Your current password is incorrect.', kind: 'validation' }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return { ok: false, error: error.message, kind: 'server' }
  }

  return { ok: true, error: null }
}
