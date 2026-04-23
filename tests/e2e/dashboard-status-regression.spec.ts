import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { APPROVED_ASSESSOR, loginDashboard } from './helpers/projectAccess';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';

function uniquePhone() {
  const suffix = Date.now().toString().slice(-8);
  return `+346${suffix}`;
}

function makeStrippedPhoto(id: string) {
  return { id, timestamp: 1, sizeBytes: 100 };
}

function buildPartialFormData() {
  return {
    dni: {
      front: { photo: makeStrippedPhoto('dni-front'), extraction: null },
      back: { photo: null, extraction: null },
      originalPdfs: [],
    },
    ibi: { photo: null, pages: [], originalPdfs: [], extraction: null },
    electricityBill: { pages: [], originalPdfs: [] },
    representation: {},
    signatures: {},
    contract: { originalPdfs: [], extraction: null },
    energyCertificate: { status: 'not-started' },
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

async function openDashboard(page: Page, token: string) {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.evaluate((dashboardToken: string) => {
    sessionStorage.setItem('dashboard_token', dashboardToken);
  }, token);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });
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
  expect(body.project?.code).toBeTruthy();
  expect(body.project?.accessToken).toBeTruthy();
  return {
    code: body.project.code as string,
    accessToken: body.project.accessToken as string,
  };
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

test.describe('Dashboard status regressions', () => {
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

  test('dashboard separates untouched, in-progress, and submitted projects after binary stripping', async ({ page, request }) => {
    const stamp = `dash-state-${Date.now()}`;
    const pending = await createDashboardProject(request, `${stamp} pending`);
    const inProgress = await createDashboardProject(request, `${stamp} progress`);
    const submitted = await createDashboardProject(request, `${stamp} submitted`);

    await uploadAssets(request, inProgress.code, ['dniFront']);
    const saveRes = await request.post(
      `${API_BASE}/api/project/${inProgress.code}/save?token=${encodeURIComponent(inProgress.accessToken)}`,
      {
        data: { formData: buildPartialFormData(), source: 'customer' },
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      },
    );
    expect(saveRes.status()).toBe(200);

    await uploadAssets(request, submitted.code, ['dniFront', 'dniBack', 'ibi_0', 'electricity_0']);
    const submitRes = await request.post(
      `${API_BASE}/api/project/${submitted.code}/submit?token=${encodeURIComponent(submitted.accessToken)}`,
      {
        data: {
          formData: buildSubmittedFormData(),
          source: 'customer',
          attemptId: `${submitted.code}-attempt-1`,
        },
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      },
    );
    expect(submitRes.status()).toBe(200);

    const token = await loginDashboard(request);
    await openDashboard(page, token);

    const searchInput = page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...');
    await searchInput.fill(stamp);
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(3);

    await page.getByRole('button', { name: 'Pendientes' }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(pending.code);

    await page.getByRole('button', { name: 'En curso' }).click();
    await expect(rows).toHaveCount(1);
    const inProgressRow = rows.first();
    await expect(inProgressRow).toContainText(inProgress.code);
    await expect(inProgressRow.locator('td').nth(4)).toContainText('Recibido');
    await expect(inProgressRow.locator('td').nth(9)).toContainText('En curso');

    await page.getByRole('button', { name: 'Enviados' }).click();
    await expect(rows).toHaveCount(1);
    const submittedRow = rows.first();
    await expect(submittedRow).toContainText(submitted.code);
    await expect(submittedRow.locator('td').nth(4)).toContainText('Frontal');
    await expect(submittedRow.locator('td').nth(4)).toContainText('Trasera');
    await expect(submittedRow.locator('td').nth(5)).toContainText('Recibido');
    await expect(submittedRow.locator('td').nth(6)).toContainText('1 página');
    await expect(submittedRow.locator('td').nth(9)).toContainText('Enviado');
    await expect(submittedRow.locator('td').nth(9)).toContainText('Completo');
  });

  test('detail modal can download primary docs from stored assets after submission strips previews', async ({ page, request }) => {
    const submitted = await createDashboardProject(request, `dash-ibi-${Date.now()}`);

    await uploadAssets(request, submitted.code, ['dniFront', 'dniBack', 'ibi_0', 'electricity_0']);
    const submitRes = await request.post(
      `${API_BASE}/api/project/${submitted.code}/submit?token=${encodeURIComponent(submitted.accessToken)}`,
      {
        data: {
          formData: buildSubmittedFormData(),
          source: 'customer',
          attemptId: `${submitted.code}-attempt-ibi-download`,
        },
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      },
    );
    expect(submitRes.status()).toBe(200);

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

  test('table quick downloads fall back to original PDFs when stripped previews are gone', async ({ page, request }) => {
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

    const submitRes = await request.post(
      `${API_BASE}/api/project/${submitted.code}/submit?token=${encodeURIComponent(submitted.accessToken)}`,
      {
        data: {
          formData: buildSubmittedFormData(),
          source: 'customer',
          attemptId: `${submitted.code}-attempt-original-pdf-download`,
        },
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      },
    );
    expect(submitRes.status()).toBe(200);

    const token = await loginDashboard(request);
    await openDashboard(page, token);

    await page.getByPlaceholder('Buscar por nombre, código, teléfono, asesor o dirección...').fill(submitted.code);
    const row = page.locator('tbody tr');
    await expect(row).toHaveCount(1);

    await expect(row.locator('td').nth(4)).toContainText('Frontal');
    await expect(row.locator('td').nth(4)).toContainText('Trasera');
    await expect(row.locator('td').nth(5)).toContainText('Recibido');
    await expect(row.locator('td').nth(6)).toContainText('1 página');

    const dniDownload = page.waitForEvent('download');
    await row.locator('td').nth(4).getByTestId('download-asset-btn').click();
    expect((await dniDownload).suggestedFilename()).toBe(`${submitted.code}_dni_original_pdf.pdf`);

    const ibiDownload = page.waitForEvent('download');
    await row.locator('td').nth(5).getByTestId('download-asset-btn').click();
    expect((await ibiDownload).suggestedFilename()).toBe(`${submitted.code}_ibi_original_pdf.pdf`);

    const electricityDownload = page.waitForEvent('download');
    await row.locator('td').nth(6).getByTestId('download-asset-btn').click();
    expect((await electricityDownload).suggestedFilename()).toBe(
      `${submitted.code}_factura_luz_original_pdf.pdf`,
    );
  });
});
