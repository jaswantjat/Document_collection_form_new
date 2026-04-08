import { test, expect, type Page } from '@playwright/test';

const PROJECT_URL = '/?code=ELT20250002';
const FOLLOW_UP_URL = '/?code=ELT20250005';

async function openEnergyCertificate(page: Page) {
  await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación');
  await page.getByRole('button', { name: /certificado energético/i }).click();
  await expect(page.locator('h1').first()).toContainText('Certificado energético');
}

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

  test('E2E-NET-02: follow-up submit still completes under added request latency', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.route('**/*', async (route) => {
      const resourceType = route.request().resourceType();
      if (resourceType !== 'websocket') {
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
      await route.continue();
    });

    await page.goto(FOLLOW_UP_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await openEnergyCertificate(page);
    await page.getByRole('button', { name: /saltar/i }).click();

    await expect(page.locator('h1').first()).toContainText('¡Todo listo', { timeout: 30000 });
    await expect(page.getByText(/hemos recibido tu documentación correctamente/i)).toBeVisible({ timeout: 30000 });
    expect(jsErrors).toEqual([]);
  });
});
