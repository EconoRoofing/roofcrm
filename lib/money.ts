/**
 * Money helpers — integer cents edition
 *
 * ALL MONEY IN THIS APPLICATION IS STORED AND COMPUTED AS INTEGER CENTS.
 *
 * Float dollars (`1234.56`) are ONLY acceptable at two boundaries:
 *   1. User input (form fields) — convert to cents IMMEDIATELY with `dollarsToCents`
 *   2. Display (UI, PDFs, CSV) — convert from cents with `centsToDollars` / `formatCents`
 *
 * Arithmetic on money:
 *   - OK:  cents + cents, cents - cents, Math.round(cents * ratio)
 *   - BAD: dollars + dollars (float drift), `value.toFixed(2)` on a cents value
 *
 * Why: IEEE-754 doubles can't represent 0.1 exactly, so `0.1 + 0.2 !== 0.3`.
 * Stored totals drift from line-item sums. Commission rounds wrong. Payroll
 * is off by pennies. Integer cents eliminates all of that at the cost of
 * one helper call at the input/output boundaries.
 */

// ─── Core conversions ────────────────────────────────────────────────────────

/**
 * Convert a dollar value (as it would appear in a form input or DB legacy column)
 * into integer cents. Uses `Math.round` to nudge 0.1+0.2=0.30000000000000004 back
 * to 30 cents. Nulls pass through as 0.
 */
export function dollarsToCents(dollars: number | null | undefined): number {
  if (dollars == null || !Number.isFinite(dollars)) return 0
  return Math.round(dollars * 100)
}

/**
 * Convert integer cents back to a plain dollar number. Only use this when handing
 * off to something that genuinely wants a float (CSV export, a third-party API).
 * For display, prefer `formatCents` which returns a formatted string.
 */
export function centsToDollars(cents: number | bigint | null | undefined): number {
  if (cents == null) return 0
  const n = typeof cents === 'bigint' ? Number(cents) : cents
  if (!Number.isFinite(n)) return 0
  return n / 100
}

/**
 * Parse a user-supplied string (typed into a form field) into integer cents.
 * Strips commas, `$`, and whitespace. Returns 0 on unparseable input.
 * Use this on every `<input type="number">` and `<input type="text">` that
 * collects money before passing to a server action.
 */
export function parseUserInputToCents(raw: string | number | null | undefined): number {
  if (raw == null) return 0
  if (typeof raw === 'number') return dollarsToCents(raw)
  const cleaned = raw.trim().replace(/[$,\s]/g, '')
  if (cleaned === '' || cleaned === '-') return 0
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return 0
  return Math.round(parsed * 100)
}

// ─── Display formatters ──────────────────────────────────────────────────────

/**
 * Format cents as a currency string: `$1,234.56` / `-$12.00` / `$0.00`.
 * Null is rendered as `$0.00`.
 */
export function formatCents(cents: number | bigint | null | undefined): string {
  const n = centsToDollars(cents)
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Nullable variant: renders `—` for null/undefined/zero. Matches the old
 * `formatAmount` semantics so existing "empty state" UI keeps working.
 */
export function formatCentsOrDash(cents: number | bigint | null | undefined): string {
  if (cents == null) return '—'
  const n = typeof cents === 'bigint' ? Number(cents) : cents
  if (n === 0) return '—'
  return formatCents(n)
}

/**
 * Compact format for dashboards: `$1.2K` / `$2.3M` / `$450`.
 * Use for KPI cards where space is tight.
 */
export function formatCentsCompact(cents: number | bigint | null | undefined): string {
  const dollars = centsToDollars(cents)
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`
  if (Math.abs(dollars) >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`
  return `$${Math.round(dollars)}`
}

/**
 * PDF format: `1,234.56` with no `$` prefix, 2 decimals, always present.
 * For `@react-pdf/renderer` templates that draw their own currency symbol.
 */
export function formatCentsForPdf(cents: number | bigint | null | undefined): string {
  const n = centsToDollars(cents)
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Input-field format: `1234.56` — bare number, 2 decimals, no grouping.
 * Use as the default value of an `<input type="number" step="0.01">`.
 */
export function formatCentsForInput(cents: number | bigint | null | undefined): string {
  const n = centsToDollars(cents)
  return n.toFixed(2)
}

// ─── Safe arithmetic primitives ──────────────────────────────────────────────

/**
 * Apply a percentage (0-100 scale, NOT 0-1) to a cents amount, rounding to
 * the nearest cent. Use for commission, tax, markup. `pct` may be fractional
 * (e.g. 7.25 for 7.25% sales tax).
 */
export function applyPercentCents(cents: number, pct: number): number {
  if (!Number.isFinite(cents) || !Number.isFinite(pct)) return 0
  return Math.round(cents * (pct / 100))
}

/**
 * Multiply cents by a scalar (e.g. hours × rate, quantity × unit price) and
 * round to the nearest cent. Avoids `Math.round(a * b / 100)` footguns.
 */
export function multiplyCents(cents: number, factor: number): number {
  if (!Number.isFinite(cents) || !Number.isFinite(factor)) return 0
  return Math.round(cents * factor)
}

/**
 * Sum an iterable of cents values. Nullable inputs are treated as 0.
 * Integer addition in JS is exact for values < 2^53, which is $90+ trillion
 * — more headroom than this app will ever need.
 */
export function sumCents(values: Iterable<number | bigint | null | undefined>): number {
  let total = 0
  for (const v of values) {
    if (v == null) continue
    const n = typeof v === 'bigint' ? Number(v) : v
    if (!Number.isFinite(n)) continue
    total += n
  }
  return total
}

/**
 * Split a cents amount into N equal parts. The last part absorbs the
 * rounding remainder so the parts sum exactly to the input. Example:
 *   splitCents(10001, 2) → [5000, 5001]   // not [5000.5, 5000.5]
 */
export function splitCents(cents: number, parts: number): number[] {
  if (parts <= 0 || !Number.isFinite(cents)) return []
  const base = Math.floor(cents / parts)
  const remainder = cents - base * parts
  const result: number[] = new Array(parts).fill(base)
  // Add 1 cent to the first `remainder` parts to absorb the rounding gap.
  for (let i = 0; i < remainder; i++) result[i] += 1
  return result
}

/**
 * 50/50 deposit convenience. Returns the deposit half (rounded up so the
 * customer pays at least half on signing). Equivalent to the common
 * `total / 2` calc but exact in cents.
 */
export function halfCents(cents: number): number {
  const [deposit] = splitCents(cents, 2)
  return deposit ?? 0
}

// ─── Migration helpers (transitional) ────────────────────────────────────────

/**
 * Read a money value from a DB row that may have EITHER the legacy
 * `*_amount` column OR the new `*_cents` column populated. Prefers cents,
 * falls back to the legacy float. Use during the expand-and-contract phase
 * so code is forward/backward compatible with the migration state.
 *
 * Example:
 *   const total = readMoneyFromRow(job.total_amount_cents, job.total_amount)
 */
export function readMoneyFromRow(
  cents: number | bigint | null | undefined,
  legacyDollars: number | null | undefined
): number {
  if (cents != null) {
    const n = typeof cents === 'bigint' ? Number(cents) : cents
    if (Number.isFinite(n) && n !== 0) return n
    // If cents is explicitly 0 but legacy is non-zero, the migration may not
    // have run yet — fall back to legacy.
    if (legacyDollars != null && legacyDollars !== 0) return dollarsToCents(legacyDollars)
    return n
  }
  return dollarsToCents(legacyDollars)
}
