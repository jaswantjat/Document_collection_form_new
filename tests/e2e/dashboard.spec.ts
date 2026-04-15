import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ENERGY_CERTIFICATE_TEMPLATE_VERSION } from '../../app/src/lib/energyCertificateDocument';
import { SIGNED_DOCUMENT_TEMPLATE_VERSION } from '../../app/src/lib/signedDocumentOverlays';
const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const VALID_JPEG_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/';
const VALID_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z5Y4AAAAASUVORK5CYII=';
const VALID_PDF_BASE64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF').toString('base64');
const ADMIN_UPLOAD_FILE = path.resolve(process.cwd(), 'app/public/eltex-logo.png');

function uniquePhone() {
  const suffix = Date.now().toString().slice(-8);
  return `+346${suffix}`;
}

function makeDataUrl(_payload: string, mimeType = 'image/jpeg') {
  const base64 = mimeType === 'image/png'
    ? VALID_PNG_BASE64
    : mimeType === 'application/pdf'
      ? VALID_PDF_BASE64
      : VALID_JPEG_BASE64;
  return `data:${mimeType};base64,${base64}`;
}

function makePhoto(payload: string) {
  return {
    id: `photo-${payload}`,
    preview: makeDataUrl(payload),
    timestamp: 1,
    sizeBytes: payload.length,
  };
}

function makeRenderedDocument(payload: string, templateVersion: string) {
  return {
    imageDataUrl: makeDataUrl(payload, 'image/png'),
    generatedAt: '2026-04-09T10:00:00Z',
    templateVersion,
  };
}

async function parseZipEntries(buffer: Buffer) {
  const { default: UZIP } = await import('../../app/node_modules/uzip/UZIP.js');
  return Object.keys(UZIP.parse(buffer)).sort();
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientRequestError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNRESET|EPIPE|socket hang up/i.test(message);
}

async function postWithRetry(
  request: any,
  url: string,
  data: unknown,
  timeout: number
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await request.post(url, { data, timeout });
    } catch (error) {
      if (!isTransientRequestError(error) || attempt === 1) throw error;
      await delay(250);
    }
  }

  throw new Error(`Request retry exhausted for ${url}`);
}

function makeCompletedEnergyCertificate() {
  return {
    status: 'completed',
    housing: {
      cadastralReference: '1234567DF3813C0001AA',
      habitableAreaM2: '110',
      floorCount: '2',
      averageFloorHeight: '2.7-3.2m',
      bedroomCount: '3',
      doorsByOrientation: { north: '1', east: '1', south: '1', west: '1' },
      windowsByOrientation: { north: '1', east: '1', south: '1', west: '1' },
      windowFrameMaterial: 'pvc',
      doorMaterial: 'Madera',
      windowGlassType: 'doble',
      hasShutters: false,
      shutterWindowCount: '',
    },
    thermal: {
      thermalInstallationType: 'aerotermia',
      boilerFuelType: 'aerotermia',
      equipmentDetails: 'Equipo exterior',
      hasAirConditioning: false,
      airConditioningType: null,
      airConditioningDetails: '',
      heatingEmitterType: 'radiadores-agua',
      radiatorMaterial: 'aluminio',
      tipoFase: 'monofasica',
      tipoFaseConfirmed: true,
    },
    additional: {
      soldProduct: 'solo-paneles',
      isExistingCustomer: false,
      hasSolarPanels: false,
      solarPanelDetails: '',
    },
    customerSignature: makeDataUrl('ec-signature', 'image/png'),
    renderedDocument: makeRenderedDocument('ec-render', ENERGY_CERTIFICATE_TEMPLATE_VERSION),
    completedAt: '2026-04-09T10:00:00Z',
    skippedAt: null,
  };
}

