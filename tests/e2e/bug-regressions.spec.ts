import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { bindPageToE2EBackend } from './helpers/pageBackendProxy';
import { loginDashboard } from './helpers/projectAccess';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const APPROVED_ASSESSORS = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'app/src/shared/approvedAssessors.json'), 'utf8')
) as string[];

function uniquePhone() {
  const suffix = Date.now().toString().slice(-8);
  return `699 ${suffix.slice(0, 3)} ${suffix.slice(3, 6)}`;
}

function makePhoto(id: string) {
  return {
    id,
    preview: `data:image/jpeg;base64,${id}`,
    timestamp: Date.now(),
    sizeBytes: 128,
  };
}

function isTransientRequestError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNRESET|EPIPE|socket hang up/i.test(message);
}

async function postWithRetry(
  request: APIRequestContext,
  url: string,
  options?: Parameters<APIRequestContext['post']>[1]
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await request.post(url, options);
    } catch (error) {
      if (!isTransientRequestError(error) || attempt === 1) throw error;
    }
  }

  throw new Error(`Request retry exhausted for ${url}`);
}

async function getWithRetry(
  request: APIRequestContext,
  url: string,
  options?: Parameters<APIRequestContext['get']>[1],
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await request.get(url, options);
    } catch (error) {
      if (!isTransientRequestError(error) || attempt === 1) throw error;
    }
  }

  throw new Error(`Request retry exhausted for ${url}`);
}

function makeEnergyCertificateState() {
  return {
    status: 'not-started',
    housing: {
      cadastralReference: '',
      habitableAreaM2: '',
      floorCount: '0',
      averageFloorHeight: null,
      bedroomCount: '0',
      doorsByOrientation: { north: '0', east: '0', south: '0', west: '0' },
      windowsByOrientation: { north: '0', east: '0', south: '0', west: '0' },
      windowFrameMaterial: null,
      doorMaterial: '',
      windowGlassType: null,
      hasShutters: null,
      shutterWindowCount: '0',
    },
    thermal: {
      thermalInstallationType: null,
      boilerFuelType: null,
      equipmentDetails: '',
      hasAirConditioning: null,
      airConditioningType: null,
      airConditioningDetails: '',
      heatingEmitterType: null,
      radiatorMaterial: null,
    },
    additional: {
      soldProduct: null,
      isExistingCustomer: null,
      hasSolarPanels: null,
      solarPanelDetails: '',
    },
    customerSignature: null,
    renderedDocument: null,
    completedAt: null,
    skippedAt: null,
  };
}

async function expectProjectScreen(
  page: import('@playwright/test').Page,
  headingText: string,
  timeout = 20000,
) {
  const heading = page.locator('h1').first();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await expect(heading).toContainText(headingText, { timeout });
      return;
    } catch (error) {
      const offlineHeading = page.getByRole('heading', { name: 'Sin conexión' });
      const offlineVisible = await offlineHeading.isVisible().catch(() => false);
      if (!offlineVisible || attempt === 1) throw error;
      await page.getByRole('button', { name: 'Reintentar' }).click();
    }
  }
}

