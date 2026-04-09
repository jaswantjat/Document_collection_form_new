import { test, expect } from '@playwright/test';

test.describe('Customer asset loading', () => {
  test('ASSET-01: initial customer load avoids downstream section and PDF assets', async ({ page }) => {
    const loadedUrls: string[] = [];

    page.on('requestfinished', (request) => {
      const url = request.url();
      if (url.includes('/src/') || url.includes('/assets/')) {
        loadedUrls.push(url);
      }
    });

    await page.goto('/?code=ELT20250001', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await expect(page.locator('h1').first()).toContainText('Documentos');
    await page.waitForTimeout(700);

    const joined = loadedUrls.join('\n');
    expect(joined).not.toMatch(/RepresentationSection|EnergyCertificateSection|ReviewSection/i);
    expect(joined).not.toMatch(/pdfjs-dist|pdf\.worker/i);
  });
});
