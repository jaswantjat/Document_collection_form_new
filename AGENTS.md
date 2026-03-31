# Eltex Document Collection Form — Agent Instructions

Production web app for solar/aerothermal installation document workflows in Spain.

---

## SESSION START — DO THIS FIRST

Read `.agents/session/CURRENT_TASK.md`. Check `Status`:
- **`idle`** → proceed normally
- **`in-progress`** → interrupted task exists — tell user what it was and ask to continue or start fresh
- **`paused`** → deliberately paused — ask user to confirm resumption

Full rules in `.agents/session/PROTOCOL.md`.

## WHILE WORKING — WRITE STATE TO DISK

After every significant step, update `.agents/session/CURRENT_TASK.md`:
- Mark completed steps
- Record the exact current step (file, line range, what's left)
- Log files modified and decisions made

**Always update before any destructive operation.**

---

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

## Skills Available

All 33 skills live in `.agents/skills/` and survive remixes. See `.agents/skills/INDEX.md` for full directory.

**Always load before any task:**
- `.agents/skills/ai-coding-workflow/SKILL.md` — PRD/EPIC/QA discipline
- `.agents/skills/ecc-patterns/SKILL.md` — memory, continuous learning, code review

**For Eltex engineering work (load as needed):**
- `backend-patterns` — Express routes, middleware, error handling
- `frontend-patterns` — React components, hooks, state management
- `api-design` — REST API design, versioning, validation
- `coding-standards` — TypeScript, naming conventions, linting rules
- `security-review` — Auth, input sanitization, file upload security
- `e2e-testing` / `tdd-workflow` — testing patterns
- `verification-loop` — QA before merges
- `documentation-lookup` — API/library reference research

## Research Defaults

1. Check local code and `.codex/agent_learnings/` first
2. Check `.agents/skills/` for relevant skill guidance before acting
3. Fetch library docs only for external/unstable facts
4. Summarize findings with file paths and line references
