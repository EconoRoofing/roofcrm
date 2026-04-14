/**
 * Supabase storage URL helpers.
 *
 * Audit R2-#8: the previous implementation persisted a 24-hour SIGNED URL
 * directly into `jobs.estimate_pdf_url` / `invoices.pdf_url`. After 24h
 * every customer-facing PDF link was a dead 403. The fix is to re-sign
 * on demand: extract the storage path from whatever URL we have stored
 * (works for both old public URLs and old expired signed URLs) and issue
 * a fresh signed URL at read time.
 *
 * This file is runtime-agnostic — no DB access. The caller provides the
 * Supabase client so this can be used from server actions, route handlers,
 * or Server Components.
 */

type SupabaseLike = {
  storage: {
    from(bucket: string): {
      createSignedUrl(path: string, expiresIn: number): Promise<{
        data: { signedUrl: string } | null
        error: { message: string } | null
      }>
    }
  }
}

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 // 24 hours per issuance
const ESTIMATES_BUCKET = 'estimates'

/**
 * Extract the storage path (within a bucket) from ANY of the URL shapes
 * Supabase has ever returned for this app:
 *
 *   Public URL:
 *     https://xxxx.supabase.co/storage/v1/object/public/estimates/jobs/abc/123.pdf
 *
 *   Signed URL:
 *     https://xxxx.supabase.co/storage/v1/object/sign/estimates/jobs/abc/123.pdf?token=xxx&...
 *
 * Returns the path portion (`jobs/abc/123.pdf`) or null if unrecognizable.
 */
export function extractStoragePath(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null
  // Match either /object/public/{bucket}/ or /object/sign/{bucket}/
  const pattern = new RegExp(`/storage/v1/object/(?:public|sign)/${bucket}/([^?#]+)`)
  const match = url.match(pattern)
  if (!match || !match[1]) return null
  // Decode once — the path in the URL is URL-encoded
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

/**
 * Given a stored PDF URL (which may be expired), issue a fresh signed URL.
 * Returns null if the input URL can't be parsed into a storage path.
 *
 * Use this at READ time in portal and job-detail contexts — don't persist
 * the result back to the DB, because a fresh signed URL is always ~free.
 */
export async function resignEstimatesPdf(
  supabase: SupabaseLike,
  storedUrl: string | null | undefined
): Promise<string | null> {
  const path = extractStoragePath(storedUrl, ESTIMATES_BUCKET)
  if (!path) return storedUrl ?? null // give back whatever we got — may still work

  const { data, error } = await supabase.storage
    .from(ESTIMATES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    console.warn('[storage-urls] resign failed for path', path, error)
    return storedUrl ?? null
  }
  return data.signedUrl
}
