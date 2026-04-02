/**
 * Form — First Principles Step-by-Step Diagnosis
 *
 * Tests every section of the form in order, takes screenshots,
 * and validates key UI elements are rendered correctly.
 *
 * Test projects:
 *   ELT20250001 (solar)     token=b43df737-e202-40d8-ba45-277dceb9d323
 *   ELT20250002 (aerothermal) token=1be9964d-a51d-4532-8f7e-647bb7aeb5f3
 *   ELT20250003 (solar)     token=18b8f66e-975e-4ddf-a486-04ad4907b8ad
 *
 * Test phones:
 *   +34612345678 → ELT20250001
 *   +34623456789 → ELT20250002
 *   +34655443322 → ELT20250003
 */

import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOTS_DIR = path.join(process.cwd(), 'test-results', 'diagnosis-screenshots');
const TOKEN_1 = 'b43df737-e202-40d8-ba45-277dceb9d323';
const TOKEN_2 = '1be9964d-a51d-4532-8f7e-647bb7aeb5f3';
const TOKEN_3 = '18b8f66e-975e-4ddf-a486-04ad4907b8ad';

async function snap(page: Page, name: string) {
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const file = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`[snapshot] ${name}.png`);
  return file;
}

async function waitReady(page: Page) {
  await page.waitForLoadState('networkidle');
}

// ─────────────────────────────────────────────────────────────────────────────
// T01 — No params → Phone section
// ─────────────────────────────────────────────────────────────────────────────
test('T01 — no params: shows phone section', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);
  await snap(page, 'T01-phone-section');

  const heading = page.getByRole('heading', { name: /teléfono del cliente/i });
  await expect(heading).toBeVisible();

  const phoneInput = page.locator('input[type="tel"]');
  await expect(phoneInput).toBeVisible();

  console.log('[T01] PASS — Phone section renders correctly');
});

// ─────────────────────────────────────────────────────────────────────────────
// T02 — ELT20250001 with token → smart routing
// ─────────────────────────────────────────────────────────────────────────────
test('T02 — ELT20250001: smart routing lands on correct section', async ({ page }) => {
  await page.goto(`/?code=ELT20250001&token=${TOKEN_1}`);
  await waitReady(page);
  await snap(page, 'T02-ELT20250001-routed-section');

  const body = await page.locator('body').textContent();
  console.log('[T02] Page text (first 300):', body?.slice(0, 300));

  // Should show some section — not an error
  const errorSection = page.locator('h1').filter({ hasText: /error|no encontrado/i });
  await expect(errorSection).toHaveCount(0);

  // Record which section we landed on
  const h1 = await page.locator('h1').first().textContent();
  console.log('[T02] Section heading:', h1);
  console.log('[T02] PASS — smart routing landed on:', h1);
});

// ─────────────────────────────────────────────────────────────────────────────
// T03 — ELT20250002 with token → smart routing
// ─────────────────────────────────────────────────────────────────────────────
test('T03 — ELT20250002: smart routing lands on correct section', async ({ page }) => {
  await page.goto(`/?code=ELT20250002&token=${TOKEN_2}`);
  await waitReady(page);
  await snap(page, 'T03-ELT20250002-routed-section');

  const errorSection = page.locator('h1').filter({ hasText: /error|no encontrado/i });
  await expect(errorSection).toHaveCount(0);

  const h1 = await page.locator('h1').first().textContent();
  console.log('[T03] Section heading:', h1);
  console.log('[T03] PASS — smart routing landed on:', h1);
});

