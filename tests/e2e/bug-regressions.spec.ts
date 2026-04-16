import { test, expect } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';

test.describe('Bug Regressions', () => {
  test('REG-01: bare home page stays on the public phone start flow', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('input[type="tel"]').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /continuar|buscar|seguir/i }).first()).toBeVisible();
  });

  test('REG-02: stale or unknown codes recover to the public start flow instead of dead-ending', async ({ page }) => {
    await page.goto('/?code=UNKNOWN_TEST_CODE_12345');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('input[type="tel"]').first()).toBeVisible();
  });

  test('REG-03: /api/project/:code stays code-based even if a stray x-project-token header is present', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/project/ELT20250001`, {
      headers: { 'x-project-token': 'wrong-token' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.project?.code).toBe('ELT20250001');
  });

  test('REG-04: international phone format is accepted by the public lookup route', async ({ request }) => {
    const phones = ['+447700900000', '+33612345678', '+12025550123'];

    for (const phone of phones) {
      const res = await request.get(`${API_BASE}/api/lookup/phone/${encodeURIComponent(phone)}`, {
        failOnStatusCode: false,
      });
      expect([200, 404]).toContain(res.status());
      const body = await res.json();
      if (res.status() === 404) {
        expect(body.error).toBe('NOT_FOUND');
      }
    }
  });
});
