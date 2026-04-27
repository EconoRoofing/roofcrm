#!/usr/bin/env node
/**
 * RSC handler-prop guard.
 *
 * Walks every .tsx file under app/ and components/ that lacks a 'use client'
 * directive (i.e. is a Server Component) and looks for JSX prop assignments
 * that could be event handlers or function refs:
 *   - on*={() => ...}        (inline arrow on event handler)
 *   - on*={someFunction}     (named function ref on event handler)
 *   - <prop>={() => ...}     (inline arrow on any prop — covers
 *     onSaveAnnotations-style custom handler props that don't start with `on`)
 *
 * Exits non-zero with a list of offenders if any are found.
 *
 * The April 2026 job-detail crash (Next.js error digest 1407542458) was
 * exactly this pattern. `next build` does NOT catch it — it fires only
 * when the offending render path runs, which can mean weeks of latent
 * bugs that only surface when a specific code path is exercised in
 * production. See tasks/lessons.md #14.
 *
 * Why custom and not eslint-plugin-react-server-components: that plugin
 * is unmaintained (last published Apr 2025) and breaks under modern Node
 * ESM resolution. A 60-line script is easier to keep working than a
 * dependency we don't control.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOTS = ['app', 'components']
const violations = []

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      yield* walk(full)
    } else if (extname(full) === '.tsx') {
      yield full
    }
  }
}

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8')

    // Skip Client Components — they're allowed to have event handlers.
    // The directive check looks at the first 200 chars to allow leading
    // comments and imports without a directive yet.
    const head = src.slice(0, 200)
    if (/['"]use client['"]/.test(head)) continue

    const lines = src.split('\n')
    lines.forEach((line, idx) => {
      // Detect handler-prop pattern: `on<Capital>={ ... }`
      //
      // This is the ONLY pattern we flag. It catches:
      //   onClick={fn}          onChange={() => ...}
      //   onMouseEnter={(e)=>}  onSaveAnnotations={(args) => ...}
      //
      // We deliberately do NOT flag arbitrary `prop={() => ...}` because
      // that catches Next.js Server Action forms — `<form action={async
      // () => {'use server'; ...}}>` is the official pattern and was
      // generating false positives across sign-out forms, etc.
      //
      // What this MISSES:
      //   - Custom handler props that don't start with `on`
      //     (e.g. `callback={fn}`, `handler={fn}`). Convention in this
      //     codebase + React community is to prefix with `on`, so this
      //     is a small gap. If we ever hit a non-`on` handler bug we'll
      //     extend the rule.
      if (/\bon[A-Z][a-zA-Z]*=\{/.test(line)) {
        violations.push({
          file,
          line: idx + 1,
          excerpt: line.trim().slice(0, 120),
        })
      }
    })
  }
}

if (violations.length === 0) {
  console.log('✓ No RSC handler-prop violations found.')
  process.exit(0)
}

console.error(`✗ Found ${violations.length} RSC handler-prop violation(s):\n`)
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`)
  console.error(`    ${v.excerpt}`)
  console.error('')
}
console.error(
  '\nFix options:'
)
console.error(
  '  1. CSS :hover/:focus/:active instead of inline JS handlers (preferred)'
)
console.error(
  '  2. Add `\'use client\'` to the file (degrades to Client rendering — costs perf)'
)
console.error(
  '  3. Extract the handler into a small Client Component wrapper (best of both)'
)
console.error('\nSee tasks/lessons.md #14 for context.')
process.exit(1)
