import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

// Sign out the current user (server-side)
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  // Also clear the active profile cookie
  const cookieStore = await cookies()
  cookieStore.delete('active_profile_id')
}

// Get the current user server-side
// Returns the active profile (from cookie) rather than the raw Google auth user
export async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return null

  // Return the active profile record if cookie is set
  const cookieStore = await cookies()
  const profileId = cookieStore.get('active_profile_id')?.value
  if (profileId) {
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', profileId)
      .eq('is_active', true)
      .single()
    if (profile) return profile
  }

  // Fall back to Google auth user data (pre-profile-selection state)
  return user
}

// Get the role for a user from the users table
export async function getUserRole(userId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()
  if (error || !data) return null
  return data.role
}

// Get the active profile or redirect to /select-profile
export async function getActiveProfileOrRedirect() {
  const cookieStore = await cookies()
  const profileId = cookieStore.get('active_profile_id')?.value
  if (!profileId) redirect('/select-profile')

  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', profileId)
    .eq('is_active', true)
    .single()

  if (!data) redirect('/select-profile')
  return data
}
