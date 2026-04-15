import { test, expect, type Page } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';

function makePhoto(id: string) {
  return {
    id,
    preview: `data:image/jpeg;base64,${id}`,
    timestamp: Date.now(),
    sizeBytes: 128,
  };
}

function makeEnergyCertificateState() {
  return {
    status: 'not-started',
    housing: {
      cadastralReference: '',
      habitableAreaM2: '',
      floorCount: '',
      averageFloorHeight: null,
      bedroomCount: '',
      doorsByOrientation: { north: '', east: '', south: '', west: '' },
      windowsByOrientation: { north: '', east: '', south: '', west: '' },
      windowFrameMaterial: null,
      doorMaterial: '',
      windowGlassType: null,
      hasShutters: null,
      shutterWindowCount: '',
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

function makeRepresentation(location: 'other' | 'cataluna') {
  return {
    location,
    isCompany: false,
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
  };
}

function backupKey(projectCode: string) {
  return `eltex_form_backup_${projectCode}`;
}

async function seedLocalBackup(page: Page, projectCode: string, formData: unknown) {
  await page.addInitScript(
    ({ key, entry }) => {
      localStorage.setItem(key, JSON.stringify(entry));
    },
    {
      key: backupKey(projectCode),
      entry: {
        version: 1,
        savedAt: Date.now(),
        projectCode,
        formData,
      },
    }
  );
}

async function loginDashboard(request: any) {
  const loginRes = await request.post(`${API_BASE}/api/dashboard/login`, {
    data: { password: 'eltex2025' },
  });
  expect(loginRes.ok()).toBeTruthy();
  const loginJson = await loginRes.json();
  return loginJson.token as string;
}

async function getProjectToken(request: any, code: string) {
  const dashboardToken = await loginDashboard(request);
  const detailRes = await request.get(`${API_BASE}/api/dashboard/project/${code}`, {
    headers: { 'x-dashboard-token': dashboardToken },
  });
  expect(detailRes.ok()).toBeTruthy();
  const detailJson = await detailRes.json();
  return detailJson.project.accessToken as string;
}

test.describe('Customer Journey Regressions', () => {
  test('deleted stale link recovers cleanly and the same phone can create a fresh project', async ({ page, request }) => {
    const localPhone = `6${String(Date.now() % 100_000_000).padStart(8, '0')}`;
    const e164Phone = `+34${localPhone}`;

    const createRes = await request.post(`${API_BASE}/api/project/create`, {
      data: {
        phone: e164Phone,
        assessor: 'QA Recovery',
        productType: 'solar',
      },
    });
    expect(createRes.ok()).toBeTruthy();

    const created = await createRes.json();
    expect(created.success).toBeTruthy();
    const staleCode = created.project.code as string;
    const staleToken = created.project.accessToken as string;

    const loginRes = await request.post(`${API_BASE}/api/dashboard/login`, {
      data: { password: 'eltex2025' },
    });
    expect(loginRes.ok()).toBeTruthy();
    const loginJson = await loginRes.json();
    const dashboardToken = loginJson.token as string;

    const deleteRes = await request.delete(`${API_BASE}/api/dashboard/project/${staleCode}`, {
      headers: { 'x-dashboard-token': dashboardToken },
    });
    expect(deleteRes.ok()).toBeTruthy();

    await page.goto(`/?code=${staleCode}&token=${encodeURIComponent(staleToken)}`);
    await expect(page.locator('h1').first()).toContainText('Teléfono del cliente');

    await page.locator('input[type="tel"]').fill(localPhone);
    await page.getByRole('button', { name: /continuar/i }).click();

    await expect(page.locator('h1').first()).toContainText('Nuevo expediente');
    await page.getByRole('button', { name: /solar/i }).click();
    await page.getByPlaceholder('Nombre completo').fill('QA Recovery');
    await page.getByRole('button', { name: /crear expediente/i }).click();

    await expect(page.locator('h1').first()).toContainText('Documentos');
    await expect(page).toHaveURL(/\/\?code=ELT\d+&token=/);

    const recreatedUrl = new URL(page.url());
    const recreatedCode = recreatedUrl.searchParams.get('code');
    expect(recreatedCode).toBeTruthy();
    expect(recreatedUrl.searchParams.get('token')).toBeTruthy();

    const lookupRes = await request.get(`${API_BASE}/api/lookup/phone/${encodeURIComponent(e164Phone)}`);
    expect(lookupRes.ok()).toBeTruthy();
    const lookupJson = await lookupRes.json();
    expect(lookupJson.success).toBeTruthy();
    expect(lookupJson.project.code).toBe(recreatedCode);
  });

  test('resume by phone restores local backup and routes to the resumed step', async ({ page, request }) => {
    const projectCode = 'ELT20250005';

    await request.post(`${API_BASE}/api/test/restore-base-flow/${projectCode}`);

    await seedLocalBackup(page, projectCode, {
      dni: {
        front: { photo: makePhoto('dni-front'), extraction: null },
        back: { photo: makePhoto('dni-back'), extraction: null },
        originalPdfs: [],
      },
      ibi: {
        photo: makePhoto('ibi-photo'),
        pages: [],
        originalPdfs: [],
        extraction: null,
      },
      electricityBill: {
        pages: [{ photo: makePhoto('bill-page'), extraction: null }],
        originalPdfs: [],
      },
      contract: { originalPdfs: [], extraction: null },
      location: 'other',
      representation: makeRepresentation('other'),
      energyCertificate: makeEnergyCertificateState(),
      signatures: { customerSignature: null, repSignature: null },
    });

    await page.goto('/');
    await page.locator('input[type="tel"]').fill('666000005');
    await page.getByRole('button', { name: /continuar/i }).click();

    await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación');
    await page.getByRole('button', { name: /certificado energético/i }).click();
    await expect(page.locator('h1').first()).toContainText('Certificado energético');
    await expect(page).toHaveURL(/code=ELT20250005&token=/);
  });

  test('representation flow completes with the dev signature helper and advances cleanly', async ({ page, request }) => {
    const projectCode = 'ELT20250001';

    await seedLocalBackup(page, projectCode, {
      dni: {
        front: { photo: makePhoto('dni-front-sign'), extraction: { extractedData: {}, confidence: 1, isCorrectDocument: true, documentTypeDetected: 'dni', identityDocumentKind: 'dni-card', needsManualReview: false, confirmedByUser: true } },
        back: { photo: makePhoto('dni-back-sign'), extraction: null },
        originalPdfs: [],
      },
      ibi: {
        photo: makePhoto('ibi-sign'),
        pages: [],
        originalPdfs: [],
        extraction: null,
      },
      electricityBill: {
        pages: [{ photo: makePhoto('bill-sign'), extraction: null }],
        originalPdfs: [],
      },
      contract: { originalPdfs: [], extraction: null },
      location: 'cataluna',
      representation: makeRepresentation('cataluna'),
      energyCertificate: makeEnergyCertificateState(),
      signatures: { customerSignature: null, repSignature: null },
    });
    const projectToken = await getProjectToken(request, projectCode);

    await page.goto(`/?code=${projectCode}&token=${encodeURIComponent(projectToken)}`);
    const continueButton = page.getByTestId('representation-continue-btn');
    await expect(continueButton).toBeVisible();
    await expect(page.locator('h1').first()).toContainText('Documentos para firmar');

    await page.waitForFunction(() => typeof (window as Window & { __eltexFillTestSignature?: () => void }).__eltexFillTestSignature === 'function');
    await page.evaluate(() => (window as Window & { __eltexFillTestSignature?: () => void }).__eltexFillTestSignature?.());

    await expect(continueButton).toHaveAttribute('data-signed', 'true');
    await continueButton.click();

    await expect(page.locator('h1').first()).toContainText('Certificado energético');
  });
});
