import { test, expect } from '@playwright/test';
import { getProjectAccess } from './helpers/projectAccess';

test.describe('Customer asset loading', () => {
  test('ASSET-01: initial customer load avoids downstream section and PDF assets', async ({ page, request }) => {
    const loadedUrls: string[] = [];
    const { customerUrl } = await getProjectAccess(request, 'ELT20250001');

    page.on('requestfinished', (request) => {
      const url = request.url();
      if (url.includes('/src/') || url.includes('/assets/')) {
        loadedUrls.push(url);
      }
    });

    await page.goto(customerUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await expect(page.locator('h1').first()).toContainText('Documentos');
    await page.waitForTimeout(700);

    const joined = loadedUrls.join('\n');
    expect(joined).not.toMatch(/RepresentationSection|EnergyCertificateSection|ReviewSection/i);
    expect(joined).not.toMatch(/pdfjs-dist|pdf\.worker/i);
  });

  test('ASSET-02: html lazy chunk responses surface the recoverable load message', async ({ page }) => {
    await page.addInitScript(() => {
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
        nativeSetTimeout(handler, Math.min(timeout ?? 0, 5), ...args)) as typeof window.setTimeout;
    });

    let interceptedDashboardChunkRequests = 0;
    await page.route('**/*DashboardLogin*', async (route) => {
      interceptedDashboardChunkRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: '<!doctype html><html><body>stale deploy chunk</body></html>',
      });
    });

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Error de carga')).toBeVisible();
    await expect(
      page.getByText('No se pudo cargar esta sección. Comprueba tu conexión a internet e inténtalo de nuevo.')
    ).toBeVisible();
    expect(interceptedDashboardChunkRequests).toBeGreaterThanOrEqual(2);
  });
});
