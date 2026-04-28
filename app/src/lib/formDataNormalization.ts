import type {
  AIExtraction,
  AIExtractionValue,
  DocSlot,
  DocumentIssue,
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

const RENDERED_DOCUMENT_KEYS: RenderedDocumentKey[] = [
  'catalunaIva',
  'catalunaGeneralitat',
  'catalunaRepresentacio',
  'spainIva',
  'spainPoder',
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
      floorCount: '0',
      averageFloorHeight: null,
      bedroomCount: '0',
      doorsByOrientation: { north: '0', east: '0', south: '0', west: '0' },
      windowsByOrientation: { north: '0', east: '0', south: '0', west: '0' },
      windowFrameMaterial: null,
      doorMaterial: '',
      windowGlassType: null,
      hasShutters: null,
      shutterWindowCount: '0',
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

function normalizeUploadedPhoto(value: unknown): UploadedPhoto | null {
  if (!isRecord(value)) return null;
  const hasPhotoSignal =
    typeof value.preview === 'string'
    || typeof value.id === 'string'
    || typeof value.timestamp === 'number'
    || typeof value.sizeBytes === 'number';
  if (!hasPhotoSignal) return null;
  return {
    id: asString(value.id, `photo-${asString(value.timestamp, 'legacy')}`),
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
    id: asString(value.id, `file-${asString(value.timestamp, 'legacy')}`),
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
  return {
    code: typeof value.code === 'string' ? value.code as DocumentIssue['code'] : 'manual-review',
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

function normalizeRenderedDocuments(value: unknown): NonNullable<RepresentationData['renderedDocuments']> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    RENDERED_DOCUMENT_KEYS.flatMap((key) => {
      const candidate = value[key];
      if (!isRecord(candidate)) return [];
      const asset: RenderedDocumentAsset = {
        imageDataUrl: typeof candidate.imageDataUrl === 'string' ? candidate.imageDataUrl : undefined,
        generatedAt: asString(candidate.generatedAt),
        templateVersion: asString(candidate.templateVersion),
      };
      return [[key, asset]];
    })
  );
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasRepresentationCompletionSignal(representation: Record<string, unknown>): boolean {
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

function inferHolderTypeConfirmed(representation: Record<string, unknown>): boolean {
  if (representation.holderTypeConfirmed === true) return true;
  return hasRepresentationCompletionSignal(representation);
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
  const raw = {
    ...initialFormData.energyCertificate,
    ...record,
    housing: {
      ...initialFormData.energyCertificate.housing,
      ...housing,
      doorsByOrientation: {
        ...initialFormData.energyCertificate.housing.doorsByOrientation,
        ...(isRecord(housing.doorsByOrientation) ? housing.doorsByOrientation : {}),
      },
      windowsByOrientation: {
        ...initialFormData.energyCertificate.housing.windowsByOrientation,
        ...(isRecord(housing.windowsByOrientation) ? housing.windowsByOrientation : {}),
      },
    },
    thermal: { ...initialFormData.energyCertificate.thermal, ...thermal },
    additional: { ...initialFormData.energyCertificate.additional, ...additional },
  } as EnergyCertificateData;

  const normalizeCountText = (field: unknown) =>
    typeof field === 'string' && field.trim() !== '' ? field : '0';

  raw.housing.floorCount = normalizeCountText(raw.housing.floorCount);
  raw.housing.bedroomCount = normalizeCountText(raw.housing.bedroomCount);
  raw.housing.shutterWindowCount = normalizeCountText(raw.housing.shutterWindowCount);
  raw.housing.doorsByOrientation = {
    north: normalizeCountText(raw.housing.doorsByOrientation.north),
    east: normalizeCountText(raw.housing.doorsByOrientation.east),
    south: normalizeCountText(raw.housing.doorsByOrientation.south),
    west: normalizeCountText(raw.housing.doorsByOrientation.west),
  };
  raw.housing.windowsByOrientation = {
    north: normalizeCountText(raw.housing.windowsByOrientation.north),
    east: normalizeCountText(raw.housing.windowsByOrientation.east),
    south: normalizeCountText(raw.housing.windowsByOrientation.south),
    west: normalizeCountText(raw.housing.windowsByOrientation.west),
  };

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

  return {
    ...initialFormData,
    browserLanguage: asString(saved.browserLanguage, initialFormData.browserLanguage),
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
      originalPdfs: normalizeArray(
        isRecord(saved.electricityBill) ? saved.electricityBill.originalPdfs : undefined,
        normalizeStoredDocumentFile
      ),
      issue: normalizeIssue(isRecord(saved.electricityBill) ? saved.electricityBill.issue : undefined),
    },
    contract: {
      originalPdfs: normalizeArray(
        isRecord(saved.contract) ? saved.contract.originalPdfs : undefined,
        normalizeStoredDocumentFile
      ),
      extraction: normalizeAIExtraction(isRecord(saved.contract) ? saved.contract.extraction : undefined),
      issue: normalizeIssue(isRecord(saved.contract) ? saved.contract.issue : undefined),
    },
    additionalBankDocuments: withAdditionalBankDocumentAssetKeys(saved.additionalBankDocuments),
    energyCertificate: normalizeEnergyCertificate(saved.energyCertificate),
    signatures: {
      customerSignature: asNullableString(isRecord(saved.signatures) ? saved.signatures.customerSignature : undefined),
      repSignature: asNullableString(isRecord(saved.signatures) ? saved.signatures.repSignature : undefined),
    },
    location: normalizedLocation ?? undefined,
    representation: normalizeRepresentation(saved.representation, normalizedLocation),
  };
}
