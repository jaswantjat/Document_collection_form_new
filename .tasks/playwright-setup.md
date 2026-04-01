# Playwright E2E Setup — Task Checklist

## Goal
Set up Playwright browser testing that lives in the codebase and works for remixers without any manual configuration.

## Environment Diagnosis (first-principles)

| Check | Finding |
|---|---|
| OS | Ubuntu 24.04.2 LTS overlay on NixOS (`#1-NixOS SMP`) |
| Node | v20.20.0 |
| apt-get | **Blocked** — Replit stub. Cannot install system deps via apt. |
| Playwright (npx) | 1.59.0 via npx cache |
| nixpkgs channel | `stable-25_05` |
| `playwright-driver` version in nix | **1.52.0** |
| Replit Chromium env var | `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` — a Nix-built Chromium 1.55.0 (revision 1187) with CJK fonts |
| Replit LD library path | `REPLIT_LD_LIBRARY_PATH` — all shared libraries pre-wired |

**Key insight:** Replit pre-builds a Playwright-compatible Chromium in the nix store and exposes it via `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE`. No browser download needed.

**ffmpeg (for video/tracing):** Lives in `pkgs.playwright-driver.browsers` nix store. Set `PLAYWRIGHT_BROWSERS_PATH` to that store path so Playwright can find it.

---

## Tasks

### [x] 1. Compatibility research
- Confirmed: NixOS environment → `apt-get` is blocked
- Confirmed: Replit provides `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` and `REPLIT_LD_LIBRARY_PATH`
- Confirmed: nixpkgs stable-25_05 has `playwright-driver` (1.52.0) with ffmpeg at correct revision
- Confirmed: Ubuntu 24.04-specific browser builds present in nix store

### [x] 2. Nix system dependency — playwright-driver
- Installed `playwright-driver` via Nix system packages
- This ensures `replit.nix` includes the package — reproducible for remixers
- **File:** `replit.nix`

### [x] 3. npm package — @playwright/test@1.55.0
- Installed at root level to match Replit's Chromium build (1.55.0 / chromium-1187)
- Added to `devDependencies` in `package.json`
- **File:** `package.json`

### [x] 4. Playwright configuration
- **File:** `playwright.config.ts` (root)
- Uses `executablePath: REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` (Replit-provided Chromium)
- Passes `LD_LIBRARY_PATH` from `REPLIT_LD_LIBRARY_PATH` into launch options
- Headless, no-sandbox, Chromium only
- baseURL: `http://localhost:5000` (dev frontend)

### [x] 5. Test runner wrapper script
- **File:** `scripts/e2e.sh`
- Dynamically resolves `playwright-driver.browsers` nix path at runtime via `nix-build`
- Sets `PLAYWRIGHT_BROWSERS_PATH` → nix ffmpeg available for video/trace recording
- Sets `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true`
- Sets `LD_LIBRARY_PATH` from `REPLIT_LD_LIBRARY_PATH`

### [x] 6. Test structure
- `tests/e2e/smoke.spec.ts` — 3 smoke tests (page load, HTTP 200, backend health)
- `tests/e2e/form-navigation.spec.ts` — 2 navigation tests
- `tests/fixtures/helpers.ts` — shared helpers (waitForAppReady, projectUrl)

### [x] 7. npm scripts
- `npm run test:e2e` — run all tests
- `npm run test:e2e:smoke` — smoke tests only
- `npm run test:e2e:nav` — navigation tests only

### [x] 8. .gitignore
- Added `playwright-report/` and `test-results/` to `.gitignore`

### [x] 9. Smoke run — all passing
```
✓ Smoke tests › app loads and shows the form (3.3s)
✓ Smoke tests › page responds with HTTP 200 (334ms)
✓ Smoke tests › backend health — /api responds (22ms)
✓ Form navigation › redirects to form when project code is missing (3.6s)
✓ Form navigation › shows an error or loading state for unknown project (1.6s)

5 passed in ~14s
```

---

## Remixer Compatibility

When someone remixes:
1. `replit.nix` → Nix installs `playwright-driver` + `playwright-driver.browsers`
2. `npm install` at root → installs `@playwright/test@1.55.0`
3. `npm run test:e2e` → `scripts/e2e.sh` resolves nix paths dynamically
4. Tests run against the dev server on port 5000

No browser downloads, no apt-get, no manual setup required.

---

## Status
- Started: 2026-04-01
- Completed: 2026-04-01
- Tasks complete: 9/9 ✅
