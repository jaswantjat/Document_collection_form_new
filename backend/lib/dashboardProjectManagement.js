const { isApprovedAssessor } = require('./approvedAssessors');

const VALID_PRODUCT_TYPES = new Set(['solar', 'aerothermal', 'solar-aerothermal']);

function buildCustomerLink(project) {
  const params = new URLSearchParams({
    code: project.code,
  });
  return `/?${params.toString()}`;
}

function findProjectByNormalizedPhone(projects, normalizedPhone, normalizePhone) {
  return Object.values(projects).find((project) => normalizePhone(project.phone) === normalizedPhone) || null;
}

function normalizeDashboardCreateInput(body, normalizePhone) {
  const phone = typeof body?.phone === 'string' ? body.phone : '';
  const normalizedPhone = normalizePhone(phone);
  const assessor = typeof body?.assessor === 'string' ? body.assessor : '';
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const customerName = typeof body?.customerName === 'string' ? body.customerName.trim() : '';
  const requestedProductType = typeof body?.productType === 'string' ? body.productType : '';
  const productType = VALID_PRODUCT_TYPES.has(requestedProductType) ? requestedProductType : 'solar';

  return {
    normalizedPhone,
    assessor,
    email,
    customerName,
    productType,
  };
}

function validateDashboardCreateInput(input) {
  if (!input.normalizedPhone) {
    return 'El número de teléfono es obligatorio.';
  }

  if (!isApprovedAssessor(input.assessor)) {
    return 'Selecciona un asesor de la lista aprobada.';
  }

  return null;
}

function createDashboardProjectRecord(input, generateProjectCode, createAccessToken, nowIso) {
  return {
    code: generateProjectCode(),
    accessToken: createAccessToken(),
    customerName: input.customerName || 'Cliente nuevo',
    phone: input.normalizedPhone,
    email: input.email,
    productType: input.productType,
    assessor: input.assessor,
    assessorId: input.assessor,
    formData: null,
    submissions: [],
    lastActivity: null,
    createdAt: nowIso,
  };
}

function serializeDashboardProjectAction(project, serializeProject) {
  return {
    project: serializeProject(project, { includeAccessToken: true }),
    customerLink: buildCustomerLink(project),
  };
}

module.exports = {
  buildCustomerLink,
  createDashboardProjectRecord,
  findProjectByNormalizedPhone,
  normalizeDashboardCreateInput,
  serializeDashboardProjectAction,
  validateDashboardCreateInput,
};
