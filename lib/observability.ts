/**
 * Centralized error reporting and structured logging.
 *
 * Audit R2-#29: previously, errors in cron jobs, the calendar webhook, and
 * other server-only paths went to `console.error(err)` only — Mario could
 * see them in `vercel logs`, but there was no aggregation, no alerting, and
 * unstructured strings made grepping painful.
 *
 * This module provides a single `reportError` helper that:
 *   1. Always emits a structured JSON log line (parseable by Vercel runtime
 *      logs, log drains, Datadog, etc.)
 *   2. Optionally fires a webhook (Slack incoming, Discord, custom backend)
 *      if `ERROR_WEBHOOK_URL` is set. Fire-and-forget — never blocks the
 *      caller.
 *   3. Forwards to Sentry if `SENTRY_DSN` is set AND `@sentry/nextjs` is
 *      installed at runtime. The dynamic import means we don't take the
 *      bundle hit until Sentry is actually configured.
 *
 * Usage:
 *   try { ... } catch (err) {
 *     reportError(err, { route: '/api/cron/daily', step: 'digest' })
 *     // optionally re-throw or return error response
 *   }
 *
 * Wiring Sentry later requires zero app code changes:
 *   1. `npm i @sentry/nextjs`
 *   2. `npx @sentry/wizard@latest -i nextjs` (creates the config files)
 *   3. `vercel env add SENTRY_DSN production`
 *   4. Redeploy
 */

interface ErrorContext {
  route?: string
  userId?: string
  jobId?: string
  step?: string
  [key: string]: unknown
}

/**
 * Report an error with structured context. Never throws — error reporting
 * itself failing should never break the calling code path.
 */
export function reportError(error: unknown, context: ErrorContext = {}): void {
  const payload = {
    level: 'error' as const,
    timestamp: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  }

  // Always emit a structured log line so it's queryable in Vercel runtime
  // logs and any drain that's wired up at the project level.
  try {
    console.error(JSON.stringify(payload))
  } catch {
    // JSON.stringify can fail on circular structures — fall back to plain
    // console.error so we don't lose the signal entirely.
    console.error('[observability] failed to serialize error', error)
  }

  // Optional webhook for free-tier alerting (Slack, Discord, custom).
  // Fire-and-forget, never awaited, never blocks the caller.
  const webhook = process.env.ERROR_WEBHOOK_URL
  if (webhook) {
    void fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {
      // swallow — if the webhook is down we still have the log line above
    })
  }

  // Optional Sentry forwarding, if installed and configured. The import
  // path is held in a variable so TypeScript and the bundler don't try to
  // resolve `@sentry/nextjs` at build time — that keeps it a true optional
  // peer dep. Installing the package later upgrades every reportError()
  // call site without any code changes here.
  if (process.env.SENTRY_DSN) {
    void (async () => {
      try {
        const sentryModule = '@sentry/nextjs'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sentry = (await (Function('m', 'return import(m)') as (m: string) => Promise<any>)(sentryModule).catch(() => null)) as
          | { captureException?: (e: unknown, opts?: { extra?: Record<string, unknown> }) => void }
          | null
        if (sentry && typeof sentry.captureException === 'function') {
          sentry.captureException(error, { extra: context as Record<string, unknown> })
        }
      } catch {
        // never let sentry forwarding break the request
      }
    })()
  }
}

/**
 * Time a span and emit start/done structured logs. Use for high-value
 * routes where you want easy P50/P95 visibility from the log search.
 */
export function logSpan(name: string, route?: string) {
  const start = Date.now()
  console.log(JSON.stringify({ level: 'info', msg: 'start', span: name, route }))
  return {
    done(extra: Record<string, unknown> = {}) {
      console.log(
        JSON.stringify({
          level: 'info',
          msg: 'done',
          span: name,
          route,
          ms: Date.now() - start,
          ...extra,
        })
      )
    },
    fail(error: unknown, extra: Record<string, unknown> = {}) {
      reportError(error, { span: name, route, ms: Date.now() - start, ...extra })
    },
  }
}
