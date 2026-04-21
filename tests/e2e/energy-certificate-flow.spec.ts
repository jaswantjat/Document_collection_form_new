import { test, expect, type Page } from '@playwright/test';
import { getProjectAccess } from './helpers/projectAccess';

const EC05_CODE = 'ELT20250005';
const BACKEND = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';

function isTransientRequestError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNRESET|EPIPE|socket hang up/i.test(message);
}

async function postWithRetry(request: any, url: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await request.post(url);
    } catch (error) {
      if (!isTransientRequestError(error) || attempt === 1) throw error;
    }
  }

  throw new Error(`Request retry exhausted for ${url}`);
}

async function openEnergyCertificate(page: Page) {
  await expect(page.locator('h1, h2').first()).toContainText(/Confirma tu documentación|Sube lo que falte y confirma/);
  await page.getByRole('button', { name: /certificado energético/i }).click();
  await expect(page.locator('h1').first()).toContainText('Certificado energético');
}

async function fillHousingStep(page: Page) {
  await page.getByRole('spinbutton', { name: /tamaño/i }).fill('120');
  await page.getByRole('spinbutton', { name: /plantas/i }).fill('2');
  await page.getByRole('spinbutton', { name: /dormitorios/i }).fill('3');
  await page.getByRole('button', { name: 'Entre 2,7m y 3,2m' }).click();

  const doorSection = page.locator('p', { hasText: 'Nº PUERTAS Exterior' }).locator('xpath=..');
  const doorInputs = doorSection.locator('input');
  for (let index = 0; index < 4; index += 1) {
    await doorInputs.nth(index).fill('1');
  }

  const windowSection = page.locator('p', { hasText: 'Nº VENTANAS Exterior' }).locator('xpath=..');
  const windowInputs = windowSection.locator('input');
  for (let index = 0; index < 4; index += 1) {
    await windowInputs.nth(index).fill('2');
  }

  await page.getByRole('button', { name: 'PVC' }).click();
  await page.getByPlaceholder('Madera').fill('Madera');
  await page.getByRole('button', { name: 'Doble vidrio' }).click();
  const shutterLabel = page.locator('p', { hasText: '¿Ventanas con persiana?' });
  await shutterLabel.locator('xpath=..').getByRole('button', { name: 'No', exact: true }).click();
  await page.getByTestId('energy-cert-next-btn').click();
}

async function fillThermalStep(page: Page, options: { selectHeatingType?: boolean } = {}) {
  const { selectHeatingType = true } = options;

  await page.getByRole('button', { name: 'Caldera (ACS y calefacción)' }).click();
  await page.getByRole('button', { name: 'Gas', exact: true }).click();
  await page.getByPlaceholder('Marca y año de la instalación').fill('Samsung 2020');
  const acLabel = page.locator('p', { hasText: '¿Aire Acondicionado?' });
  await acLabel.locator('xpath=..').getByRole('button', { name: 'No', exact: true }).click();

  if (selectHeatingType) {
    await page.getByRole('button', { name: 'Radiadores de Agua' }).click();
    await page.getByRole('button', { name: 'Aluminio' }).click();
  }

  await page.getByRole('button', { name: 'Monofásica' }).click();
  await page.getByTestId('energy-cert-next-btn').click();
}

async function fillAdditionalStep(page: Page) {
  await page.getByRole('button', { name: /paneles solares/i }).click();

  const existingCustomerLabel = page.locator('p', { hasText: '¿Cliente de Eltex?' });
  await existingCustomerLabel.locator('xpath=..').getByRole('button', { name: 'No', exact: true }).click();

  const solarPanelsLabel = page.locator('p', { hasText: '¿Placas solares?' });
  await solarPanelsLabel.locator('xpath=..').getByRole('button', { name: 'No', exact: true }).click();

  await page.getByTestId('energy-cert-next-btn').click();
}

test.describe('Energy Certificate Flow Tests', () => {
  test.beforeEach(async ({ request }) => {
    // Restore full base state: property docs done + EC not-started
    // This prevents cross-test contamination when reset-property-docs is called in FLOW-04
    const res = await postWithRetry(request, `${BACKEND}/api/test/restore-base-flow/${EC05_CODE}`);
    if (!res.ok()) {
      console.warn('[RESET] Failed to restore base flow for EC05:', await res.text());
    }
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

    await expect(page.locator('h1').first()).toContainText('¡Todo listo');
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

  test('E2E-FLOW-04: follow-up path routing — documents with missing docs → EC → review', async ({ page, request }) => {
    // Step 1: clear property docs. With missing mandatory documents, the form should
    // reopen on the document collection section before the customer can continue.
    const clearRes = await postWithRetry(request, `${BACKEND}/api/test/reset-property-docs/${EC05_CODE}`);
    expect(clearRes.ok()).toBeTruthy();

    let access = await getProjectAccess(request, EC05_CODE);
    await page.goto(access.customerUrl);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1, h2').first()).toContainText('Documentos');
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
    await page.goto(access.customerUrl);
    await page.waitForLoadState('networkidle');

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

  test('E2E-FLOW-05: thermal step stays completable when heating type is omitted', async ({ page, request }) => {
    const { customerUrl } = await getProjectAccess(request, EC05_CODE);
    await page.goto(customerUrl);
    await page.waitForLoadState('networkidle');

    await openEnergyCertificate(page);
    await fillHousingStep(page);
    await fillThermalStep(page, { selectHeatingType: false });

    await expect(page.getByText('¿Qué producto/s se está vendiendo?')).toBeVisible();
    await fillAdditionalStep(page);

    const confirmButton = page.getByTestId('energy-cert-confirm-btn');
    await expect(confirmButton).toBeEnabled({ timeout: 15000 });
    await confirmButton.click();

    await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación');
    await expect(page.getByText('Certificado energético — confirmado')).toBeVisible();

    await expect.poll(async () => {
      const response = await request.get(`${BACKEND}/api/project/${EC05_CODE}`, { timeout: 15000 });
      if (!response.ok()) {
        return null;
      }

      const body = await response.json();
      const energyCertificate = body.project?.formData?.energyCertificate;
      return JSON.stringify({
        status: energyCertificate?.status ?? null,
        heatingEmitterType: energyCertificate?.thermal?.heatingEmitterType ?? null,
        radiatorMaterial: energyCertificate?.thermal?.radiatorMaterial ?? null,
        hasCompletedAt: Boolean(energyCertificate?.completedAt),
      });
    }, { timeout: 20000 }).toBe(JSON.stringify({
      status: 'completed',
      heatingEmitterType: null,
      radiatorMaterial: null,
      hasCompletedAt: true,
    }));
  });
});
