import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getProjectAccess } from './helpers/projectAccess';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const VALID_JPEG_BUFFER = readFileSync(path.resolve(process.cwd(), 'app/public/autoritzacio-representacio.jpg'));

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
  test('AI-00: single-image DNI uploads use the fast extractor path', async ({ page, request }) => {
    const projectCode = 'ELT20250005';
    await request.post(`${API_BASE}/api/test/reset-property-docs/${projectCode}`);
    const { customerUrl } = await getProjectAccess(request, projectCode);

    let singleCalls = 0;
    let batchCalls = 0;

    await page.route('**/api/extract-dni-batch', async (route) => {
      batchCalls += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'batch should not be used for a single image' }),
      });
    });

    await page.route('**/api/extract', async (route) => {
      const requestBody = route.request().postDataJSON();
      if (requestBody?.documentType !== 'dniAuto') {
        await route.fallback();
        return;
      }

      singleCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          side: 'front',
          extraction: {
            extractedData: {
              fullName: 'Geert Elschot',
              dniNumber: 'Z3806141Z',
            },
            confidence: 0.96,
            isCorrectDocument: true,
            documentTypeDetected: 'passport',
            identityDocumentKind: 'passport',
            needsManualReview: false,
            confirmedByUser: true,
          },
          needsManualReview: false,
          message: 'Datos extraídos correctamente.',
        }),
      });
    });

    await page.goto(customerUrl);
    await expect(page.locator('h1').first()).toContainText('Documentos');

    await page.getByTestId('dni-input').setInputFiles({
      name: 'passport-front.jpg',
      mimeType: 'image/jpeg',
      buffer: VALID_JPEG_BUFFER,
    });

    await expect(page.getByText('Geert Elschot')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Z3806141Z')).toBeVisible({ timeout: 30000 });
    await expect.poll(() => singleCalls).toBe(1);
    await expect.poll(() => batchCalls).toBe(0);
  });

  test('AI-01: failed IBI extraction preserves the upload and still allows follow-up completion', async ({ page, request }) => {
    const projectCode = 'ELT20250005';
    await request.post(`${API_BASE}/api/test/restore-base-flow/${projectCode}`);
    const { customerUrl } = await getProjectAccess(request, projectCode);

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

    await page.goto(customerUrl);
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
    await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación', { timeout: 30000 });
    await page.getByTestId('review-submit-btn').click();
    await expect(page.locator('h1').first()).toContainText('¡Todo listo', { timeout: 30000 });
    expect(extractionCalls).toBeGreaterThan(0);
  });

  test('AI-02: offline IBI PDF upload shows a friendly error and recovers after reconnect', async ({ page, request }) => {
    const projectCode = 'ELT20250005';
    await request.post(`${API_BASE}/api/test/reset-property-docs/${projectCode}`);
    const { customerUrl } = await getProjectAccess(request, projectCode);
    let pdfConversionAvailable = false;

    await page.route('**/api/pdf-to-images', async (route) => {
      if (pdfConversionAvailable) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            images: [
              {
                name: 'ibi-offline-page-1.svg',
                mimeType: 'image/svg+xml',
                data: createMockPdfImageData(),
              },
            ],
          }),
        });
        return;
      }

      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'pdf conversion unavailable' }),
      });
    });

    await page.route('**/api/extract', async (route) => {
      const requestBody = route.request().postDataJSON();
      if (requestBody?.documentType !== 'ibi') {
        await route.fallback();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          extraction: {
            extractedData: {
              referenciaCatastral: '1234567VK1234A0001RT',
              titular: 'IAN EDUARDO DROMUNDO HERNANDEZ',
              direccion: 'Calle Mayor 1',
            },
            confidence: 0.96,
            isCorrectDocument: true,
            documentTypeDetected: 'ibi',
            needsManualReview: false,
            confirmedByUser: true,
          },
          needsManualReview: false,
          message: 'Datos extraídos correctamente.',
        }),
      });
    });

    await page.goto(customerUrl);
    await expect(page.locator('h1').first()).toContainText('Documentos');

    const pdfBuffer = await createPdfBuffer();

    await page.context().setOffline(true);
    await page.getByTestId('ibi-input').setInputFiles({
      name: 'ibi-offline.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
    });

    await expect(page.getByText(/no se pudo convertir el pdf sin conexión/i)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/Failed to fetch dynamically imported module/i)).toHaveCount(0);

    await page.context().setOffline(false);
    pdfConversionAvailable = true;
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('h1').first()).toContainText('Documentos');
    await page.getByTestId('ibi-input').setInputFiles({
      name: 'ibi-offline.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
    });

    await expect(page.getByText(/PDF original guardado: 1 archivo/i)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('1234567VK1234A0001RT')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/no se pudo convertir el pdf sin conexión/i)).toHaveCount(0);
  });
});
