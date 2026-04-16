import { test, expect, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';

async function openEnergyCertificate(page: Page) {
  await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación');
  await page.getByRole('button', { name: /certificado energético/i }).click();
  await expect(page.locator('h1').first()).toContainText('Certificado energético');
}

test.describe('Low-network resilience', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${BACKEND}/api/test/restore-base-flow/ELT20250005`);
  });

  test('E2E-NET-01: mobile form still reaches a usable state under added request latency', async ({ page, request }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const customerUrl = '/?code=ELT20250002';

    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.route('**/*', async (route) => {
      const resourceType = route.request().resourceType();
      if (resourceType !== 'websocket') {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      await route.continue();
    });

    await page.goto(customerUrl, {
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

  test('E2E-NET-02: follow-up submit still completes under added request latency', async ({ page, request }) => {
    const customerUrl = '/?code=ELT20250005';
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.route('**/*', async (route) => {
      const resourceType = route.request().resourceType();
      if (resourceType !== 'websocket') {
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
      await route.continue();
    });

    await page.goto(customerUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await openEnergyCertificate(page);
    await page.getByRole('button', { name: /saltar/i }).click();
    await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación', { timeout: 30000 });
    await page.getByTestId('review-submit-btn').click();

    await expect(page.locator('h1').first()).toContainText('¡Todo listo', { timeout: 30000 });
    await expect(page.getByText(/hemos recibido tu documentación correctamente/i)).toBeVisible({ timeout: 30000 });
    expect(jsErrors).toEqual([]);
  });

  test('E2E-NET-02B: submit shows a blocking wait modal while background uploads finish', async ({ page, request }) => {
    const projectCode = 'ELT20250005';
    const customerUrl = `/?code=${projectCode}`;

    const projectResponse = await request.get(`${BACKEND}/api/project/${projectCode}`, { timeout: 15000 });
    const projectBody = await projectResponse.json();
    const formData = projectBody.project?.formData;
    expect(formData).toBeTruthy();

    const saveResponse = await request.post(`${BACKEND}/api/project/${projectCode}/save`, {
      data: {
        source: 'customer',
        formData: {
          ...formData,
          additionalBankDocuments: [
            {
              id: 'pending-extra-doc',
              type: 'other',
              files: [{
                id: 'pending-extra-file',
                filename: 'espera.pdf',
                mimeType: 'application/pdf',
                dataUrl: `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF').toString('base64')}`,
                timestamp: Date.now(),
                sizeBytes: 100,
              }],
              extraction: null,
              issue: null,
            },
          ],
        },
      },
      timeout: 15000,
    });
    expect(saveResponse.status()).toBe(200);

    await page.route(`**/api/project/${projectCode}/upload-assets*`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await route.continue();
    });

    await page.goto(customerUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación', { timeout: 30000 });
    await expect(page.getByText(/archivos preparados/i)).toHaveCount(0);
    await expect(page.getByText(/subiendo archivos en segundo plano/i)).toHaveCount(0);

    await page.getByTestId('review-submit-btn').click();
    await expect(page.getByTestId('review-upload-wait-modal')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('review-upload-wait-modal')).toContainText(
      'Estamos subiendo tus archivos. Espera un momento, por favor.',
    );

    await expect(page.locator('h1').first()).toContainText('¡Todo listo', { timeout: 30000 });
  });

  test('E2E-NET-03: follow-up submit recovers from failed pre-upload and one failed submit attempt', async ({ page, request }) => {
    const customerUrl = '/?code=ELT20250005';
    let uploadFailures = 0;
    let submitFailures = 0;

    await page.route('**/api/project/ELT20250005/upload-assets*', async (route) => {
      if (uploadFailures === 0) {
        uploadFailures += 1;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'upload failed' }),
        });
        return;
      }
      await route.continue();
    });

    await page.route('**/api/project/ELT20250005/submit*', async (route) => {
      if (submitFailures === 0) {
        submitFailures += 1;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    await page.goto(customerUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await openEnergyCertificate(page);
    await page.getByRole('button', { name: /saltar/i }).click();
    await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación', { timeout: 30000 });
    await page.getByTestId('review-submit-btn').click();

    await expect(page.getByText(/sin conexión/i)).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: /reintentar envío/i }).click();

    await expect(page.locator('h1').first()).toContainText('¡Todo listo', { timeout: 30000 });
    await expect(page.getByText(/hemos recibido tu documentación correctamente/i)).toBeVisible({ timeout: 30000 });
  });
});
