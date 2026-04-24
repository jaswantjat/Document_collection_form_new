import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ENERGY_CERTIFICATE_TEMPLATE_VERSION } from '../../app/src/lib/energyCertificateDocument';
import { SIGNED_DOCUMENT_TEMPLATE_VERSION } from '../../app/src/lib/signedDocumentOverlays';
import { bindPageToE2EBackend } from './helpers/pageBackendProxy';
const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const APPROVED_ASSESSOR = 'Sergi Guillen Cavero';
const APPROVED_ASSESSORS = [
  'Sergi Guillen Cavero',
  'Juán Felipe Murillo Tamayo',
  'Diego Perujo Díaz',
  'Javier Paterna Merino',
  'José Luís Sevilla',
  'Antonio Miguel Sorroche Martínez',
  'Laura Martín Manzano',
  'Adolfo José Perdiguero Molina',
  'Albert Llacha',
  'Koen Hoogteijling',
];
const VALID_JPEG_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/';
const VALID_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z5Y4AAAAASUVORK5CYII=';
const VALID_PDF_BASE64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF').toString('base64');
const ADMIN_UPLOAD_FILE = path.resolve(process.cwd(), 'app/public/eltex-logo.png');
const transientProjectCodes = new Set<string>();

function uniquePhone() {
  const suffix = Date.now().toString().slice(-8);
  return `+346${suffix}`;
}

function trackTransientProjectCode(code: string) {
  transientProjectCodes.add(code);
  return code;
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
  return /ECONNRESET|EPIPE|socket hang up|Timeout .* exceeded/i.test(message);
}

async function postWithRetry(
  request: any,
  url: string,
  data: unknown,
  timeout: number,
  headers?: Record<string, string>,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await request.post(url, { data, timeout, headers });
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
      extraction: {
        extractedData: {
          summary: 'Declaración presentada ante AEAT.',
        },
        confidence: 0.93,
        isCorrectDocument: true,
        documentTypeDetected: 'Declaración de la renta',
        needsManualReview: true,
        confirmedByUser: true,
      },
      issue: {
        code: 'manual-review',
        message: 'Hemos guardado el documento, pero conviene revisarlo antes de tramitarlo.',
        updatedAt: '2026-04-15T10:00:00Z',
      },
    },
  ];
}

async function loginDashboard(request: any) {
  const loginRes = await postWithRetry(
    request,
    `${API_BASE}/api/dashboard/login`,
    { password: 'eltex2025' },
    20000,
  );
  expect(loginRes.status()).toBe(200);
  const loginBody = await loginRes.json();
  return loginBody.token as string;
}

