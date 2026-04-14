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

// One global auth-state subscription, set up on first hook mount. Lives for
// the entire tab session — not per-component — so we don't subscribe N times.
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
