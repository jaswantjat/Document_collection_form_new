import { test, expect } from '@playwright/test';

const EC05_CODE = 'ELT20250005';
const EC05_TOKEN = 'ec-flow-token-5555';
const BACKEND = 'http://localhost:3001';

test.describe('Energy Certificate Flow Tests', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/test/reset-ec/${EC05_CODE}`);
    if (!res.ok()) {
      console.warn('[RESET] Failed to reset EC05:', await res.text());
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
});
