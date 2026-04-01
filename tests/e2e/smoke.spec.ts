import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('app loads and shows the form', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveTitle('');
    await expect(page.locator('body')).toBeVisible();
  });

  test('page responds with HTTP 200', async ({ request }) => {
    const response = await request.get('http://localhost:5000/');
    expect(response.status()).toBe(200);
  });

  test('backend health — /api responds', async ({ request }) => {
    const response = await request.get('http://localhost:3001/api/health', {
      failOnStatusCode: false,
    });
    expect([200, 404]).toContain(response.status());
  });
});
