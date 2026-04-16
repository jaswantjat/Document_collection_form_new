import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const VALID_CODE = 'ELT20250001';
const APPROVED_ASSESSOR = 'Sergi Guillen Cavero';
const VALID_JPEG_BASE64 = readFileSync(path.resolve(process.cwd(), 'app/public/autoritzacio-representacio.jpg')).toString('base64');
const VALID_PNG_BASE64 = readFileSync(path.resolve(process.cwd(), 'app/public/eltex-logo.png')).toString('base64');
const VALID_PDF_BASE64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF').toString('base64');

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

function makeStoredPdf(payload: string) {
  return {
    id: `pdf-${payload}`,
    filename: `${payload}.pdf`,
    mimeType: 'application/pdf',
    dataUrl: makeDataUrl(payload, 'application/pdf'),
    timestamp: 1,
    sizeBytes: payload.length,
  };
}

async function parseZipEntries(buffer: Buffer) {
  const { default: UZIP } = await import('../../app/node_modules/uzip/UZIP.js');
  return Object.keys(UZIP.parse(buffer)).sort();
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
    },
    additional: {
      soldProduct: 'solo-paneles',
      isExistingCustomer: false,
      hasSolarPanels: false,
      solarPanelDetails: '',
    },
    customerSignature: makeDataUrl('ec-signature', 'image/png'),
    renderedDocument: {
      imageDataUrl: makeDataUrl('ec-render', 'image/png'),
      generatedAt: '2026-04-09T10:00:00Z',
      templateVersion: '2026-04-01.3',
    },
    completedAt: '2026-04-09T10:00:00Z',
    skippedAt: null,
  };
}

function buildLegacyZipFormData() {
  return {
    dni: {
      front: { photo: makePhoto('dni-front'), extraction: null },
      back: { photo: makePhoto('dni-back'), extraction: null },
      originalPdfs: [makeStoredPdf('dni-original')],
    },
    ibi: {
      photo: null,
      pages: [makePhoto('ibi-1')],
      originalPdfs: [makeStoredPdf('ibi-original')],
      extraction: null,
    },
    electricityBill: {
      pages: [{ photo: makePhoto('bill-1'), extraction: null }],
      originalPdfs: [makeStoredPdf('bill-original')],
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
      renderedDocuments: {},
    },
    signatures: {
      customerSignature: makeDataUrl('customer-signature', 'image/png'),
      repSignature: makeDataUrl('rep-signature', 'image/png'),
    },
    energyCertificate: makeCompletedEnergyCertificate(),
    roof: { photos: [makePhoto('roof-1')] },
  };
}

async function loginDashboard(request: any) {
  const loginRes = await request.post(`${BASE}/api/dashboard/login`, {
    data: { password: 'eltex2025' },
    timeout: 10000,
  });
  expect(loginRes.status()).toBe(200);
  const loginBody = await loginRes.json();
  expect(loginBody.token).toBeTruthy();
  return loginBody.token as string;
}

async function getDashboardProject(request: any, code: string) {
  const dashToken = await loginDashboard(request);
  const detailRes = await request.get(`${BASE}/api/dashboard/project/${code}`, {
    headers: { 'x-dashboard-token': dashToken },
    timeout: 15000,
  });
  expect(detailRes.status()).toBe(200);
  const detailBody = await detailRes.json();
  expect(detailBody.project?.accessToken).toBeTruthy();
  return {
    dashboardToken: dashToken,
    accessToken: detailBody.project.accessToken as string,
  };
}