async function createPublicProject(request: APIRequestContext) {
  const res = await postWithRetry(request, `${API_BASE}/api/project/create`, {
    data: {
      phone: `+34${uniquePhone().replace(/\s+/g, '')}`,
      assessor: APPROVED_ASSESSORS[0],
      assessorId: APPROVED_ASSESSORS[0],
    },
    timeout: 30000,
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  return body.project.code as string;
}

async function deleteProjectAsAdmin(request: APIRequestContext, code: string) {
  const dashboardToken = await loginDashboard(request);
  const response = await request.delete(`${API_BASE}/api/dashboard/project/${code}`, {
    headers: { 'x-dashboard-token': dashboardToken },
    timeout: 30000,
  });

  expect(response.ok()).toBeTruthy();
}

test.describe('Bug Regressions', () => {
  test.describe.configure({ timeout: 90000 });

  test.beforeEach(async ({ page }) => {
    await bindPageToE2EBackend(page);
  });

  test('REG-01: bare home page stays on the public phone start flow', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('input[type="tel"]').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /continuar|buscar|seguir/i }).first()).toBeVisible();
  });

  test('REG-01b: public new-project flow shows the full approved assessor dropdown', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="tel"]').first().fill(uniquePhone());
    await page.getByRole('button', { name: /continuar|buscar|seguir/i }).first().click();
    await page.waitForLoadState('networkidle');

    const options = await page.getByTestId('phone-create-assessor-select').locator('option').allTextContents();
    expect(options).toEqual(['Selecciona un asesor', ...APPROVED_ASSESSORS]);
  });

  test('REG-02: stale or unknown codes recover to the public start flow instead of dead-ending', async ({ page }) => {
    await page.goto('/?code=UNKNOWN_TEST_CODE_12345');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('input[type="tel"]').first()).toBeVisible();
  });

  test('REG-03: /api/project/:code stays code-based even if a stray x-project-token header is present', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/project/ELT20250001`, {
      headers: { 'x-project-token': 'wrong-token' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.project?.code).toBe('ELT20250001');
  });

  test('REG-04: international phone format is accepted by the public lookup route', async ({ request }) => {
    const phones = ['+447700900000', '+33612345678', '+12025550123'];

    for (const phone of phones) {
      const res = await request.get(`${API_BASE}/api/lookup/phone/${encodeURIComponent(phone)}`, {
        failOnStatusCode: false,
      });
      expect([200, 404]).toContain(res.status());
      const body = await res.json();
      if (res.status() === 404) {
        expect(body.error).toBe('NOT_FOUND');
      }
    }
  });

  test('REG-05: province step requires an explicit person-or-company choice with clear copy', async ({ page, request }) => {
    const code = await createPublicProject(request);
    try {
      const saveRes = await postWithRetry(request, `${API_BASE}/api/project/${code}/save`, {
        data: {
          source: 'customer',
          formData: {
            dni: {
              front: { photo: makePhoto('dni-front'), extraction: null },
              back: { photo: makePhoto('dni-back'), extraction: null },
            },
            ibi: {
              pages: [makePhoto('ibi-1')],
            },
            electricityBill: {
              pages: [{ photo: makePhoto('bill-1'), extraction: null }],
            },
            representation: {
              location: null,
              isCompany: false,
              holderTypeConfirmed: false,
              companyName: '',
              companyNIF: '',
              companyAddress: '',
              companyMunicipality: '',
              companyPostalCode: '',
              postalCode: '',
              ivaPropertyAddress: '',
              ivaCertificateSignature: null,
              representacioSignature: null,
              generalitatRole: 'titular',
              generalitatSignature: null,
              poderRepresentacioSignature: null,
              ivaCertificateEsSignature: null,
              renderedDocuments: {},
            },
          },
        },
        timeout: 30000,
      });
      expect(saveRes.status()).toBe(200);

      const projectRes = await getWithRetry(request, `${API_BASE}/api/project/${code}`, {
        timeout: 30000,
      });
      expect(projectRes.status()).toBe(200);
      const projectBody = await projectRes.json();

      await page.route(`**/api/project/${code}`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(projectBody),
        });
      });

      await page.goto(`/?code=${code}`, { waitUntil: 'domcontentloaded' });
      await expectProjectScreen(page, 'Ubicación');

      await page.getByTestId('select-province-btn').click();
      await page.getByTestId('province-btn-cataluna').click();

      await expect(page.getByText('¿A nombre de quién está el contrato o la factura?')).toBeVisible();
      await expect(page.getByText('Elige una opción para que preparemos los documentos correctos.')).toBeVisible();
      await expect(page.getByTestId('province-continue-btn')).toBeDisabled();

      await page.getByTestId('holder-type-option-company').click();
      await expect(page.getByText('El contrato está a nombre de una sociedad o negocio y te pediremos sus datos fiscales.')).toBeVisible();
      await expect(page.getByText('Datos de la empresa')).toBeVisible();
      await expect(page.getByTestId('province-continue-btn')).toBeDisabled();

      await page.getByTestId('holder-type-option-individual').click();
      await expect(page.getByText('El contrato está a nombre de una persona, por ejemplo Juan Pérez.')).toBeVisible();
      await expect(page.getByText('Datos de la empresa')).toHaveCount(0);
      await expect(page.getByTestId('province-continue-btn')).toBeEnabled();
    } finally {
      await deleteProjectAsAdmin(request, code);
    }
  });

  test('REG-06: pure aerothermal review flow does not show electricity as pending', async ({ page, request }) => {
    const saveRes = await postWithRetry(
      request,
      `${API_BASE}/api/project/ELT20250002/save`,
      {
        data: {
          source: 'customer',
          formData: {
            dni: {
              front: { photo: makePhoto('dni-front-aero'), extraction: null },
              back: { photo: makePhoto('dni-back-aero'), extraction: null },
              originalPdfs: [],
              issue: null,
            },
            ibi: {
              photo: makePhoto('ibi-aero'),
              pages: [],
              originalPdfs: [],
              extraction: null,
              issue: null,
            },
            electricityBill: {
              pages: [],
              originalPdfs: [],
              issue: null,
            },
            contract: { originalPdfs: [], extraction: null, issue: null },
            additionalBankDocuments: [],
            location: 'other',
            representation: {
              location: 'other',
              isCompany: false,
              holderTypeConfirmed: true,
              companyName: '',
              companyNIF: '',
              companyAddress: '',
              companyMunicipality: '',
              companyPostalCode: '',
              postalCode: '',
              ivaPropertyAddress: '',
              ivaCertificateSignature: null,
              representacioSignature: null,
              generalitatRole: 'titular',
              generalitatSignature: null,
              poderRepresentacioSignature: null,
              ivaCertificateEsSignature: null,
              renderedDocuments: {},
            },
            signatures: { customerSignature: null, repSignature: null },
            energyCertificate: makeEnergyCertificateState(),
          },
        },
        timeout: 15000,
      }
    );
    expect(saveRes.ok()).toBeTruthy();

    await page.goto('/?code=ELT20250002', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: 'Confirma tu documentación' })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('review-submit-btn')).toBeVisible();
    await expect(page.getByText('DNI / NIE')).toBeVisible();
    await expect(page.getByText('IBI o escritura')).toBeVisible();
    await expect(page.getByText('Factura de luz')).toHaveCount(0);

    await page.getByRole('button', { name: /IBI o escritura/ }).click();
    await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();
    await expect(page.getByText('Factura de luz')).toHaveCount(0);
    await expect(page.getByTestId('electricity-input')).toHaveCount(0);
  });

  test('REG-06: pure aerothermal review flow does not treat electricity as pending', async ({ page, request }) => {
    const projectCode = 'ELT20250002';
    const saveRes = await request.post(`${API_BASE}/api/project/${projectCode}/save`, {
      data: {
        source: 'customer',
        formData: {
          dni: {
            front: { photo: makePhoto('dni-front-aero'), extraction: null },
            back: { photo: makePhoto('dni-back-aero'), extraction: null },
            originalPdfs: [],
            issue: null,
          },
          ibi: {
            photo: null,
            pages: [makePhoto('ibi-aero-page')],
            originalPdfs: [],
            extraction: null,
            issue: null,
          },
          electricityBill: {
            pages: [],
            originalPdfs: [],
            issue: null,
          },
          contract: { originalPdfs: [], extraction: null, issue: null },
          additionalBankDocuments: [],
          location: 'other',
          representation: {
            location: 'other',
            isCompany: false,
            holderTypeConfirmed: true,
            companyName: '',
            companyNIF: '',
            companyAddress: '',
            companyMunicipality: '',
            companyPostalCode: '',
            postalCode: '',
            ivaPropertyAddress: '',
            ivaCertificateSignature: null,
            representacioSignature: null,
            generalitatRole: 'titular',
            generalitatSignature: null,
            poderRepresentacioSignature: null,
            ivaCertificateEsSignature: null,
            renderedDocuments: {},
          },
          energyCertificate: {
            status: 'not-started',
            housing: {
              cadastralReference: '',
              habitableAreaM2: '',
              floorCount: '0',
              averageFloorHeight: null,
              bedroomCount: '0',
              doorsByOrientation: { north: '0', east: '0', south: '0', west: '0' },
              windowsByOrientation: { north: '0', east: '0', south: '0', west: '0' },
              windowFrameMaterial: null,
              doorMaterial: '',
              windowGlassType: null,
              hasShutters: null,
              shutterWindowCount: '0',
            },
            thermal: {
              thermalInstallationType: null,
              boilerFuelType: null,
              equipmentDetails: '',
              hasAirConditioning: null,
              airConditioningType: null,
              airConditioningDetails: '',
              heatingEmitterType: null,
              radiatorMaterial: null,
            },
            additional: {
              soldProduct: null,
              isExistingCustomer: null,
              hasSolarPanels: null,
              solarPanelDetails: '',
            },
            customerSignature: null,
            renderedDocument: null,
            completedAt: null,
            skippedAt: null,
          },
          signatures: { customerSignature: null, repSignature: null },
        },
      },
      timeout: 15000,
    });
    expect(saveRes.status()).toBe(200);

    await page.goto(`/?code=${projectCode}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación', { timeout: 20000 });
    await expect(page.getByText('Factura de luz')).toHaveCount(0);
    await expect(page.getByTestId('review-submit-btn')).toContainText('Confirmar documentación');

    await page.getByTestId('review-submit-btn').click();
    await expect(page.locator('h1').first()).toContainText('¡Todo listo', { timeout: 20000 });
  });
});
