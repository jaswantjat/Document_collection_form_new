import { test, expect } from '@playwright/test';
import { getProjectAccess, loginDashboard } from './helpers/projectAccess';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';

test.describe('Bug Regressions', () => {
  test('REG-04: customer root without a code or with source=assessor shows contact-advisor handling', async ({ page }) => {
    await page.goto('/?source=assessor', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Sin código de proyecto' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/accede desde el enlace/i)).toBeVisible({ timeout: 15000 });
    await expect(page.locator('input[type="tel"]')).toHaveCount(0);
  });

  test('REG-01: public phone lookup is blocked without a dashboard session', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/lookup/phone/${encodeURIComponent('+34612345678')}`, {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: 'UNAUTHORIZED',
    });
  });

  test('REG-02: /api/project/:code rejects a stray wrong token instead of allowing code-only access', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/project/ELT20250001`, {
      headers: { 'x-project-token': 'wrong-token' }
    });

    expect(res.status()).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: 'INVALID_TOKEN',
    });
  });

  test('REG-03: international phone format is accepted by staff lookup when dashboard-authenticated', async ({ request }) => {
    const dashboardToken = await loginDashboard(request);
    const phones = ['+447700900000', '+33612345678', '+12025550123'];
    for (const phone of phones) {
      const res = await request.get(`${API_BASE}/api/lookup/phone/${encodeURIComponent(phone)}`, {
        headers: { 'x-dashboard-token': dashboardToken },
        failOnStatusCode: false,
      });
      expect([200, 404]).toContain(res.status());
      const body = await res.json();
      if (res.status() === 404) {
        expect(body.error).toBe('NOT_FOUND');
      }
    }
  });

  test('REG-05: invalid customer link shows contact-advisor handling', async ({ page }) => {
    await page.goto('/?code=UNKNOWN_TEST_CODE_12345');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /enlace no válido/i })).toBeVisible();
    await expect(page.getByText(/contacta con tu asesor/i)).toBeVisible();
    await expect(page.locator('input[type="tel"]')).toHaveCount(0);
  });

  test('REG-06: valid customer link still works when both query token and header token are present', async ({ request }) => {
    const { accessToken } = await getProjectAccess(request, 'ELT20250001');
    const res = await request.get(`${API_BASE}/api/project/ELT20250001?token=${encodeURIComponent(accessToken)}`, {
      headers: { 'x-project-token': accessToken },
    });
    expect(res.status()).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      project: { code: 'ELT20250001' },
    });
  });
});
