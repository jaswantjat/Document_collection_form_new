const DOC_LABELS = {
  dni_front: 'DNI frontal',
  dni_back: 'DNI trasera',
  ibi: 'IBI / Escritura',
  electricity_bill: 'Factura de luz',
  energy_certificate: 'Certificado energético',
  cataluna_iva: 'IVA Cataluña',
  cataluna_generalitat: 'Generalitat Cataluña',
  cataluna_representacio: 'Representación Cataluña',
  spain_iva: 'IVA España',
  spain_poder: 'Poder de representación',
};

const PRODUCT_LABELS = {
  solar: 'Solar',
  aerothermal: 'Aerotermia',
  'solar-aerothermal': 'Solar + Aerotermia',
};

const LOCATION_LABELS = {
  cataluna: 'Cataluña',
  madrid: 'Madrid',
  valencia: 'Valencia',
  other: 'Otra ubicación',
};

const SOURCE_LABELS = {
  customer: 'Cliente',
  assessor: 'Asesor',
  dashboard: 'Informatica',
  system: 'Sistema',
};

const EVENT_LABELS = {
  form_submitted: 'Nuevo formulario enviado',
  form_updated: 'Formulario actualizado',
};

const REPRESENTATION_DOC_KEYS = new Set([
  'cataluna_iva',
  'cataluna_generalitat',
  'cataluna_representacio',
  'spain_iva',
  'spain_poder',
]);