async function createCustomerProject(request: any) {
  const dashboardToken = await loginDashboard(request);
  const response = await request.post(`${BASE}/api/dashboard/project`, {
    headers: { 'Content-Type': 'application/json', 'x-dashboard-token': dashboardToken },
    data: {
      phone: uniquePhone(),
      assessor: APPROVED_ASSESSOR,
    },
    timeout: 15000,
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  return {
    dashboardToken,
    code: body.project.code as string,
    accessToken: body.project.accessToken as string,
  };
}

test.describe('API Coverage', () => {
  test('API-01: GET /api/project/:code rejects missing customer token', async ({ request }) => {
    const res = await request.get(`${BASE}/api/project/${VALID_CODE}`, {
      timeout: 15000,
    });
    expect(res.status()).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ success: false, error: 'UNAUTHORIZED' });
  });

  test('API-02: GET /api/project/:code rejects a wrong customer token', async ({ request }) => {
    const res = await request.get(`${BASE}/api/project/${VALID_CODE}?token=wrong-token`, {
      timeout: 15000,
    });
    expect(res.status()).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ success: false, error: 'INVALID_TOKEN' });
  });

  test('API-03: GET /api/project/:code succeeds with code + token', async ({ request }) => {
    const { accessToken } = await getDashboardProject(request, VALID_CODE);
    const res = await request.get(`${BASE}/api/project/${VALID_CODE}?token=${encodeURIComponent(accessToken)}`, {
      timeout: 15000,
    });
    expect(res.status()).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, project: { code: VALID_CODE } });
  });

  test('API-04: POST /api/project/:code/save rejects missing customer token', async ({ request }) => {
    const res = await request.post(`${BASE}/api/project/${VALID_CODE}/save`, {
      headers: { 'Content-Type': 'application/json' },
      data: { formData: {} },
      timeout: 15000,
    });
    expect(res.status()).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ success: false, error: 'UNAUTHORIZED' });
  });

  test('API-05: POST /api/project/:code/submit rejects missing customer token', async ({ request }) => {
    const res = await request.post(`${BASE}/api/project/${VALID_CODE}/submit`, {
      headers: { 'Content-Type': 'application/json' },
      data: { formData: {}, source: 'customer', attemptId: 'attempt-no-token' },
      timeout: 15000,
    });
    expect(res.status()).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ success: false, error: 'UNAUTHORIZED' });
  });

  test('API-06: POST /api/project/:code/upload-assets rejects missing customer token', async ({ request }) => {
    const res = await request.post(`${BASE}/api/project/${VALID_CODE}/upload-assets`, {
      multipart: { activeKeys: JSON.stringify([]) },
      timeout: 15000,
    });
    expect(res.status()).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ success: false, error: 'UNAUTHORIZED' });
  });

  test('API-07: POST /api/project/:code/save succeeds with code + token', async ({ request }) => {
    const { accessToken } = await getDashboardProject(request, VALID_CODE);
    const res = await request.post(`${BASE}/api/project/${VALID_CODE}/save?token=${encodeURIComponent(accessToken)}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-project-token': accessToken,
      },
      data: { formData: {}, source: 'customer' },
      timeout: 15000,
    });
    expect(res.status()).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
  });

  test('API-08: POST /api/project/:code/submit succeeds with code + token', async ({ request }) => {
    const { accessToken } = await getDashboardProject(request, VALID_CODE);
    const res = await request.post(`${BASE}/api/project/${VALID_CODE}/submit?token=${encodeURIComponent(accessToken)}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-project-token': accessToken,
      },
      data: { formData: {}, source: 'customer', attemptId: `attempt-${Date.now()}` },
      timeout: 15000,
    });
    expect(res.status()).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
  });

  test('API-09: POST /api/project/:code/upload-assets succeeds with code + token', async ({ request }) => {
    const { accessToken } = await getDashboardProject(request, VALID_CODE);
    const res = await request.post(`${BASE}/api/project/${VALID_CODE}/upload-assets?token=${encodeURIComponent(accessToken)}`, {
      headers: { 'x-project-token': accessToken },
      multipart: {
        activeKeys: JSON.stringify(['dniFront']),
        dniFront: {
          name: 'dni-front.jpg',
          mimeType: 'image/jpeg',
          buffer: Buffer.from('fake-image'),
        },
      },
      timeout: 15000,
    });
    expect(res.status()).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
  });

  test('API-10: GET /api/project/:code/download-zip returns a ZIP file after dashboard login', async ({ request }) => {
    const { code, accessToken } = await createCustomerProject(request);

    const saveRes = await request.post(`${BASE}/api/project/${code}/save?token=${encodeURIComponent(accessToken)}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-project-token': accessToken,
      },
      data: { formData: buildLegacyZipFormData(), source: 'customer' },
      timeout: 15000,
    });
    expect(saveRes.status()).toBe(200);

    const dashToken = await loginDashboard(request);

    const res = await request.get(`${BASE}/api/project/${code}/download-zip`, {
      headers: { 'x-dashboard-token': dashToken },
      timeout: 15000,
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type'] || '').toMatch(/zip|octet-stream/);

    const entries = await parseZipEntries(await res.body());

    expect(entries).toEqual(expect.arrayContaining([
      '1_documentos/DNI_frontal.jpg',
      '1_documentos/DNI_trasera.jpg',
      '1_documentos/IBI.jpg',
      '1_documentos/Factura_luz_1.jpg',
      '1_documentos/DNI_original_pdf.pdf',
      '1_documentos/IBI_original_pdf.pdf',
      '1_documentos/Factura_luz_original_pdf.pdf',
      '2_certificados/Certificado_energetico.pdf',
    ]));
    expect(entries.some((entry: string) => entry.startsWith('2_pdfs_firmados/'))).toBe(false);
    expect(entries.some((entry: string) => entry.startsWith('4_firmas_finales/'))).toBe(false);
    expect(entries.some((entry: string) => entry.startsWith('5_fotos_inmueble/'))).toBe(false);
  });

  test('API-11: upload-assets prunes stale asset keys when the active manifest shrinks', async ({ request }) => {
    const { code, accessToken } = await createCustomerProject(request);
    expect(code).toBeTruthy();

    const firstUpload = await request.post(`${BASE}/api/project/${code}/upload-assets?token=${encodeURIComponent(accessToken)}`, {
      headers: { 'x-project-token': accessToken },
      multipart: {
        activeKeys: JSON.stringify(['dniFront']),
        dniFront: {
          name: 'dni-front.jpg',
          mimeType: 'image/jpeg',
          buffer: Buffer.from('fake-image'),
        },
      },
      timeout: 15000,
    });
    expect(firstUpload.status()).toBe(200);

    const firstProject = await request.get(`${BASE}/api/project/${code}?token=${encodeURIComponent(accessToken)}`, { timeout: 15000 });
    const firstBody = await firstProject.json();
    expect(firstBody.project.assetFiles.dniFront).toContain(`/uploads/assets/${code}/dniFront`);

    const secondUpload = await request.post(`${BASE}/api/project/${code}/upload-assets?token=${encodeURIComponent(accessToken)}`, {
      headers: { 'x-project-token': accessToken },
      multipart: {
        activeKeys: JSON.stringify([]),
      },
      timeout: 15000,
    });
    expect(secondUpload.status()).toBe(200);

    const secondProject = await request.get(`${BASE}/api/project/${code}?token=${encodeURIComponent(accessToken)}`, { timeout: 15000 });
    const secondBody = await secondProject.json();
    expect(secondBody.project.assetFiles.dniFront).toBeUndefined();
  });

  test('API-12: reset endpoints recreate missing seeded follow-up fixtures', async ({ request }) => {
    const dashToken = await loginDashboard(request);

    for (const code of ['ELT20250004', 'ELT20250005']) {
      await request.delete(`${BASE}/api/dashboard/project/${code}`, {
        headers: { 'x-dashboard-token': dashToken },
        timeout: 15000,
      });
    }

    const resetRes = await request.post(`${BASE}/api/test/restore-base-flow/ELT20250005`, {
      timeout: 15000,
    });
    expect(resetRes.status()).toBe(200);

    const projectTokenRes = await request.get(`${BASE}/api/dashboard/project/ELT20250005`, {
      headers: { 'x-dashboard-token': dashToken },
      timeout: 15000,
    });
    expect(projectTokenRes.status()).toBe(200);
    const projectTokenBody = await projectTokenRes.json();
    const projectToken = projectTokenBody.project.accessToken as string;

    const projectRes = await request.get(`${BASE}/api/project/ELT20250005?token=${encodeURIComponent(projectToken)}`, {
      timeout: 15000,
    });
    expect(projectRes.status()).toBe(200);
    const projectBody = await projectRes.json();
    expect(projectBody.project.code).toBe('ELT20250005');
  });

  test('API-13: submit is idempotent when the first response times out client-side', async ({ request }) => {
    await request.post(`${BASE}/api/test/restore-base-flow/ELT20250005`, { timeout: 15000 });

    const { accessToken } = await getDashboardProject(request, 'ELT20250005');

    const beforeRes = await request.get(`${BASE}/api/project/ELT20250005?token=${encodeURIComponent(accessToken)}`, { timeout: 15000 });
    const beforeBody = await beforeRes.json();
    const beforeSubmissionCount = beforeBody.project.submissionCount as number;
    const formData = beforeBody.project.formData;
    const attemptId = `attempt-${Date.now()}`;

    await expect(request.post(`${BASE}/api/project/ELT20250005/submit?token=${encodeURIComponent(accessToken)}`, {
      headers: { 'x-test-submit-delay-ms': '250', 'x-project-token': accessToken },
      data: { formData, source: 'customer', attemptId },
      timeout: 50,
    })).rejects.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 350));

    const retryRes = await request.post(`${BASE}/api/project/ELT20250005/submit?token=${encodeURIComponent(accessToken)}`, {
      headers: { 'x-project-token': accessToken },
      data: { formData, source: 'customer', attemptId },
      timeout: 15000,
    });
    expect(retryRes.status()).toBe(200);
    const retryBody = await retryRes.json();
    expect(retryBody.success).toBe(true);
    expect(retryBody.submissionId).toBeTruthy();

    const afterRes = await request.get(`${BASE}/api/project/ELT20250005?token=${encodeURIComponent(accessToken)}`, { timeout: 15000 });
    const afterBody = await afterRes.json();
    expect(afterBody.project.submissionCount).toBe(beforeSubmissionCount + 1);
  });

  test('API-07: dashboard create returns the secure customer link and reuses the existing project for duplicate phones', async ({ request }) => {
    const dashToken = await loginDashboard(request);
    const phone = uniquePhone();

    const firstCreate = await request.post(`${BASE}/api/dashboard/project`, {
      headers: { 'Content-Type': 'application/json', 'x-dashboard-token': dashToken },
      data: {
        phone,
        assessor: APPROVED_ASSESSOR,
        productType: 'solar',
        email: 'staff-create@example.com',
      },
      timeout: 15000,
    });
    expect(firstCreate.status()).toBe(200);
    const firstBody = await firstCreate.json();
    expect(firstBody.existing).toBe(false);
    expect(firstBody.customerLink).toMatch(new RegExp(`^/\\?code=${firstBody.project.code}&token=`));

    const duplicateCreate = await request.post(`${BASE}/api/dashboard/project`, {
      headers: { 'Content-Type': 'application/json', 'x-dashboard-token': dashToken },
      data: {
        phone,
        assessor: APPROVED_ASSESSOR,
        productType: 'solar',
      },
      timeout: 15000,
    });
    expect(duplicateCreate.status()).toBe(200);
    const duplicateBody = await duplicateCreate.json();
    expect(duplicateBody.existing).toBe(true);
    expect(duplicateBody.project.code).toBe(firstBody.project.code);
    expect(duplicateBody.customerLink).toBe(firstBody.customerLink);
  });

  test('API-08: dashboard create rejects assessors outside the approved dropdown allowlist', async ({ request }) => {
    const dashToken = await loginDashboard(request);
    const res = await request.post(`${BASE}/api/dashboard/project`, {
      headers: { 'Content-Type': 'application/json', 'x-dashboard-token': dashToken },
      data: {
        phone: uniquePhone(),
        assessor: 'QA Bot',
      },
      timeout: 15000,
    });
    expect(res.status()).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      message: 'Selecciona un asesor de la lista aprobada.',
    });
  });

  test('API-09: dashboard resend rotates accessToken and returns the current secure customer link', async ({ request }) => {
    const dashToken = await loginDashboard(request);
    const createRes = await request.post(`${BASE}/api/dashboard/project`, {
      headers: { 'Content-Type': 'application/json', 'x-dashboard-token': dashToken },
      data: {
        phone: uniquePhone(),
        assessor: APPROVED_ASSESSOR,
      },
      timeout: 15000,
    });
    expect(createRes.status()).toBe(200);
    const createBody = await createRes.json();

    const resendRes = await request.post(`${BASE}/api/dashboard/project/${createBody.project.code}/resend`, {
      headers: { 'x-dashboard-token': dashToken },
      timeout: 15000,
    });
    expect(resendRes.status()).toBe(200);
    const resendBody = await resendRes.json();
    expect(resendBody.project.code).toBe(createBody.project.code);
    expect(resendBody.project.accessToken).not.toBe(createBody.project.accessToken);
    expect(resendBody.customerLink).toBe(`/?code=${createBody.project.code}&token=${resendBody.project.accessToken}`);
  });
});
