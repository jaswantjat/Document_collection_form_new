import { test, expect, type Page } from '@playwright/test';
import { getProjectAccess } from './helpers/projectAccess';

const EC05_CODE = 'ELT20250005';
const BACKEND = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';

function isTransientRequestError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNRESET|EPIPE|socket hang up/i.test(message);
}

async function postWithRetry(request: any, url: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await request.post(url, { timeout: 30000 });
    } catch (error) {
      if (!isTransientRequestError(error) || attempt === 2) throw error;
      await pageWait(250 * (attempt + 1));
    }
  }

  throw new Error(`Request retry exhausted for ${url}`);
}

function pageWait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openEnergyCertificate(page: Page) {
  await expect(page.locator('h1, h2').first()).toContainText(
    /Confirma tu documentación|Sube lo que falte y confirma/,
    { timeout: 15000 }
  );
  await page.getByRole('button', { name: /certificado energético/i }).click({
    timeout: 15000,
  });
  await expect(page.locator('h1').first()).toContainText('Certificado energético', {
    timeout: 15000,
  });
}

async function openCustomerPage(
  page: Page,
  customerUrl: string,
  expectedHeading: string | RegExp
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(customerUrl, { waitUntil: 'domcontentloaded' });

    const heading = page.locator('h1, h2').first();
    try {
      await expect(heading).toContainText(expectedHeading, { timeout: 15000 });
      return;
    } catch (error) {
      const headingText = await heading.textContent().catch(() => null);
      const isTransientLoadFailure = headingText?.includes('Sin conexión');
      if (!isTransientLoadFailure || attempt === 2) throw error;
      await pageWait(500 * (attempt + 1));
    }
  }
}

