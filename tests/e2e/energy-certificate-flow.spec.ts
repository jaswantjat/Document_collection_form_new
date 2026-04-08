import { test, expect, type Page } from '@playwright/test';

const EC05_CODE = 'ELT20250005';
const BACKEND = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';

async function openEnergyCertificate(page: Page) {
  await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación');
  await page.getByRole('button', { name: /certificado energético/i }).click();
  await expect(page.locator('h1').first()).toContainText('Certificado energético');
}

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
    await page.goto(`/?code=${EC05_CODE}`);
    await page.waitForLoadState('networkidle');

    await openEnergyCertificate(page);
    
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
    await page.goto(`/?code=${EC05_CODE}`);
    await page.waitForLoadState('networkidle');

    await openEnergyCertificate(page);

    // Click skip
    const skipBtn = page.getByRole('button', { name: /saltar/i });
    await skipBtn.click();
    await page.waitForLoadState('networkidle');

    // After skipping with everything else complete, the flow auto-submits to success.
    await expect(page.locator('h1').first()).toContainText('¡Todo listo');
  });

  test('E2E-FLOW-03: EC resume path — partially filled housing data persists on reload', async ({ page, request }) => {
    // Seed EC with partial housing data (cadastralReference + some fields filled)
    const seedRes = await request.post(`${BACKEND}/api/test/reset-ec-partial/${EC05_CODE}`);
    expect(seedRes.ok()).toBeTruthy();

    // Open form — should route to review first, then into EC on demand
    await page.goto(`/?code=${EC05_CODE}`);
    await page.waitForLoadState('networkidle');

    await openEnergyCertificate(page);

    // The cadastralReference field should show the seeded value from the server
    const cadastralInput = page.getByLabel('Referencia Catastral de la Vivienda');
    await expect(cadastralInput).toHaveValue('1234567VK1234A0001RT');
  });

  test('E2E-FLOW-04: follow-up path routing — property-docs → EC → review', async ({ page, request }) => {
    // Step 1: clear property docs → form should route to property-docs section
    const clearRes = await request.post(`${BACKEND}/api/test/reset-property-docs/${EC05_CODE}`);
    expect(clearRes.ok()).toBeTruthy();

    await page.goto(`/?code=${EC05_CODE}`);
    await page.waitForLoadState('networkidle');

    // Current follow-up logic lands on review first, with the missing docs surfaced as checklist items.
    await expect(page.locator('h1, h2').first()).toContainText(/Confirma tu documentación|Sube lo que falte y confirma/);
    const identityCard = page.getByRole('button', { name: /Documento de identidad del titular/i }).first();
    await expect(identityCard).toBeVisible();
    await identityCard.click();
    await expect(page.locator('h1').first()).toContainText('Documentos');

    // Clear localStorage while still on the form page (before beforeunload fires)
    await page.evaluate(() => localStorage.clear());

    // Navigate to blank — this flushes the beforeunload keepalive save (with cleared-docs state).
    // Must happen BEFORE restore-base-flow so the keepalive doesn't overwrite the restored state.
    await page.goto('about:blank');
    await page.waitForLoadState('domcontentloaded');

    // Step 2: restore full flow state (property docs done, EC not-started) — safe after beforeunload
    const restoreRes = await request.post(`${BACKEND}/api/test/restore-base-flow/${EC05_CODE}`);
    expect(restoreRes.ok()).toBeTruthy();

    await page.goto(`/?code=${EC05_CODE}`);
    await page.waitForLoadState('networkidle');

    await openEnergyCertificate(page);

    // Step 3: skip EC → should route to review section
    const skipBtn = page.getByRole('button', { name: /saltar/i });
    await skipBtn.click();
    await page.waitForLoadState('networkidle');

    // With all required steps resolved, skipping the EC auto-submits to success.
    await expect(page.locator('h1').first()).toContainText('¡Todo listo');
  });
});
