import { test, expect } from '@playwright/test';

const EC05_CODE = 'ELT20250005';
const EC05_TOKEN = 'ec-flow-token-5555';
const BACKEND = 'http://localhost:3001';

test.describe('Energy Certificate Flow Tests', () => {
  test.beforeEach(async ({ request }) => {
    // Restore full base state: property docs done + EC not-started
    // This prevents cross-test contamination when reset-property-docs is called in FLOW-04
    const res = await request.post(`${BACKEND}/api/test/restore-base-flow/${EC05_CODE}`);
    if (!res.ok()) {
      console.warn('[RESET] Failed to restore base flow for EC05:', await res.text());
    }
  });

  test('E2E-FLOW-01: EC section loads with all steps and skip button', async ({ page }) => {
    await page.goto(`/?code=${EC05_CODE}&token=${EC05_TOKEN}`);
    await page.waitForLoadState('networkidle');
    
    // Assert we're on EC section
    const heading = page.locator('h1').first();
    await expect(heading).toContainText('Certificado energético');
    
    // Assert step tabs are visible (exact match to avoid matching field labels like "Referencia Catastral de la Vivienda")
    await expect(page.getByText('Vivienda', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Instalación', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Equipamiento', { exact: true })).toBeVisible();
    
    // Assert skip button exists
    const skipBtn = page.getByRole('button', { name: /saltar/i });
    await expect(skipBtn).toBeVisible();
    
    // Assert housing form fields exist
    const nextBtn = page.getByRole('button', { name: /siguiente/i });
    await expect(nextBtn).toBeVisible();
  });

  test('E2E-FLOW-02: EC skip path — clicking Saltar routes to review section', async ({ page }) => {
    await page.goto(`/?code=${EC05_CODE}&token=${EC05_TOKEN}`);
    await page.waitForLoadState('networkidle');
    
    // Confirm we're on EC section
    const heading = page.locator('h1').first();
    await expect(heading).toContainText('Certificado energético');
    
    // Click skip
    const skipBtn = page.getByRole('button', { name: /saltar/i });
    await skipBtn.click();
    await page.waitForLoadState('networkidle');
    
    // After skipping, we should NOT be on EC section
    const newHeading = page.locator('h1').first();
    await expect(newHeading).not.toContainText('Certificado energético');
    
    // Should be on some next section (review/submit/signing)
    const headingText = await newHeading.textContent();
    console.log('[E2E-FLOW-02] After skip, heading:', headingText);
  });

  test('E2E-FLOW-03: EC resume path — partially filled housing data persists on reload', async ({ page, request }) => {
    // Seed EC with partial housing data (cadastralReference + some fields filled)
    const seedRes = await request.post(`${BACKEND}/api/test/reset-ec-partial/${EC05_CODE}`);
    expect(seedRes.ok()).toBeTruthy();

    // Open form — should route to EC section because property docs are done
    await page.goto(`/?code=${EC05_CODE}&token=${EC05_TOKEN}`);
    await page.waitForLoadState('networkidle');

    // Should be on EC section
    const heading = page.locator('h1').first();
    await expect(heading).toContainText('Certificado energético');

    // The cadastralReference field should show the seeded value from the server
    const cadastralInput = page.getByLabel('Referencia Catastral de la Vivienda');
    await expect(cadastralInput).toHaveValue('1234567VK1234A0001RT');
  });

  test('E2E-FLOW-04: follow-up path routing — property-docs → EC → review', async ({ page, request }) => {
    // Step 1: clear property docs → form should route to property-docs section
    const clearRes = await request.post(`${BACKEND}/api/test/reset-property-docs/${EC05_CODE}`);
    expect(clearRes.ok()).toBeTruthy();

    await page.goto(`/?code=${EC05_CODE}&token=${EC05_TOKEN}`);
    await page.waitForLoadState('networkidle');

    // Should land on property-docs section (representation done but docs missing)
    const heading1 = page.locator('h1').first();
    await expect(heading1).toContainText('Documentos');

    // Clear localStorage while still on the form page (before beforeunload fires)
    await page.evaluate(() => localStorage.clear());

    // Navigate to blank — this flushes the beforeunload keepalive save (with cleared-docs state).
    // Must happen BEFORE restore-base-flow so the keepalive doesn't overwrite the restored state.
    await page.goto('about:blank');
    await page.waitForLoadState('domcontentloaded');

    // Step 2: restore full flow state (property docs done, EC not-started) — safe after beforeunload
    const restoreRes = await request.post(`${BACKEND}/api/test/restore-base-flow/${EC05_CODE}`);
    expect(restoreRes.ok()).toBeTruthy();

    await page.goto(`/?code=${EC05_CODE}&token=${EC05_TOKEN}`);
    await page.waitForLoadState('networkidle');

    // Should now route to EC section
    const heading2 = page.locator('h1').first();
    await expect(heading2).toContainText('Certificado energético');

    // Step 3: skip EC → should route to review section
    const skipBtn = page.getByRole('button', { name: /saltar/i });
    await skipBtn.click();
    await page.waitForLoadState('networkidle');

    // Should be past EC section (on review)
    const heading3 = page.locator('h1').first();
    await expect(heading3).not.toContainText('Certificado energético');
    const finalHeading = await heading3.textContent();
    console.log('[E2E-FLOW-04] After skip, heading:', finalHeading);
  });
});
