const ADDITIONAL_BANK_DOCUMENT_LABELS = {
  'bank-ownership-certificate': 'el certificado de titularidad bancaria',
  payroll: 'la nómina',
  'bank-statements': 'los extractos bancarios',
  'employment-contract': 'el contrato laboral',
  'tax-return': 'la declaración de la renta',
  other: 'un documento financiero o justificante relacionado con la operación',
};

const RESPONSE_SHAPE = [
  '{"isCorrectDocument":true,"documentTypeDetected":"string","isReadable":true,"extractedData":{',
  '"holderName":"string or null",',
  '"documentNumber":"string or null",',
  '"issuerName":"string or null",',
  '"referenceOrIban":"string or null",',
  '"period":"string or null",',
  '"amount":"string or null",',
  '"summary":"string or null"',
  '},"confidence":0.95,"notes":"string"}',
].join('');

function buildPrompt(title, acceptedDocuments, extractionRules) {
  return `You are a document validator and data extractor for Spanish customer financial supporting documents.

Image quality check — ONLY reject (isReadable: false) if the document is genuinely unreadable: completely blurred, fully cut off, or so dark that the key fields cannot be read. Normal phone photos, scans, and readable screenshots are acceptable.

Accepted document for this upload slot: ${title}.
ACCEPT ONLY: ${acceptedDocuments}

Extract these generic fields:
1. holderName — the person named on the document
2. documentNumber — the main NIF/NIE/model/reference number if visible
3. issuerName — the bank, employer, AEAT, or issuing entity
4. referenceOrIban — IBAN/account/reference/contract code if visible
5. period — month, tax year, issue date, or statement period
6. amount — the most relevant money amount if visible
7. summary — one short sentence in Spanish describing what the document is

Specific rules:
${extractionRules}

Set isCorrectDocument: false if the upload is unrelated, blank, template-only, or clearly belongs to another slot.

Respond ONLY with this exact JSON (no markdown, no extra text):
${RESPONSE_SHAPE}`;
}

const ADDITIONAL_BANK_DOCUMENT_PROMPTS = {
  'bank-ownership-certificate': buildPrompt(
    'bank ownership certificate / certificate of account ownership',
    'bank ownership certificates, bank account holder certificates, account ownership letters issued by a bank',
    '- holderName should be the account owner.\n- issuerName should be the bank.\n- referenceOrIban should be the IBAN or account identifier.\n- period should be the issue date if visible.\n- Reject payrolls, statements, IDs, or unrelated banking screenshots.'
  ),
  payroll: buildPrompt(
    'payroll / payslip',
    'salary payslips, payroll receipts, nóminas, employer payroll statements',
    '- holderName should be the employee name.\n- issuerName should be the employer/company.\n- documentNumber should be the employee NIF/NIE if visible.\n- period should be the payroll month or pay period.\n- amount should be the net salary / liquido a percibir when visible.\n- Reject bank statements, contracts, tax returns, or utility bills.'
  ),
  'bank-statements': buildPrompt(
    'bank statement',
    'bank statements, account statements, transaction statements, extractos bancarios',
    '- holderName should be the account holder.\n- issuerName should be the bank.\n- referenceOrIban should be the IBAN or account number if visible.\n- period should be the covered statement period.\n- amount may be the ending balance if clearly visible.\n- Reject payrolls, certificates, invoices, or unrelated screenshots.'
  ),
  'employment-contract': buildPrompt(
    'employment contract',
    'employment contracts, labor contracts, contrato laboral, work agreement letters',
    '- holderName should be the employee.\n- issuerName should be the employer/company.\n- documentNumber should be the employee NIF/NIE or contract reference if visible.\n- period should be the contract start date or duration if visible.\n- Reject payrolls, bank statements, or tax returns.'
  ),
  'tax-return': buildPrompt(
    'tax return',
    'Spanish tax returns, declaración de la renta, AEAT filing summaries, Modelo 100 summaries',
    '- holderName should be the taxpayer.\n- issuerName should be AEAT or the filing entity.\n- documentNumber should be the taxpayer NIF/NIE or Modelo reference.\n- period should be the tax year.\n- amount should be the refund/payment result if visible.\n- Reject payrolls, employment contracts, or generic bank documents.'
  ),
  other: buildPrompt(
    'generic financial supporting document',
    'financial supporting documents related to income, banking, financing, tax, employment, or solvency proofs',
    '- Use summary to describe the document clearly in Spanish.\n- If it is still obviously a payroll, statement, tax return, or contract, identify it in documentTypeDetected.\n- Reject selfies, chats, random photos, unrelated IDs already collected elsewhere, and non-financial documents.'
  ),
};

function isAdditionalBankDocumentType(documentType) {
  return typeof documentType === 'string' && documentType in ADDITIONAL_BANK_DOCUMENT_PROMPTS;
}

function getAdditionalBankDocumentPrompt(documentType) {
  return isAdditionalBankDocumentType(documentType)
    ? ADDITIONAL_BANK_DOCUMENT_PROMPTS[documentType]
    : null;
}

function getAdditionalBankDocumentWrongDocumentMessage(documentType) {
  return `Documento incorrecto. Por favor sube ${ADDITIONAL_BANK_DOCUMENT_LABELS[documentType] || 'el documento correcto'}.`;
}

function normalizeStringRecord(record) {
  if (!record || typeof record !== 'object') return {};
  const next = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== 'string') {
      next[key] = value ?? null;
      continue;
    }
    next[key] = value.replace(/\s+/g, ' ').trim() || null;
  }
  return next;
}

function normalizeAdditionalBankDocumentExtraction(documentType, extraction) {
  if (!isAdditionalBankDocumentType(documentType) || !extraction || typeof extraction !== 'object') {
    return { extraction, wrongDocumentMessage: null };
  }

  const normalized = { ...extraction, extractedData: normalizeStringRecord(extraction.extractedData) };
  const data = normalized.extractedData || {};

  if (typeof data.referenceOrIban === 'string') {
    const compact = data.referenceOrIban.replace(/\s+/g, '').toUpperCase();
    if (/(.)\1{3,}/.test(compact)) data.referenceOrIban = null;
    else if (compact.startsWith('ES')) data.referenceOrIban = compact;
  }

  if (typeof data.documentNumber === 'string') {
    const compact = data.documentNumber.replace(/\s+/g, '').toUpperCase();
    data.documentNumber = compact || null;
  }

  const hasCoreData = Boolean(
    data.holderName
    || data.documentNumber
    || data.issuerName
    || data.referenceOrIban
    || data.period
    || data.amount
    || data.summary
  );

  return {
    extraction: normalized,
    wrongDocumentMessage: normalized.isCorrectDocument && !hasCoreData
      ? getAdditionalBankDocumentWrongDocumentMessage(documentType)
      : null,
  };
}

module.exports = {
  getAdditionalBankDocumentPrompt,
  getAdditionalBankDocumentWrongDocumentMessage,
  isAdditionalBankDocumentType,
  normalizeAdditionalBankDocumentExtraction,
};
