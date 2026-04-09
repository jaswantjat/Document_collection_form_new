const DEFAULT_TEST_CODES = ['ELT20250001', 'ELT20250002', 'ELT20250003', 'ELT20250004', 'ELT20250005'];
const RESETTABLE_TEST_CODES = ['ELT20250004', 'ELT20250005'];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildBaseFlowFormData() {
  return {
    dni: { front: { photo: 'data:image/jpeg;base64,/9j/TEST_FRONT', extraction: null }, back: { photo: 'data:image/jpeg;base64,/9j/TEST_BACK', extraction: null }, originalPdfs: [], issue: null },
    ibi: { photo: 'data:image/jpeg;base64,/9j/TEST_IBI', pages: [], originalPdfs: [], extraction: null, issue: null },
    electricityBill: { pages: [{ photo: 'data:image/jpeg;base64,/9j/TEST_BILL', extraction: null }], originalPdfs: [], issue: null },
    contract: null,
    location: 'other',
    representation: { location: 'other', isCompany: false, companyName: '', companyNIF: '', companyAddress: '', companyMunicipality: '', companyPostalCode: '', postalCode: '', ivaPropertyAddress: '', ivaCertificateSignature: null, representacioSignature: null, generalitatRole: 'titular', generalitatSignature: null, poderRepresentacioSignature: null, ivaCertificateEsSignature: null, renderedDocuments: {} },
    signatures: {},
    energyCertificate: {
      status: 'not-started',
      housing: { cadastralReference: '', habitableAreaM2: '', floorCount: '', averageFloorHeight: null, bedroomCount: '', doorsByOrientation: { north: '', east: '', south: '', west: '' }, windowsByOrientation: { north: '', east: '', south: '', west: '' }, windowFrameMaterial: null, doorMaterial: '', windowGlassType: null, hasShutters: null, shutterWindowCount: '' },
      thermal: { thermalInstallationType: null, boilerFuelType: null, equipmentDetails: '', hasAirConditioning: null, airConditioningType: null, airConditioningDetails: '', heatingEmitterType: null, radiatorMaterial: null },
      additional: { soldProduct: null, isExistingCustomer: null, hasSolarPanels: null, solarPanelDetails: '' },
      customerSignature: null, renderedDocument: null, completedAt: null, skippedAt: null,
    },
  };
}

function getDefaultProjects({ isProduction, seedSampleData }) {
  if (isProduction && seedSampleData !== 'true') {
    return {};
  }

  return {
    ELT20250001: {
      code: 'ELT20250001',
      customerName: 'María García López',
      phone: '+34612345678',
      email: 'maria.garcia@email.com',
      productType: 'solar',
      assessor: 'Carlos Ruiz',
      assessorId: 'ASR001',
      formData: null,
      submissions: [],
      lastActivity: null,
      createdAt: '2025-03-15T10:00:00Z',
    },
    ELT20250002: {
      code: 'ELT20250002',
      customerName: 'Juan Pérez Martínez',
      phone: '+34623456789',
      email: 'juan.perez@email.com',
      productType: 'aerothermal',
      assessor: 'Ana López',
      assessorId: 'ASR002',
      formData: null,
      submissions: [],
      lastActivity: null,
      createdAt: '2025-03-18T14:30:00Z',
    },
    ELT20250003: {
      code: 'ELT20250003',
      customerName: 'Laura Fernández Ruiz',
      phone: '+34655443322',
      email: 'laura.fernandez@email.com',
      productType: 'solar',
      assessor: 'Pedro Sánchez',
      assessorId: 'ASR003',
      formData: null,
      submissions: [],
      lastActivity: null,
      createdAt: '2025-03-20T09:15:00Z',
    },
    ELT20250004: {
      code: 'ELT20250004',
      customerName: 'Test EC Usuario',
      phone: '+34666000004',
      email: 'test.ec@eltex.es',
      productType: 'solar',
      assessor: 'Test Assessor',
      assessorId: 'ASR004',
      accessToken: 'ec-test-token-4444',
      formData: null,
      submissions: [],
      lastActivity: null,
      createdAt: '2026-04-02T10:00:00Z',
    },
    ELT20250005: {
      code: 'ELT20250005',
      customerName: 'Test EC Flow Usuario',
      phone: '+34666000005',
      email: 'test.ec.flow@eltex.es',
      productType: 'solar',
      assessor: 'Test Assessor',
      assessorId: 'ASR005',
      accessToken: 'ec-flow-token-5555',
      formData: null,
      submissions: [],
      lastActivity: null,
      createdAt: '2026-04-02T10:00:00Z',
    },
  };
}

function ensureDefaultTestProjects(database, { isProduction, seedSampleData }) {
  if (isProduction) return false;

  const defaults = getDefaultProjects({ isProduction, seedSampleData });
  database.projects = database.projects || {};

  let changed = false;
  for (const code of DEFAULT_TEST_CODES) {
    if (database.projects[code]) continue;
    database.projects[code] = clone(defaults[code]);
    changed = true;
  }
  return changed;
}

function ensureResettableTestProject(database, code, options) {
  if (!RESETTABLE_TEST_CODES.includes(code)) return null;
  ensureDefaultTestProjects(database, options);
  return database.projects?.[code] || null;
}

module.exports = {
  DEFAULT_TEST_CODES,
  RESETTABLE_TEST_CODES,
  buildBaseFlowFormData,
  ensureDefaultTestProjects,
  ensureResettableTestProject,
  getDefaultProjects,
};
