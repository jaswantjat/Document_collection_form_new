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

test.describe('Customer Journey Regressions', () => {
  test('deleted stale link shows contact-advisor handling instead of phone recovery', async ({ page, request }) => {
    const phone = `+346${String(Date.now() % 100_000_000).padStart(8, '0')}`;

    const createRes = await request.post(`${API_BASE}/api/project/create`, {
      data: {
        phone,
        assessor: 'QA Recovery',
        productType: 'solar',
      },
    });
    expect(createRes.ok()).toBeTruthy();

    const created = await createRes.json();
    expect(created.success).toBeTruthy();
    const staleCode = created.project.code as string;

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

    await page.goto(`/?code=${staleCode}`);
    await expect(page.getByRole('heading', { name: /enlace no válido/i })).toBeVisible();
    await expect(page.getByText(/contacta con tu asesor/i)).toBeVisible();
    await expect(page.locator('input[type="tel"]')).toHaveCount(0);
  });

  test('assessor phone lookup restores local backup and routes to the resumed step', async ({ page, request }) => {
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

    await page.goto('/?source=assessor');
    await page.locator('input[type="tel"]').fill('666000005');
    await page.getByRole('button', { name: /continuar/i }).click();

    await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación');
    await page.getByRole('button', { name: /certificado energético/i }).click();
    await expect(page.locator('h1').first()).toContainText('Certificado energético');
    await expect(page).toHaveURL(/code=ELT20250005/);
  });

  test('representation flow completes with the dev signature helper and advances cleanly', async ({ page }) => {
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

    await page.goto(`/?code=${projectCode}`);
    await expect(page.locator('h1').first()).toContainText('Documentos para firmar');

    await page.waitForFunction(() => typeof (window as Window & { __eltexFillTestSignature?: () => void }).__eltexFillTestSignature === 'function');
    await page.evaluate(() => (window as Window & { __eltexFillTestSignature?: () => void }).__eltexFillTestSignature?.());

    const continueButton = page.getByTestId('representation-continue-btn');
    await expect(continueButton).toHaveAttribute('data-signed', 'true');
    await continueButton.click();

    await expect(page.locator('h1').first()).toContainText('Certificado energético');
  });
});
