# Agent Learnings

Persistent memory store for non-obvious fixes, domain constraints, and recurring patterns discovered during development of the Eltex Document Collection Form.

## Format

Each entry is a JSON file in `entries/`:

```json
{
  "ts_utc": "YYYY-MM-DDTHH:MM:SSZ",
  "category": "architecture | domain | bug | pattern | security",
  "issue": "One-line description of the problem",
  "text": "Full explanation of root cause, fix, and why it matters.",
  "pointers": ["path/to/file.ts:line-range"]
}
```

## Index (19 entries)

| File | Category | Issue |
|------|----------|-------|
| `20260331-ec-suelo-radiante-radiator-visibility.json` | bug | Radiator material field visible but unselectable when suelo-radiante selected |
| `20260331-ec-autofill-eslint-stale-closure.json` | pattern | Catastral autofill useEffect intentionally omits 'data'/'onChange' — eslint-disable added |
| `20260331-ec-renderedDocument-bypass-removed.json` | decision-pattern | EC showed confirmado with empty fields due to renderedDocument bypass — bypass removed |
| `20260331-ec-catastral-autofill-and-optional.json` | bug | Catastral auto-fill missed manualCorrections; cadastralReference blocked form navigation when IBI absent |
| `20260331-ec-duplicate-display-and-download-groups-blank-space.json` | anti-pattern | EC appeared in SignedDocumentsSection AND EnergyCertificatePanel; EC in download groups caused blank column |
| `20260331-ec-pdf-onthefly-render.json` | architecture | EC PDF download missing for projects without stored imageDataUrl |
| `20260331-ec-stale-completed-status-downgrade.json` | bug | EC status incorrectly downgraded from completed to pending |
| `20260331-ec-completion-guard.json` | domain | EC completion guard logic — stored imageDataUrl as proof |
| `20260331-ec-backend-stale-status-downgrade.json` | bug | Backend EC stale status downgrade |
| `20260331-table-row-height-actions-column.json` | bug | Dashboard table rows too tall due to Actions column flex-col layout |
| `2026-03-31-dashboard-ec-status-display-gap.json` | bug | Blank space below Signed PDFs when EC is pending |
| `2026-03-31-dashboard-detail-api-uses-serializeProject.json` | architecture | Dashboard detail API serialization pattern |
| `2026-03-31-bug06-nie-certificate-side-detection.json` | bug | NIE certificate side detection |
| `2026-03-31-nie-testing-methodology.json` | pattern | NIE document testing methodology |
| `2026-03-31-name-mismatch-warning.json` | pattern | Name mismatch warning handling |
| `2026-03-31-testing-runtime-findings.json` | pattern | Testing runtime findings |
| `2026-03-30-bug04-energy-cert-inference-fix.json` | bug | Energy certificate inference fix |
| `2026-03-30-energy-cert-bugs.json` | bug | Energy certificate bug cluster |

## When to Add an Entry

Add a learning after:
- Fixing a subtle bug that required deep investigation
- Discovering a domain constraint not obvious from the code
- Finding a recurring pattern worth remembering across sessions

Use the `/learn` command to guide the process.