async function createDashboardProject(request: any, formData?: Record<string, unknown>) {
  const dashboardToken = await loginDashboard(request);
  const createRes = await postWithRetry(
    request,
    `${API_BASE}/api/dashboard/project`,
    {
      phone: uniquePhone(),
      assessor: APPROVED_ASSESSOR,
      email: `qa-dashboard+${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
    },
    30000,
    { 'Content-Type': 'application/json', 'x-dashboard-token': dashboardToken },
  );
  expect(createRes.status()).toBe(200);
  const createBody = await createRes.json();
  const code = trackTransientProjectCode(createBody.project.code as string);
  const accessToken = createBody.project.accessToken as string;

  if (formData) {
    const saveRes = await postWithRetry(
      request,
      `${API_BASE}/api/project/${code}/save?token=${encodeURIComponent(accessToken)}`,
      { formData, source: 'customer' },
      30000,
    );
    expect(saveRes.status()).toBe(200);
  }

  return code;
}

async function deleteProjectAsAdmin(request: any, code: string, dashboardToken?: string) {
  const token = dashboardToken ?? await loginDashboard(request);
  const response = await request.delete(`${API_BASE}/api/dashboard/project/${code}`, {
    headers: { 'x-dashboard-token': token },
    timeout: 30000,
    failOnStatusCode: false,
  });
  expect([200, 404]).toContain(response.status());
}

async function openDashboard(page: any, token: string) {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.evaluate((dashboardToken: string) => {
    sessionStorage.setItem('dashboard_token', dashboardToken);
  }, token);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...')).toBeVisible({ timeout: 15000 });
}

function getProjectRow(page: any, projectText: string) {
  return page.locator('tbody tr').filter({ hasText: projectText }).first();
}

async function openProjectDetail(page: any, projectText: string) {
  const row = getProjectRow(page, projectText);
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByTestId('ver-expediente-btn').click();
  await expect(page.getByTestId('project-detail-modal')).toBeVisible({ timeout: 30000 });
  return row;
}

async function expectDetailUploadTargets(page: any) {
  const modal = page.getByTestId('project-detail-modal');
  await expect(modal.getByTestId('detail-upload-workspace')).toBeVisible();
  for (const key of ['dni-front', 'dni-back', 'ibi', 'electricity-bill', 'additional-bank-document']) {
    await expect(modal.getByTestId(`detail-upload-zone-${key}`)).toBeVisible();
  }
}

async function dropFileOnUploadZone(page: any, zoneTestId: string, file: { name: string; mimeType: string; buffer: Buffer }) {
  const dataTransfer = await page.evaluateHandle(({ name, mimeType, bytes }: { name: string; mimeType: string; bytes: number[] }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], name, { type: mimeType }));
    return transfer;
  }, {
    name: file.name,
    mimeType: file.mimeType,
    bytes: [...file.buffer],
  });
  const zone = page.getByTestId(zoneTestId);
  await zone.dispatchEvent('dragover', { dataTransfer });
  await zone.dispatchEvent('drop', { dataTransfer });
}

test.describe('Dashboard QA', () => {
  test.describe.configure({ timeout: 90000 });

  test.beforeEach(async ({ page }) => {
    await bindPageToE2EBackend(page);
  });

  test.afterEach(async ({ request }) => {
    const codes = [...transientProjectCodes];
    transientProjectCodes.clear();
    if (codes.length === 0) return;

    const dashboardToken = await loginDashboard(request);
    for (const code of codes) {
      await deleteProjectAsAdmin(request, code, dashboardToken);
    }
  });

  test('dashboard staff can create, reopen duplicate phones, and open the assessor form without customer-link controls', async ({ page, request }) => {
    const token = await loginDashboard(request);
    const phone = uniquePhone();

    await openDashboard(page, token);

    const assessorOptions = await page.locator('[data-testid="dashboard-create-assessor-select"] option').allTextContents();
    expect(assessorOptions).toEqual(APPROVED_ASSESSORS);

    await page.getByTestId('dashboard-create-phone-input').fill(phone);
    await page.getByTestId('dashboard-create-email-input').fill('dashboard.staff@example.com');
    await page.getByTestId('dashboard-create-assessor-select').selectOption(APPROVED_ASSESSOR);
    await page.getByTestId('dashboard-create-project-btn').click();

    const resultPanel = page.getByTestId('dashboard-project-action-result');
    await expect(resultPanel).toContainText('Expediente creado');

    const codeLine = await resultPanel.locator('text=/ELT\\d+/').first().textContent();
    const createdCode = codeLine?.match(/ELT\d+/)?.[0];
    expect(createdCode).toBeTruthy();
    trackTransientProjectCode(createdCode!);
    await expect(page.getByTestId('dashboard-open-project-btn')).toBeVisible();
    await expect(page.getByTestId('dashboard-resend-latest-link-btn')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-open-customer-link-btn')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-customer-link-input')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-copy-customer-link-btn')).toHaveCount(0);

    await expect(page.getByTestId('dashboard-create-phone-input')).toHaveValue('', { timeout: 15000 });
    await page.getByTestId('dashboard-create-phone-input').fill(phone);
    await expect(page.getByTestId('dashboard-create-project-btn')).toBeEnabled({ timeout: 15000 });
    await page.getByTestId('dashboard-create-project-btn').click();
    await expect(resultPanel).toContainText('Expediente existente encontrado');
    await expect(resultPanel).toContainText(createdCode!);

    const popupPromise = page.waitForEvent('popup');
    await page.getByTestId('dashboard-open-project-btn').click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await expect(popup).toHaveURL(new RegExp(`/\\?code=${createdCode}&source=assessor$`));
    await popup.close();

    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(createdCode!);
    await expect(page.getByTestId('dashboard-row-resend-link-btn')).toHaveCount(0);
    await expect(page.getByTestId('open-upload-btn')).toHaveCount(0);
  });

  test('dashboard staff create shows a validation error when the phone is missing', async ({ page, request }) => {
    const token = await loginDashboard(request);
    await openDashboard(page, token);

    await page.getByTestId('dashboard-create-project-btn').click();

    await expect(page.getByTestId('dashboard-project-management-error')).toContainText(
      'El número de teléfono es obligatorio.',
    );
  });

  test('dashboard create surfaces backend failures without leaving the dashboard flow', async ({ page, request }) => {
    const token = await loginDashboard(request);
    await openDashboard(page, token);

    await page.route('**/api/dashboard/project', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          message: 'Selecciona un asesor de la lista aprobada.',
        }),
      });
    });

    await page.getByTestId('dashboard-create-phone-input').fill(uniquePhone());
    await page.getByTestId('dashboard-create-project-btn').click();

    await expect(page.getByTestId('dashboard-project-management-error')).toContainText(
      'Selecciona un asesor de la lista aprobada.',
    );
  });

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
    const row = getProjectRow(page, code);
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(page.locator('thead')).toContainText('Estado');
    await expect(page.getByRole('columnheader', { name: 'DNI / NIE' })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'IBI / escritura' })).toHaveCount(0);

    await page.getByTestId('dashboard-assessor-filter').selectOption(APPROVED_ASSESSOR);
    await expect(row).toBeVisible();

    const csvDownload = page.waitForEvent('download');
    await page.getByTestId('export-csv-btn').click();
    const csv = await csvDownload;
    expect(csv.suggestedFilename()).toContain('eltex_expedientes_');

    await row.getByTestId('ver-expediente-btn').click();
    await expect(page.getByTestId('project-detail-modal')).toBeVisible();
    await page.getByTestId('project-detail-modal').click({ position: { x: 8, y: 8 } });
    await expect(page.getByTestId('project-detail-modal')).toBeHidden();

    await page.getByTestId('logout-btn').click();
    await expect(page.getByRole('heading', { name: 'Acceso al panel' })).toBeVisible();
  });

  test('inline assessor reassignment saves immediately and preserves unrelated signed renders', async ({ page, request }) => {
    const code = await createDashboardProject(request, makeDashboardFormData());
    const token = await loginDashboard(request);
    const newAssessor = APPROVED_ASSESSORS[6];

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(code);
    const row = getProjectRow(page, code);
    await expect(row).toBeVisible({ timeout: 15000 });

    const rowAssessorOptions = await row.getByTestId('dashboard-assessor-select').locator('option').allTextContents();
    expect(rowAssessorOptions).toEqual(APPROVED_ASSESSORS);
    await row.getByTestId('dashboard-assessor-select').selectOption(newAssessor);
    await expect(row.getByTestId('dashboard-assessor-save-status')).toContainText('Guardado', { timeout: 30000 });
    await expect(row.getByTestId('dashboard-assessor-select')).toHaveValue(newAssessor);

    const detailRes = await request.get(`${API_BASE}/api/dashboard/project/${code}`, {
      headers: { 'x-dashboard-token': token },
      timeout: 15000,
    });
    const detailBody = await detailRes.json();
    expect(detailBody.project.assessor).toBe(newAssessor);
    expect(detailBody.project.formData.energyCertificate.renderedDocument).toBeNull();
    expect(detailBody.project.formData.representation.renderedDocuments.catalunaIva.templateVersion)
      .toBe(SIGNED_DOCUMENT_TEMPLATE_VERSION);

    await page.getByTestId('dashboard-assessor-filter').selectOption(newAssessor);
    await expect(row).toBeVisible();
    await page.getByTestId('dashboard-assessor-filter').selectOption(APPROVED_ASSESSOR);
    await expect(row).toBeHidden();
  });

  test('refresh pulls in new projects and keeps the newest activity first', async ({ page, request }) => {
    const customerName = `Refresh Sort ${Date.now()}`;
    const createProject = async () => {
      const dashboardToken = await loginDashboard(request);
      const createRes = await postWithRetry(
        request,
        `${API_BASE}/api/dashboard/project`,
        {
          phone: uniquePhone(),
          assessor: APPROVED_ASSESSOR,
          customerName,
          email: `qa-refresh+${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
        },
        30000,
        { 'Content-Type': 'application/json', 'x-dashboard-token': dashboardToken },
      );
      expect(createRes.status()).toBe(200);
      const createBody = await createRes.json();
      return trackTransientProjectCode(createBody.project.code as string);
    };

    const firstCode = await createProject();
    const token = await loginDashboard(request);

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(customerName);
    const filteredRows = page.locator('tbody tr');
    await expect(filteredRows).toHaveCount(1);
    await expect(filteredRows.first()).toContainText(firstCode);

    await delay(25);
    const secondCode = await createProject();
    await page.getByTestId('dashboard-refresh-btn').click();

    await expect(filteredRows).toHaveCount(2, { timeout: 30000 });
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

    await openProjectDetail(page, code);
    await expect(page.getByRole('heading', { name: 'Acceso al panel' })).toBeVisible();
  });

  test('expired dashboard session on create returns to the login gate', async ({ page, request }) => {
    const token = await loginDashboard(request);

    await openDashboard(page, token);

    await page.route('**/api/dashboard/project', async (route) => {
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

    await page.getByTestId('dashboard-create-phone-input').fill(uniquePhone());
    await page.getByTestId('dashboard-create-project-btn').click();

    await expect(page.getByRole('heading', { name: 'Acceso al panel' })).toBeVisible();
    await expect(page.getByTestId('dashboard-project-management-card')).toBeHidden();
  });

  test('browser-built dashboard ZIP matches the detail inventory folders', async ({ page, request }) => {
    const code = await createDashboardProject(request, makeDashboardFormData());
    const token = await loginDashboard(request);

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(code);
    await openProjectDetail(page, code);
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

  test('status-column downloads direct files and document mini ZIPs without using the full ZIP button', async ({ page, request }) => {
    const directCode = await createDashboardProject(request, makeDashboardFormData());
    const multiFileData = makeDashboardFormData();
    multiFileData.ibi.pages = [makePhoto('ibi-1'), makePhoto('ibi-2')];
    const zipCode = await createDashboardProject(request, multiFileData);
    const token = await loginDashboard(request);

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(directCode);
    const directRow = getProjectRow(page, directCode);
    await expect(directRow).toBeVisible({ timeout: 15000 });
    const directDownload = page.waitForEvent('download');
    await directRow.getByTestId('status-download-ibi').click();
    expect((await directDownload).suggestedFilename()).toBe(`${directCode}_ibi_escritura.jpg`);

    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(zipCode);
    const zipRow = getProjectRow(page, zipCode);
    await expect(zipRow).toBeVisible({ timeout: 15000 });
    const miniZipDownload = page.waitForEvent('download');
    await zipRow.getByTestId('status-download-ibi').click();
    const miniZip = await miniZipDownload;
    expect(miniZip.suggestedFilename()).toBe(`${zipCode}_ibi_escritura.zip`);

    const miniZipPath = await miniZip.path();
    expect(miniZipPath).toBeTruthy();
    const entries = await parseZipEntries(readFileSync(miniZipPath!));
    expect(entries).toEqual(expect.arrayContaining([
      '1_documentos/ibi_escritura.jpg',
      '1_documentos/ibi_escritura_2.jpg',
    ]));

    await expect(zipRow.getByRole('button', { name: 'ZIP' })).toBeVisible();
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

    await openProjectDetail(page, code);
    await expect(page.getByText('Cargando detalle del expediente...')).toBeVisible();
    await expect(page.getByText('PDFs firmados')).toBeVisible();
    const firstOpenRequests = detailRequests;
    expect(firstOpenRequests).toBeGreaterThanOrEqual(1);

    await page.getByTestId('project-detail-modal').click({ position: { x: 8, y: 8 } });
    await expect(page.getByTestId('project-detail-modal')).toBeHidden();

    await openProjectDetail(page, code);
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
    await expect(getProjectRow(page, code)).toBeVisible({ timeout: 30000 });

    await openProjectDetail(page, code);
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
    await expect(page.getByText(code)).toBeVisible({ timeout: 15000 });
    await openProjectDetail(page, code);
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
    await openProjectDetail(page, code);
    const modal = page.getByTestId('project-detail-modal');
    await expect(modal).toBeVisible();

    await expect(modal.getByText('Documentos adicionales')).toBeVisible();
    await expect(modal.getByTitle('Descargar Documento adicional')).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: code }).first()).toContainText('Documento adicional');
    await expect(modal.getByText('IRPF 2024')).toBeVisible();
    await expect(modal.getByText('Revisar', { exact: true })).toBeVisible();
    await expect(modal.getByText('Declaración presentada ante AEAT.')).toHaveCount(0);

    const bankDocDownload = page.waitForEvent('download');
    await modal.getByTitle('Descargar Documento adicional').click();
    expect((await bankDocDownload).suggestedFilename()).toBe(
      `${code}_documento_adicional.pdf`,
    );
  });

  test('dashboard admin upload saves additional documents without triggering AI extraction and surfaces them in the status column', async ({ page, request }) => {
    const code = await createDashboardProject(request);
    const token = await loginDashboard(request);
    let extractCalls = 0;

    await page.route('**/api/extract', async (route) => {
      extractCalls += 1;
      await route.continue();
    });
    await page.route('**/api/extract-batch', async (route) => {
      extractCalls += 1;
      await route.continue();
    });

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(code);
    const row = page.locator('tbody tr').filter({ hasText: code }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).not.toContainText('Documento adicional');
    await openProjectDetail(page, code);
    await expectDetailUploadTargets(page);

    const modal = page.getByTestId('project-detail-modal');
    const uploadZone = modal.getByTestId('detail-upload-zone-additional-bank-document');
    await dropFileOnUploadZone(page, 'detail-upload-zone-additional-bank-document', {
      name: 'irpf-2024.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'),
    });

    await expect(uploadZone.getByText('Documento adicional guardado correctamente.')).toBeVisible({ timeout: 30000 });
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Documentos adicionales')).toBeVisible();
    await expect(modal.getByTitle('Descargar Documento adicional')).toBeVisible();
    await expect(modal.getByText('Revisar', { exact: true })).toHaveCount(0);
    await page.getByTestId('project-detail-modal').click({ position: { x: 8, y: 8 } });
    await expect(page.getByTestId('project-detail-modal')).toBeHidden({ timeout: 15000 });

    await expect(row).toContainText('Documento adicional', { timeout: 30000 });
    await expect(row).toContainText('1 archivo', { timeout: 30000 });
    expect(extractCalls).toBe(0);

    await row.getByTestId('ver-expediente-btn').click();
    await expect(page.getByTestId('project-detail-modal')).toBeVisible();
    const bankDocDownload = page.waitForEvent('download');
    await page.getByTestId('project-detail-modal').getByTitle('Descargar Documento adicional').click();
    expect((await bankDocDownload).suggestedFilename()).toBe(`${code}_documento_adicional.pdf`);
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
    await openProjectDetail(page, code);
    await expectDetailUploadTargets(page);

    const uploadZone = page.getByTestId('detail-upload-zone-dni-front');
    await page.getByTestId('detail-upload-input-dni-front').setInputFiles(ADMIN_UPLOAD_FILE);
    await expect(uploadZone.getByText('Documento guardado correctamente.')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('project-detail-modal').getByTitle('Descargar DNI frontal').first()).toBeVisible();
  });

  test('delete action requires confirmation and removes the project row', async ({ page, request }) => {
    const code = await createDashboardProject(request);
    const token = await loginDashboard(request);

    await openDashboard(page, token);
    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(code);
    const row = getProjectRow(page, code);
    await expect(row).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Eliminar expediente' }).click();
    await expect(page.getByRole('button', { name: 'Confirmar' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(row).toBeVisible();

    await page.getByRole('button', { name: 'Eliminar expediente' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(row).toBeHidden({ timeout: 30000 });
  });
});
