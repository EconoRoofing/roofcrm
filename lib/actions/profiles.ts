'use server'

import { timingSafeEqual } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
import { getUserWithCompany, requireManager } from '@/lib/auth-helpers'
import { cookies } from 'next/headers'

// INTENTIONAL: No auth on getCompanies/getProfiles — these are used by the
// Netflix-style shared-device profile picker. All profiles must be shown so
// users can select theirs before authenticating via PIN.

// Get all companies (for primary company assignment)
export async function getCompanies() {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('companies')
      .select('id, name')
      .order('name')
    return data ?? []
  } catch {
    return []
  }
}

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

// Set a user's PIN (manager only, or self-service for own PIN)
export async function setPin(userId: string, pin: string) {
  const { userId: callerId, role } = await getUserWithCompany()

  // Crew members can only set their own PIN; managers can set anyone's
  if (userId !== callerId) {
    requireManager(role)
  }

  const supabase = await createClient()
  const encoder = new TextEncoder()
  const serverSalt = process.env.PIN_HASH_SALT ?? 'roofcrm-default-salt-change-me'
  const data = encoder.encode(pin + userId + serverSalt)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const pinHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

  await supabase.from('users').update({ pin_hash: pinHash }).eq('id', userId)

  // Audit trail for PIN changes
  try {
    await supabase.from('activity_log').insert({
      job_id: userId,
      user_id: callerId,
      action: 'pin_changed',
      old_value: null,
      new_value: 'PIN updated',
    })
  } catch {}
}

// Unlock a locked account (manager only — resets failed attempts)
export async function unlockAccount(userId: string) {
  const { role } = await getUserWithCompany()
  requireManager(role)

  const supabase = await createClient()
  await supabase.from('users').update({
    pin_failed_attempts: 0,
    pin_locked_until: null,
  }).eq('id', userId)
}

// Verify a PIN
export async function verifyPin(userId: string, pin: string): Promise<boolean> {
  try {
    const supabase = await createClient()

    // Fetch user's pin data including rate-limit fields
    const { data: user } = await supabase
      .from('users')
      .select('pin_hash, pin_failed_attempts, pin_locked_until')
      .eq('id', userId)
      .single()

    if (!user) return false

    // Check lockout (Supabase-persisted — works across serverless instances)
    if (user.pin_locked_until && new Date(user.pin_locked_until) > new Date()) {
      throw new Error('Too many PIN attempts. Try again later.')
    }

    // SECURITY: fail closed when no PIN is set. Previous behavior allowed any
    // PIN-less profile to be selected without authentication, which combined
    // with the cross-tenant getProfiles() let any logged-in Google user
    // impersonate any PIN-less account in the database.
    if (!user.pin_hash) {
      throw new Error('No PIN configured for this profile. Ask your manager to set one.')
    }

    // Compute hash for comparison
    const encoder = new TextEncoder()
    const serverSalt = process.env.PIN_HASH_SALT ?? 'roofcrm-default-salt-change-me'
    const data = encoder.encode(pin + userId + serverSalt)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const pinHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Timing-safe comparison to prevent timing attacks
    const storedBuf = Buffer.from(user.pin_hash, 'hex')
    const computedBuf = Buffer.from(pinHash, 'hex')
    const isMatch = storedBuf.length === computedBuf.length && timingSafeEqual(storedBuf, computedBuf)

    if (!isMatch) {
      // Increment failed attempts and set lockout if threshold reached
      const attempts = (user.pin_failed_attempts ?? 0) + 1
      const lockUntil = attempts >= 5
        ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
        : null

      await supabase.from('users').update({
        pin_failed_attempts: attempts,
        pin_locked_until: lockUntil,
      }).eq('id', userId)

      if (attempts >= 5) throw new Error('Too many PIN attempts. Try again in 15 minutes.')
      return false
    }

    // On success, reset failed attempts
    await supabase.from('users').update({
      pin_failed_attempts: 0,
      pin_locked_until: null,
    }).eq('id', userId)

    return true
  } catch (err) {
    // Re-throw rate-limit and "no PIN configured" errors so callers can show the message
    if (err instanceof Error && (
      err.message.includes('Too many PIN attempts') ||
      err.message.includes('No PIN configured')
    )) {
      throw err
    }
    // Fail closed on all other errors — don't grant access
    return false
  }
}

