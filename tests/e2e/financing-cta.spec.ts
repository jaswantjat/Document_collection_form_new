import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const CONFIGURED_BASE_URL = process.env.E2E_FINANCING_CONFIGURED_BASE_URL ?? 'http://localhost:5004';
const HIDDEN_BASE_URL = process.env.E2E_FINANCING_HIDDEN_BASE_URL ?? 'http://localhost:5005';
const FINANCING_TARGET = process.env.E2E_FINANCING_URL ?? `${API_BASE}/health`;

function uniquePhone() {
  const suffix = Date.now().toString().slice(-8);
  return `+346${suffix}`;
}

function makePhoto(id: string) {
  return {
    id,
    preview: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',
    timestamp: Date.now(),
    sizeBytes: 128,
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

async function createReviewReadyProject(request: APIRequestContext) {
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

  return projectCode;
}

async function openReview(page: Page, baseUrl: string, projectCode: string) {
  await page.goto(`${baseUrl}/?code=${projectCode}`, { waitUntil: 'networkidle' });
  await expect(page.locator('h1, h2').first()).toContainText('Confirma tu documentación');
}

test.describe('Financing CTA', () => {
  test('shows the financing CTA when configured and links to a new tab target', async ({ page, request }) => {
    const projectCode = await createReviewReadyProject(request);

    await openReview(page, CONFIGURED_BASE_URL, projectCode);

    const card = page.getByTestId('financing-cta-card');
    const link = page.getByTestId('financing-cta-link');

    await expect(card).toBeVisible();
    await expect(link).toHaveAttribute('href', FINANCING_TARGET);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });

  test('hides the financing CTA when the URL is not configured', async ({ page, request }) => {
    const projectCode = await createReviewReadyProject(request);

    await openReview(page, HIDDEN_BASE_URL, projectCode);

    await expect(page.getByTestId('financing-cta-card')).toHaveCount(0);
    await expect(page.getByText('Ver opciones de financiación')).toHaveCount(0);
  });
});
