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

test('buildExpectedDocKeys removes DNI back for single-sided identity docs and skipped energy certificates', () => {
  const keys = buildExpectedDocKeys(
    {
      dni: {
        front: {
          extraction: {
            identityDocumentKind: 'passport',
            notes: '',
          },
        },
      },
      representation: { location: 'madrid' },
      energyCertificate: { status: 'skipped' },
    },
    ['dni_front', 'dni_back', 'ibi', 'electricity_bill', 'energy_certificate'],
    ['dni_front']
  );

  assert.deepEqual(keys, [
    'dni_front',
    'ibi',
    'electricity_bill',
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
  assert.equal(payload.links.form, 'https://documentos.eltex.es/?code=ELT20260001');
  assert.equal(payload.submitted_by.name, 'Jaswant Jat');
  assert.equal(payload.project.location_label, 'Cataluña');
  assert.equal(payload.project.holder_type_label, 'Empresa');
  assert.equal(payload.customer.name, 'Jaswant Jat');
  assert.equal(payload.customer.dni_number, '12345678A');
  assert.equal(payload.additional_documents.count, 1);
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
    'Firmas de representación',
    'Firma final del cliente',
    'Firma final comercial',
  ]);
  assert.equal(payload.statuses.identity, 'completa');
  assert.equal(payload.statuses.representation_documents, 'pendientes (0/3)');
  assert.equal(payload.statuses.representation_signatures, 'pendientes (0/3)');
  assert.equal(payload.statuses.final_signatures, 'pendientes (0/2)');
  assert.match(payload.teams_message, /Nuevo formulario enviado/);
  assert.match(payload.teams_message, /Asesor asignado: Luciano/);
  assert.match(payload.teams_message, /Rellenado por: Jaswant Jat \(Cliente\)/);
  assert.match(payload.teams_message, /Enlace del formulario: https:\/\/documentos\.eltex\.es\/\?code=ELT20260001/);
  assert.match(payload.teams_message, /Firmas de representación: pendientes \(0\/3\)/);
  assert.match(payload.teams_message, /Firmas finales: pendientes \(0\/2\)/);
  assert.match(payload.teams_message, /Pendiente \(10\):/);
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
        ivaCertificateEsSignature: 'data:image/png;base64,iva',
        poderRepresentacioSignature: 'data:image/png;base64,poder',
      },
      signatures: {
        customerSignature: 'data:image/png;base64,customer',
        repSignature: 'data:image/png;base64,rep',
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
  assert.equal(payload.links.form, 'https://documentos.eltex.es/?code=ELT20260002');
  assert.deepEqual(payload.documents.missing_keys, []);
  assert.deepEqual(payload.documents.pending_labels, ['Nada pendiente']);
  assert.equal(payload.documents.progress_label, '7/7');
  assert.equal(payload.sections.representacion, 'completa');
  assert.equal(payload.statuses.representation_signatures, 'completas (2/2)');
  assert.equal(payload.statuses.final_signatures, 'completas (2/2)');
  assert.match(payload.teams_message, /Formulario actualizado \(3 envíos\)/);
  assert.match(payload.teams_message, /Enlace del formulario: https:\/\/documentos\.eltex\.es\/\?code=ELT20260002/);
  assert.match(payload.teams_message, /Pendiente \(1\):/);
  assert.match(payload.teams_message, /- Nada pendiente/);
});

test('buildFormNotificationPayload handles passport uploads, deferred signatures, and skipped energy correctly', () => {
  const payload = buildFormNotificationPayload({
    eventType: 'form_updated',
    project: {
      code: 'ELT20260003',
      customerName: 'Cliente extranjero',
      phone: '+31612345678',
      email: 'foreign@example.com',
      productType: 'solar',
      assessor: 'Marta',
      submissions: [{ id: 'sub-1' }, { id: 'sub-2' }],
    },
    formData: {
      dni: {
        front: {
          extraction: {
            identityDocumentKind: 'passport',
            notes: '',
          },
        },
      },
      representation: {
        location: 'madrid',
        holderTypeConfirmed: true,
        isCompany: false,
        signatureDeferred: true,
      },
      signatures: {
        customerSignature: 'data:image/png;base64,customer',
        repSignature: null,
      },
      energyCertificate: {
        status: 'skipped',
      },
    },
    snapshot: {
      fullName: 'Geert Elschot',
      firstName: 'Geert',
      lastName: 'Elschot',
    },
    docsUploaded: ['dni_front', 'ibi', 'electricity_bill', 'spain_iva'],
    docsRequired: ['dni_front', 'dni_back', 'ibi', 'electricity_bill', 'energy_certificate'],
    locale: 'es',
    source: 'dashboard',
    submittedAt: '2026-04-17T10:00:00.000Z',
  });

  assert.deepEqual(payload.documents.missing_keys, ['spain_poder']);
  assert.equal(payload.documents.progress_label, '4/5');
  assert.equal(payload.statuses.identity, 'completa (pasaporte)');
  assert.equal(payload.statuses.energy_certificate, 'aplazado');
  assert.equal(payload.statuses.representation_documents, 'parciales (1/2)');
  assert.equal(payload.statuses.representation_signatures, 'aplazadas (0/2)');
  assert.equal(payload.statuses.final_signatures, 'parciales (1/2)');
  assert.deepEqual(payload.documents.pending_labels, [
    'Poder de representación',
    'Firmas de representación aplazadas',
    'Firma final comercial',
  ]);
  assert.doesNotMatch(payload.teams_message, /DNI trasera/);
  assert.doesNotMatch(payload.teams_message, /Certificado energético\n- Certificado energético/);
  assert.match(payload.teams_message, /Rellenado por: Informatica/);
  assert.match(payload.teams_message, /Certificado energético: aplazado/);
});
