import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const VALID_JPEG_BASE64 = readFileSync(
  path.resolve(process.cwd(), 'app/public/autoritzacio-representacio.jpg'),
).toString('base64');

const BANK_DOCUMENT_UPLOAD = {
  name: 'irpf-2024.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'),
};
const BANK_DOCUMENT_IMAGE_UPLOAD = {
  name: 'nomina.jpg',
  mimeType: 'image/jpeg',
  buffer: Buffer.from(VALID_JPEG_BASE64, 'base64'),
};

function uniquePhone() {
  const suffix = Date.now().toString().slice(-8);
  return `+346${suffix}`;
}

function makeDataUrl() {
  return `data:image/jpeg;base64,${VALID_JPEG_BASE64}`;
}

async function mockAdditionalBankDocumentValidation(page: Page, body: Record<string, unknown>) {
  await page.route('**/api/extract', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.route('**/api/extract-batch', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.route('**/api/pdf-to-images', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        images: [
          {
            name: 'irpf-2024-page-1.jpg',
            mimeType: 'image/jpeg',
            data: VALID_JPEG_BASE64,
          },
        ],
      }),
    });
  });
}

function makePhoto(id: string) {
  return {
    id,
    preview: makeDataUrl(),
    timestamp: Date.now(),
    sizeBytes: 256,
  };
}

function makeSkippedEnergyCertificate() {
  return {
    status: 'skipped',
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
    skippedAt: '2026-04-14T10:30:00Z',
  };
}

function buildReviewReadyFormData() {
  return {
    dni: {
      front: { photo: makePhoto('dni-front'), extraction: null },
      back: { photo: makePhoto('dni-back'), extraction: null },
      originalPdfs: [],
      issue: null,
    },
    ibi: {
      photo: makePhoto('ibi-photo'),
      pages: [],
      originalPdfs: [],
      extraction: null,
      issue: null,
    },
    electricityBill: {
      pages: [{ photo: makePhoto('bill-page'), extraction: null }],
      originalPdfs: [],
      issue: null,
    },
    contract: { originalPdfs: [], extraction: null, issue: null },
    additionalBankDocuments: [],
    location: 'other',
    representation: {
      location: 'other',
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
    },
    energyCertificate: makeSkippedEnergyCertificate(),
    signatures: { customerSignature: null, repSignature: null },
  };
}

async function clearDeviceBackup(page: Page, projectCode: string) {
  await page.evaluate(async ({ code }) => {
    localStorage.removeItem(`eltex_form_backup_${code}`);

    await new Promise<void>((resolve) => {
      const request = indexedDB.open('eltex_form_db');
      request.onerror = () => resolve();
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('form_backups')) {
          resolve();
          return;
        }

        const tx = db.transaction('form_backups', 'readwrite');
        tx.objectStore('form_backups').delete(code);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
    });
  }, { code: projectCode });
}

async function readProjectState(request: APIRequestContext, projectCode: string) {
  try {
    const res = await request.get(`${API_BASE}/api/project/${projectCode}`);
    const body = await res.json();
    return body.project;
  } catch {
    return null;
  }
}

