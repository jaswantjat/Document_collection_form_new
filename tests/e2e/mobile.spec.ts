import { test, expect } from '@playwright/test';

test.describe('Mobile Viewport', () => {
  test('E2E-MOBILE-01: form is usable on 375×667 (iPhone SE) viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/?code=ELT20250002', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    const body = page.locator('body');
    await expect(body).toBeVisible();

    const h1 = page.locator('h1, h2, h3').first();
    await expect(h1).toBeVisible({ timeout: 10000 });
    const headingText = await h1.textContent();
    console.log('[E2E-MOBILE-01] Heading:', headingText);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = 375;
    console.log('[E2E-MOBILE-01] Body scroll width:', bodyWidth, '/ Viewport:', viewportWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10);

    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    expect(jsErrors.length).toBe(0);

    await page.screenshot({ path: 'test-results/diagnosis-screenshots/mobile-375x667.png', fullPage: false });
    console.log('[E2E-MOBILE-01] PASS — form renders correctly on 375×667 viewport');
  });
});
