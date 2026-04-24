import { timingSafeEqual } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * TEMPORARY ADMIN ENDPOINT — delete as soon as PIN login is restored.
 *
 * Exists to break the chicken-and-egg lockout where setPin() in
 * lib/actions/profiles.ts requires an active session (via
 * getUserWithCompany), but the only way to establish a session is to
 * already know the PIN. Local hash computation failed because the salt
 * pasted from the Vercel dashboard doesn't match the runtime
 * PIN_HASH_SALT (env scope, whitespace, truncation — any of these is
 * possible and we couldn't narrow it down without runtime access).
 *
 * This endpoint runs ON production, uses production's process.env
 * PIN_HASH_SALT directly, and writes the resulting hash. Mathematical
 * certainty that the hash matches what verifyPin will compute.
 *
 * Auth: CRON_SECRET bearer (same pattern as /api/cron/daily), constant-
 * time compare. Payload validated strictly (4-digit PIN, email format).
 * Returns saltLength + saltFingerprint so we can cross-check against
 * whatever value was pasted locally — if they differ, we've found the
 * discrepancy that caused the local-hash attempt to fail.
 *
 * DELETE IMMEDIATELY after use. Do not leave this on production — even
 * with auth, a forgotten admin endpoint is a standing risk.
 */

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || !safeEqual(authHeader, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; newPin?: unknown }
    | null
  const email =
    typeof body?.email === 'string' && body.email.includes('@') ? body.email.trim() : null
  const newPin =
    typeof body?.newPin === 'string' && /^\d{4}$/.test(body.newPin) ? body.newPin : null
  if (!email || !newPin) {
    return NextResponse.json(
      { error: 'Invalid payload — needs {email, newPin} where newPin is 4 digits' },
      { status: 400 }
    )
  }

  const salt = process.env.PIN_HASH_SALT
  if (!salt || salt.length < 16) {
    return NextResponse.json(
      { error: 'PIN_HASH_SALT not configured on this deployment' },
      { status: 500 }
    )
  }

  const svc = createServiceClient()
  if (!svc) {
    return NextResponse.json(
      { error: 'Service client unavailable — SUPABASE_SERVICE_ROLE_KEY missing' },
      { status: 500 }
    )
  }

  const { data: user, error: lookupErr } = await svc
    .from('users')
    .select('id, email')
    .eq('email', email)
    .eq('is_active', true)
    .maybeSingle()
  if (lookupErr) {
    return NextResponse.json({ error: `User lookup failed: ${lookupErr.message}` }, { status: 500 })
  }
  if (!user) {
    return NextResponse.json({ error: 'User not found or inactive' }, { status: 404 })
  }

  // Identical algorithm to lib/actions/profiles.ts::setPin + verifyPin:
  // SHA-256 of UTF-8(pin + userId + salt), lowercase hex.
  const encoder = new TextEncoder()
  const data = encoder.encode(newPin + user.id + salt)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const pinHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  const { error: updateErr } = await svc
    .from('users')
    .update({
      pin_hash: pinHash,
      pin_failed_attempts: 0,
      pin_locked_until: null,
    })
    .eq('id', user.id)
  if (updateErr) {
    return NextResponse.json(
      { error: `PIN update failed: ${updateErr.message}` },
      { status: 500 }
    )
  }

  console.log(
    `[admin/pin-reset] reset PIN for ${user.email} (id=${user.id}, saltLen=${salt.length})`
  )

  return NextResponse.json({
    success: true,
    userId: user.id,
    email: user.email,
    saltLength: salt.length,
    saltFingerprint: `${salt.slice(0, 4)}...${salt.slice(-4)}`,
    pinHashPreview: `${pinHash.slice(0, 12)}...`,
  })
}
