# Performance & Reliability Tracker

## Issues & Status

| # | Issue | Priority | Status | Notes |
|---|-------|----------|--------|-------|
| 1 | Form data lost on page refresh (within 2s debounce window) | Critical | ✅ Done | localStorage backup (300ms) + beforeunload server save |
| 2 | Document upload progress lost on refresh | Critical | ✅ Done | Full photo data (base64) persisted to localStorage within 300ms |
| 3 | Energy certificate summary image too slow (1.1MB JPEG 2481×3509px) | High | ✅ Done | Compressed to 116KB — 89% reduction |
| 4 | Thermal images slow (64–152KB PNG with transparency) | Medium | ✅ Done | Converted to optimized JPG: 8–16KB each — up to 93% reduction |
| 5 | Blur detection UX — blurry rejections showed no preview and generic error | High | ✅ Done | BlurWarningCard with preview, tips, and retry; BLUR_THRESHOLD raised 100→150; `reason` field on validation result; 'blurry' errorCode added |

---

## Root Cause Analysis (First Principles)

### Issue 1 & 2: Data Loss on Refresh

**Why it happens:**
- Auto-save uses a 2-second debounce (`useFormState.ts` line 326)
- If user refreshes within 2 seconds of a change, the server save never fires
- No `beforeunload` event handler to flush pending save
- No local cache — all state lives only in React memory + server DB

**First-principles solution implemented:**
1. `useLocalStorageBackup` hook: Writes full form data (including photo base64) to `localStorage` within 300ms of every change. Covers the 0–300ms window.
2. `useBeforeUnloadSave` hook: On `beforeunload`, triggers `fetch` with `keepalive: true` to flush current state to the server. Payload capped at 60KB (browser keepalive limit) — if too large (many photos), localStorage covers it safely.
3. On app load: Compare localStorage `savedAt` timestamp vs server `lastActivity`. If localStorage is >500ms newer, use it. This seamlessly merges any unsaved changes from the last session.

### Issue 3 & 4: Slow Images

**Why it happens:**
- `energy-certificate-summary.jpg` is 2481×3509px at 300 DPI — print resolution served on the web
- Thermal PNGs had RGBA transparency that isn't needed for display, forcing the larger PNG format
- No image sizing appropriate for screen

**Solution implemented:**
- Resize & compress `energy-certificate-summary.jpg` (1.1MB → 116KB, 900px wide, quality 82)
- Convert thermal images to optimized JPGs with white background flatten (64–152KB → 8–16KB)
- Updated imports in `EnergyCertificateSection.tsx` to use new files

---

## Files Changed

| File | What changed |
|------|-------------|
| `app/src/hooks/useBeforeUnloadSave.ts` | NEW — fires keepalive fetch to server on page unload |
| `app/src/hooks/useLocalStorageBackup.ts` | NEW — 300ms localStorage backup of full form data |
| `app/src/App.tsx` | Added imports & hook calls; localStorage merge logic on project load |
| `app/src/sections/EnergyCertificateSection.tsx` | Updated image imports to compressed JPG versions |
| `app/src/assets/energy-certificate/energy-certificate-summary-web.jpg` | NEW — 116KB (was 1.1MB) |
| `app/src/assets/energy-certificate/thermal-*-web.jpg` | NEW — 8–16KB each (was 64–152KB PNG) |
| `app/public/energy-certificate-assets/*-web.jpg` | NEW — public copies of compressed assets |

---

## Image Compression Results

| File | Before | After | Reduction |
|------|--------|-------|-----------|
| energy-certificate-summary.jpg | 1,102 KB | 116 KB | **89%** |
| thermal-calentador.png → .jpg | 119 KB | 8 KB | **93%** |
| thermal-caldera.png → .jpg | 79 KB | 12 KB | **85%** |
| thermal-aerotermia.png → .jpg | 60 KB | 16 KB | **73%** |
| thermal-termo-electrico.png → .jpg | 149 KB | 12 KB | **92%** |
| **Total** | **1,509 KB** | **164 KB** | **89%** |

---

## Persistence Architecture (New)

