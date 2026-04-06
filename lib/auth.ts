import { createClient } from '@/lib/supabase/server'

// Sign out the current user (server-side)
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
}

// Get the current user server-side
export async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) return null
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
