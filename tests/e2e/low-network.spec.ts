import { test, expect } from '@playwright/test';

const PROJECT_URL = '/?code=ELT20250002&token=1be9964d-a51d-4532-8f7e-647bb7aeb5f3';

test.describe('Low-network resilience', () => {
  test('E2E-NET-01: mobile form still reaches a usable state under added request latency', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.route('**/*', async (route) => {
      const resourceType = route.request().resourceType();
      if (resourceType !== 'websocket') {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      await route.continue();
    });

    await page.goto(PROJECT_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await expect(page.locator('body')).toBeVisible();

    const heading = page.locator('h1, h2, h3').first();
    await expect(heading).toBeVisible({ timeout: 20000 });

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(385);
    expect(jsErrors).toEqual([]);
  });
});