```
User makes a change (form field, photo upload, selection)
        │
        ├─ 300ms → localStorage.setItem() [full data, all photos, base64]
        │           Key: eltex_form_backup_<code>  TTL: 7 days
        │
        ├─ 2000ms → POST /api/project/:code/save  [server, full data]
        │            (existing useFormState auto-save — unchanged)
        │
        └─ beforeunload → fetch keepalive POST [only if payload < 60KB]
                           Skips silently if too large (photos) — localStorage covers it

On page load:
  1. Fetch project from server
  2. Read localStorage backup for this project code
  3. If localStorage.savedAt > server.lastActivity + 500ms → use localStorage data
  4. Render with the most recent data
```

---

## QA Test Checklist

### Done (automated/visual verification)
- [x] TypeScript compiles with no errors (npx tsc --noEmit)
- [x] App renders correctly on test project ELT20250004
- [x] Energy certificate section loads with no console errors
- [x] Image files confirmed at correct sizes

### Needs manual testing
- [ ] Upload a DNI photo, refresh immediately → data persists
- [ ] Fill in energy certificate form fields, refresh within 1 second → data persists
- [ ] Upload electricity bill, refresh during AI extraction → photo visible on reload
- [ ] Energy certificate thermal images display correctly after JPG conversion
- [ ] Signing flows still work (representations, Catalonia, Madrid/Valencia)
- [ ] Auto-save still fires on slow connections (server save still fires at 2s)
- [ ] No data corruption when merging localStorage + server data

### Performance Benchmarks
- [x] Thermal images: 8–16KB (down from 64–152KB)
- [x] Summary image: 116KB (down from 1.1MB)
- [x] Energy certificate section initial load: instant (no console errors)

---

### Issue 5: Blur Detection UX

**Why it failed silently:**
- Old `validatePhoto` returned `{ valid: false, error: '...' }` with no `reason` field — callers couldn't distinguish blur from size/format errors
- Preview (`fileToPreview`) was only generated AFTER validation passed — blur rejections had no image to show
- All 3 pipelines (DocCard, DNI, Electricity) showed the same generic red error banner regardless of cause
- `BLUR_THRESHOLD=100` only caught severely blurry images; many government-portal-rejectable images still passed

**Fix applied (2026-04-02):**
1. `PhotoValidationResult` extended with `reason?: 'blurry' | 'too-small' | 'too-large' | 'other'` and `blurScore?`
2. `BLUR_THRESHOLD` raised from 100 → 150
3. `validatePhoto` now returns `reason: 'blurry'` on blur failures
4. All 3 pipelines generate an immediate `URL.createObjectURL` preview BEFORE running validation, so the photo can be shown even on rejection
5. `'blurry'` added to `DocumentProcessingErrorCode`
6. New `BlurWarningCard` component shows: blurred preview image, amber warning badge, 4 actionable tips, prominent amber "Volver a fotografiar" button
7. DocCard uses `'blurry'` errorCode and shows BlurWarningCard for first-time uploads; replacement note updated for blur-specific message
8. DNI and Electricity `PendingItem` gains `reason` field; blur items render BlurWarningCard instead of generic error

**QA checklist:**
- [ ] Upload a clearly blurry photo to DNI section → see BlurWarningCard with preview and tips
- [ ] Upload blurry photo to IBI/DocCard → see BlurWarningCard (no generic red error)
- [ ] Upload blurry electricity bill → see BlurWarningCard
- [ ] "Volver a fotografiar" button dismisses the card and shows upload area again
- [ ] X button on blur card dismisses without retrying
- [ ] Sharp photo after dismissing blur card → processes correctly
- [ ] PDF upload skips blur check (skipBlurCheck=true) as before
- [ ] Non-blur errors (too small, too large) still show generic red error

---

## Pending / Future Improvements

| # | Idea | Notes |
|---|------|-------|
| 5 | Show "unsaved changes" indicator | Toast when localStorage has newer data than server |
| 6 | Service Worker for offline resilience | Cache API responses, allow offline form filling |
| 7 | Chunked photo upload | Upload photos in chunks with resume support for large files |
| 8 | Convert to WebP | ~30% smaller than JPG at same quality; needs server Accept header check |