function makeDashboardFormData() {
  return {
    dni: {
      front: { photo: makePhoto('dni-front'), extraction: null },
      back: { photo: makePhoto('dni-back'), extraction: null },
      originalPdfs: [],
    },
    ibi: {
      photo: null,
      pages: [makePhoto('ibi-1')],
      originalPdfs: [],
      extraction: null,
    },
    electricityBill: {
      pages: [{ photo: makePhoto('bill-1'), extraction: null }],
      originalPdfs: [],
    },
    contract: { originalPdfs: [], extraction: null },
    location: 'cataluna',
    representation: {
      location: 'cataluna',
      isCompany: false,
      companyName: '',
      companyNIF: '',
      companyAddress: '',
      companyMunicipality: '',
      companyPostalCode: '',
      postalCode: '08001',
      ivaPropertyAddress: 'Calle Solar 1',
      ivaCertificateSignature: makeDataUrl('iva-cat', 'image/png'),
      representacioSignature: makeDataUrl('rep-cat', 'image/png'),
      generalitatRole: 'titular',
      generalitatSignature: makeDataUrl('gen-cat', 'image/png'),
      poderRepresentacioSignature: null,
      ivaCertificateEsSignature: null,
      renderedDocuments: {
        catalunaIva: makeRenderedDocument('iva-render', SIGNED_DOCUMENT_TEMPLATE_VERSION),
        catalunaGeneralitat: makeRenderedDocument('generalitat-render', SIGNED_DOCUMENT_TEMPLATE_VERSION),
        catalunaRepresentacio: makeRenderedDocument('representacio-render', SIGNED_DOCUMENT_TEMPLATE_VERSION),
      },
    },
    signatures: {
      customerSignature: makeDataUrl('customer-signature', 'image/png'),
      repSignature: makeDataUrl('rep-signature', 'image/png'),
    },
    energyCertificate: makeCompletedEnergyCertificate(),
    electricalPanel: { photos: [makePhoto('panel-1')] },
    roof: { photos: [makePhoto('roof-1')] },
    installationSpace: { photos: [makePhoto('space-1')] },
    radiators: { photos: [makePhoto('radiator-1')] },
  };
}

function makeAdditionalBankDocuments() {
  return [
    {
      id: 'ownership',
      type: 'bank-ownership-certificate',
      files: [{
        id: 'ownership-file',
        filename: 'ownership.pdf',
        mimeType: 'application/pdf',
        dataUrl: makeDataUrl('ownership', 'application/pdf'),
        timestamp: 1,
        sizeBytes: 100,
      }],
    },
    {
      id: 'other',
      type: 'other',
      customLabel: 'IRPF 2024',
      files: [{
        id: 'other-file',
        filename: 'irpf.png',
        mimeType: 'image/png',
        dataUrl: makeDataUrl('irpf', 'image/png'),
        timestamp: 1,
        sizeBytes: 100,
      }],
    },
  ];
}

async function loginDashboard(request: any) {
  const loginRes = await postWithRetry(
    request,
    `${API_BASE}/api/dashboard/login`,
    { password: 'eltex2025' },
    10000,
  );
  expect(loginRes.status()).toBe(200);
  const loginBody = await loginRes.json();
  return loginBody.token as string;
}

async function createDashboardProject(request: any, formData?: Record<string, unknown>) {
  const createRes = await postWithRetry(
    request,
    `${API_BASE}/api/project/create`,
    {
      phone: uniquePhone(),
      assessor: 'QA Bot',
      assessorId: 'QA-BOT',
    },
    15000,
  );
  expect(createRes.status()).toBe(200);
  const createBody = await createRes.json();
  const code = createBody.project.code as string;

  if (formData) {
    const saveRes = await postWithRetry(
      request,
      `${API_BASE}/api/project/${code}/save`,
      { formData, source: 'customer' },
      15000,
    );
    expect(saveRes.status()).toBe(200);
  }

  return code;
}

async function openDashboard(page: any, token: string) {
  await page.goto('/');
  await page.evaluate((dashboardToken: string) => {
    sessionStorage.setItem('dashboard_token', dashboardToken);
  }, token);
  await page.goto('/dashboard');
  await expect(page.getByText('Dashboard')).toBeVisible();
}

