# Eltex Document Collection Form — Agent Instructions

Production web app for solar/aerothermal installation document workflows in Spain.

**Stack**: React 19 + TypeScript + Vite · Node.js/Express · JSON flat-file DB · Python/Flask autocropper

## Core Principles

1. **TypeScript-First** — strict types everywhere; no implicit `any`
2. **Domain Accuracy** — EC status values are `pending | skipped | completed` only; respect province-specific flows
3. **Immutability** — never mutate `db.json` fields directly; always write via the Express API
4. **Plan Before Execute** — for features touching PDF generation or signature overlays, plan before coding
5. **Preserve Learnings** — check `.codex/agent_learnings/entries/` before solving known problem classes

## Available Agents

| Agent | Purpose |
|-------|---------|
| explorer | Trace execution paths, cite files and symbols, map data flow |
| reviewer | Code quality, correctness, security, behavioral regressions |
| docs-researcher | Look up library APIs (pdf-lib, react-hook-form, etc.) |

## Key Files

| File | Purpose |
|------|---------|
| `app/src/pages/Dashboard.tsx` | Admin dashboard for assessors |
| `app/src/lib/dashboardProject.ts` | EC status derivation logic |
| `app/src/lib/energyCertificateDocument.ts` | EC PDF builder |
| `app/src/lib/energyCertificateValidation.ts` | EC form validation |
| `backend/server.js` | All API routes |
| `backend/db.json` | Flat-file data store |

## Commit Format

```
feat(dashboard): improve EC status badge display
fix(pdf): correct signature overlay alignment for Cataluña template
chore(deps): bump pdf-lib to 1.17.1
docs(agents): add agent learning for EC downgrade bug
```

## Research Defaults

1. Check local code and `.codex/agent_learnings/` first
2. Fetch library docs only for external/unstable facts
3. Summarize findings with file paths and line references
