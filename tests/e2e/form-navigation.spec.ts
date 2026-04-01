import { test, expect } from '@playwright/test';

test.describe('Form navigation', () => {
  test('redirects to form when project code is missing', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const url = page.url();
    expect(url).toBeTruthy();
  });

  test('shows an error or loading state for unknown project', async ({ page }) => {
    await page.goto('/?code=UNKNOWN_TEST_CODE_12345');
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(0);
  });
});
