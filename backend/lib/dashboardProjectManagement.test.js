const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCustomerLink,
  createDashboardProjectRecord,
  findProjectByNormalizedPhone,
  normalizeDashboardCreateInput,
  serializeDashboardProjectAction,
  validateDashboardCreateInput,
} = require('./dashboardProjectManagement');
const { approvedAssessors } = require('./approvedAssessors');

function normalizePhone(phone) {
  return phone.replace(/[\s-]/g, '');
}

test('normalizeDashboardCreateInput normalizes the phone and keeps approved assessor values verbatim', () => {
  const input = normalizeDashboardCreateInput({
    phone: '+34 612 34 56 78',
    assessor: approvedAssessors[0],
    email: '  test@example.com ',
    customerName: '  Cliente  ',
    productType: 'solar-aerothermal',
  }, normalizePhone);

  assert.equal(input.normalizedPhone, '+34612345678');
  assert.equal(input.assessor, approvedAssessors[0]);
  assert.equal(input.email, 'test@example.com');
  assert.equal(input.customerName, 'Cliente');
  assert.equal(input.productType, 'solar-aerothermal');
});

test('validateDashboardCreateInput rejects phones and assessors outside the dashboard contract', () => {
  assert.equal(
    validateDashboardCreateInput({ normalizedPhone: '', assessor: approvedAssessors[0] }),
    'El número de teléfono es obligatorio.',
  );
  assert.equal(
    validateDashboardCreateInput({ normalizedPhone: '+34612345678', assessor: 'QA Bot' }),
    'Selecciona un asesor de la lista aprobada.',
  );
});

test('findProjectByNormalizedPhone and createDashboardProjectRecord preserve the one-project-per-phone invariant', () => {
  const existing = {
    ELT20260001: {
      code: 'ELT20260001',
      phone: '+34612345678',
      assessor: approvedAssessors[0],
    },
  };

  assert.deepEqual(findProjectByNormalizedPhone(existing, '+34612345678', normalizePhone), existing.ELT20260001);

  const project = createDashboardProjectRecord({
    normalizedPhone: '+34600000000',
    assessor: approvedAssessors[1],
    email: '',
    customerName: '',
    productType: 'solar',
  }, () => 'ELT20260002', () => 'token-123', '2026-04-15T15:00:00.000Z');

  assert.equal(project.code, 'ELT20260002');
  assert.equal(project.accessToken, 'token-123');
  assert.equal(project.phone, '+34600000000');
  assert.equal(project.assessorId, approvedAssessors[1]);
});

test('serializeDashboardProjectAction returns the secure customer link expected by the dashboard flow', () => {
  const project = {
    code: 'ELT20260003',
    accessToken: 'rotate-token-456',
    customerName: 'Cliente',
  };

  assert.equal(
    buildCustomerLink(project),
    '/?code=ELT20260003&token=rotate-token-456',
  );

  const serialized = serializeDashboardProjectAction(project, (value, options) => ({
    code: value.code,
    accessToken: options.includeAccessToken ? value.accessToken : undefined,
  }));

  assert.deepEqual(serialized, {
    project: {
      code: 'ELT20260003',
      accessToken: 'rotate-token-456',
    },
    customerLink: '/?code=ELT20260003&token=rotate-token-456',
  });
});
