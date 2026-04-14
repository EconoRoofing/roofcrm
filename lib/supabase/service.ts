import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client using the service-role key.
 *
 * Bypasses Row Level Security for system tasks that run WITHOUT a user
 * session: cron jobs, webhooks, background syncs. Every other query path
 * in the codebase should keep using `createClient()` from `./server.ts`
 * which uses the anon key + cookie auth and enforces RLS normally.
 *
 * SECURITY: This key grants unrestricted read+write access to every row
 * in every table. Never:
 *   - Import this file from a client component
 *   - Log or serialize the returned client
 *   - Return it from a server action that streams to the browser
 *
 * Next.js's `'server-only'` marker on the import keeps the bundler from
 * ever including this file in a client bundle. If you see a build error
 * saying this file was imported from a client boundary, fix the caller —
 * do NOT remove the marker.
 *
 * Returns null if `SUPABASE_SERVICE_ROLE_KEY` is not configured in the
 * environment. Callers are expected to handle null gracefully (e.g. the
 * daily cron logs a skip with a clear reason) rather than throwing at
 * module load time. This means forgetting to set the env var in Vercel
 * surfaces as "step skipped in cron response" instead of "cron endpoint
 * 500s and breaks every other step in the chain."
 */
import 'server-only'

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    return null
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      // Disable token persistence and auto-refresh — this client is
      // stateless and ephemeral, used per-request in server handlers.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
