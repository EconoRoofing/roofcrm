import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'

/**
 * TEMPORARY DIAGNOSTIC — delete after PIN login is restored.
 *
 * Computes the PIN hash using the RUNTIME value of PIN_HASH_SALT (whatever
 * Vercel has deployed right now), without touching the DB. Mario can curl
 * this with his intended PIN + user ID, compare `computedHash` against the
 * stored `pin_hash` column in public.users, and immediately know whether:
 *
 *   - The salt in Vercel matches the salt used when he ran the SQL UPDATE
 *     (if `computedHash === pin_hash` → match, login should work, something
 *     else is wrong)
 *   - OR the two salts differ (if they don't match → SQL was run with a
 *     salt value that doesn't match the one in Vercel's runtime env)
 *
 * Also returns the first/last 4 chars of the runtime salt so he can eyeball
 * it against what's pasted in Vercel's env var UI without the endpoint
 * leaking the full value.
 *
 * Auth: bearer token against CRON_SECRET. Same pattern as /api/cron/daily.
 *
 * IMPORTANT: Delete this file once PIN login is restored. Leaving a
 * hash-oracle endpoint in production is a standing vulnerability — even
 * with the auth gate, it exists to be removed, not to stay.
 */

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || !safeEqual(authHeader, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const pin = url.searchParams.get('pin')
  const userId = url.searchParams.get('userId')

  if (!pin || !userId) {
    return NextResponse.json(
      { error: 'Missing required query params: pin, userId' },
      { status: 400 }
    )
  }

  const salt = process.env.PIN_HASH_SALT ?? ''
  const saltPresent = salt.length > 0
  const saltLength = salt.length
  const saltStart = salt.slice(0, 4) || null
  const saltEnd = salt.slice(-4) || null

  if (!saltPresent || saltLength < 16) {
    return NextResponse.json({
      ok: false,
      reason: 'PIN_HASH_SALT missing or too short at runtime',
      saltPresent,
      saltLength,
      saltStart,
      saltEnd,
      hint: 'Check Vercel env vars. Must be ≥16 chars and the deployment currently serving traffic must have been created AFTER the env var was added.',
    })
  }

  // Hash using the exact same algorithm as lib/actions/profiles.ts:verifyPin
  const encoder = new TextEncoder()
  const data = encoder.encode(pin + userId + salt)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const computedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

  return NextResponse.json({
    ok: true,
    saltPresent,
    saltLength,
    saltStart,
    saltEnd,
    computedHash,
    hint: 'Compare computedHash to the pin_hash column in public.users for this userId. If they match, login should work — check that you are entering the same PIN you hashed. If they differ, the salt used in your SQL UPDATE does not match the salt currently in Vercel runtime.',
  })
}