test.describe('Energy Certificate Flow Tests', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ request }) => {
    // Restore full base state: property docs done + EC not-started
    // This prevents cross-test contamination when reset-property-docs is called in FLOW-04
    const res = await postWithRetry(request, `${BACKEND}/api/test/restore-base-flow/${EC05_CODE}`);
    if (!res.ok()) {
      console.warn('[RESET] Failed to restore base flow for EC05:', await res.text());
    }
  });

  test.afterEach(async ({ page }) => {
    if (page.isClosed()) return;

    await page.goto('about:blank', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(250).catch(() => {});
  });

  test('E2E-FLOW-01: EC section loads with all steps and skip button', async ({ page, request }) => {
    const { customerUrl } = await getProjectAccess(request, EC05_CODE);
    await page.goto(customerUrl);
    await page.waitForLoadState('networkidle');

    await openEnergyCertificate(page);
    
    // Assert step tabs are visible (exact match to avoid matching field labels like "Referencia Catastral de la Vivienda")
    await expect(page.getByText('Vivienda', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Instalación', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Equipamiento', { exact: true })).toBeVisible();
    
    // Assert skip button exists
    const skipBtn = page.getByRole('button', { name: /saltar/i });
    await expect(skipBtn).toBeVisible();
    
    // Assert housing form fields exist
    const nextBtn = page.getByRole('button', { name: /siguiente/i });
    await expect(nextBtn).toBeVisible();
  });

  test('E2E-FLOW-02: EC skip path — clicking Saltar routes to review section', async ({ page, request }) => {
    const { customerUrl } = await getProjectAccess(request, EC05_CODE);
    await page.goto(customerUrl);
    await page.waitForLoadState('networkidle');

    await openEnergyCertificate(page);

    // Click skip
    const skipBtn = page.getByRole('button', { name: /saltar/i });
    await skipBtn.click();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación');
    await expect(page.getByText(/El certificado energético es opcional y no bloquea el envío inicial/i)).toBeVisible();
    await page.getByTestId('review-submit-btn').click();

    await expect(page.getByTestId('success-section')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('h1, h2').first()).toContainText('¡Todo listo', {
      timeout: 15000,
    });
  });

  test('E2E-FLOW-03: EC resume path — partially filled housing data persists on reload', async ({ page, request }) => {
    // Seed EC with partial housing data (cadastralReference + some fields filled)
    const seedRes = await postWithRetry(request, `${BACKEND}/api/test/reset-ec-partial/${EC05_CODE}`);
    expect(seedRes.ok()).toBeTruthy();

    // Open form — should route to review first, then into EC on demand
    const { customerUrl } = await getProjectAccess(request, EC05_CODE);
    await page.goto(customerUrl);
    await page.waitForLoadState('networkidle');

    await openEnergyCertificate(page);

    // The cadastralReference field should show the seeded value from the server
    const cadastralInput = page.getByLabel('Referencia Catastral de la Vivienda');
    await expect(cadastralInput).toHaveValue('1234567VK1234A0001RT');
  });

  test('E2E-FLOW-03b: reload returns to review first and reopens EC at the saved sub-step', async ({ page, request }) => {
    const restoreRes = await postWithRetry(request, `${BACKEND}/api/test/restore-base-flow/${EC05_CODE}`);
    expect(restoreRes.ok()).toBeTruthy();

    const { customerUrl } = await getProjectAccess(request, EC05_CODE);
    await page.goto(customerUrl);
    await page.waitForLoadState('networkidle');

    await openEnergyCertificate(page);

    await page.getByLabel('Tamaño (m²)').fill('85');
    await page.getByRole('button', { name: 'Entre 2,7m y 3,2m' }).click();
    await page.getByRole('button', { name: 'PVC' }).click();
    await page.getByLabel('Material de las puertas').fill('Madera');
    await page.getByRole('button', { name: 'Doble vidrio' }).click();
    await page
      .getByText('¿Ventanas con persiana?')
      .locator('..')
      .getByRole('button', { name: 'No' })
      .click();
    await page.getByRole('button', { name: /siguiente/i }).click();

    await expect(page.getByText('Tipo de instalación térmica')).toBeVisible();
    await page.waitForFunction(
      (projectCode) =>
        localStorage
          .getItem(`eltex_form_backup_${projectCode}`)
          ?.includes('"currentStepIndex":1') ?? false,
      EC05_CODE
    );

    const reopenedPage = await page.context().newPage();
    await reopenedPage.goto(customerUrl, { waitUntil: 'domcontentloaded' });
    await expect(reopenedPage.locator('h1, h2').first()).toContainText(
      'Confirma tu documentación',
      { timeout: 30000 }
    );

    await openEnergyCertificate(reopenedPage);
    await expect(reopenedPage.getByText('Tipo de instalación térmica')).toBeVisible();
    await reopenedPage.close();
  });

  test('E2E-FLOW-04: follow-up path routing — documents with missing docs → EC → review', async ({ page, request }) => {
    // Step 1: clear property docs. With missing mandatory documents, the form should
    // reopen on the document collection section before the customer can continue.
    const clearRes = await postWithRetry(request, `${BACKEND}/api/test/reset-property-docs/${EC05_CODE}`);
    expect(clearRes.ok()).toBeTruthy();

    let access = await getProjectAccess(request, EC05_CODE);
    await openCustomerPage(page, access.customerUrl, 'Documentos');
    await expect(page.getByText('DNI / NIE').first()).toBeVisible();

    // Clear localStorage while still on the form page (before beforeunload fires)
    await page.evaluate(() => localStorage.clear());

    // Navigate to blank — this flushes the beforeunload keepalive save (with cleared-docs state).
    // Must happen BEFORE restore-base-flow so the keepalive doesn't overwrite the restored state.
    await page.goto('about:blank');
    await page.waitForLoadState('domcontentloaded');

    // Step 2: restore full flow state (property docs done, EC not-started) — safe after beforeunload
    const restoreRes = await postWithRetry(request, `${BACKEND}/api/test/restore-base-flow/${EC05_CODE}`);
    expect(restoreRes.ok()).toBeTruthy();

    access = await getProjectAccess(request, EC05_CODE);
    await openCustomerPage(page, access.customerUrl, 'Confirma tu documentación');
    await openEnergyCertificate(page);

    // Step 3: skip EC → should route to review section
    const skipBtn = page.getByRole('button', { name: /saltar/i });
    await skipBtn.click();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación');
    await expect(page.getByText(/El certificado energético es opcional y no bloquea el envío inicial/i)).toBeVisible();
    await page.getByTestId('review-submit-btn').click();

    await expect(page.locator('h1').first()).toContainText('¡Todo listo');
  });
});
