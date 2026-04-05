// Eltex Document Collection Form - Types

export type ProductType = 'solar' | 'aerothermal' | 'solar-aerothermal';
export type EnergyCertificateStatus = 'not-started' | 'in-progress' | 'skipped' | 'completed';

export interface ProjectData {
  code: string;
  accessToken?: string;
  customerName: string;
  customerLanguage?: string;
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

export type AIExtractionValue =
  | string
  | null
  | undefined;

export interface AIExtraction {
  extractedData: Record<string, AIExtractionValue>;
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
  | 'blurry'
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
  signatureDeferred?: boolean;
  renderedDocuments?: Partial<Record<RenderedDocumentKey, RenderedDocumentAsset>>;
}

export interface SignaturesData {
  customerSignature: string | null;
  repSignature: string | null;
}

export interface EnergyCertificateHousingData {
  cadastralReference: string;
  habitableAreaM2: string;
  floorCount: string;
  averageFloorHeight: '<2.7m' | '2.7-3.2m' | '>3.2m' | null;
  bedroomCount: string;
  doorsByOrientation: {
    north: string;
    east: string;
    south: string;
    west: string;
  };
  windowsByOrientation: {
    north: string;
    east: string;
    south: string;
    west: string;
  };
  windowFrameMaterial: 'madera' | 'aluminio' | 'pvc' | null;
  doorMaterial: string;
  windowGlassType: 'simple' | 'doble' | null;
  hasShutters: boolean | null;
  shutterWindowCount: string;
}

export interface EnergyCertificateThermalData {
  thermalInstallationType: 'termo-electrico' | 'calentador' | 'caldera' | 'aerotermia' | null;
  boilerFuelType: 'gas' | 'gasoil' | 'electricidad' | 'aerotermia' | null;
  equipmentDetails: string;
  hasAirConditioning: boolean | null;
  airConditioningType: 'frio-calor' | 'frio' | null;
  airConditioningDetails: string;
  heatingEmitterType: 'radiadores-agua' | 'radiadores-electricos' | 'suelo-radiante' | null;
  radiatorMaterial: 'hierro-fundido' | 'aluminio' | 'no-aplica' | null;
}

export interface EnergyCertificateAdditionalData {
  soldProduct: 'solo-paneles' | 'solo-aerotermia' | 'paneles-y-aerotermia' | 'ampliacion' | 'ampliacion-y-aerotermia' | null;
  isExistingCustomer: boolean | null;
  hasSolarPanels: boolean | null;
  solarPanelDetails: string;
}

export interface EnergyCertificateData {
  status: EnergyCertificateStatus;
  housing: EnergyCertificateHousingData;
  thermal: EnergyCertificateThermalData;
  additional: EnergyCertificateAdditionalData;
  customerSignature: string | null;
  renderedDocument: RenderedDocumentAsset | null;
  completedAt: string | null;
  skippedAt: string | null;
  currentStepIndex?: number;
}

export interface ContractData {
  originalPdfs: StoredDocumentFile[];
  extraction: AIExtraction | null;
}

export interface FormData {
  dni: DNIData;
  ibi: IBIData;
  electricityBill: ElectricityBillData;
  contract?: ContractData;
  location?: LocationRegion;
  representation: RepresentationData;
  energyCertificate: EnergyCertificateData;
  signatures: SignaturesData;
  browserLanguage?: string;
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
  | 'energy-certificate'
  | 'review'
  | 'success';

export interface FormErrors {
  [key: string]: string | undefined;
}

export type PhotoValidationResult = {
  valid: boolean;
  error?: string;
  reason?: 'blurry' | 'too-small' | 'too-large' | 'other';
  blurScore?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
};