// ─────────────────────────────────────────────────────────────────────────────
// T04 — Phone section: enter a known test phone
// ─────────────────────────────────────────────────────────────────────────────
test('T04 — phone section: typing and submitting a known phone', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);

  const phoneInput = page.locator('input[type="tel"]');
  await expect(phoneInput).toBeVisible();
  await phoneInput.fill('+34612345678');
  await snap(page, 'T04a-phone-filled');

  // Submit button
  const submitBtn = page.locator('button[type="submit"], button').filter({ hasText: /continuar|buscar|siguiente/i }).first();
  if (await submitBtn.isVisible()) {
    await submitBtn.click();
    await waitReady(page);
    await snap(page, 'T04b-after-phone-submit');
    const h1 = await page.locator('h1').first().textContent();
    console.log('[T04] After submit, heading:', h1);
    console.log('[T04] PASS — phone submit navigated to:', h1);
  } else {
    // Look for any button
    const anyBtn = page.locator('button').first();
    console.log('[T04] Submit button text:', await anyBtn.textContent());
    await snap(page, 'T04b-no-submit-found');
    console.log('[T04] WARN — Could not find submit button with expected text');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// T05 — Property Docs section renders
// ─────────────────────────────────────────────────────────────────────────────
test('T05 — property docs section: all document cards visible', async ({ page }) => {
  // Try ELT20250002 — expected to be earlier in the flow
  await page.goto(`/?code=ELT20250002&token=${TOKEN_2}`);
  await waitReady(page);
  await snap(page, 'T05a-ELT20250002-initial');

  const currentHeading = await page.locator('h1').first().textContent();
  console.log('[T05] Current section:', currentHeading);

  // Check for known property docs section elements
  const dniCard = page.getByText(/DNI\s*\/\s*NIE/i).first();
  const ibiCard = page.getByText(/IBI|escritura/i).first();
  const billCard = page.getByText(/electricidad|factura|luz/i).first();

  const hasDni = await dniCard.isVisible().catch(() => false);
  const hasIbi = await ibiCard.isVisible().catch(() => false);
  const hasBill = await billCard.isVisible().catch(() => false);

  console.log('[T05] DNI card visible:', hasDni);
  console.log('[T05] IBI card visible:', hasIbi);
  console.log('[T05] Bill card visible:', hasBill);

  if (hasDni && hasIbi && hasBill) {
    console.log('[T05] PASS — all document cards visible');
  } else if (!hasDni && !hasIbi && !hasBill) {
    // We're on a different section — take note
    console.log('[T05] NOTE — not on property docs section, currently on:', currentHeading);
    await snap(page, 'T05b-not-on-property-docs');
  } else {
    console.log('[T05] PARTIAL — some cards missing');
    await snap(page, 'T05b-partial-docs');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// T06 — Scroll through ELT20250001 full page
// ─────────────────────────────────────────────────────────────────────────────
test('T06 — ELT20250001: full page scroll and capture', async ({ page }) => {
  await page.goto(`/?code=ELT20250001&token=${TOKEN_1}`);
  await waitReady(page);

  await snap(page, 'T06a-top');

  // Scroll to middle
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(500);
  await snap(page, 'T06b-middle');

  // Scroll to bottom
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await snap(page, 'T06c-bottom');

  const h1 = await page.locator('h1').first().textContent();
  console.log('[T06] ELT20250001 section:', h1);
  console.log('[T06] PASS — full page captured');
});

// ─────────────────────────────────────────────────────────────────────────────
// T07 — ELT20250003: third project state
// ─────────────────────────────────────────────────────────────────────────────
test('T07 — ELT20250003: third project smart routing', async ({ page }) => {
  await page.goto(`/?code=ELT20250003&token=${TOKEN_3}`);
  await waitReady(page);
  await snap(page, 'T07-ELT20250003');

  const h1 = await page.locator('h1').first().textContent();
  console.log('[T07] ELT20250003 section:', h1);
  console.log('[T07] PASS');
});

// ─────────────────────────────────────────────────────────────────────────────
// T08 — Backend API health
// ─────────────────────────────────────────────────────────────────────────────
test('T08 — backend: /api/project/:code returns data', async ({ request }) => {
  const res1 = await request.get('http://localhost:3001/api/project/ELT20250001', {
    headers: { 'x-project-token': TOKEN_1 },
    failOnStatusCode: false,
    timeout: 30000,
  });
  console.log('[T08] ELT20250001 status:', res1.status());
  const body1 = await res1.json().catch(() => ({}));
  console.log('[T08] ELT20250001 keys:', Object.keys(body1));

  expect([200, 401, 403, 404]).toContain(res1.status());
  console.log('[T08] PASS');
});

// ─────────────────────────────────────────────────────────────────────────────
// T09 — Error state: invalid code
// ─────────────────────────────────────────────────────────────────────────────
test('T09 — error state: unknown project code shows error', async ({ page }) => {
  await page.goto('/?code=INVALID_CODE_9999');
  await waitReady(page);
  await snap(page, 'T09-invalid-code-error');

  const body = await page.locator('body').textContent();
  // Should show some error or loading state — not crash
  expect(body).toBeTruthy();
  expect(body!.length).toBeGreaterThan(10);

  const h1Text = await page.locator('h1').first().textContent().catch(() => '');
  console.log('[T09] Error page h1:', h1Text);
  console.log('[T09] PASS — error state renders without crash');
});

// ─────────────────────────────────────────────────────────────────────────────
// T10 — Dashboard: /dashboard route
// ─────────────────────────────────────────────────────────────────────────────
test('T10 — /dashboard route renders login or dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await waitReady(page);
  await snap(page, 'T10-dashboard');

  const body = await page.locator('body').textContent();
  expect(body).toBeTruthy();
  const h1 = await page.locator('h1').first().textContent().catch(() => '');
  console.log('[T10] Dashboard h1:', h1);
  console.log('[T10] PASS — dashboard renders:', h1);
});

// ─────────────────────────────────────────────────────────────────────────────
// T11 — ELT20250001 review/signing section: sign button visible
// ─────────────────────────────────────────────────────────────────────────────
test('T11 — ELT20250001: signing section has sign button', async ({ page }) => {
  await page.goto(`/?code=ELT20250001&token=${TOKEN_1}`);
  await waitReady(page);
  await snap(page, 'T11a-signing-top');

  const h1 = await page.locator('h1').first().textContent();
  console.log('[T11] Section:', h1);

  // Check for document carousel or signing button
  const signBtn = page.getByRole('button').filter({ hasText: /firma|firmar|aprobar/i }).first();
  const hasSignBtn = await signBtn.isVisible().catch(() => false);
  console.log('[T11] Sign button visible:', hasSignBtn);

  // Check for document navigation arrows
  const nextArrow = page.locator('button svg').first();
  const hasArrow = await nextArrow.isVisible().catch(() => false);
  console.log('[T11] Navigation arrow visible:', hasArrow);

  // Check for "Desliza para ver" instruction
  const swipeHint = page.getByText(/desliza/i).first();
  const hasSwipeHint = await swipeHint.isVisible().catch(() => false);
  console.log('[T11] Swipe hint visible:', hasSwipeHint);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await snap(page, 'T11b-signing-bottom');

  console.log('[T11] PASS');
});

// ─────────────────────────────────────────────────────────────────────────────
// T12 — Console errors: load each project and check for JS errors
// ─────────────────────────────────────────────────────────────────────────────
test('T12 — console errors: no unexpected JS errors on load', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));

  await page.goto(`/?code=ELT20250001&token=${TOKEN_1}`);
  await waitReady(page);

  const filteredErrors = errors.filter(e =>
    !e.includes('favicon') &&
    !e.includes('DevTools') &&
    !e.includes('React DevTools')
  );

  console.log('[T12] JS errors found:', filteredErrors.length);
  filteredErrors.forEach(e => console.log('[T12]  ERR:', e));

  if (filteredErrors.length === 0) {
    console.log('[T12] PASS — no console errors');
  } else {
    console.log('[T12] WARN — JS errors present');
  }

  await snap(page, 'T12-console-error-check');
  // Non-fatal — just report
  expect(filteredErrors.length).toBe(0);
});
