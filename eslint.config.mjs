import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // NOTE: For RSC handler-prop violation detection (the April 2026 job-detail
  // crash with digest 1407542458), we rely on scripts/check-rsc-handlers.mjs
  // run via `npm run lint:rsc`. The dedicated ESLint plugin
  // (eslint-plugin-react-server-components) is broken under Node ESM, and
  // Next.js itself doesn't catch the pattern at build time — only at render
  // time, which means production crashes for users.
  // See tasks/lessons.md #14 for the rule rationale.

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
