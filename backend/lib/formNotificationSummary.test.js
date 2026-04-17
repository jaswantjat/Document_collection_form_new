const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildExpectedDocKeys,
  buildFormNotificationPayload,
} = require('./formNotificationSummary');

test('buildExpectedDocKeys adds location-specific representation documents', () => {
  const cataloniaKeys = buildExpectedDocKeys(
    { representation: { location: 'cataluna' } },
    ['dni_front', 'dni_back', 'ibi', 'electricity_bill', 'energy_certificate']
  );
  const madridKeys = buildExpectedDocKeys(
    { representation: { location: 'madrid' } },
    ['dni_front', 'dni_back', 'ibi', 'electricity_bill', 'energy_certificate']
  );

  assert.deepEqual(cataloniaKeys, [
    'dni_front',
    'dni_back',
    'ibi',
    'electricity_bill',
    'energy_certificate',
    'cataluna_iva',
    'cataluna_generalitat',
    'cataluna_representacio',
  ]);
  assert.deepEqual(madridKeys, [
    'dni_front',
    'dni_back',
    'ibi',
    'electricity_bill',
    'energy_certificate',
    'spain_iva',
    'spain_poder',
  ]);
});

test('buildFormNotificationPayload summarizes a new submission in Spanish with pending items', () => {
  const payload = buildFormNotificationPayload({
    eventType: 'form_submitted',
    project: {
      code: 'ELT20260001',
      customerName: 'Cliente pendiente',
      phone: '+34612345678',
      email: 'cliente@example.com',
      productType: 'solar-aerothermal',
      assessor: 'Luciano',
      submissions: [{ id: 'sub-1' }],
    },
    formData: {
      representation: {
        location: 'cataluna',
        holderTypeConfirmed: true,
        isCompany: true,
      },
      energyCertificate: {
        status: 'in-progress',
      },
      additionalBankDocuments: [
        { type: 'other', customLabel: 'Certificado bancario adicional' },
      ],
    },
    snapshot: {
      fullName: 'Jaswant Jat',
      firstName: 'Jaswant',
      lastName: 'Jat',
      dniNumber: '12345678A',
      address: 'Calle Mayor 1',
      municipality: 'Barcelona',
      province: 'Barcelona',
      postalCode: '08001',
    },
    docsUploaded: ['dni_front', 'dni_back', 'ibi'],
    docsRequired: ['dni_front', 'dni_back', 'ibi', 'electricity_bill', 'energy_certificate'],
    locale: 'es',
    source: 'customer',
    submittedAt: '2026-04-17T08:15:00.000Z',
  });

  assert.equal(payload.event_label, 'Nuevo formulario enviado');
  assert.equal(payload.is_first_submission, true);
  assert.equal(payload.source_label, 'Cliente');
  assert.equal(payload.project.location_label, 'Cataluña');
  assert.equal(payload.project.holder_type_label, 'Empresa');
  assert.equal(payload.customer.name, 'Jaswant Jat');
  assert.equal(payload.customer.dni_number, '12345678A');
  assert.equal(payload.additional_documents.count, 1);
  assert.deepEqual(payload.documents.uploaded_labels, [
    'DNI frontal',
    'DNI trasera',
    'IBI / Escritura',
  ]);
  assert.deepEqual(payload.documents.missing_keys, [
    'electricity_bill',
    'energy_certificate',
    'cataluna_iva',
    'cataluna_generalitat',
    'cataluna_representacio',
  ]);
  assert.deepEqual(payload.documents.pending_labels, [
    'Factura de luz',
    'Certificado energético',
    'IVA Cataluña',
    'Generalitat Cataluña',
    'Representación Cataluña',
    'Nombre de la empresa',
    'NIF de la empresa',
  ]);
  assert.match(payload.teams_message, /Nuevo formulario enviado/);
  assert.match(payload.teams_message, /Titular del contrato: Empresa/);
  assert.match(payload.teams_message, /Pendiente \(7\):/);
});

test('buildFormNotificationPayload marks updates with no pending items when the file set is complete', () => {
  const payload = buildFormNotificationPayload({
    eventType: 'form_updated',
    project: {
      code: 'ELT20260002',
      customerName: 'Cliente final',
      phone: '+34600000000',
      email: '',
      productType: 'solar',
      assessor: 'Pau',
      submissions: [{ id: 'sub-1' }, { id: 'sub-2' }, { id: 'sub-3' }],
    },
    formData: {
      representation: {
        location: 'madrid',
        holderTypeConfirmed: true,
        isCompany: false,
      },
      energyCertificate: {
        status: 'completed',
      },
    },
    snapshot: {
      fullName: 'Ana Lopez',
      firstName: 'Ana',
      lastName: 'Lopez',
      address: 'Gran Via 10',
      municipality: 'Madrid',
      province: 'Madrid',
      postalCode: '28013',
    },
    docsUploaded: [
      'dni_front',
      'dni_back',
      'ibi',
      'electricity_bill',
      'energy_certificate',
      'spain_iva',
      'spain_poder',
    ],
    docsRequired: ['dni_front', 'dni_back', 'ibi', 'electricity_bill', 'energy_certificate'],
    locale: 'es',
    source: 'assessor',
    submittedAt: '2026-04-17T09:00:00.000Z',
  });

  assert.equal(payload.event_label, 'Formulario actualizado');
  assert.equal(payload.is_first_submission, false);
  assert.equal(payload.submission_count, 3);
  assert.equal(payload.source_label, 'Asesor');
  assert.equal(payload.project.location_label, 'Madrid');
  assert.equal(payload.project.holder_type_label, 'Particular');
  assert.deepEqual(payload.documents.missing_keys, []);
  assert.deepEqual(payload.documents.pending_labels, ['Nada pendiente']);
  assert.equal(payload.documents.progress_label, '7/7');
  assert.equal(payload.sections.representacion, 'completa');
  assert.match(payload.teams_message, /Formulario actualizado/);
  assert.match(payload.teams_message, /Pendiente \(1\):/);
  assert.match(payload.teams_message, /- Nada pendiente/);
});
