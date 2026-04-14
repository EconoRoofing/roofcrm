'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

type UserRole = 'owner' | 'office_manager' | 'sales' | 'crew' | null

interface UseUserReturn {
  user: User | null
  role: UserRole
  isLoading: boolean
}

interface UserCacheEntry {
  user: User | null
  role: UserRole
}

// ─── Module-level cache ──────────────────────────────────────────────────────
//
// Without this cache, every component that calls useUser() does its own
// `getUser()` round trip plus a `users` table query. A page that mounts 4
// components calling useUser() = 8 server round trips on every render burst.
//
// With this cache:
//   - First mount kicks off a single fetch and stores the in-flight Promise
//   - Subsequent mounts await the same Promise (request deduping)
//   - Once it resolves, every mount reads from the resolved entry instantly
//   - `onAuthStateChange` invalidates the cache + notifies all listeners
//
// Module state is per-tab. SSR doesn't run this file (it's marked `'use client'`).

let cachedEntry: UserCacheEntry | null = null
let inFlight: Promise<UserCacheEntry> | null = null
const listeners = new Set<(entry: UserCacheEntry | null) => void>()

function notifyAll(entry: UserCacheEntry | null) {
  for (const listener of listeners) listener(entry)
}

async function fetchUserAndRole(): Promise<UserCacheEntry> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, role: null }
  }

  const { data } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  return { user, role: (data?.role as UserRole) ?? null }
}

/**
 * Get-or-fetch the cached user/role entry. Multiple concurrent callers share
 * the same in-flight Promise, so we never have parallel duplicate fetches.
 */
function getOrFetch(): Promise<UserCacheEntry> {
  if (cachedEntry !== null) return Promise.resolve(cachedEntry)
  if (inFlight !== null) return inFlight

  inFlight = fetchUserAndRole()
    .then((entry) => {
      cachedEntry = entry
      inFlight = null
      notifyAll(entry)
      return entry
    })
    .catch((err) => {
      inFlight = null
      throw err
    })

  return inFlight
}

// One global auth-state subscription. Audit R2-#24: this used to be set up
// lazily on first useUser() mount, which left a race window between module
// load and the first component mount — if a SIGNED_OUT event fired in that
// window (e.g. tab restore where the cookie has already expired), we'd miss
// it and serve a stale cached user until the next manual refetch. Calling
// it at module load (right below the function) closes that window. The file
// is `'use client'`, so this runs once per tab on first import — never on
// the server.
let authSubscribed = false
function ensureAuthSubscription() {
  if (authSubscribed) return
  authSubscribed = true

  const supabase = createClient()
  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      cachedEntry = { user: null, role: null }
      notifyAll(cachedEntry)
    } else {
      // Session changed — invalidate and refetch
      cachedEntry = null
      inFlight = null
      getOrFetch().catch(() => {})
    }
  })
}

// Subscribe at module load, not on first hook mount, so we never miss an
// auth event that fires before any component has called useUser().
if (typeof window !== 'undefined') {
  try {
    ensureAuthSubscription()
  } catch {
    // Defensive: if createClient throws during module init for any reason,
    // fall back to lazy subscription on first hook mount below.
  }
}

export function useUser(): UseUserReturn {
  const [entry, setEntry] = useState<UserCacheEntry | null>(cachedEntry)
  const [isLoading, setIsLoading] = useState(cachedEntry === null)

  useEffect(() => {
    ensureAuthSubscription()

    let cancelled = false

    // Subscribe this component to cache updates
    const listener = (e: UserCacheEntry | null) => {
      if (cancelled) return
      setEntry(e)
      setIsLoading(false)
    }
    listeners.add(listener)

    // Kick off (or join) the fetch
    if (cachedEntry !== null) {
      // Cache hit — render immediately
      setEntry(cachedEntry)
      setIsLoading(false)
    } else {
      getOrFetch()
        .then((e) => {
          if (cancelled) return
          setEntry(e)
          setIsLoading(false)
        })
        .catch(() => {
          if (cancelled) return
          setIsLoading(false)
        })
    }

    return () => {
      cancelled = true
      listeners.delete(listener)
    }
  }, [])

  return {
    user: entry?.user ?? null,
    role: entry?.role ?? null,
    isLoading,
  }
}
