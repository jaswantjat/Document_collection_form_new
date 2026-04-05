# PRD: Performance & Network Optimization
## Eltex Form — Low-Network Speed Improvements

**Version**: 1.0  
**Date**: 2026-04-05  
**Status**: Approved — In Development  
**Author**: Agent

---

## Context

The Eltex form is used in the field by solar installation assessors and their customers in rural Spain. Network conditions are often poor (1–2 bar mobile signal, 2G/3G). Three bottlenecks were identified via codebase analysis:

1. Express sends all API responses uncompressed — formData JSON with embedded base64 photos can be 2–5 MB per save/load.
2. Images sent to AI extraction are JPEG at 82% quality / 1600px max — 35–40% larger than needed for OCR accuracy.
3. Photo base64 data is embedded in every save payload — the server stores and returns megabytes of image data that only needs to travel once.

---

## PERF-01 — Express Response Compression

### Problem
Every `/api/project/:code/save`, `/api/project/:code/load`, and all JSON API responses are served without compression. A typical save payload with 3–4 uploaded photos embedded as base64 is 2–5 MB of raw JSON. On a 2Mbps mobile connection this takes 8–20 seconds.

### Solution
Add the `compression` npm package to the Express server. Base64 text inside JSON compresses at 5–7x ratio. The same 2–5 MB payload becomes 300–700 KB.

### Acceptance Criteria
- [ ] `compression` is installed in `backend/package.json`
- [ ] Middleware is applied before all routes in `server.js`
- [ ] `Content-Encoding: gzip` header is present on all JSON API responses
- [ ] No existing routes or functionality broken
- [ ] Response bodies are still valid JSON after decompression

### Technical Design
```js
const compression = require('compression');
app.use(compression());
```
Placed after `dotenv` setup but before any `app.use()` route registrations.

### Risk: Low
Pure additive middleware. Client browsers and fetch() decompress gzip automatically.

---

## PERF-02 — WebP + Smaller Resolution for AI Extraction

### Problem
`compressImageForAI()` in `app/src/lib/photoValidation.ts` currently outputs JPEG at 82% quality with a 1600px max dimension. For AI OCR of a Spanish DNI card, 1600px is far more than Gemini needs (1200px ≈ 350 DPI on a credit-card-sized document — well beyond OCR requirements). JPEG at 82% produces ~250KB per image. WebP at 70% produces ~140KB at equivalent perceived quality. Across a full form session (DNI front + back + IBI + electricity = 4 images), this is ~440KB less upload.

### Solution
Change `compressImageForAI()` defaults from JPEG 82% / 1600px to **WebP 70% / 1200px**.  
The display/preview compression (`fileToPreview`) stays at JPEG 80% / 1200px — this is stored in localStorage and shown in the UI; WebP there offers no practical benefit.

### Acceptance Criteria
- [ ] `compressImageForAI()` outputs `image/webp` at quality `0.70`
- [ ] Max dimension capped at `1200` (down from `1600`)
- [ ] `fileToPreview()` is unchanged (still JPEG, 1200px, 80%)
- [ ] AI extraction endpoints still accept the WebP data URLs correctly
- [ ] Existing callers in `PropertyDocsSection.tsx` work without changes
- [ ] WebP data URL prefix (`data:image/webp;base64,...`) is valid for OpenRouter Gemini vision

### Technical Design
In `photoValidation.ts`:
```ts
// Change default args only
export function compressImageForAI(dataUrl: string, maxPx = 1200, quality = 0.70): Promise<string> {
  // ... existing canvas logic, but output 'image/webp' instead of 'image/jpeg'
  resolve(canvas.toDataURL('image/webp', quality));
}
```

### Risk: Low
WebP is supported in all modern browsers (95%+ caniuse). OpenRouter accepts `data:image/webp;base64,...` in the `image_url` field. The canvas encode path is identical — only the MIME type and quality change.

---

## PERF-03 — Strip Photos from Save Payload (Progressive Upload)

### Problem
The `/api/project/:code/save` endpoint receives the entire `formData` object as JSON, including base64-encoded photo previews. Each photo is 50–150KB base64. With 4–6 documents, a save payload is 300KB–1MB of photo data. This happens on every auto-save (every 2 seconds while the user is active). The server stores all of this in `db.json`, and on project load it returns all of it back.

A separate `/api/project/:code/upload-assets` endpoint already exists and stores photos as binary files on disk. `preUploadAssets()` already calls it from the review screen. The photo binary is already on disk — sending base64 in the save payload is redundant.

### Solution
**Strip photo base64 from the save payload** before sending to the server. Replace photo previews with a sentinel marker `"__uploaded__"` so the server and other clients know the file exists without re-downloading its bytes. On reload, photos are restored from localStorage (which still holds the full preview for display).

Photos continue to be uploaded immediately via `upload-assets` when captured (new: call `preUploadAssets` after each document upload, not only at review).

### Acceptance Criteria
- [ ] `saveProgress()` in `useFormState.ts` strips photo base64 before sending — replaces with `"__uploaded__"` sentinel
- [ ] `preUploadAssets()` is called immediately after each document is accepted (not only at review)
- [ ] Server save payload is ≤ 50KB for a fully-filled project (was 300KB–1MB)
- [ ] On page reload, photos still display correctly (restored from localStorage)
- [ ] AI extraction is not affected — it uses the in-memory base64, not the server-stored value
- [ ] Admin ZIP download still works (files are already on disk via upload-assets)
- [ ] Existing localStorage backup continues to hold full photo data for offline support

### Technical Design

**Step 1 — `stripPhotosForSave(formData)`** — new utility function in `app/src/lib/`:
```ts
// Replaces all photo.preview base64 strings with "__uploaded__" sentinel
// so the save payload stays lean.
export function stripPhotosForSave(formData: FormData): FormData { ... }
```

**Step 2 — `useFormState.ts`** — call `stripPhotosForSave` in the debounced save:
```ts
const strippedFormData = stripPhotosForSave(currentFormData);
await saveProgress(code, strippedFormData, token);
```

**Step 3 — `PropertyDocsSection.tsx`** — call `preUploadAssets` immediately after a document is accepted, in the background (fire-and-forget, don't block UI):
```ts
preUploadAssets(project.code, updatedFormData, token).catch(() => {});
```

**Step 4 — `App.tsx` / data merge** — on project load, photos from localStorage should win if they are present (already handled by existing merge logic since localStorage is always ≤500ms newer than server on a fresh load).

### Risk: Medium
The existing localStorage→server merge logic must be verified to ensure photo data from localStorage is correctly restored when the server value is `"__uploaded__"`. The display of photos must be tested on reload. The AI extraction must be tested to ensure it reads from in-memory formData, not from the server-restored value.

---

## Implementation Order

| # | Feature | Effort | Risk | Priority |
|---|---------|--------|------|---------|
| 1 | PERF-01: Express gzip | 15 min | Low | Do first |
| 2 | PERF-02: WebP for AI | 20 min | Low | Do second |
| 3 | PERF-03: Strip photos from save | 1–2 hours | Medium | Do third |

After each feature: run QA sub-agent to verify no regressions.

---

## Out of Scope
- Cloudflare CDN setup (infrastructure, not code)
- Upstash Redis sessions (reliability, not network speed)
- Service Worker / offline sync (next sprint)
- Model migration (already handled separately)

---

## Definition of Done
- All three features implemented and passing QA
- No TypeScript errors (`cd app && npx tsc --noEmit`)  
- Backend starts cleanly
- `CHANGELOG.md` updated
- `AGENTS.md` task queue updated