// Select a profile — sets the active_profile cookie
// Shared-device model: all profiles on the same Google account can be selected.
// Scoped to companies the auth user owns to prevent cross-org impersonation.
export async function selectProfile(userId: string) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) throw new Error('Not authenticated')

  // Get companies owned by the auth user
  const { data: ownedCompanies } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_id', authUser.id)

  const companyIds = (ownedCompanies ?? []).map(c => c.id)

  // SECURITY: fail closed when the authed Google user owns no companies.
  // Previous behavior skipped the company filter entirely, letting any
  // logged-in Google user select any active profile in the database.
  if (companyIds.length === 0) {
    throw new Error('No companies associated with this account')
  }

  // Verify the profile exists, is active, and belongs to one of the auth user's companies
  const { data: profile } = await supabase
    .from('users')
    .select('id, is_active, primary_company_id')
    .eq('id', userId)
    .eq('is_active', true)
    .in('primary_company_id', companyIds)
    .single()

  if (!profile) throw new Error('Profile not found or access denied')

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
    .eq('is_active', true)
    .single()
  return data
}

// Clear active profile (switch user)
export async function clearActiveProfile() {
  const cookieStore = await cookies()
  // Read the profile ID before clearing so we can also purge its role cache cookie
  const profileId = cookieStore.get('active_profile_id')?.value
  cookieStore.delete('active_profile_id')
  if (profileId) {
    cookieStore.delete(`profile_role_${profileId}`)
  }
}

// Create a new team member profile (manager only)
export async function createProfile(name: string, role: string, pin?: string, primaryCompanyId?: string) {
  const { companyId, role: callerRole } = await getUserWithCompany()
  requireManager(callerRole)

  // Validate the requested role against the canonical role model.
  // Only owners can mint other owners — office_manager promoting itself to
  // owner via the "Add Member" form is an escalation path otherwise.
  const ALLOWED_ROLES = ['owner', 'office_manager', 'sales', 'crew']
  if (!ALLOWED_ROLES.includes(role)) {
    throw new Error(`Invalid role: ${role}`)
  }
  if (role === 'owner' && callerRole !== 'owner') {
    throw new Error('Only owners can create other owner profiles')
  }

  const supabase = await createClient()

  // Verify the selected company is one the caller has access to
  // (for now, we only allow assignment to the caller's own company unless they're an owner)
  let targetCompanyId = companyId
  if (primaryCompanyId && callerRole === 'owner') {
    // Owners can assign to any company they own
    const { data: companyCheck } = await supabase
      .from('companies')
      .select('id')
      .eq('id', primaryCompanyId)
      .single()
    if (companyCheck) {
      targetCompanyId = primaryCompanyId
    }
  } else if (primaryCompanyId && primaryCompanyId === companyId) {
    // Non-owners can only assign to their own company
    targetCompanyId = primaryCompanyId
  }

  // Build a placeholder email that won't collide — use a short random suffix
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')
  const suffix = crypto.randomUUID().slice(0, 6)
  const placeholderEmail = `${slug || 'member'}.${suffix}@team.roofcrm`

  const { data, error } = await supabase.from('users').insert({
    id: crypto.randomUUID(),
    email: placeholderEmail,
    name,
    role,
    is_active: true,
    primary_company_id: targetCompanyId,
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

// Update an existing profile (manager only, target must be in same company)
export async function updateProfile(
  userId: string,
  updates: { name?: string; role?: string; is_active?: boolean; primary_company_id?: string | null }
) {
  const { companyId, role: callerRole } = await getUserWithCompany()
  requireManager(callerRole)

  // Validate role on update too — same rules as createProfile
  if (updates.role !== undefined) {
    const ALLOWED_ROLES = ['owner', 'office_manager', 'sales', 'crew']
    if (!ALLOWED_ROLES.includes(updates.role)) {
      throw new Error(`Invalid role: ${updates.role}`)
    }
    if (updates.role === 'owner' && callerRole !== 'owner') {
      throw new Error('Only owners can grant the owner role')
    }
  }

  const supabase = await createClient()

  // Verify the target user belongs to the manager's company
  const { data: targetUser } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', userId)
    .eq('primary_company_id', companyId)
    .maybeSingle()
  if (!targetUser) throw new Error('User not found or not in your company')

  // Office managers cannot demote owners
  if (targetUser.role === 'owner' && callerRole !== 'owner') {
    throw new Error('Only owners can modify owner profiles')
  }

  const { error } = await supabase.from('users').update(updates).eq('id', userId)
  if (error) throw new Error(error.message)
}
