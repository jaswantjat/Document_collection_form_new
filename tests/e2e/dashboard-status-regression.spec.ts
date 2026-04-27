import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { bindPageToE2EBackend } from './helpers/pageBackendProxy';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const APPROVED_ASSESSOR = 'Sergi Guillen Cavero';
const transientProjectCodes = new Set<string>();

function uniquePhone() {
  const suffix = Date.now().toString().slice(-8);
  return `+346${suffix}`;
}

function makeStrippedPhoto(id: string) {
  return {
    id,
    timestamp: 1,
    sizeBytes: 100,
  };
}

function buildSubmittedFormData() {
  return {
    dni: {
      front: { photo: makeStrippedPhoto('dni-front'), extraction: null },
      back: { photo: makeStrippedPhoto('dni-back'), extraction: null },
      originalPdfs: [],
    },
    ibi: {
      photo: null,
      pages: [makeStrippedPhoto('ibi-1')],
      originalPdfs: [],
      extraction: null,
    },
    electricityBill: {
      pages: [{ photo: makeStrippedPhoto('bill-1'), extraction: null }],
      originalPdfs: [],
    },
    representation: {},
    signatures: {},
    contract: { originalPdfs: [], extraction: null },
    energyCertificate: { status: 'not-started' },
  };
}