test('additional bank documents persist across reload and remain optional for submit', async ({ page, request }) => {
  const createRes = await request.post(`${API_BASE}/api/project/create`, {
    data: {
      phone: uniquePhone(),
      assessor: 'QA Bot',
      assessorId: 'QA-BOT',
    },
  });
  expect(createRes.ok()).toBeTruthy();
  const createBody = await createRes.json();
  const projectCode = createBody.project.code as string;

  const saveRes = await request.post(`${API_BASE}/api/project/${projectCode}/save`, {
    headers: { 'Content-Type': 'application/json' },
    data: { formData: buildReviewReadyFormData(), source: 'customer' },
  });
  expect(saveRes.ok()).toBeTruthy();

  await mockAdditionalBankDocumentValidation(page, {
    success: true,
    extraction: {
      extractedData: {
        holderName: 'Ana Pérez López',
        documentNumber: 'MODEL100',
        period: 'Ejercicio 2024',
        amount: '250 EUR a devolver',
        summary: 'Declaración de la renta presentada ante AEAT.',
      },
      confidence: 0.96,
      isCorrectDocument: true,
      documentTypeDetected: 'Declaración de la renta',
      needsManualReview: false,
    },
  });

  await page.goto(`/?code=${projectCode}`, { waitUntil: 'networkidle' });
  await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación');

  await page.getByRole('button', { name: /Factura de luz/i }).click();
  await expect(page.locator('h1').first()).toContainText('Documentos');
  await expect(page.getByTestId('additional-bank-documents-card')).toBeVisible();

  await page.getByTestId('additional-bank-doc-type').selectOption('tax-return');
  await page.getByTestId('additional-bank-documents-input').setInputFiles(BANK_DOCUMENT_UPLOAD);

  await expect(page.getByTestId('additional-bank-documents-list')).toContainText('Declaración de la renta');
  await expect(page.getByTestId('additional-bank-documents-list')).toContainText('irpf-2024.pdf');
  await expect(page.getByTestId('additional-bank-documents-list')).toContainText('Ana Pérez López');
  await expect(page.getByTestId('additional-bank-documents-list')).toContainText('Ejercicio 2024');
  await expect(page.getByTestId('additional-bank-documents-list')).toContainText('250 EUR a devolver');

  await expect.poll(async () => {
    const project = await readProjectState(request, projectCode);
    return {
      documents: project?.formData.additionalBankDocuments?.length ?? 0,
      asset: Boolean(project?.assetFiles?.bankDocument_0),
      holderName: project?.formData.additionalBankDocuments?.[0]?.extraction?.extractedData?.holderName ?? null,
    };
  }).toEqual({ documents: 1, asset: true, holderName: 'Ana Pérez López' });

  await clearDeviceBackup(page, projectCode);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación');
  await page.getByRole('button', { name: /Factura de luz/i }).click();
  await expect(page.locator('h1').first()).toContainText('Documentos');

  await expect(page.getByTestId('additional-bank-documents-list')).toContainText('Declaración de la renta');
  await expect(page.getByTestId('additional-bank-documents-list')).toContainText('irpf-2024.pdf');
  await expect(page.getByTestId('additional-bank-documents-list')).toContainText('Ana Pérez López');
  await expect(page.getByTestId('additional-bank-documents-list')).toContainText('Ejercicio 2024');

  await expect.poll(async () => {
    const project = await readProjectState(request, projectCode);
    return Boolean(project?.assetFiles?.bankDocument_0);
  }).toBe(true);

  await page.getByTestId('property-docs-continue-btn').click();
  await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación');

  await expect.poll(async () => {
    const project = await readProjectState(request, projectCode);
    return Boolean(project?.assetFiles?.bankDocument_0);
  }).toBe(true);

  await page.getByTestId('review-submit-btn').click();
  await expect(page.getByTestId('success-section')).toBeVisible();
});

test('additional bank documents reject a wrong document before saving it', async ({ page, request }) => {
  const createRes = await request.post(`${API_BASE}/api/project/create`, {
    data: {
      phone: uniquePhone(),
      assessor: 'QA Bot',
      assessorId: 'QA-BOT',
    },
  });
  expect(createRes.ok()).toBeTruthy();
  const createBody = await createRes.json();
  const projectCode = createBody.project.code as string;

  const saveRes = await request.post(`${API_BASE}/api/project/${projectCode}/save`, {
    headers: { 'Content-Type': 'application/json' },
    data: { formData: buildReviewReadyFormData(), source: 'customer' },
  });
  expect(saveRes.ok()).toBeTruthy();

  await mockAdditionalBankDocumentValidation(page, {
    success: false,
    isWrongDocument: true,
    reason: 'wrong-document',
    message: 'Documento incorrecto. Por favor sube la nómina.',
  });

  await page.goto(`/?code=${projectCode}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Factura de luz/i }).click();
  await expect(page.locator('h1').first()).toContainText('Documentos');

  await page.getByTestId('additional-bank-doc-type').selectOption('payroll');
  await page.getByTestId('additional-bank-documents-input').setInputFiles(BANK_DOCUMENT_IMAGE_UPLOAD);

  await expect(page.getByText('Documento incorrecto. Por favor sube la nómina.')).toBeVisible();
  await expect(page.getByTestId('additional-bank-documents-list')).toHaveCount(0);

  await expect.poll(async () => {
    const project = await readProjectState(request, projectCode);
    return project?.formData.additionalBankDocuments?.length ?? 0;
  }).toBe(0);
});
