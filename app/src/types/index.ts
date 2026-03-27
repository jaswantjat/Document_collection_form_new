// Eltex Document Collection Form - Types

export type ProductType = 'solar' | 'aerothermal';

export interface ProjectData {
  code: string;
  accessToken?: string;
  customerName: string;
  phone: string;
  email: string;
  productType: ProductType;
  assessor: string;
  assessorId: string;
  formData: FormData | null;
  lastActivity: string | null;
  createdAt: string;
}

export interface UploadedPhoto {
  id: string;
  file?: File;
  preview: string;
  timestamp: number;
  sizeBytes: number;
  width?: number;
  height?: number;
}

export interface StoredDocumentFile {
  id: string;
  filename: string;
  mimeType: string;
  dataUrl: string;
  timestamp: number;
  sizeBytes: number;
}

export interface AIExtraction {
  extractedData: Record<string, any>;
  confidence: number;
  isCorrectDocument: boolean;
  documentTypeDetected: string;
  identityDocumentKind?: 'dni-card' | 'nie-card' | 'nie-certificate';
  needsManualReview: boolean;
  confirmedByUser: boolean;
  manualCorrections?: Record<string, string>;
}

export interface DocSlot {
  photo: UploadedPhoto | null;
  extraction: AIExtraction | null;
}

export type DocumentSlotKey =
  | 'dniFront'
  | 'dniBack'
  | 'ibi';

export type DocumentProcessingStatus =
  | 'idle'
  | 'validating'
  | 'extracting'
  | 'accepted'
  | 'rejected';

export type DocumentProcessingErrorCode =
  | 'unreadable'
  | 'wrong-document'
  | 'wrong-side'
  | 'temporary-error'
  | 'validation';

export interface DocumentProcessingState {
  status: DocumentProcessingStatus;
  errorCode?: DocumentProcessingErrorCode;
  errorMessage?: string;
  pendingPreview?: string | null;
}

export interface DNIData {
  front: DocSlot;
  back: DocSlot;
  originalPdfs: StoredDocumentFile[];
}

export interface IBIData {
  photo: UploadedPhoto | null;
  pages: UploadedPhoto[];
  originalPdfs: StoredDocumentFile[];
  extraction: AIExtraction | null;
}

export interface ElectricityBillData {
  pages: DocSlot[];
  originalPdfs: StoredDocumentFile[];
  front?: DocSlot;
  back?: DocSlot;
}

export type LocationRegion = 'cataluna' | 'madrid' | 'valencia' | 'other';

export type RenderedDocumentKey =
  | 'catalunaIva'
  | 'catalunaGeneralitat'
  | 'catalunaRepresentacio'
  | 'spainIva'
  | 'spainPoder';

export interface RenderedDocumentAsset {
  imageDataUrl?: string;
  generatedAt: string;
  templateVersion: string;
}

export interface RepresentationData {
  location: LocationRegion | null;
  isCompany: boolean;
  companyName: string;
  companyNIF: string;
  companyAddress: string;
  companyMunicipality: string;
  companyPostalCode: string;
  postalCode: string;
  ivaPropertyAddress: string;
  ivaCertificateSignature: string | null;
  representacioSignature: string | null;
  generalitatRole: 'titular' | 'representant';
  generalitatSignature: string | null;
  poderRepresentacioSignature: string | null;
  ivaCertificateEsSignature: string | null;
  renderedDocuments?: Partial<Record<RenderedDocumentKey, RenderedDocumentAsset>>;
}

export interface SignaturesData {
  customerSignature: string | null;
  repSignature: string | null;
}

export interface ElectricalPanelData {
  photos: UploadedPhoto[];
}

export interface RoofData {
  photos: UploadedPhoto[];
  lengthM: string;
  widthM: string;
  roofType: string;
  orientation: string;
}

export interface InstallationSpaceData {
  photos: UploadedPhoto[];
  widthCm: string;
  depthCm: string;
  heightCm: string;
}

export interface RadiatorsData {
  photos: UploadedPhoto[];
  radiatorType: string;
  totalCount: string;
  heatingZones: string;
}

export interface FormData {
  dni: DNIData;
  ibi: IBIData;
  electricityBill: ElectricityBillData;
  electricalPanel: ElectricalPanelData;
  roof: RoofData;
  installationSpace: InstallationSpaceData;
  radiators: RadiatorsData;
  location?: LocationRegion;
  representation: RepresentationData;
  signatures: SignaturesData;
}

export interface FormItem {
  id: string;
  label: string;
  section: Section;
  required: boolean;
  isComplete: (formData: FormData, productType: ProductType) => boolean;
}

export type Section =
  | 'property-docs'
  | 'province-selection'
  | 'representation'
  | 'review'
  | 'success';

export interface FormErrors {
  [key: string]: string | undefined;
}

export type PhotoValidationResult = {
  valid: boolean;
  error?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
};