async function loginDashboard(request: APIRequestContext) {
  const response = await request.post(`${API_BASE}/api/dashboard/login`, {
    data: { password: 'eltex2025' },
    timeout: 15000,
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  return body.token as string;
}

async function createDashboardProject(request: APIRequestContext, customerName: string) {
  const dashboardToken = await loginDashboard(request);
  const response = await request.post(`${API_BASE}/api/dashboard/project`, {
    data: {
      phone: uniquePhone(),
      assessor: APPROVED_ASSESSOR,
      customerName,
    },
    headers: {
      'Content-Type': 'application/json',
      'x-dashboard-token': dashboardToken,
    },
    timeout: 15000,
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  const code = body.project.code as string;
  transientProjectCodes.add(code);
  return {
    code,
    accessToken: body.project.accessToken as string,
  };
}

async function deleteProjectAsAdmin(request: APIRequestContext, code: string, dashboardToken?: string) {
  const token = dashboardToken ?? await loginDashboard(request);
  const response = await request.delete(`${API_BASE}/api/dashboard/project/${code}`, {
    headers: { 'x-dashboard-token': token },
    timeout: 15000,
    failOnStatusCode: false,
  });
  expect([200, 404]).toContain(response.status());
}

async function uploadAssets(request: APIRequestContext, code: string, assetKeys: string[]) {
  const multipart: Record<string, unknown> = {
    activeKeys: JSON.stringify(assetKeys),
  };

  assetKeys.forEach((key) => {
    multipart[key] = {
      name: `${key}.jpg`,
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-image'),
    };
  });

  const response = await request.post(`${API_BASE}/api/project/${code}/upload-assets`, {
    multipart,
    timeout: 15000,
  });
  expect(response.status()).toBe(200);
}

async function uploadCustomAssets(
  request: APIRequestContext,
  code: string,
  assets: Array<{ key: string; name: string; mimeType: string; buffer: Buffer }>,
) {
  const multipart: Record<string, unknown> = {
    activeKeys: JSON.stringify(assets.map((asset) => asset.key)),
  };

  assets.forEach((asset) => {
    multipart[asset.key] = {
      name: asset.name,
      mimeType: asset.mimeType,
      buffer: asset.buffer,
    };
  });

  const response = await request.post(`${API_BASE}/api/project/${code}/upload-assets`, {
    multipart,
    timeout: 15000,
  });
  expect(response.status()).toBe(200);
}

async function submitStrippedProject(request: APIRequestContext, code: string, accessToken: string, attemptId: string) {
  const response = await request.post(
    `${API_BASE}/api/project/${code}/submit?token=${encodeURIComponent(accessToken)}`,
    {
      data: {
        formData: buildSubmittedFormData(),
        source: 'customer',
        attemptId,
      },
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    },
  );
  expect(response.status()).toBe(200);
}

async function openDashboard(page: Page, token: string) {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.evaluate((dashboardToken: string) => {
    sessionStorage.setItem('dashboard_token', dashboardToken);
  }, token);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });
}

test.describe('Dashboard status regressions', () => {
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

  test('desktop dashboard keeps row actions visible without horizontal scrolling', async ({ page, request }) => {
    const project = await createDashboardProject(request, `dash-actions-${Date.now()}`);
    const token = await loginDashboard(request);
    await openDashboard(page, token);

    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(project.code);
    const row = page.locator('tbody tr');
    await expect(row).toHaveCount(1);

    const scrollFrame = page.getByTestId('dashboard-table-scroll');
    expect(await scrollFrame.evaluate((element) => element.scrollLeft)).toBe(0);

    const detailButton = row.getByTestId('ver-expediente-btn');
    const zipButton = row.getByTestId('dashboard-row-download-zip-btn');
    await expect(detailButton).toBeVisible();
    await expect(zipButton).toBeVisible();
    await expect(detailButton).toBeInViewport();
    await expect(zipButton).toBeInViewport();
  });

  test('detail modal can download primary docs from stored assets after submission strips previews', async ({ page, request }) => {
    const submitted = await createDashboardProject(request, `dash-assets-${Date.now()}`);

    await uploadAssets(request, submitted.code, ['dniFront', 'dniBack', 'ibi_0', 'electricity_0']);
    await submitStrippedProject(
      request,
      submitted.code,
      submitted.accessToken,
      `${submitted.code}-attempt-primary-assets`,
    );

    const token = await loginDashboard(request);
    await openDashboard(page, token);

    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(submitted.code);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await page.getByTestId('ver-expediente-btn').click();

    const modal = page.getByTestId('project-detail-modal');
    await expect(modal).toBeVisible();

    const dniFrontDownload = page.waitForEvent('download');
    await modal.getByTitle('Descargar DNI frontal').first().click();
    expect((await dniFrontDownload).suggestedFilename()).toBe(`${submitted.code}_dni_frontal.jpg`);

    const dniBackDownload = page.waitForEvent('download');
    await modal.getByTitle('Descargar DNI trasera').first().click();
    expect((await dniBackDownload).suggestedFilename()).toBe(`${submitted.code}_dni_trasera.jpg`);

    const ibiDownload = page.waitForEvent('download');
    await modal.getByTitle('Descargar IBI / Escritura').first().click();
    expect((await ibiDownload).suggestedFilename()).toBe(`${submitted.code}_ibi_escritura.jpg`);

    const electricityDownload = page.waitForEvent('download');
    await modal.getByTitle('Descargar Factura luz — pág. 1').first().click();
    expect((await electricityDownload).suggestedFilename()).toBe(`${submitted.code}_factura_luz_pag._1.jpg`);
  });

  test('status quick downloads fall back to original PDFs when stripped previews are gone', async ({ page, request }) => {
    const submitted = await createDashboardProject(request, `dash-originals-${Date.now()}`);

    await uploadCustomAssets(request, submitted.code, [
      {
        key: 'dniOriginal_0',
        name: 'dni.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 dni'),
      },
      {
        key: 'ibiOriginal_0',
        name: 'ibi.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 ibi'),
      },
      {
        key: 'electricityOriginal_0',
        name: 'bill.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 bill'),
      },
    ]);
    await submitStrippedProject(
      request,
      submitted.code,
      submitted.accessToken,
      `${submitted.code}-attempt-original-pdf-download`,
    );

    const token = await loginDashboard(request);
    await openDashboard(page, token);

    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(submitted.code);
    const row = page.locator('tbody tr');
    await expect(row).toHaveCount(1);
    await expect(row.locator('td').nth(2)).toContainText('DNI / NIE');
    await expect(row.locator('td').nth(2)).toContainText('IBI / Escritura');
    await expect(row.locator('td').nth(2)).toContainText('Factura de luz');

    const dniDownload = page.waitForEvent('download');
    await row.getByTestId('status-download-dni').click();
    expect((await dniDownload).suggestedFilename()).toBe(`${submitted.code}_dni_original_pdf.pdf`);

    const ibiDownload = page.waitForEvent('download');
    await row.getByTestId('status-download-ibi').click();
    expect((await ibiDownload).suggestedFilename()).toBe(`${submitted.code}_ibi_original_pdf.pdf`);

    const electricityDownload = page.waitForEvent('download');
    await row.getByTestId('status-download-electricity').click();
    expect((await electricityDownload).suggestedFilename()).toBe(
      `${submitted.code}_factura_luz_original_pdf.pdf`,
    );
  });
});
