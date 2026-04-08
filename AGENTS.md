# AGENTS.md
> Persistent agent memory for this repo.
> Last updated: 2026-04-08

## Project
Eltex Document Collection Form. Mobile-first React + Vite frontend in `app/`, Express backend in `backend/`, Playwright E2E in `tests/e2e/`.

## Current Architecture Notes
- Customer project access is tokenless in the current branch. Customer URLs are `/?code=ELT...`; backend `requireProject` only checks existence by code.
- Dashboard/admin routes still use `x-dashboard-token`.
- Frontend dev server proxies `/api` and `/uploads` to `E2E_API_BASE_URL` when set, otherwise `http://localhost:3001`.

## Critical Performance / Reliability Notes
- `preUploadAssets()` is now manifest-driven and delta-only.
  - It sends `activeKeys` on every upload-assets request.
  - It only uploads binaries whose fingerprints changed in the current browser session.
  - If nothing changed, it skips the network call entirely.
- `/api/project/:code/upload-assets` now prunes stale `project.assetFiles` keys when `activeKeys` shrinks, and deletes obsolete files from disk.
  - Backward-compatible: if `activeKeys` is missing, the backend does not prune.
- `preparePhotoAssets()` in `app/src/lib/photoValidation.ts` generates both the UI preview JPEG and the AI WebP payload from a single base64 read / single canvas render.
  - Contract, IBI, DNI, and electricity flows all use it now.
- Review submit no longer falls back to a fat JSON payload.
  - Review retries `preUploadAssets()` if background pre-upload did not finish.
  - Final submit always uses `stripAllBinaryData(...)`.
- `saveProgress`, `preUploadAssets`, and `submitForm` now throw on non-2xx responses instead of silently treating error JSON as success.
- The large `pdf.worker` build artifact is not on the initial customer hot path.
  - `app/src/lib/pdfToImages.ts` loads `pdfjs-dist` via dynamic import only when browser-side PDF expansion is needed.
  - Normal first load and non-PDF customer flows do not eagerly download the worker.

## Known Current Validation State
- `npm --prefix app run test` passes: 234 tests.
- `node --test backend/lib/assetFiles.test.js` passes.
- `npm --prefix app run build` passes.
- `npx playwright test tests/e2e/smoke.spec.ts tests/e2e/api-coverage.spec.ts tests/e2e/form-navigation.spec.ts tests/e2e/low-network.spec.ts tests/e2e/mobile.spec.ts tests/e2e/bug-regressions.spec.ts tests/e2e/energy-certificate-flow.spec.ts tests/e2e/energy-certificate.spec.ts tests/e2e/customer-journey.spec.ts --reporter=list` passes: 29/29 against backend `:3002` and frontend `:5003`.
- `npm --prefix app run lint` has 5 pre-existing `react-hooks/exhaustive-deps` warnings but no lint errors.

## Important Files
- `app/src/services/api.ts`
- `app/src/lib/photoValidation.ts`
- `app/src/sections/PropertyDocsSection.tsx`
- `app/src/sections/ReviewSection.tsx`
- `backend/server.js`
- `backend/lib/assetFiles.js`

## Session Log
### 2026-04-08
- Fixed silent API success handling on save/upload/submit.
- Added delta asset uploads with `activeKeys` manifest support.
- Fixed stale uploaded asset retention when customers delete/retry documents.
- Reduced document-processing work by removing duplicate file reads/compressions.
- Added unit/backend/E2E regression coverage for the new behavior.
- Updated stale E2E expectations to the current review-first follow-up flow and tokenless project access model.
- Added `tests/e2e/customer-journey.spec.ts` coverage for deleted-stale-link recovery with the same phone number, local-backup resume-by-phone, and representation completion via the dev signature helper.
- Re-proved the customer browser matrix end-to-end: stale deleted link recovery, phone lookup/create, follow-up review routing, EC skip/resume permutations, mobile viewport, and low-network loading.
- Added explicit low-network submit proof in `tests/e2e/low-network.spec.ts` so follow-up submission is covered under added request latency, not only initial loading.
