# Hardening Backlog

## P0 Ship-Blocker
- Any production flow that loses uploaded customer documents or prevents submit/retry.
- Any dashboard summary/detail mismatch that misstates document completion.
- Any webhook/notification path that silently fails without persisted delivery status.
- Any readiness/deploy failure that allows Railway to look healthy while the app is not ready.

## P1 High-Risk
- Remaining oversized frontend hotspots: `App.tsx`, `useFormState`, dashboard table/panels, `services/api.ts`.
- Gaps in critical Playwright coverage outside the current critical suite.
- Remaining backend routes that still log via raw `console.*` instead of structured events.
- Manual-only production checks that can be moved into scripts or CI.

## P2 Polish
- Additional dashboard UX cleanup and more granular admin diagnostics.
- Further decomposition of large unit-test files.
- Broader performance and bundle-size monitoring beyond the current correctness gates.
