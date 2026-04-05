# Product Requirements Document
## Eltex — Section Persistence, Signature UX & Document Preview

**Version**: 1.0  
**Date**: 2026-04-04  
**Status**: In Progress  
**Author**: Agent (from user conversation)

---

## Context

The Eltex form app is a mobile-first, multi-step wizard filled in by the sales assessor and/or the customer. Sessions are long (10–20 min) and interrupted frequently. The app already syncs to the server every 2 s and maintains localStorage/IndexedDB backups. However, three distinct UX gaps have been reported:

1. **Routing does not remember the current in-progress section across reloads.**
2. **The review page has no actionable card for a missing representation signature.**
3. **The document-signing carousel was incorrectly cropped, hiding the full preview.**

---

## Feature 1 — Persistent Section Routing on Reload

### Problem

When the assessor is mid-flow (e.g., filling in the Energy Certificate or on the Representation/Signing step) and reloads the page, `getInitialSection()` in `App.tsx` recomputes the section from scratch using completion flags. Because the EC is not yet "completed" or "skipped", the function falls back to an earlier section (e.g., `property-docs`). The user loses their place.

### User Story

> As an assessor filling in a customer's form, when I reload the page mid-flow I should land on the exact section I was on before the reload, not be sent back to the beginning.

### Acceptance Criteria

- [ ] The **current active section** is persisted to `formData` (or a parallel lightweight key in localStorage) within 300 ms of every navigation.
- [ ] On reload with a valid code+token, the app restores to the saved section rather than recomputing from completion flags.
- [ ] Completion-flag routing still acts as a **fallback** when no saved section exists (e.g., first visit, or saved section is invalid).
- [ ] If the saved section is `representation` but representation is now complete (user completed it from another device), routing advances to the next logical section.
- [ ] The saved section key is **cleared** when the form is successfully submitted.
- [ ] Works for all sections: `property-docs`, `province-selection`, `representation`, `energy-certificate`, `review`.
- [ ] `phone` is never persisted (it has no project code context).

### Technical Design

**Option A (recommended): store `currentSection` alongside `formData`**

