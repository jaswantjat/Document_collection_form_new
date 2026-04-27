import type {
  AIExtraction,
  AIExtractionValue,
  DocSlot,
  DocumentIssue,
  DocumentIssueCode,
  EnergyCertificateData,
  FormData,
  LocationRegion,
  RenderedDocumentAsset,
  RenderedDocumentKey,
  RepresentationData,
  StoredDocumentFile,
  UploadedPhoto,
} from '@/types';
import { withAdditionalBankDocumentAssetKeys } from '@/lib/additionalBankDocuments';
import { isEnergyCertificateReadyToComplete } from '@/lib/energyCertificateValidation';

const DEFAULT_EC_COUNT = '0';

const RENDERED_DOCUMENT_KEYS: RenderedDocumentKey[] = [
  'catalunaIva',
  'catalunaGeneralitat',
  'catalunaRepresentacio',
  'spainIva',
  'spainPoder',
];

const DOCUMENT_ISSUE_CODES: DocumentIssueCode[] = [
  'manual-review',
  'temporary-error',
  'unreadable',
  'wrong-document',
  'wrong-side',
];

const emptyDocSlot = (): DocSlot => ({ photo: null, extraction: null });
const emptyContractData = () => ({ originalPdfs: [], extraction: null, issue: null });

export const initialFormData: FormData = {
  dni: { front: emptyDocSlot(), back: emptyDocSlot(), originalPdfs: [], issue: null },
  ibi: { photo: null, pages: [], originalPdfs: [], extraction: null, issue: null },
  electricityBill: { pages: [], originalPdfs: [], issue: null },
  contract: emptyContractData(),
  additionalBankDocuments: [],
  browserLanguage: typeof navigator !== 'undefined' ? navigator.language : undefined,
  energyCertificate: {
    status: 'not-started',
    housing: {
      cadastralReference: '',
      habitableAreaM2: '',
      floorCount: DEFAULT_EC_COUNT,
      averageFloorHeight: null,
      bedroomCount: DEFAULT_EC_COUNT,
      doorsByOrientation: {
        north: DEFAULT_EC_COUNT,
        east: DEFAULT_EC_COUNT,
        south: DEFAULT_EC_COUNT,
        west: DEFAULT_EC_COUNT,
      },
      windowsByOrientation: {
        north: DEFAULT_EC_COUNT,
        east: DEFAULT_EC_COUNT,
        south: DEFAULT_EC_COUNT,
        west: DEFAULT_EC_COUNT,
      },
      windowFrameMaterial: null,
      doorMaterial: '',
      windowGlassType: null,
      hasShutters: null,
      shutterWindowCount: DEFAULT_EC_COUNT,
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
    skippedAt: null,
  },
  signatures: { customerSignature: null, repSignature: null },
  representation: {
    location: null,
    isCompany: false,
    holderTypeConfirmed: false,
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
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function normalizeArray<T>(value: unknown, mapper: (item: unknown) => T | null): T[] {
  return Array.isArray(value)
    ? value.map(mapper).filter((item): item is T => item !== null)
    : [];
}

function normalizeEcCount(value: unknown): string {
  return value == null || String(value).trim() === ''
    ? DEFAULT_EC_COUNT
    : String(value);
}

function normalizeOrientationCounts(value: unknown) {
  const record = isRecord(value) ? value : {};
  return {
    north: normalizeEcCount(record.north),
    east: normalizeEcCount(record.east),
    south: normalizeEcCount(record.south),
    west: normalizeEcCount(record.west),
  };
}

function normalizeUploadedPhoto(value: unknown): UploadedPhoto | null {
  if (!isRecord(value)) return null;
  const hasPhotoSignal =
    typeof value.preview === 'string'
    || typeof value.id === 'string'
    || typeof value.timestamp === 'number'
    || typeof value.sizeBytes === 'number';
  if (!hasPhotoSignal) return null;
  return {
    id: asString(value.id, `photo-${String(value.timestamp ?? 'legacy')}`),
    preview: asString(value.preview),
    timestamp: typeof value.timestamp === 'number' ? value.timestamp : 0,
    sizeBytes: typeof value.sizeBytes === 'number' ? value.sizeBytes : 0,
    width: typeof value.width === 'number' ? value.width : undefined,
    height: typeof value.height === 'number' ? value.height : undefined,
  };
}

function normalizeStoredDocumentFile(value: unknown): StoredDocumentFile | null {
  if (!isRecord(value)) return null;
  const hasFileSignal =
    typeof value.dataUrl === 'string'
    || typeof value.id === 'string'
    || typeof value.filename === 'string';
  if (!hasFileSignal) return null;
  return {
    id: asString(value.id, `file-${String(value.timestamp ?? 'legacy')}`),
    filename: asString(value.filename),
    mimeType: asString(value.mimeType, 'application/octet-stream'),
    dataUrl: asString(value.dataUrl),
    timestamp: typeof value.timestamp === 'number' ? value.timestamp : 0,
    sizeBytes: typeof value.sizeBytes === 'number' ? value.sizeBytes : 0,
  };
}

function normalizeAIExtraction(value: unknown): AIExtraction | null {
  if (!isRecord(value)) return null;
  const extractedData = isRecord(value.extractedData)
    ? Object.fromEntries(
        Object.entries(value.extractedData).filter(([, field]) =>
          typeof field === 'string' || field === null || field === undefined
        )
      ) as Record<string, AIExtractionValue>
    : {};
  return {
    extractedData,
    confidence: typeof value.confidence === 'number' ? value.confidence : 0,
    isCorrectDocument: value.isCorrectDocument !== false,
    documentTypeDetected: asString(value.documentTypeDetected),
    identityDocumentKind: value.identityDocumentKind as AIExtraction['identityDocumentKind'],
    notes: typeof value.notes === 'string' ? value.notes : undefined,
    needsManualReview: value.needsManualReview === true,
    confirmedByUser: value.confirmedByUser !== false,
    manualCorrections: isRecord(value.manualCorrections)
      ? Object.fromEntries(
          Object.entries(value.manualCorrections).filter(([, field]) => typeof field === 'string')
        ) as Record<string, string>
      : undefined,
  };
}

function normalizeIssue(value: unknown): DocumentIssue | null {
  if (!isRecord(value) || typeof value.message !== 'string') return null;
  const code = DOCUMENT_ISSUE_CODES.includes(value.code as DocumentIssueCode)
    ? value.code as DocumentIssueCode
    : 'manual-review';
  return {
    code,
    message: value.message,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString(),
  };
}

function normalizeDocSlot(value: unknown): DocSlot {
  const record = isRecord(value) ? value : {};
  return {
    photo: normalizeUploadedPhoto(record.photo),
    extraction: normalizeAIExtraction(record.extraction),
  };
}

function normalizeLocation(value: unknown): LocationRegion | null {
  return value === 'cataluna' || value === 'madrid' || value === 'valencia' || value === 'other'
    ? value
    : null;
}

function normalizeRenderedAsset(value: unknown): RenderedDocumentAsset | null {
  if (!isRecord(value)) return null;
  return {
    imageDataUrl: typeof value.imageDataUrl === 'string' ? value.imageDataUrl : undefined,
    generatedAt: asString(value.generatedAt),
    templateVersion: asString(value.templateVersion),
  };
}

function normalizeRenderedDocuments(value: unknown): NonNullable<RepresentationData['renderedDocuments']> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    RENDERED_DOCUMENT_KEYS.flatMap((key) => {
      const asset = normalizeRenderedAsset(value[key]);
      return asset ? [[key, asset]] : [];
    })
  );
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function inferHolderTypeConfirmed(representation: Record<string, unknown>): boolean {
  if (typeof representation.holderTypeConfirmed === 'boolean') return representation.holderTypeConfirmed;
  return Boolean(
    representation.isCompany
    || hasText(representation.companyName)
    || hasText(representation.companyNIF)
    || hasText(representation.companyAddress)
    || hasText(representation.companyMunicipality)
    || hasText(representation.companyPostalCode)
    || hasText(representation.postalCode)
    || hasText(representation.ivaPropertyAddress)
    || hasText(representation.ivaCertificateSignature)
    || hasText(representation.representacioSignature)
    || hasText(representation.generalitatSignature)
    || hasText(representation.poderRepresentacioSignature)
    || hasText(representation.ivaCertificateEsSignature)
    || Object.keys(normalizeRenderedDocuments(representation.renderedDocuments)).length > 0
  );
}

function normalizeRepresentation(value: unknown, location: LocationRegion | null): RepresentationData {
  const record = isRecord(value) ? value : {};
  return {
    ...initialFormData.representation,
    location,
    isCompany: record.isCompany === true,
    holderTypeConfirmed: inferHolderTypeConfirmed(record),
    companyName: asString(record.companyName),
    companyNIF: asString(record.companyNIF),
    companyAddress: asString(record.companyAddress),
    companyMunicipality: asString(record.companyMunicipality),
    companyPostalCode: asString(record.companyPostalCode),
    postalCode: asString(record.postalCode),
    ivaPropertyAddress: asString(record.ivaPropertyAddress),
    ivaCertificateSignature: asNullableString(record.ivaCertificateSignature),
    representacioSignature: asNullableString(record.representacioSignature),
    generalitatRole: record.generalitatRole === 'representant' ? 'representant' : 'titular',
    generalitatSignature: asNullableString(record.generalitatSignature),
    poderRepresentacioSignature: asNullableString(record.poderRepresentacioSignature),
    ivaCertificateEsSignature: asNullableString(record.ivaCertificateEsSignature),
    signatureDeferred: record.signatureDeferred === true,
    renderedDocuments: normalizeRenderedDocuments(record.renderedDocuments),
  };
}

function normalizeEnergyCertificate(value: unknown): EnergyCertificateData {
  const record = isRecord(value) ? value : {};
  const housing = isRecord(record.housing) ? record.housing : {};
  const thermal = isRecord(record.thermal) ? record.thermal : {};
  const additional = isRecord(record.additional) ? record.additional : {};
  const renderedDocument = normalizeRenderedAsset(record.renderedDocument);
  const raw = {
    ...initialFormData.energyCertificate,
    ...record,
    status: record.status === 'in-progress' || record.status === 'skipped' || record.status === 'completed'
      ? record.status
      : initialFormData.energyCertificate.status,
    housing: {
      ...initialFormData.energyCertificate.housing,
      ...housing,
      floorCount: normalizeEcCount(housing.floorCount),
      bedroomCount: normalizeEcCount(housing.bedroomCount),
      doorsByOrientation: normalizeOrientationCounts(housing.doorsByOrientation),
      windowsByOrientation: normalizeOrientationCounts(housing.windowsByOrientation),
      shutterWindowCount: normalizeEcCount(housing.shutterWindowCount),
    },
    thermal: { ...initialFormData.energyCertificate.thermal, ...thermal },
    additional: { ...initialFormData.energyCertificate.additional, ...additional },
    customerSignature: asNullableString(record.customerSignature),
    renderedDocument,
    completedAt: asNullableString(record.completedAt),
    skippedAt: asNullableString(record.skippedAt),
    currentStepIndex: typeof record.currentStepIndex === 'number' ? record.currentStepIndex : undefined,
  } as EnergyCertificateData;
  return raw.status === 'completed' && !isEnergyCertificateReadyToComplete(raw)
    ? { ...raw, status: 'in-progress' }
    : raw;
}

function normalizeElectricityPages(value: unknown): DocSlot[] {
  const record = isRecord(value) ? value : {};
  if (record.front || record.back) {
    return [record.front, record.back]
      .map(normalizeDocSlot)
      .filter((page) => !!page.photo);
  }
  return normalizeArray(record.pages, normalizeDocSlot).filter((page) => !!page.photo);
}

export function normalizeFormData(savedFormData?: unknown): FormData {
  const saved = isRecord(savedFormData) ? savedFormData : {};
  const representationRecord = isRecord(saved.representation) ? saved.representation : {};
  const normalizedLocation = normalizeLocation(saved.location) ?? normalizeLocation(representationRecord.location);
  const dniRecord = isRecord(saved.dni) ? saved.dni : {};
  const ibiRecord = isRecord(saved.ibi) ? saved.ibi : {};
  const ibiPhoto = normalizeUploadedPhoto(ibiRecord.photo);
  const ibiPages = normalizeArray(ibiRecord.pages, normalizeUploadedPhoto);
  const electricityRecord = isRecord(saved.electricityBill) ? saved.electricityBill : {};
  const contractRecord = isRecord(saved.contract) ? saved.contract : {};
  const signaturesRecord = isRecord(saved.signatures) ? saved.signatures : {};

  return {
    ...initialFormData,
    browserLanguage: typeof saved.browserLanguage === 'string' ? saved.browserLanguage : initialFormData.browserLanguage,
    dni: {
      front: normalizeDocSlot(dniRecord.front),
      back: normalizeDocSlot(dniRecord.back),
      originalPdfs: normalizeArray(dniRecord.originalPdfs, normalizeStoredDocumentFile),
      issue: normalizeIssue(dniRecord.issue),
    },
    ibi: {
      photo: ibiPhoto,
      pages: ibiPages.length > 0 ? ibiPages : (ibiPhoto ? [ibiPhoto] : []),
      originalPdfs: normalizeArray(ibiRecord.originalPdfs, normalizeStoredDocumentFile),
      extraction: normalizeAIExtraction(ibiRecord.extraction),
      issue: normalizeIssue(ibiRecord.issue),
    },
    electricityBill: {
      pages: normalizeElectricityPages(saved.electricityBill),
      originalPdfs: normalizeArray(electricityRecord.originalPdfs, normalizeStoredDocumentFile),
      issue: normalizeIssue(electricityRecord.issue),
    },
    contract: {
      originalPdfs: normalizeArray(contractRecord.originalPdfs, normalizeStoredDocumentFile),
      extraction: normalizeAIExtraction(contractRecord.extraction),
      issue: normalizeIssue(contractRecord.issue),
    },
    additionalBankDocuments: withAdditionalBankDocumentAssetKeys(saved.additionalBankDocuments),
    energyCertificate: normalizeEnergyCertificate(saved.energyCertificate),
    signatures: {
      customerSignature: asNullableString(signaturesRecord.customerSignature),
      repSignature: asNullableString(signaturesRecord.repSignature),
    },
    location: normalizedLocation ?? undefined,
    representation: normalizeRepresentation(saved.representation, normalizedLocation),
  };
}
