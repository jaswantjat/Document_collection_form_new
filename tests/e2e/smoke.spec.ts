import { test, expect } from '@playwright/test';

const FRONTEND_BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5000';
const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';

test.describe('Smoke tests', () => {
  test('app loads and shows the form', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveTitle('');
    await expect(page.locator('body')).toBeVisible();
  });

  test('page responds with HTTP 200', async ({ request }) => {
    const response = await request.get(`${FRONTEND_BASE}/`);
    expect(response.status()).toBe(200);
  });

  test('backend health — /api responds', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/health`, {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ready).toBe(true);
    expect(['ok', 'degraded']).toContain(body.status);
  });
});
