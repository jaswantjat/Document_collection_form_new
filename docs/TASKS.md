# Eltex Task Tracker

## Bug Fixes

### [DONE] Submit stuck on "Enviando tu documentación..."
**Root cause:** `ReviewSection` initializes `submitting` state to `true` when `autoSubmit=true` (via `useState(autoSubmit)`). The `submit()` function guarded with `if (submitting) return` would immediately return because `submitting` was already `true`, so the actual submission never ran — only the spinner showed.

**Fix:** Replaced state-based guard with a `useRef` (`submitInProgress`) that tracks whether an async submit is truly running. The ref starts at `false` even when the component mounts with `autoSubmit=true`.

**Files:** `app/src/sections/ReviewSection.tsx`

---

### [DONE] Slow submission / loading
**Root causes:**
1. Energy certificate canvas rendered at 2480×3508 px (A4 @ 300 DPI) — ~8.7M pixels, very slow on mobile.
2. JPEG quality at 0.92 produced a large (~3–5 MB) base64 payload sent in the submit request.
3. `saveDB()` used `fs.writeFileSync`, blocking the Node.js event loop on every save.
4. No timeout on `submitForm` fetch — a slow server left users waiting forever.

**Fixes:**
- Canvas uses a `SCALE = 0.5` factor: logical drawing space stays at 300 DPI coordinates, but output canvas pixels are 1240×1754 (150 DPI) — 4× fewer pixels, same layout.
- JPEG quality reduced from 0.92 → 0.82.
- `saveDB()` converted to async (`fs.writeFile`) with a write-queue so concurrent calls coalesce and the event loop is never blocked.
- `submitForm` fetch now has a 60-second `AbortSignal.timeout`.
- Template version bumped to `2026-04-01.3` to invalidate stale cached renders.

**Files:** `app/src/lib/energyCertificateDocument.ts`, `app/src/services/api.ts`, `backend/server.js`

---

## Open / Backlog

_(none)_