test.describe('Dashboard QA', () => {
  test('invalid dashboard session returns to the login gate', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      sessionStorage.setItem('dashboard_token', 'invalid-token');
    });
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Acceso al panel' })).toBeVisible();
  });

  test('search, filter, CSV export, detail modal, and logout work together', async ({ page, request }) => {
    const code = await createDashboardProject(request, makeDashboardFormData());
    const token = await loginDashboard(request);

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(code);
    await expect(page.getByText(code)).toBeVisible();

    await page.getByRole('button', { name: 'Pendientes' }).click();
    await expect(page.getByText(code)).toBeVisible();

    const csvDownload = page.waitForEvent('download');
    await page.getByTestId('export-csv-btn').click();
    const csv = await csvDownload;
    expect(csv.suggestedFilename()).toContain('eltex_expedientes_');

    await page.getByTestId('ver-expediente-btn').click();
    await expect(page.getByTestId('project-detail-modal')).toBeVisible();
    await page.getByTestId('project-detail-modal').click({ position: { x: 8, y: 8 } });
    await expect(page.getByTestId('project-detail-modal')).toBeHidden();

    await page.getByTestId('logout-btn').click();
    await expect(page.getByRole('heading', { name: 'Acceso al panel' })).toBeVisible();
  });

  test('refresh pulls in new projects and keeps the newest activity first', async ({ page, request }) => {
    const assessor = `Refresh Sort ${Date.now()}`;
    const createProject = async () => {
      const createRes = await postWithRetry(
        request,
        `${API_BASE}/api/project/create`,
        {
          phone: uniquePhone(),
          assessor,
          assessorId: assessor,
        },
        15000,
      );
      expect(createRes.status()).toBe(200);
      const createBody = await createRes.json();
      return createBody.project.code as string;
    };

    const firstCode = await createProject();
    const token = await loginDashboard(request);

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(assessor);
    const filteredRows = page.locator('tbody tr');
    await expect(filteredRows).toHaveCount(1);
    await expect(filteredRows.first()).toContainText(firstCode);

    await delay(25);
    const secondCode = await createProject();
    await page.getByTestId('dashboard-refresh-btn').click();

    await expect(filteredRows).toHaveCount(2, { timeout: 15000 });
    await expect(filteredRows.first()).toContainText(secondCode);
    await expect(filteredRows.nth(1)).toContainText(firstCode);
  });

  test('expired dashboard session on detail load returns to the login gate', async ({ page, request }) => {
    const code = await createDashboardProject(request, makeDashboardFormData());
    const token = await loginDashboard(request);

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(code);

    await page.route(`**/api/dashboard/project/${code}`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'SESSION_EXPIRED',
          message: 'La sesión del dashboard ha caducado.',
        }),
      });
    });

    await page.getByTestId('ver-expediente-btn').click();
    await expect(page.getByRole('heading', { name: 'Acceso al panel' })).toBeVisible();
  });

  test('browser-built dashboard ZIP matches the detail inventory folders', async ({ page, request }) => {
    const code = await createDashboardProject(request, makeDashboardFormData());
    const token = await loginDashboard(request);

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(code);
    await page.getByTestId('ver-expediente-btn').click();
    await expect(page.getByTestId('project-detail-modal')).toBeVisible();

    const zipDownload = page.waitForEvent('download');
    await page.getByTestId('download-zip-btn').click();
    const download = await zipDownload;
    const zipPath = await download.path();
    expect(zipPath).toBeTruthy();

    const entries = await parseZipEntries(readFileSync(zipPath!));

    expect(entries).toEqual(expect.arrayContaining([
      '1_documentos/dni_frontal.jpg',
      '1_documentos/dni_trasera.jpg',
      '1_documentos/ibi_escritura.jpg',
      '1_documentos/factura_luz_pag_1.jpg',
      `2_pdfs_firmados/${code}_iva-cat.pdf`,
      `2_pdfs_firmados/${code}_generalitat.pdf`,
      `2_pdfs_firmados/${code}_autoritzacio-representacio.pdf`,
      `3_certificado_energetico/${code}_certificado-energetico.pdf`,
      '4_firmas_finales/firma_cliente.png',
      '4_firmas_finales/firma_comercial.png',
      '5_fotos_inmueble/cuadro_electrico_1.jpg',
      '5_fotos_inmueble/tejado_1.jpg',
      '5_fotos_inmueble/espacio_de_instalacion_1.jpg',
      '5_fotos_inmueble/radiadores_1.jpg',
    ]));
  });

  test('detail modal uses cached project detail after the first slow load', async ({ page, request }) => {
    const code = await createDashboardProject(request, makeDashboardFormData());
    const token = await loginDashboard(request);
    let detailRequests = 0;

    await page.route(`**/api/dashboard/project/${code}`, async (route) => {
      detailRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(code);

    await page.getByTestId('ver-expediente-btn').click();
    await expect(page.getByText('Cargando detalle del expediente...')).toBeVisible();
    await expect(page.getByText('PDFs firmados')).toBeVisible();
    const firstOpenRequests = detailRequests;
    expect(firstOpenRequests).toBeGreaterThanOrEqual(1);

    await page.getByTestId('project-detail-modal').click({ position: { x: 8, y: 8 } });
    await expect(page.getByTestId('project-detail-modal')).toBeHidden();

    await page.getByTestId('ver-expediente-btn').click();
    await expect(page.getByText('PDFs firmados')).toBeVisible();
    await page.waitForTimeout(200);
    expect(detailRequests).toBe(firstOpenRequests);
  });

  test('slower network still allows detail load and ZIP download for a populated project', async ({ page, request }) => {
    const code = await createDashboardProject(request, makeDashboardFormData());
    const token = await loginDashboard(request);

    await page.route('**/api/dashboard', async (route) => {
      await delay(500);
      await route.continue();
    });
    await page.route(`**/api/dashboard/project/${code}`, async (route) => {
      await delay(700);
      await route.continue();
    });

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(code);
    await expect(page.getByText(code)).toBeVisible();

    await page.getByTestId('ver-expediente-btn').click();
    await expect(page.getByText('Cargando detalle del expediente...')).toBeVisible();
    await expect(page.getByText('PDFs firmados')).toBeVisible();

    const zipDownload = page.waitForEvent('download');
    await page.getByTestId('download-zip-btn').click();
    expect((await zipDownload).suggestedFilename()).toContain(code);
  });

  test('detail modal per-section downloads return the expected filenames', async ({ page, request }) => {
    const code = await createDashboardProject(request, makeDashboardFormData());
    const token = await loginDashboard(request);

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(code);
    await page.getByTestId('ver-expediente-btn').click();
    const modal = page.getByTestId('project-detail-modal');
    await expect(modal).toBeVisible();

    const docDownload = page.waitForEvent('download');
    await modal.getByTitle('Descargar DNI frontal').first().click();
    expect((await docDownload).suggestedFilename()).toBe(`${code}_dni_frontal.jpg`);

    const signedDownload = page.waitForEvent('download');
    await modal.getByTitle('Descargar IVA 10% Cataluña').click();
    expect((await signedDownload).suggestedFilename()).toBe(`${code}_iva-cat.pdf`);

    const signatureDownload = page.waitForEvent('download');
    await modal.getByTitle('Descargar Firma cliente').first().click();
    expect((await signatureDownload).suggestedFilename()).toBe(`${code}_firma_cliente.png`);
  });

  test('detail modal exposes additional bank documents for download without redesigning the view', async ({ page, request }) => {
    const code = await createDashboardProject(request, {
      ...makeDashboardFormData(),
      additionalBankDocuments: makeAdditionalBankDocuments(),
    });
    const token = await loginDashboard(request);

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(code);
    await page.getByTestId('ver-expediente-btn').click();
    const modal = page.getByTestId('project-detail-modal');
    await expect(modal).toBeVisible();

    await expect(modal.getByText('Documentos bancarios adicionales')).toBeVisible();
    await expect(modal.getByText('Documento adicional')).toBeVisible();
    await expect(modal.getByText('IRPF 2024')).toBeVisible();

    const bankDocDownload = page.waitForEvent('download');
    await modal.getByTitle('Descargar Documento adicional').click();
    expect((await bankDocDownload).suggestedFilename()).toBe(
      `${code}_documento_adicional.pdf`,
    );
  });

  test('admin upload refreshes the dashboard and makes the new document downloadable', async ({ page, request }) => {
    const code = await createDashboardProject(request);
    const token = await loginDashboard(request);

    await page.route('**/api/extract', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          extraction: {
            extractedData: {
              fullName: 'Admin Upload Test',
              dniNumber: '12345678A',
            },
            confidence: 1,
            isCorrectDocument: true,
            documentTypeDetected: 'dni',
            identityDocumentKind: 'dni-card',
            needsManualReview: false,
          },
        }),
      });
    });

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(code);
    await page.getByTestId('open-upload-btn').click();
    await expect(page.getByTestId('admin-upload-modal')).toBeVisible();

    await page.getByTestId('admin-upload-file-input').setInputFiles(ADMIN_UPLOAD_FILE);
    await expect(page.getByText('Admin Upload Test')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Recibido')).toBeVisible({ timeout: 15000 });
    const uploadModal = page.getByTestId('admin-upload-modal');
    await expect(uploadModal.getByText('Documento guardado correctamente.')).toBeVisible({ timeout: 15000 });
    await uploadModal.getByTestId('admin-upload-close-btn').click();
    await expect(uploadModal).toBeHidden({ timeout: 15000 });

    await page.getByTestId('ver-expediente-btn').click();
    await expect(page.getByTestId('project-detail-modal').getByTitle('Descargar DNI frontal').first()).toBeVisible();
  });

  test('delete action requires confirmation and removes the project row', async ({ page, request }) => {
    const code = await createDashboardProject(request);
    const token = await loginDashboard(request);

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(code);
    await expect(page.getByText(code)).toBeVisible();

    await page.getByRole('button', { name: 'Eliminar expediente' }).click();
    await expect(page.getByRole('button', { name: 'Confirmar' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText(code)).toBeVisible();

    await page.getByRole('button', { name: 'Eliminar expediente' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText(code)).toBeHidden();
  });
});
