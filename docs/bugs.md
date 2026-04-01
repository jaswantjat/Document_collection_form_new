# Bug Tracker — Eltex Document Collection Form

---

## BUG-001 · Contract card resets to "upload again" on form reload

**Status:** FIXED (2026-04-01)
**File:** `app/src/sections/PropertyDocsSection.tsx` — `ContractCard`

### Symptom
When a user uploads the Eltex contract and then returns to the same form link ("continue editing"), the contract card shows the upload prompt again instead of the previously uploaded document.

### Root Cause (First Principles)

`ContractCard` manages its own local `status` state:

```typescript
const [status, setStatus] = useState<ContractStatus>(() =>
  contract.originalPdfs.length > 0 || contract.extraction ? 'accepted' : 'idle'
);
```

`useState` with a lazy initializer (`() => ...`) **runs only once** — when the component first mounts. It never re-runs even if the `contract` prop changes later.

The async load sequence is:
1. Page loads → `useFormState` initializes with empty data (`savedFormData = null`) because the API call hasn't returned yet.
2. `ContractCard` mounts → `status = 'idle'` (empty contract at mount time).
3. API responds → `syncSavedFormData()` updates `formData` with the saved contract.
4. `ContractCard` receives a new `contract` prop with `originalPdfs` and `extraction` set.
5. **Bug:** `status` is still `'idle'` — `useState` only used the initial value from step 2.

The other document slots (DNI, IBI, electricity) are unaffected because their "accepted/idle" state is driven by `documentProcessing` inside `useFormState`, which is explicitly reset by `syncSavedFormData` every time saved data loads.

### Why It Only Affects Contract
- DNI/IBI/electricity: `documentProcessing` lives in `useFormState`, gets reset when saved data loads.
- Contract: `status` lives **inside** `ContractCard` as local state, never resynchronized with incoming prop changes.

### Fix Applied
Added a `useEffect` that syncs `status` whenever the presence of contract data changes:

```typescript
const hasContractData = contract.originalPdfs.length > 0 || !!contract.extraction;
useEffect(() => {
  setStatus(prev => {
    if (prev === 'processing') return prev; // never interrupt in-flight upload
    return hasContractData ? 'accepted' : 'idle';
  });
}, [hasContractData]);
```

Using `hasContractData` (a boolean primitive) as the dependency ensures:
- The effect only fires when data presence actually changes (true ↔ false).
- Object reference churn from `normalizeFormData()` (which recreates objects on every call) does NOT cause spurious re-runs.
- In-flight uploads (`status === 'processing'`) are never interrupted.

### Related Areas to Watch
- Any future document card that manages its own local `status` state (rather than using `documentProcessing` from `useFormState`) must include the same `useEffect` pattern.
- The silent `.catch(() => {})` on `saveProgress` means large-file save failures are invisible. If documents are reliably not persisting, investigate body size (`express.json({ limit: '25mb' })`).

---

## BUG-002 · Save failures are silently swallowed

**Status:** TRACKED — low priority
**File:** `app/src/hooks/useFormState.ts` line 337

### Symptom
If the auto-save POST request fails (network error, body too large, server error), the error is silently caught and discarded. The user sees no warning and assumes their data was saved.

### Root Cause
```typescript
saveProgress(projectCode, cleanData, projectToken).catch(() => {});
```

### Impact
If the total formData payload exceeds 25 MB (the Express body limit), the save silently fails and the user loses progress on reload. Multi-page PDFs stored as base64 in `originalPdfs` are the most likely cause of oversized payloads.

### Recommended Fix
Log the error to the console at minimum. Optionally surface a subtle toast/banner to the user ("No se pudo guardar el progreso — comprueba tu conexión").

---
