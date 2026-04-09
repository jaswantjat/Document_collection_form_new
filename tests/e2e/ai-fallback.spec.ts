import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

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

function makeRepresentation() {
  return {
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

async function createPdfBuffer() {
  const pdf = await PDFDocument.create();
  const pdfPage = pdf.addPage([420, 260]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdfPage.drawText('IBI TEST', { x: 60, y: 140, size: 28, font });
  return Buffer.from(await pdf.save());
}

function createMockPdfImageData() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
      <rect width="900" height="1200" fill="#ffffff" />
      <text x="120" y="220" font-size="72" fill="#111827">IBI TEST</text>
      <text x="120" y="340" font-size="42" fill="#374151">Referencia Catastral 1234567VK</text>
    </svg>
  `.trim();
  return Buffer.from(svg).toString('base64');
}

test.describe('AI fallback', () => {
  test('AI-01: failed IBI extraction preserves the upload and still allows follow-up completion', async ({ page, request }) => {
    const projectCode = 'ELT20250005';
    await request.post(`${API_BASE}/api/test/restore-base-flow/${projectCode}`);

    await seedLocalBackup(page, projectCode, {
      dni: {
        front: { photo: makePhoto('dni-front'), extraction: null },
        back: { photo: makePhoto('dni-back'), extraction: null },
        originalPdfs: [],
        issue: null,
      },
      ibi: {
        photo: null,
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
      location: 'other',
      representation: makeRepresentation(),
      energyCertificate: makeEnergyCertificateState(),
      signatures: { customerSignature: null, repSignature: null },
    });

    let extractionCalls = 0;
    await page.route('**/api/extract', async (route) => {
      extractionCalls += 1;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'extract unavailable', reason: 'temporary-error' }),
      });
    });
    await page.route('**/api/extract-batch', async (route) => {
      extractionCalls += 1;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'extract unavailable', reason: 'temporary-error' }),
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
              name: 'ibi-test-page-1.svg',
              mimeType: 'image/svg+xml',
              data: createMockPdfImageData(),
            },
          ],
        }),
      });
    });

    await page.goto(`/?code=${projectCode}`);
    await expect(page.locator('h1, h2').first()).toContainText(/Sube lo que falte y confirma|Confirma tu documentación/);
    await page.getByRole('button', { name: /IBI o escritura/i }).first().click();
    await expect(page.locator('h1').first()).toContainText('Documentos');

    const pdfBuffer = await createPdfBuffer();
    await page.getByTestId('ibi-input').setInputFiles({
      name: 'ibi-test.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
    });

    await expect(page.getByText(/lectura automática no pudo completarse/i)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/PDF original guardado: 1 archivo/i)).toBeVisible({ timeout: 30000 });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByText(/lectura automática no pudo completarse/i)).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: /IBI o escritura/i }).first().click();
    await expect(page.locator('h1').first()).toContainText('Documentos');
    await expect(page.getByText(/PDF original guardado: 1 archivo/i)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/lectura automática no pudo completarse/i)).toBeVisible({ timeout: 30000 });

    await page.getByTestId('property-docs-continue-btn').click();
    await expect(page.locator('h1').first()).toContainText('Certificado energético');
    await page.getByRole('button', { name: /saltar/i }).click();
    await expect(page.locator('h1').first()).toContainText('¡Todo listo', { timeout: 30000 });
    expect(extractionCalls).toBeGreaterThan(0);
  });
});
