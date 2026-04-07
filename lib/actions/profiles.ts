'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

// Get all active team members
export async function getProfiles() {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('users')
      .select('id, name, role, avatar_url, is_active')
      .eq('is_active', true)
      .order('name')
    return data ?? []
  } catch {
    return []
  }
}

// Set a user's PIN (manager only, or first-time setup)
export async function setPin(userId: string, pin: string) {
  const supabase = await createClient()
  const encoder = new TextEncoder()
  const data = encoder.encode(pin + userId) // salt with userId
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const pinHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

  await supabase.from('users').update({ pin_hash: pinHash }).eq('id', userId)
}

// Verify a PIN
export async function verifyPin(userId: string, pin: string): Promise<boolean> {
  try {
    const supabase = await createClient()

    const encoder = new TextEncoder()
    const data = encoder.encode(pin + userId)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const pinHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    const { data: user } = await supabase
      .from('users')
      .select('pin_hash')
      .eq('id', userId)
      .single()

    if (!user?.pin_hash) {
      // No PIN set — allow first-time access
      return true
    }

    return user.pin_hash === pinHash
  } catch {
    // Fail closed on error — don't grant access
    return false
  }
}

// Select a profile — sets the active_profile cookie
export async function selectProfile(userId: string) {
  const cookieStore = await cookies()
  cookieStore.set('active_profile_id', userId, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
}

// Get the current active profile
export async function getActiveProfile() {
  const cookieStore = await cookies()
  const profileId = cookieStore.get('active_profile_id')?.value
  if (!profileId) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', profileId)
    .single()
  return data
}

// Clear active profile (switch user)
export async function clearActiveProfile() {
  const cookieStore = await cookies()
  cookieStore.delete('active_profile_id')
}

// Create a new team member profile (manager creates these)
export async function createProfile(name: string, role: string, pin?: string) {
  const supabase = await createClient()

  // Get the shared Google auth user ID to link
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) throw new Error('Not authenticated')

  const { data, error } = await supabase.from('users').insert({
    id: crypto.randomUUID(),
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@team.roofcrm`,
    name,
    role,
    is_active: true,
  }).select().single()

  if (error) throw new Error(error.message)

  if (pin && data) {
    await setPin(data.id, pin)
  }

  return data
}

// Sign out the Google auth session and clear active profile
export async function signOutAndClear() {
  const cookieStore = await cookies()
  cookieStore.delete('active_profile_id')
  const supabase = await createClient()
  await supabase.auth.signOut()
}

// Update an existing profile
export async function updateProfile(
  userId: string,
  updates: { name?: string; role?: string; is_active?: boolean }
) {
  const supabase = await createClient()
  const { error } = await supabase.from('users').update(updates).eq('id', userId)
  if (error) throw new Error(error.message)
}
