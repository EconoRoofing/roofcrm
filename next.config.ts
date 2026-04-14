import type { NextConfig } from "next";

// ─── Security headers ───────────────────────────────────────────────────────
// Applied to every route via the wildcard source `/:path*`. Audit finding #36
// (empty next.config.ts) — before this, the portal page was frameable
// (clickjacking risk on the Pay Now link) and browsers had no HSTS/CSP signal.
//
// Intentionally NOT setting a strict CSP: the app uses heavy inline styles
// (next.js dev tooling + third-party libs like react-signature-canvas). A
// `default-src 'self'` policy would break them. We set the pragmatic basics
// (clickjacking, MIME sniffing, referrer, HSTS, basic XSS protection) now
// and tighten CSP in a separate hardening pass.
const SECURITY_HEADERS = [
  // Clickjacking protection — blocks the portal page from being iframed
  // by third parties. `SAMEORIGIN` lets us embed our own pages if we add
  // any iframe-based features later.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Prevents browsers from MIME-sniffing uploaded images/PDFs into something
  // executable (e.g. interpreting a .png as HTML).
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Limits what the browser sends in Referer headers to third parties.
  // `strict-origin-when-cross-origin` sends the origin but not the path —
  // enough for analytics, not enough to leak job ids or portal tokens.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // HSTS: force HTTPS for 2 years, apply to subdomains, eligible for preload.
  // Vercel already terminates TLS, but HSTS is what tells the BROWSER to
  // refuse plain HTTP on subsequent visits.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Disable sensors/devices the app doesn't use. Locks down the surface
  // even if a third-party script tries to request them.
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(self), interest-cohort=()',
  },
  // Legacy XSS filter toggle — modern browsers ignore this but some
  // intermediaries and older clients respect it. Harmless and cheap.
  { key: 'X-XSS-Protection', value: '1; mode=block' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ]
  },
}

export default nextConfig
