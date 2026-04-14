import type {
  AIExtraction,
  AdditionalBankDocumentEntry,
  AdditionalBankDocumentFile,
  AdditionalBankDocumentType,
  DocumentIssue,
} from '@/types';

const ADDITIONAL_BANK_DOCUMENT_LABELS: Record<AdditionalBankDocumentType, string> = {
  'bank-ownership-certificate': 'Certificado de titularidad bancaria',
  payroll: 'Nómina',
  'bank-statements': 'Extractos bancarios',
  'employment-contract': 'Contrato laboral',
  'tax-return': 'Declaración de la renta',
  other: 'Otro documento',
};

export const ADDITIONAL_BANK_DOCUMENT_ASSET_PREFIX = 'bankDocument';
export const ADDITIONAL_BANK_DOCUMENT_OPTIONS = Object.entries(ADDITIONAL_BANK_DOCUMENT_LABELS).map(
  ([value, label]) => ({ value: value as AdditionalBankDocumentType, label }),
);

export function createAdditionalBankDocumentId(): string {
  return `additional-bank-document-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isAdditionalBankDocumentType(value: unknown): value is AdditionalBankDocumentType {
  return typeof value === 'string' && value in ADDITIONAL_BANK_DOCUMENT_LABELS;
}

function sanitizeAdditionalBankDocumentFile(
  file: unknown,
): AdditionalBankDocumentFile | null {
  if (!file || typeof file !== 'object') return null;
  const candidate = file as Partial<AdditionalBankDocumentFile>;

  return {
    id: typeof candidate.id === 'string' ? candidate.id : '',
    filename: typeof candidate.filename === 'string' ? candidate.filename : '',
    mimeType: typeof candidate.mimeType === 'string' ? candidate.mimeType : 'application/octet-stream',
    dataUrl: typeof candidate.dataUrl === 'string' ? candidate.dataUrl : '',
    timestamp: typeof candidate.timestamp === 'number' ? candidate.timestamp : 0,
    sizeBytes: typeof candidate.sizeBytes === 'number' ? candidate.sizeBytes : 0,
    assetKey: typeof candidate.assetKey === 'string' && candidate.assetKey.trim()
      ? candidate.assetKey
      : undefined,
  };
}

function sanitizeExtractionValue(value: unknown): string | null | undefined {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return value;
  return undefined;
}

function sanitizeAIExtraction(value: unknown): AIExtraction | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<AIExtraction>;
  const extractedData = candidate.extractedData && typeof candidate.extractedData === 'object'
    ? Object.fromEntries(
      Object.entries(candidate.extractedData).flatMap(([key, fieldValue]) => {
        const sanitized = sanitizeExtractionValue(fieldValue);
        return sanitized === undefined ? [] : [[key, sanitized]];
      })
    )
    : {};

  return {
    extractedData,
    confidence: typeof candidate.confidence === 'number' ? candidate.confidence : 0,
    isCorrectDocument: candidate.isCorrectDocument !== false,
    documentTypeDetected: typeof candidate.documentTypeDetected === 'string' ? candidate.documentTypeDetected : '',
    identityDocumentKind: candidate.identityDocumentKind,
    notes: typeof candidate.notes === 'string' ? candidate.notes : undefined,
    needsManualReview: candidate.needsManualReview === true,
    confirmedByUser: candidate.confirmedByUser !== false,
    manualCorrections: candidate.manualCorrections && typeof candidate.manualCorrections === 'object'
      ? Object.fromEntries(
        Object.entries(candidate.manualCorrections).filter(([, fieldValue]) => typeof fieldValue === 'string')
      )
      : undefined,
  };
}

function sanitizeDocumentIssue(value: unknown): DocumentIssue | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<DocumentIssue>;
  if (typeof candidate.code !== 'string' || typeof candidate.message !== 'string') return null;

  return {
    code: candidate.code as DocumentIssue['code'],
    message: candidate.message,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date(0).toISOString(),
  };
}

export function normalizeAdditionalBankDocuments(value: unknown): AdditionalBankDocumentEntry[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as Partial<AdditionalBankDocumentEntry>;
    if (!isAdditionalBankDocumentType(candidate.type)) return [];

    return [{
      id: typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id
        : `additional-bank-document-${index}`,
      type: candidate.type,
      customLabel: typeof candidate.customLabel === 'string' && candidate.customLabel.trim()
        ? candidate.customLabel.trim()
        : undefined,
      files: Array.isArray(candidate.files)
        ? candidate.files
          .map((file) => sanitizeAdditionalBankDocumentFile(file))
          .filter((file): file is AdditionalBankDocumentFile => Boolean(file))
        : [],
      extraction: sanitizeAIExtraction(candidate.extraction),
      issue: sanitizeDocumentIssue(candidate.issue),
    }];
  });
}

export function withAdditionalBankDocumentAssetKeys(
  value: unknown,
): AdditionalBankDocumentEntry[] {
  let nextAssetIndex = 0;

  return normalizeAdditionalBankDocuments(value).map((entry) => ({
    ...entry,
    files: entry.files.map((file) => ({
      ...file,
      assetKey: `${ADDITIONAL_BANK_DOCUMENT_ASSET_PREFIX}_${nextAssetIndex++}`,
    })),
  }));
}

export function getAdditionalBankDocumentLabel(entry: AdditionalBankDocumentEntry): string {
  if (entry.type === 'other') {
    return entry.customLabel || ADDITIONAL_BANK_DOCUMENT_LABELS.other;
  }

  return ADDITIONAL_BANK_DOCUMENT_LABELS[entry.type];
}

export function getAdditionalBankDocumentFileLabel(
  entry: AdditionalBankDocumentEntry,
  fileIndex: number,
): string {
  const baseLabel = getAdditionalBankDocumentLabel(entry);
  return entry.files.length > 1 ? `${baseLabel} ${fileIndex + 1}` : baseLabel;
}