Add `currentSection?: string` to `FormData` (or a sibling key in the backup object). Write it to localStorage immediately on every `goTo()` call (no debounce needed — it's tiny). Read it back in `getInitialSection()` and use it if it represents a valid, reachable section for the loaded project state.

```
goTo(section) {
  window.scrollTo(...)
  setCurrentSection(section)
  persistSectionToLocalStorage(code, section)  // ← new
}

getInitialSection(project, urlCode) {
  const saved = readSavedSection(urlCode)
  if (saved && isSectionReachable(saved, project.formData)) return saved
  // ... existing completion-flag logic (unchanged)
}
```

**`isSectionReachable(section, formData)` rules:**
- `property-docs` → always reachable
- `province-selection` → reachable if `hasPropertyDocsDone`
- `representation` → reachable if `hasPropertyDocsDone && location set && !hasRepresentationDone`
- `energy-certificate` → reachable if `hasPropertyDocsDone`
- `review` → reachable if `hasPropertyDocsDone`

**Key used in localStorage**: `eltex_section_${projectCode}` (separate from the formData backup key).

**Files to change**: `App.tsx`, possibly a tiny new helper `persistSection.ts` in `src/lib/`.

---

## Feature 2 — Missing Signature Card in Review Page

### Problem

The screenshot (step 5 — Revisión) shows the review page listing documents and the energy certificate status, but there is **no actionable entry for the representation documents or their signatures**. When signatures are missing, the user only sees a vague amber warning banner at the bottom. There is no card that lets them tap directly into the signing step.

### User Story

> As an assessor reviewing a customer's form, I need to see the representation/signature status as a tappable card (same style as DNI, IBI, electricity) so I can immediately navigate back to the signing step if signatures are absent.

### Acceptance Criteria

- [ ] A **"Documentos de representación"** card appears in the review page for locations that require representation documents (`cataluna`, `madrid`, `valencia`).
- [ ] When signatures are **complete**: card shows green check + "Firmados" label + document count. Tapping navigates to `representation` to review.
- [ ] When signatures are **missing/deferred**: card is styled as a **pending action card** (same blue-border style as DNI/IBI pending) with label "Firma pendiente" and "Firmar →" button. Tapping navigates to `representation`.
- [ ] For `location === 'other'` or no location: card is **not shown** (representation not required).
- [ ] The card appears **above** the energy certificate card in the list.
- [ ] The existing amber warning banner below is **removed** when the new card is added (avoids duplicate messaging). The banner was only needed because there was no direct action path — the card now replaces it.

### Technical Design

Add a representation status item to the review list in `ReviewSection.tsx`. The item has:

```typescript
{
  id: 'representation',
  description: 'Documentos de representación',
  hint: signaturesOk ? `${docCount} documentos firmados` : 'Firma pendiente — toca para completar',
  done: signaturesOk,
  section: 'representation',
  icon: FileText,
}
```

Insert this item in `allItems` **before** energy-certificate, conditionally only when `location !== 'other' && !!location`.

Remove the standalone amber warning block (lines 417–426 of current `ReviewSection.tsx`).

**Files to change**: `ReviewSection.tsx`.

---

## Feature 3 — Document Preview: Revert Crop, Add Scroll-to-Signature

### Problem

The previous session added `maxHeight: '220px', overflowY: 'hidden'` to the document carousel in `RepresentationSection.tsx` to keep the signature pad visible without scrolling. The user explicitly did not want the preview cropped — they want to see the **full document** in the carousel. Instead, the desired behaviour is:

- Full A4 preview visible (no crop).
- **On mount**, the page auto-scrolls down so the signature pad is clearly in view (the user sees both the bottom of the doc and the pad).
- **After signing** (and auto-cycle completes), the page scrolls back up to show the documents being stamped.

The user also referenced "auto scroll to the documentation of the tax and the representation" — this means when arriving at the signing step, the documents should be briefly shown before the scroll lands on the pad.

### User Story

> As a customer signing the documents, I want to see the full document preview first, then have the page smoothly scroll me to the signature pad so I don't have to manually scroll. The document should not be cropped.

### Acceptance Criteria

- [ ] **No carousel height cap** — `maxHeight: '220px'` and `overflowY: 'hidden'` are removed. Full A4 document renders at natural width-driven height.
- [ ] **On section mount**: a `useEffect` fires after 600 ms and smoothly scrolls the scrollable container so the signature pad label ("Firma para aprobar...") is at or near the top of the viewport.
- [ ] The auto-scroll does **not** fire if the user has already started interacting with the page (scrolled manually or tapped).
- [ ] **After the auto-cycle** (carousel sweeps through all docs after first signature), the page scrolls back up to show doc 1 at the top again, giving a "stamped all" visual. This part is already implemented.
- [ ] The `allDocsToured` dot-fill behaviour is preserved.
- [ ] The fullscreen modal ("Toca para leer") continues to work.

### Technical Design

In `RepresentationSection.tsx`:

1. **Remove** `maxHeight: '220px', overflowY: 'hidden'` from the carousel scroll container's `style` prop.

2. **Add** a `scrollContainerRef` on the outer `overflow-y-auto` div (the scrollable top area).

3. **Add** a `signatureLabelRef` on the `<p>` element "Firma para aprobar todos los documentos".

4. **Add** `useEffect` that fires once on mount:
   ```typescript
   useEffect(() => {
     const id = setTimeout(() => {
       signatureLabelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
     }, 700);
     return () => clearTimeout(id);
   }, []);
   ```

5. After auto-cycle completes (`allDocsToured` becomes true), scroll back to top:
   ```typescript
   useEffect(() => {
     if (!allDocsToured) return;
     scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
   }, [allDocsToured]);
   ```

**Files to change**: `RepresentationSection.tsx`.

---

## Implementation Order

| # | Feature | Risk | Effort | Priority |
|---|---------|------|--------|----------|
| 1 | Revert carousel crop + auto-scroll | Low | Small | High (regression fix) |
| 2 | Missing signature card in review | Low | Small | High |
| 3 | Section persistence on reload | Medium | Medium | High |

Implement in order: 1 → 2 → 3.

---

## Out of Scope

- Changing the actual document templates or overlay coordinates (separate session).
- Admin dashboard changes.
- Push notifications or email reminders for deferred signatures.

---

## Open Questions

- Q: Should `review` be a saveable section? Currently it auto-submits when coming from EC (`autoSubmit=true`). If we restore to `review`, the auto-submit won't fire on reload (correct behaviour — prevent accidental double submit). **Decision**: Yes, save `review` as a section; `autoSubmit` only fires from the EC→review navigation, not from restore.
- Q: Should the scroll-to-signature fire on every visit, or only on first mount? **Decision**: every mount (user re-enters the section from Back navigation).

---

## Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-04-04 | 1.0 | Initial PRD created from user conversation |