function uniq(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function formatWhen(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function labelForDocKey(key) {
  return DOC_LABELS[key] || key;
}

function getLocationKey(formData, snapshot) {
  return formData?.location ?? formData?.representation?.location ?? snapshot?.location ?? null;
}

function getLocationLabel(formData, snapshot) {
  const location = getLocationKey(formData, snapshot);
  if (location && LOCATION_LABELS[location]) return LOCATION_LABELS[location];
  if (snapshot?.province) return snapshot.province;
  return 'Pendiente';
}

function getHolderTypeLabel(formData) {
  const representation = formData?.representation;
  if (!representation?.holderTypeConfirmed) return 'Pendiente de seleccionar';
  return representation.isCompany ? 'Empresa' : 'Particular';
}

function getSourceLabel(source) {
  return SOURCE_LABELS[source] || 'Sistema';
}

function getProductLabel(productType) {
  return PRODUCT_LABELS[productType] || productType || 'Sin definir';
}

function buildExpectedDocKeys(formData, docsRequired) {
  const expected = [...(docsRequired || [])];
  const location = getLocationKey(formData, null);
  if (location === 'cataluna') {
    expected.push('cataluna_iva', 'cataluna_generalitat', 'cataluna_representacio');
  } else if (location && location !== 'other') {
    expected.push('spain_iva', 'spain_poder');
  }
  return uniq(expected);
}

function getAdditionalDocumentLabels(formData) {
  const entries = Array.isArray(formData?.additionalBankDocuments)
    ? formData.additionalBankDocuments
    : [];
  return entries.map((entry) => {
    if (entry?.type === 'other' && typeof entry?.customLabel === 'string' && entry.customLabel.trim()) {
      return entry.customLabel.trim();
    }
    return 'Documento adicional';
  });
}

function buildPendingItems(formData, missingDocLabels) {
  const pending = [...missingDocLabels];
  const representation = formData?.representation || {};
  if (!getLocationKey(formData, null)) pending.push('Ubicación / provincia');
  if (!representation.holderTypeConfirmed) pending.push('Titular del contrato (persona o empresa)');
  if (representation.isCompany) {
    if (!representation.companyName?.trim()) pending.push('Nombre de la empresa');
    if (!representation.companyNIF?.trim()) pending.push('NIF de la empresa');
  }
  return uniq(pending);
}

function buildSectionSummary(formData, uploadedDocKeys, expectedDocKeys) {
  const uploaded = new Set(uploadedDocKeys);
  const expected = new Set(expectedDocKeys);
  const representationExpected = expectedDocKeys.filter((key) => REPRESENTATION_DOC_KEYS.has(key));

  return {
    identidad: uploaded.has('dni_front') && uploaded.has('dni_back') ? 'completa' : 'pendiente',
    inmueble:
      uploaded.has('ibi') && uploaded.has('electricity_bill') ? 'completa' : 'pendiente',
    representacion:
      representationExpected.length === 0 || representationExpected.every((key) => uploaded.has(key))
        ? 'completa'
        : 'pendiente',
    certificado_energetico:
      formData?.energyCertificate?.status === 'completed' ? 'completo' : 'pendiente',
    documentos_adicionales:
      getAdditionalDocumentLabels(formData).length > 0 ? 'presentes' : 'sin_aportar',
  };
}

function buildProjectDetails(project, formData, snapshot) {
  const representation = formData?.representation || {};

  return {
    product_type: project.productType || null,
    product_label: getProductLabel(project.productType),
    assessor: project.assessor || null,
    location_key: getLocationKey(formData, snapshot),
    location_label: getLocationLabel(formData, snapshot),
    holder_type_label: getHolderTypeLabel(formData),
    company_name: representation.companyName?.trim() || null,
    company_nif: representation.companyNIF?.trim() || null,
  };
}

function buildCustomerDetails(project, snapshot) {
  return {
    name: snapshot?.fullName || project.customerName || 'Cliente sin identificar',
    first_name: snapshot?.firstName || null,
    last_name: snapshot?.lastName || null,
    phone: project.phone || '',
    email: project.email || '',
    dni_number: snapshot?.dniNumber || null,
    address: snapshot?.address || null,
    municipality: snapshot?.municipality || null,
    province: snapshot?.province || null,
    postal_code: snapshot?.postalCode || null,
  };
}

function buildMessageLines(payload) {
  const lines = [
    payload.event_label,
    `Expediente: ${payload.order_id}`,
    `Enviado por: ${payload.source_label}`,
    `Cliente: ${payload.customer.name}`,
    `Teléfono: ${payload.customer.phone || 'Pendiente'}`,
    `Email: ${payload.customer.email || 'Pendiente'}`,
    `DNI/NIF: ${payload.customer.dni_number || payload.project.company_nif || 'Pendiente'}`,
    `Asesor: ${payload.project.assessor || 'Pendiente'}`,
    `Producto: ${payload.project.product_label}`,
    `Ubicación: ${payload.project.location_label}`,
    `Titular del contrato: ${payload.project.holder_type_label}`,
    `Dirección: ${payload.customer.address || 'Pendiente'}`,
    `Fecha: ${payload.submitted_at_label || 'Pendiente'}`,
    '',
    `Completado (${payload.documents.uploaded_labels.length}):`,
    ...payload.documents.uploaded_labels.map((item) => `- ${item}`),
    '',
    `Pendiente (${payload.documents.pending_labels.length}):`,
    ...payload.documents.pending_labels.map((item) => `- ${item}`),
    '',
    'Resumen:',
    `- Progreso documental: ${payload.documents.progress_label}`,
    `- Certificado energético: ${payload.sections.certificado_energetico}`,
    `- Documentos adicionales: ${payload.additional_documents.count}`,
  ];

  return lines.filter((line, index, all) => {
    if (line !== '') return true;
    return all[index - 1] !== '';
  });
}

function buildTeamsNotificationMessage(payload) {
  return buildMessageLines(payload).join('\n');
}

function buildFormNotificationPayload({
  eventType,
  project,
  formData,
  snapshot,
  docsUploaded,
  docsRequired,
  locale,
  source,
  submittedAt,
}) {
  const uploadedDocKeys = uniq(docsUploaded);
  const expectedDocKeys = buildExpectedDocKeys(formData, docsRequired);
  const uploadedLabels = uploadedDocKeys.map(labelForDocKey);
  const missingDocKeys = expectedDocKeys.filter((key) => !uploadedDocKeys.includes(key));
  const missingDocLabels = missingDocKeys.map(labelForDocKey);
  const pendingLabels = buildPendingItems(formData, missingDocLabels);
  const additionalDocumentLabels = getAdditionalDocumentLabels(formData);

  const payload = {
    event_type: eventType,
    event_label: EVENT_LABELS[eventType] || 'Actualización de formulario',
    order_id: project.code,
    is_first_submission: eventType === 'form_submitted',
    submission_count: Array.isArray(project.submissions) ? project.submissions.length : 0,
    source: source || 'customer',
    source_label: getSourceLabel(source),
    locale: locale || 'es',
    submitted_at: submittedAt || null,
    submitted_at_label: formatWhen(submittedAt),
    project: buildProjectDetails(project, formData, snapshot),
    customer: buildCustomerDetails(project, snapshot),
    documents: {
      required_keys: expectedDocKeys,
      uploaded_keys: uploadedDocKeys,
      missing_keys: missingDocKeys,
      uploaded_labels: uploadedLabels.length ? uploadedLabels : ['Ninguno'],
      missing_labels: missingDocLabels,
      pending_labels: pendingLabels.length ? pendingLabels : ['Nada pendiente'],
      progress_label: `${uploadedDocKeys.filter((key) => expectedDocKeys.includes(key)).length}/${expectedDocKeys.length || 0}`,
    },
    sections: buildSectionSummary(formData, uploadedDocKeys, expectedDocKeys),
    additional_documents: {
      count: additionalDocumentLabels.length,
      labels: additionalDocumentLabels,
    },
  };

  payload.teams_message = buildTeamsNotificationMessage(payload);
  return payload;
}

module.exports = {
  buildExpectedDocKeys,
  buildFormNotificationPayload,
  buildTeamsNotificationMessage,
};
