'use client'

import { createClient } from '@/lib/supabase/client'

// Sign in with Google OAuth — requests calendar.events scope and offline access
export async function signInWithGoogle(redirectTo: string) {
  const supabase = createClient()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
      scopes: 'https://www.googleapis.com/auth/calendar.events',
    },
  })
  if (error) throw error
}

// Sign out the current user
export async function signOut() {
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
