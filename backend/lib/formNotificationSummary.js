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

const DEFAULT_PUBLIC_FORM_BASE_URL = 'https://documentos.eltex.es';

const REPRESENTATION_DOC_KEYS = new Set([
  'cataluna_iva',
  'cataluna_generalitat',
  'cataluna_representacio',
  'spain_iva',
  'spain_poder',
]);

const SINGLE_SIDED_IDENTITY_KINDS = new Set([
  'nie-card',
  'nie-certificate',
  'passport',
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

function getIdentityDocumentKind(formData) {
  const kind = formData?.dni?.front?.extraction?.identityDocumentKind;
  return typeof kind === 'string' ? kind : null;
}

function isCombinedIdentityImage(formData) {
  return !!formData?.dni?.front?.extraction?.notes?.toLowerCase().includes('combined');
}

function isIdentityBackRequired(formData, uploadedDocKeys) {
  const hasFront =
    uploadedDocKeys.includes('dni_front')
    || !!formData?.dni?.front?.photo
    || !!formData?.dni?.front?.extraction;

  if (!hasFront) return true;

  const kind = getIdentityDocumentKind(formData);
  if (!kind) return true;

  return !SINGLE_SIDED_IDENTITY_KINDS.has(kind) && !isCombinedIdentityImage(formData);
}

function buildExpectedDocKeys(formData, docsRequired, uploadedDocKeys = []) {
  const expected = [...(docsRequired || [])].filter((key) => {
    if (key === 'dni_back' && !isIdentityBackRequired(formData, uploadedDocKeys)) {
      return false;
    }
    if (key === 'energy_certificate' && formData?.energyCertificate?.status === 'skipped') {
      return false;
    }
    return true;
  });
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

function getRepresentationSignatureKeys(formData) {
  const location = getLocationKey(formData, null);
  if (location === 'cataluna') {
    return ['ivaCertificateSignature', 'generalitatSignature', 'representacioSignature'];
  }
  if (location && location !== 'other') {
    return ['ivaCertificateEsSignature', 'poderRepresentacioSignature'];
  }
  return [];
}

function getFilledCount(formData, keys) {
  return keys.filter((key) => !!formData?.representation?.[key]).length;
}

function getIdentityStatus(formData, uploadedDocKeys) {
  const uploaded = new Set(uploadedDocKeys);
  const hasFront = uploaded.has('dni_front');
  const hasBack = uploaded.has('dni_back');

  if (!hasFront && !hasBack) return 'pendiente';
  if (hasFront && (hasBack || !isIdentityBackRequired(formData, uploadedDocKeys))) {
    const kind = getIdentityDocumentKind(formData);
    if (kind === 'passport') return 'completa (pasaporte)';
    if (kind === 'nie-certificate') return 'completa (NIE certificado)';
    if (kind === 'nie-card') return 'completa (NIE)';
    return 'completa';
  }
  if (hasFront) return 'pendiente (falta la trasera)';
  return 'pendiente (falta la frontal)';
}

function getRepresentationDocumentStatus(uploadedDocKeys, expectedDocKeys) {
  const requiredKeys = expectedDocKeys.filter((key) => REPRESENTATION_DOC_KEYS.has(key));
  if (!requiredKeys.length) return 'no aplica';

  const uploaded = new Set(uploadedDocKeys);
  const uploadedCount = requiredKeys.filter((key) => uploaded.has(key)).length;
  if (uploadedCount === requiredKeys.length) return `completos (${uploadedCount}/${requiredKeys.length})`;
  if (uploadedCount === 0) return `pendientes (0/${requiredKeys.length})`;
  return `parciales (${uploadedCount}/${requiredKeys.length})`;
}

function getRepresentationSignatureStatus(formData) {
  const signatureKeys = getRepresentationSignatureKeys(formData);
  if (!signatureKeys.length) return 'no aplica';

  const signedCount = getFilledCount(formData, signatureKeys);
  if (signedCount === signatureKeys.length) return `completas (${signedCount}/${signatureKeys.length})`;
  if (formData?.representation?.signatureDeferred) {
    return `aplazadas (${signedCount}/${signatureKeys.length})`;
  }
  if (signedCount === 0) return `pendientes (0/${signatureKeys.length})`;
  return `parciales (${signedCount}/${signatureKeys.length})`;
}

function getFinalSignatureStatus(formData) {
  const signatures = formData?.signatures || {};
  const signedCount = [signatures.customerSignature, signatures.repSignature].filter(Boolean).length;
  if (signedCount === 2) return 'completas (2/2)';
  if (signedCount === 1) return 'parciales (1/2)';
  return 'pendientes (0/2)';
}

function getEnergyCertificateStatus(formData) {
  switch (formData?.energyCertificate?.status) {
    case 'completed':
      return 'completo';
    case 'skipped':
      return 'aplazado';
    case 'in-progress':
      return 'en curso';
    default:
      return 'pendiente';
  }
}

function getAdditionalDocumentsStatus(additionalDocumentLabels) {
  if (!additionalDocumentLabels.length) return 'sin aportar';
  return `${additionalDocumentLabels.length} adjunto${additionalDocumentLabels.length === 1 ? '' : 's'}`;
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

  const representationSignatureKeys = getRepresentationSignatureKeys(formData);
  if (representationSignatureKeys.length) {
    const signedCount = getFilledCount(formData, representationSignatureKeys);
    if (signedCount < representationSignatureKeys.length) {
      pending.push(
        formData?.representation?.signatureDeferred
          ? 'Firmas de representación aplazadas'
          : 'Firmas de representación'
      );
    }
  }

  if (!formData?.signatures?.customerSignature) pending.push('Firma final del cliente');
  if (!formData?.signatures?.repSignature) pending.push('Firma final comercial');

  return uniq(pending);
}

function buildSectionSummary(formData, uploadedDocKeys, expectedDocKeys) {
  const uploaded = new Set(uploadedDocKeys);
  const representationExpected = expectedDocKeys.filter((key) => REPRESENTATION_DOC_KEYS.has(key));

  return {
    identidad: getIdentityStatus(formData, uploadedDocKeys).startsWith('completa') ? 'completa' : 'pendiente',
    inmueble:
      uploaded.has('ibi') && uploaded.has('electricity_bill') ? 'completa' : 'pendiente',
    representacion:
      representationExpected.length === 0 || representationExpected.every((key) => uploaded.has(key))
        ? 'completa'
        : 'pendiente',
    firmas_representacion: getRepresentationSignatureStatus(formData),
    firmas_finales: getFinalSignatureStatus(formData),
    certificado_energetico: getEnergyCertificateStatus(formData),
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

function buildSubmittedBy(source, project, customer) {
  if (source === 'customer') {
    return { label: getSourceLabel(source), name: customer.name || 'Cliente' };
  }
  if (source === 'assessor') {
    return { label: getSourceLabel(source), name: project.assessor || 'Asesor' };
  }
  return { label: getSourceLabel(source), name: getSourceLabel(source) };
}

function buildFormLink(orderId, publicFormBaseUrl) {
  const fallbackBaseUrl = DEFAULT_PUBLIC_FORM_BASE_URL;
  const rawBaseUrl = typeof publicFormBaseUrl === 'string' && publicFormBaseUrl.trim()
    ? publicFormBaseUrl.trim()
    : fallbackBaseUrl;

  let baseUrl;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    baseUrl = new URL(fallbackBaseUrl);
  }

  const formUrl = new URL('/', baseUrl);
  formUrl.searchParams.set('code', orderId);
  return formUrl.toString();
}

function buildDocumentStatuses(formData, uploadedDocKeys, expectedDocKeys, additionalDocumentLabels) {
  const uploaded = new Set(uploadedDocKeys);
  return {
    identity: getIdentityStatus(formData, uploadedDocKeys),
    ibi: uploaded.has('ibi') ? 'recibido' : 'pendiente',
    electricity_bill: uploaded.has('electricity_bill') ? 'recibida' : 'pendiente',
    representation_documents: getRepresentationDocumentStatus(uploadedDocKeys, expectedDocKeys),
    representation_signatures: getRepresentationSignatureStatus(formData),
    final_signatures: getFinalSignatureStatus(formData),
    energy_certificate: getEnergyCertificateStatus(formData),
    additional_documents: getAdditionalDocumentsStatus(additionalDocumentLabels),
  };
}

function buildEventTitle(payload) {
  if (!payload.is_first_submission && payload.submission_count > 1) {
    return `${payload.event_label} (${payload.submission_count} envíos)`;
  }
  return payload.event_label;
}

function formatSubmittedBy(payload) {
  if (!payload.submitted_by?.name) return payload.source_label;
  if (payload.submitted_by.name === payload.submitted_by.label) return payload.submitted_by.name;
  return `${payload.submitted_by.name} (${payload.submitted_by.label})`;
}

function buildMessageLines(payload) {
  const lines = [
    buildEventTitle(payload),
    `Expediente: ${payload.order_id}`,
    `Cliente: ${payload.customer.name}`,
    `Asesor asignado: ${payload.project.assessor || 'Pendiente'}`,
    `Rellenado por: ${formatSubmittedBy(payload)}`,
    `Enlace del formulario: ${payload.links.form}`,
    `Fecha: ${payload.submitted_at_label || 'Pendiente'}`,
    '',
    'Resumen:',
    `- Producto: ${payload.project.product_label}`,
    `- Ubicación: ${payload.project.location_label}`,
    `- Titular del contrato: ${payload.project.holder_type_label}`,
    `- Teléfono: ${payload.customer.phone || 'Pendiente'}`,
    `- Email: ${payload.customer.email || 'Pendiente'}`,
    `- DNI/NIF: ${payload.customer.dni_number || payload.project.company_nif || 'Pendiente'}`,
    `- Dirección: ${payload.customer.address || 'Pendiente'}`,
    '',
    'Estado actual:',
    `- Progreso documental: ${payload.documents.progress_label}`,
    `- Identidad: ${payload.statuses.identity}`,
    `- IBI / Escritura: ${payload.statuses.ibi}`,
    `- Factura de luz: ${payload.statuses.electricity_bill}`,
    `- Documentos de representación: ${payload.statuses.representation_documents}`,
    `- Firmas de representación: ${payload.statuses.representation_signatures}`,
    `- Firmas finales: ${payload.statuses.final_signatures}`,
    `- Certificado energético: ${payload.statuses.energy_certificate}`,
    `- Documentos adicionales: ${payload.statuses.additional_documents}`,
    '',
    `Pendiente (${payload.documents.pending_labels.length}):`,
    ...payload.documents.pending_labels.map((item) => `- ${item}`),
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
  publicFormBaseUrl,
}) {
  const uploadedDocKeys = uniq(docsUploaded);
  const expectedDocKeys = buildExpectedDocKeys(formData, docsRequired, uploadedDocKeys);
  const uploadedLabels = uploadedDocKeys.map(labelForDocKey);
  const missingDocKeys = expectedDocKeys.filter((key) => !uploadedDocKeys.includes(key));
  const missingDocLabels = missingDocKeys.map(labelForDocKey);
  const additionalDocumentLabels = getAdditionalDocumentLabels(formData);
  const pendingLabels = buildPendingItems(formData, missingDocLabels);
  const customer = buildCustomerDetails(project, snapshot);
  const submittedBy = buildSubmittedBy(source, project, customer);
  const statuses = buildDocumentStatuses(formData, uploadedDocKeys, expectedDocKeys, additionalDocumentLabels);

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
    links: {
      form: buildFormLink(project.code, publicFormBaseUrl),
    },
    project: buildProjectDetails(project, formData, snapshot),
    customer,
    submitted_by: submittedBy,
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
    statuses,
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
